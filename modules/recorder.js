/* Ringpuffer der Live-Werte (10 Minuten), Aufnahmen mit Vorlauf, Trigger (Schwellwert oder neuer Fehlercode), CSV. */
import { storageGet, storageSet, clockTime, num } from "./dom.js";
import { state, emit, logEvent, signalTitle, obdList } from "./state.js";

export const BUFFER_SECONDS = 600;
export const buffer = { t: [], sig: {} };

export function pushSample(werte, at = Date.now() / 1000) {
  const seen = new Set();
  buffer.t.push(at);
  for (const v of werte) {
    if (typeof v.wert !== "number") continue;
    if (!buffer.sig[v.signal]) buffer.sig[v.signal] = new Array(buffer.t.length - 1).fill(null);
    buffer.sig[v.signal].push(v.wert);
    seen.add(v.signal);
  }
  for (const [sig, arr] of Object.entries(buffer.sig)) if (!seen.has(sig)) arr.push(null);
  if (buffer.t.length > BUFFER_SECONDS) { buffer.t.shift(); for (const arr of Object.values(buffer.sig)) arr.shift(); }
  checkTriggers(at);
}
export const historyOf = (sig) => (buffer.sig[sig] || []).filter((v) => v != null);

/* ---------- Aufnahmen ---------- */
export const recordings = storageGet("kfzdiag-aufnahmen", []).filter((r) => r && Array.isArray(r.t));
const save = () => storageSet("kfzdiag-aufnahmen", recordings.slice(0, 10));
export const rec = { active: false, startT: null, marks: [], stopAt: null, trigger: null, armed: false, lastCodes: null, dtcTimer: null };

export function startRecording(preSeconds = 10, reason = "") {
  if (rec.active) return;
  const now = Date.now() / 1000;
  rec.active = true; rec.startT = now - preSeconds; rec.marks = reason ? [{ t: now, text: reason }] : []; rec.stopAt = null;
  state.recording = true;
  logEvent(reason ? `Aufnahme ausgelöst: ${reason}` : `Aufnahme gestartet (Vorlauf ${preSeconds} s)`, "rec");
  emit("status"); emit("recording");
}
export function markRecording(text) {
  if (!rec.active) return;
  rec.marks = [...rec.marks, { t: Date.now() / 1000, text: text || `Markierung ${rec.marks.length + 1}` }];
  emit("recording");
}
export function stopRecording() {
  if (!rec.active) return null;
  const from = buffer.t.findIndex((t) => t >= rec.startT);
  const idx = from < 0 ? 0 : from;
  const t = buffer.t.slice(idx);
  const sig = {};
  for (const [name, arr] of Object.entries(buffer.sig)) { const part = arr.slice(idx); if (part.some((v) => v != null)) sig[name] = part; }
  const r = { id: Date.now().toString(36), name: `Aufnahme ${clockTime(new Date())}`, fahrzeug: (state.status && state.status.fahrzeug) || "", von: t[0], bis: t[t.length - 1], t, sig, marks: rec.marks };
  rec.active = false; rec.stopAt = null; state.recording = false;
  recordings.unshift(r);
  while (recordings.length > 10) recordings.pop();
  save();
  logEvent(`Aufnahme gespeichert: ${r.name}, ${t.length} s, ${Object.keys(sig).length} Kanäle`, "rec");
  emit("status"); emit("recording");
  return r;
}
export function deleteRecording(id) {
  const i = recordings.findIndex((r) => r.id === id);
  if (i >= 0) { recordings.splice(i, 1); save(); emit("recording"); }
}

/* ---------- Trigger ---------- */
export function armTrigger(trigger) {
  rec.trigger = trigger; rec.armed = true;
  clearInterval(rec.dtcTimer);
  if (trigger.art === "dtc") { rec.lastCodes = null; dtcWatchTick(); rec.dtcTimer = setInterval(dtcWatchTick, 5000); }
  logEvent(trigger.art === "dtc" ? "Trigger scharf: neuer Fehlercode" : `Trigger scharf: ${signalTitle(trigger.signal)} ${trigger.op} ${num(trigger.wert, 2)}`, "rec");
  emit("recording");
}
export function disarmTrigger() {
  rec.armed = false; clearInterval(rec.dtcTimer); rec.dtcTimer = null;
  emit("recording");
}
function fire(text) {
  const tr = rec.trigger;
  rec.armed = false; clearInterval(rec.dtcTimer); rec.dtcTimer = null;
  startRecording(tr.pre, text);
  rec.stopAt = Date.now() / 1000 + tr.dauer;
  emit("recording");
}
function checkTriggers(at) {
  if (rec.active && rec.stopAt && at >= rec.stopAt) { stopRecording(); return; }
  if (!rec.armed || !rec.trigger || rec.active || rec.trigger.art !== "schwelle") return;
  const tr = rec.trigger;
  const v = state.live[tr.signal] && state.live[tr.signal].wert;
  if (typeof v !== "number") return;
  const hit = tr.op === ">" ? v > tr.wert : v < tr.wert;
  if (hit) fire(`${signalTitle(tr.signal)} ${tr.op} ${num(tr.wert, 2)} (gemessen ${num(v, 2)})`);
}
async function dtcWatchTick() {
  if (!rec.armed || rec.active) return;
  try {
    const obd = await state.src.obdFaults();
    const codes = new Set([...obdList("gespeichert", obd), ...obdList("vorlaeufig", obd)].map((d) => `${d.sender}|${d.code}`));
    if (rec.lastCodes) {
      const neu = [...codes].filter((c) => !rec.lastCodes.has(c));
      if (neu.length) { state.obd = obd; emit("render"); fire(`neuer Fehlercode ${neu.map((c) => c.split("|")[1]).join(", ")}`); }
    }
    rec.lastCodes = codes;
  } catch (_) { /* nächster Versuch in 5 s */ }
}

/* ---------- Auswertung, Export ---------- */
export function stats(arr) {
  const vals = arr.filter((v) => typeof v === "number");
  if (!vals.length) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of vals) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { min, max, avg: sum / vals.length, n: vals.length };
}
/* Werte einer zweiten Aufnahme auf die Zeitachse der ersten legen (relative Sekunden, linear interpoliert). */
export function resample(srcT, srcV, targetT) {
  if (!srcT.length) return targetT.map(() => null);
  const s0 = srcT[0], t0 = targetT[0];
  let j = 0;
  return targetT.map((t) => {
    const rel = t - t0;
    while (j < srcT.length - 1 && srcT[j + 1] - s0 <= rel) j++;
    if (rel < 0 || rel > srcT[srcT.length - 1] - s0) return null;
    const a = srcV[j], b = srcV[Math.min(j + 1, srcT.length - 1)];
    if (a == null) return b == null ? null : b;
    if (b == null) return a;
    const ta = srcT[j] - s0, tb = srcT[Math.min(j + 1, srcT.length - 1)] - s0;
    return tb === ta ? a : a + (b - a) * ((rel - ta) / (tb - ta));
  });
}
export function toCsv(r) {
  const names = Object.keys(r.sig);
  const de = (v) => (v == null ? "" : String(Math.round(v * 1000) / 1000).replace(".", ","));
  const lines = [`# ${r.name}; ${r.fahrzeug}; Start ${new Date(r.von * 1000).toLocaleString("de-DE")}`, ["Zeit", "Sekunde", ...names.map(signalTitle)].join(";")];
  r.t.forEach((t, i) => lines.push([new Date(t * 1000).toLocaleTimeString("de-DE"), de(t - r.t[0]), ...names.map((n) => de(r.sig[n][i]))].join(";")));
  if (r.marks.length) { lines.push(""); lines.push("# Markierungen"); r.marks.forEach((m) => lines.push(`${de(m.t - r.t[0])};${m.text}`)); }
  return lines.join("\r\n");
}
