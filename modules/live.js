/* Live-Werte: oben in einem Satz, ob alles im Rahmen ist, darunter drei Rundinstrumente. Zum Tiefergraben drei Reiter:
   Werte (auffällige zuerst), Diagramm (uPlot mit Sollband und synchronem Cursor), Aufnahme mit Trigger und Wiedergabe. */
import { $, h, s, num, numFix, cssVar, mixColor, icon, mark, chev, toast, download, storageGet, storageSet, reducedMotion, clockTime, statusChip, jump } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, WISSEN, on, emit, signalTitle, sollFor, logEvent } from "./state.js";
import { buffer, pushSample, recordings, rec, startRecording, stopRecording, markRecording, armTrigger, disarmTrigger, deleteRecording, toCsv, stats, resample } from "./recorder.js";
export { historyOf } from "./recorder.js";

const isLiveVisible = () => !$("view-live").hidden;

/* ---------- Rundinstrumente ---------- */
/* Präzise ablesbar (Recherche 28.10.: FAA AC 25-11B, ISA-101, Few): 270°-Bogen, beschriftete Hauptstriche nach 1-2-5
   mit Nebenstrichen, Normalbereich neutral hinterlegt und mit Grenzstrichen markiert, Farbe nur bei Abweichung,
   Min/Max seit Start als kleine Dreiecke. Ziffer mit fester Stellenzahl und Totband gegen Zittern. */
const GAUGES = [
  { sig: "DREHZAHL", min: 0, max: 8000, major: 1000, minor: 250, red: 6500, digits: 0, round: 10, label: "Drehzahl", factor: 1000, unit: "1/min ×1000" },
  { sig: "KUEHLMITTEL", min: 40, max: 140, major: 20, minor: 5, red: 115, digits: 0, round: 1, label: "Kühlmittel" },
  { sig: "SPANNUNG", min: 10, max: 16, major: 1, minor: .2, red: 15.2, low: 12, digits: 2, round: .01, label: "Bordnetz" },
];
/* Nadel: kritisch gedämpfte Feder, 95 % nach etwa 150 ms (motion.md 4.6). */
const needles = {};
const OMEGA = 31.6;
function springNeedle(sig, target, dt) {
  const n = needles[sig] || (needles[sig] = { x: target, v: 0 });
  if (reducedMotion() || dt > .25) { n.x = target; n.v = 0; return n.x; }
  const a = -2 * OMEGA * n.v - OMEGA * OMEGA * (n.x - target);
  n.v += a * dt; n.x += n.v * dt;
  return n.x;
}
/* Ziffer: auf die Anzeigestufe gerundet, springt erst, wenn der Wert sich um mehr als drei Viertel Stufe bewegt. */
const shown = {};
export function steadyDigit(key, raw, step) {
  const r = Math.round(raw / step) * step;
  if (shown[key] == null || Math.abs(raw - shown[key]) >= step * .75) shown[key] = r;
  return shown[key];
}
const extremes = {};
function buildGauges() {
  $("gauges").replaceChildren(...GAUGES.map((g) => h("button", { class: "card gauge", type: "button", "data-info": `signal:${g.sig}`, "aria-label": `${g.label}, Infoblatt` },
    h("canvas", { id: "g-" + g.sig, width: 380, height: 380, "aria-hidden": "true" }), h("span", { class: "state-lbl" }, g.label))));
}
let gaugeDt = 0;
function drawGauge(g) {
  const canvas = $("g-" + g.sig);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H * .43, R = Math.min(W, H) * .39;
  const entry = state.live[g.sig];
  /* Liefert das Auto den Wert nicht, steht die Nadel am Anfang und statt einer Zahl ein Strich. */
  const hasValue = Boolean(entry) && typeof entry.wert === "number";
  const target = hasValue ? entry.wert : g.min;
  if (hasValue) { const e = extremes[g.sig] || (extremes[g.sig] = { lo: target, hi: target }); e.lo = Math.min(e.lo, target); e.hi = Math.max(e.hi, target); }
  const val = springNeedle(g.sig, target, gaugeDt);
  const a0 = Math.PI * .75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + (Math.min(Math.max(v, g.min), g.max) - g.min) / (g.max - g.min) * (a1 - a0);
  const at = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const line = (a, r1, r2) => { const [x1, y1] = at(a, r1), [x2, y2] = at(a, r2); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const arcSeg = (from, to, r, w, color) => { ctx.lineWidth = w; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, ang(from), ang(to)); ctx.stroke(); };
  const text = cssVar("--text"), muted = cssVar("--text-muted"), crit = cssVar("--crit"), warn = cssVar("--warn"), line2 = cssVar("--line-strong");
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "butt";
  const soll = sollFor(g.sig);
  const outside = hasValue && ((soll && (target < soll.soll_min || target > soll.soll_max)) || target >= g.red || (g.low && target < g.low));
  const alarm = hasValue && (target >= g.red || (g.low && target < g.low));
  /* Grundbogen, Normalbereich als helle Fläche innen, Warn- und Rotzonen dünn außen */
  arcSeg(g.min, g.max, R, 2, line2);
  if (soll) arcSeg(soll.soll_min, soll.soll_max, R - 9, 16, mixColor(text, null, 0, .13));
  arcSeg(g.red, g.max, R + 5, 5, crit);
  if (g.low) arcSeg(g.min, g.low, R + 5, 5, warn);
  /* Teilung: Nebenstriche fein, Hauptstriche länger mit Zahl */
  ctx.strokeStyle = muted;
  const n = Math.round((g.max - g.min) / g.minor);
  for (let i = 0; i <= n; i++) {
    const v = g.min + i * g.minor, isMajor = Math.abs(((v - g.min) / g.major) - Math.round((v - g.min) / g.major)) < 1e-6;
    ctx.lineWidth = isMajor ? 3 : 1.5; ctx.strokeStyle = isMajor ? text : muted;
    line(ang(v), R, R - (isMajor ? 18 : 9));
  }
  ctx.fillStyle = text; ctx.font = `600 ${Math.round(R * .2)}px ${cssVar("--font-num")}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let v = g.min; v <= g.max + 1e-9; v += g.major) { const [x, y] = at(ang(v), R - 40); ctx.fillText(num(g.factor ? v / g.factor : v, 0), x, y); }
  /* Sollgrenzen: kräftige Querstriche über den Bogen */
  if (soll) { ctx.strokeStyle = cssVar("--ok"); ctx.lineWidth = 4; line(ang(soll.soll_min), R + 9, R - 20); line(ang(soll.soll_max), R + 9, R - 20); }
  /* Min/Max seit Start: hohle Dreiecke außen */
  const ex = extremes[g.sig];
  if (ex) for (const v of [ex.lo, ex.hi]) {
    const a = ang(v), [px, py] = at(a, R + 12), [lx, ly] = at(a - .045, R + 24), [rx, ry] = at(a + .045, R + 24);
    ctx.strokeStyle = muted; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, ly); ctx.lineTo(rx, ry); ctx.closePath(); ctx.stroke();
  }
  /* Zeiger schmal, endet vor den Zahlen; Farbe nur bei Abweichung */
  const needle = alarm ? crit : outside ? warn : text;
  ctx.lineCap = "round"; ctx.strokeStyle = needle; ctx.lineWidth = 4; line(ang(val), 0, R - 22);
  ctx.fillStyle = needle; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  const shownVal = hasValue ? steadyDigit(g.sig, target, g.round) : null;
  ctx.fillStyle = alarm ? crit : outside ? warn : text; ctx.font = `600 ${Math.round(R * .4)}px ${cssVar("--font-num")}`;
  ctx.fillText(hasValue ? numFix(shownVal, g.digits) : "–", cx, cy + R * .98);
  ctx.font = `500 ${Math.round(R * .19)}px ${cssVar("--font-text")}`; ctx.fillStyle = muted;
  ctx.fillText(hasValue ? (g.unit || entry.einheit || "") : "nicht gemeldet", cx, cy + R * 1.3);
}

/* ---------- Kanäle und Diagramme ---------- */
/* Kanalfarben: Abstufungen der einen Akzentfarbe, die vierte neutral */
const chanColor = (i) => { const a = cssVar("--accent"); return [a, mixColor(a, cssVar("--text"), .5), mixColor(a, cssVar("--surface-0"), .5), cssVar("--text-muted")][i] || a; };
const PREFERRED = ["DREHZAHL", "TRIM_KURZ_B1", "TRIM_LANG_B1", "LAST", "LUFTMASSE", "ZUENDWINKEL", "SPANNUNG", "KAT_TEMP_B1", "KUEHLMITTEL", "SAUGROHRDRUCK", "LAMBDA_SOLL", "DROSSELKLAPPE", "ANSAUGLUFT"];
let channels = storageGet("kfzdiag-kanaele", ["DREHZAHL", "TRIM_KURZ_B1", "TRIM_LANG_B1"]);
const charts = new Map();
const view = { mode: "live", rec: null, cmp: null };
const short = (sig) => signalTitle(sig).replace("Gemischkorrektur ", "Trim ").replace(", Bank ", " B");

function setChannels(next) {
  channels = next.slice(-4);
  storageSet("kfzdiag-kanaele", channels);
  for (const [sig, c] of charts) if (!channels.includes(sig)) { c.u.destroy(); c.root.remove(); charts.delete(sig); }
  renderChannelPicker(); updateCharts();
}
/* Kanalwähler: gewählte Kanäle als Reihe (entfernen per x), Gruppen als Segment, Kanäle als Liste mit Haken. */
const GROUPS = [
  ["motor", "Motor", /^(DREHZAHL|LAST|LAST_ABSOLUT|DREHMOMENT|ZUENDWINKEL|KUEHLMITTEL|OELTEMPERATUR|LAUFZEIT|DROSSELKLAPPE|DROSSEL_RELATIV)$/],
  ["gemisch", "Gemisch", /^(TRIM_|LAMBDA|LUFTMASSE|SAUGROHRDRUCK|ANSAUGLUFT|RAILDRUCK|LUFTDRUCK)/],
  ["abgas", "Abgas", /^(KAT_|AGR_)/],
  ["bordnetz", "Bordnetz", /^SPANNUNG$/],
  ["fahrt", "Fahrt", /^(GESCHWINDIGKEIT|TANK|VERBRAUCH|KM_|UMGEBUNG)/],
];
const groupOf = (sig) => (GROUPS.find(([, , re]) => re.test(sig)) || ["motor"])[0];
let pickGroup = storageGet("kfzdiag-kanalgruppe", "motor");
const CHECK = () => s("svg", { viewBox: "0 0 24 24", width: 14, height: 14, "aria-hidden": "true", class: "ic" }, s("path", { d: "M5 12l4 4L19 6" }));
function renderChannelPicker() {
  const present = Object.keys(state.live).filter((k) => typeof state.live[k].wert === "number");
  const options = [...PREFERRED.filter((p) => present.includes(p)), ...present.filter((p) => !PREFERRED.includes(p)).sort()];
  const selected = h("div", { class: "chan-selected", id: "chan-selected", "aria-label": "Gewählte Kanäle" }, ...(channels.length ? channels.map((sig, idx) =>
    h("span", { class: "selc" }, h("span", { class: "swatch", style: `background:${chanColor(idx)}` }), short(sig),
      h("button", { class: "x", type: "button", "aria-label": `${short(sig)} entfernen`, onclick: () => setChannels(channels.filter((x) => x !== sig)) }, icon("close")))) : [h("span", { class: "sm" }, "Kein Kanal gewählt")]),
    h("span", { class: "sm" }, `${channels.length} von 4`));
  const groups = GROUPS.filter(([id]) => options.some((sig) => groupOf(sig) === id));
  if (!groups.some(([id]) => id === pickGroup) && groups.length) pickGroup = groups[0][0];
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Kanalgruppe" }, ...groups.map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(id === pickGroup), onclick: () => { pickGroup = id; storageSet("kfzdiag-kanalgruppe", id); renderChannelPicker(); } },
      label, h("span", { class: "cnt" }, options.filter((sig) => groupOf(sig) === id).length))));
  const full = channels.length >= 4;
  const list = h("div", { class: "chan-list" }, ...options.filter((sig) => groupOf(sig) === pickGroup).map((sig) => {
    const on = channels.includes(sig);
    const v = state.live[sig];
    return h("button", { class: "chan-row", type: "button", "aria-pressed": String(on), disabled: !on && full ? true : null, title: !on && full ? "Höchstens vier Kanäle, zuerst einen entfernen" : null,
      onclick: () => setChannels(on ? channels.filter((x) => x !== sig) : [...channels, sig]) },
      h("span", { class: "chk" }, CHECK()), h("span", { class: "cr-t" }, signalTitle(sig)), h("span", { class: "sm mono" }, v ? `${num(v.wert, 1)} ${v.einheit || ""}` : ""));
  }));
  $("chan-pick").replaceChildren(selected, seg, list);
}

function currentData() {
  if (view.mode === "play" && view.rec) return view.rec;
  return buffer;
}
function chartOptions(sig, color, width) {
  const muted = cssVar("--text-muted"), line = cssVar("--line"), font = `11px ${cssVar("--font-num")}`;
  const clock = (v) => new Date(v * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return {
    width, height: 120, legend: { show: false }, padding: [8, 10, 0, 0],
    cursor: { sync: { key: "kfzdiag", setSeries: false }, drag: { x: true, y: false }, points: { size: 7 }, y: false },
    scales: { x: { time: true }, y: { range: (u, min, max) => { const soll = sollFor(sig); let lo = min, hi = max; if (soll) { lo = Math.min(lo, soll.soll_min); hi = Math.max(hi, soll.soll_max); } const pad = (hi - lo) * .14 || Math.abs(hi) * .1 || 1; return [lo - pad, hi + pad]; } } },
    axes: [
      { stroke: muted, font, size: 24, gap: 4, space: 72, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1, size: 4 }, values: (u, vals) => vals.map(clock) },
      { stroke: muted, font, size: 48, gap: 4, grid: { stroke: line, width: 1 }, ticks: { show: false }, values: (u, vals) => vals.map((v) => num(v, 2)) },
    ],
    series: [{}, { stroke: color, width: 2, spanGaps: true, points: { show: false } }, { stroke: muted, width: 1.5, dash: [4, 4], spanGaps: true, points: { show: false }, show: false }],
    hooks: { drawClear: [(u) => drawBand(u, sig)], setCursor: [(u) => onCursor(u, sig)] },
  };
}
function drawBand(u, sig) {
  const soll = sollFor(sig);
  if (!soll) return;
  const { ctx, bbox } = u;
  const y1 = u.valToPos(soll.soll_max, "y", true), y2 = u.valToPos(soll.soll_min, "y", true);
  ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = cssVar("--ok"); ctx.fillRect(bbox.left, y1, bbox.width, y2 - y1); ctx.restore();
}
function onCursor(u, sig) {
  const c = charts.get(sig);
  if (!c) return;
  const idx = u.cursor.idx;
  if (idx == null) { c.cursor.textContent = ""; return; }
  const v = u.data[1][idx], t = u.data[0][idx];
  const cmp = u.data[2] && u.data[2][idx];
  c.cursor.textContent = v == null ? "" : `Cursor ${clockTime(new Date(t * 1000))}:${new Date(t * 1000).getSeconds().toString().padStart(2, "0")} → ${num(v, 2)}${cmp != null ? ` · Vergleich ${num(cmp, 2)}` : ""}`;
}
function ensureChart(sig, idx) {
  if (charts.has(sig)) return charts.get(sig);
  const color = chanColor(idx);
  const title = h("span", { class: "ch-title state-lbl" }, h("span", { class: "swatch", style: `background:${color}` }), short(sig));
  const val = h("span", { class: "ch-val" });
  const statsEl = h("span", { class: "ch-stats" });
  const cursor = h("span", { class: "ch-stats" });
  const plot = h("div", { class: "plot" });
  const summary = h("p", { class: "sr" });
  const root = h("div", { class: "card chart", role: "group", "aria-label": `Diagramm ${short(sig)}` }, summary, h("div", { class: "ch-head" }, h("button", { type: "button", class: "unbtn", "data-info": `signal:${sig}` }, title), val, statsEl, cursor), plot);
  $("charts").append(root);
  const u = new uPlot(chartOptions(sig, color, Math.max(plot.clientWidth, 200)), [[], [], []], plot);
  const entry = { u, root, val, statsEl, cursor, color, summary };
  charts.set(sig, entry);
  return entry;
}
export function updateCharts() {
  if (!window.uPlot || !isLiveVisible()) return;
  const data = currentData();
  const empty = data.t.map(() => null);
  channels.forEach((sig, idx) => {
    const c = ensureChart(sig, idx);
    const series = data.sig[sig] || empty;
    const cmp = view.mode === "play" && view.cmp && view.cmp.sig[sig] ? resample(view.cmp.t, view.cmp.sig[sig], data.t) : empty;
    c.u.setData([data.t, series, cmp]);
    c.u.setSeries(2, { show: Boolean(view.cmp) });
    const live = state.live[sig];
    const unit = (live && live.einheit) || "";
    const current = view.mode === "play" ? [...series].reverse().find((v) => v != null) : live && typeof live.wert === "number" ? live.wert : null;
    c.val.replaceChildren(current == null ? "–" : num(current, 2), h("small", {}, unit));
    const st = stats(series), soll = sollFor(sig);
    const off = soll && current != null ? (current > soll.soll_max ? "über" : current < soll.soll_min ? "unter" : null) : null;
    c.root.classList.toggle("off", Boolean(off));
    c.statsEl.replaceChildren(...[
      st ? `min ${num(st.min, 2)} · max ${num(st.max, 2)} · Ø ${num(st.avg, 2)}` : "noch keine Daten",
      soll ? ` · Soll ${num(soll.soll_min)} bis ${num(soll.soll_max)}` : "",
      off ? h("span", { class: "off" }, icon(off === "über" ? "up" : "down"), `${off} Soll`) : null].filter((x) => x != null));
    c.summary.textContent = `${short(sig)}: aktuell ${current == null ? "kein Wert" : `${num(current, 2)} ${unit}`}${st ? `, min ${num(st.min, 2)}, max ${num(st.max, 2)}` : ""}${off ? `, ${off} dem Sollbereich` : ""}.`;
  });
  const order = [...$("charts").children];
  channels.forEach((sig, i) => { const c = charts.get(sig); if (c && order[i] !== c.root) $("charts").append(c.root); });
}
function resizeCharts() {
  for (const c of charts.values()) { const w = c.root.querySelector(".plot").clientWidth; if (w > 50 && w !== c.u.width) c.u.setSize({ width: w, height: 120 }); }
}
function rebuildCharts() {
  for (const c of charts.values()) { c.u.destroy(); c.root.remove(); }
  charts.clear();
  updateCharts();
}

/* ---------- Wiedergabe ---------- */
function play(r) {
  view.mode = "play"; view.rec = r; view.cmp = null;
  const slider = h("input", { type: "range", min: 0, max: Math.max(0, r.t.length - 1), value: 0, "aria-label": "Zeitpunkt in der Aufnahme" });
  const pos = h("span", {}, "0 s");
  slider.addEventListener("input", () => {
    const i = Number(slider.value);
    pos.textContent = `${num(r.t[i] - r.t[0], 0)} s`;
    for (const c of charts.values()) c.u.setCursor({ left: c.u.valToPos(r.t[i], "x"), top: 10 });
  });
  const cmpSel = h("select", { "aria-label": "Vergleich mit" }, h("option", { value: "" }, "Vergleich: keiner"), ...recordings.filter((x) => x.id !== r.id).map((x) => h("option", { value: x.id }, x.name)));
  cmpSel.addEventListener("change", () => { view.cmp = recordings.find((x) => x.id === cmpSel.value) || null; updateCharts(); });
  $("scrub").hidden = false;
  cmpSel.className = "inp";
  $("scrub").replaceChildren(h("button", { class: "btn sec small", type: "button", onclick: backToLive }, icon("back"), "Live"), slider, pos,
    h("span", { class: "scrub-meta" }, h("b", {}, r.name), `${r.t.length} s · ${Object.keys(r.sig).length} Kanäle`, cmpSel,
      ...r.marks.map((m) => jump({ onclick: () => { const i = r.t.findIndex((t) => t >= m.t); slider.value = Math.max(0, i); slider.dispatchEvent(new Event("input")); } }, `${num(m.t - r.t[0], 0)} s ${m.text}`))));
  $("chart-title").textContent = `Wiedergabe: ${r.name}`;
  updateCharts();
  for (const c of charts.values()) c.u.setScale("x", { min: r.t[0], max: r.t[r.t.length - 1] });
}
function backToLive() {
  view.mode = "live"; view.rec = null; view.cmp = null;
  $("scrub").hidden = true; $("scrub").replaceChildren();
  $("chart-title").textContent = "Messkanäle";
  for (const c of charts.values()) c.u.setCursor({ left: -10, top: -10 });
  updateCharts();
}

/* ---------- Aufnahme-Steuerung ---------- */
function renderRecorder() {
  const box = $("rec-box");
  const present = Object.keys(state.live).filter((k) => typeof state.live[k].wert === "number");
  const saved = storageGet("kfzdiag-trigger", { art: "schwelle", signal: "DREHZAHL", op: ">", wert: 3000, pre: 10, dauer: 30 });
  const pre = h("select", { class: "inp", "aria-label": "Vorlauf" }, ...[5, 10, 20, 30, 60].map((s) => h("option", { value: s, selected: s === saved.pre }, `Vorlauf ${s} s`)));
  const row1 = h("div", { class: "rowline" },
    rec.active ? statusChip("running", "Aufnahme läuft, Steuerung unten")
      : h("button", { class: "btn pri", type: "button", onclick: () => startRecording(Number(pre.value)) }, icon("rec"), "Aufnahme starten"),
    rec.active ? null : pre);
  const art = h("select", { class: "inp", "aria-label": "Trigger-Art" }, h("option", { value: "schwelle", selected: saved.art === "schwelle" }, "Schwellwert"), h("option", { value: "dtc", selected: saved.art === "dtc" }, "Neuer Fehlercode"));
  const sig = h("select", { class: "inp", "aria-label": "Signal" }, ...[...new Set([saved.signal, ...PREFERRED, ...present])].filter((x) => present.includes(x) || x === saved.signal).map((x) => h("option", { value: x, selected: x === saved.signal }, short(x))));
  const op = h("select", { class: "inp", "aria-label": "Vergleich" }, h("option", { value: ">", selected: saved.op === ">" }, "über"), h("option", { value: "<", selected: saved.op === "<" }, "unter"));
  const wert = h("input", { class: "inp", type: "number", step: "any", value: saved.wert, "aria-label": "Schwellwert" });
  const tpre = h("input", { class: "inp", type: "number", min: 0, max: 300, value: saved.pre, "aria-label": "Vorlauf in Sekunden", title: "Vorlauf s" });
  const dauer = h("input", { class: "inp", type: "number", min: 5, max: 600, value: saved.dauer, "aria-label": "Dauer in Sekunden", title: "Dauer s" });
  const sync = () => { const on = art.value === "schwelle"; sig.hidden = op.hidden = wert.hidden = !on; };
  art.addEventListener("change", sync); sync();
  const armBtn = rec.armed
    ? h("button", { class: "btn dng small", type: "button", onclick: disarmTrigger }, "Trigger entschärfen")
    : h("button", { class: "btn sec small", type: "button", onclick: () => {
      const tr = { art: art.value, signal: sig.value, op: op.value, wert: Number(wert.value), pre: Number(tpre.value) || 0, dauer: Number(dauer.value) || 30 };
      if (tr.art === "schwelle" && Number.isNaN(tr.wert)) { toast("Schwellwert fehlt."); return; }
      storageSet("kfzdiag-trigger", tr); armTrigger(tr);
    } }, icon("bolt"), "Trigger scharf schalten");
  const status = rec.armed ? h("span", { class: "cs t-warn" }, rec.trigger.art === "dtc" ? "scharf: wartet auf neuen Fehlercode" : `scharf: ${short(rec.trigger.signal)} ${rec.trigger.op} ${num(rec.trigger.wert, 2)}`) : null;
  const row2 = h("div", { class: "rowline" }, h("span", { class: "state-lbl" }, "Trigger"), art, sig, op, wert,
    h("label", { class: "sm inl" }, "Vorlauf ", tpre, " s"), h("label", { class: "sm inl" }, "Dauer ", dauer, " s"), armBtn, status);
  box.replaceChildren(row1, row2);
  renderRecBar();
  $("recordings").replaceChildren(...(recordings.length ? recordings.map((r) => h("div", { class: "erow rec-row" },
    mark(view.rec && view.rec.id === r.id ? "running" : "pending"),
    h("span", {}, h("div", { class: "t" }, r.name), h("div", { class: "d" }, `${new Date(r.von * 1000).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · ${r.t.length} s · ${Object.keys(r.sig).length} Kanäle${r.marks.length ? ` · ${r.marks.length} Markierung${r.marks.length > 1 ? "en" : ""}` : ""}`)),
    h("span", { class: "rec-actions" },
      h("button", { class: "btn sec small", type: "button", onclick: () => play(r) }, icon("play"), "Abspielen"),
      h("button", { class: "btn qt small", type: "button", onclick: () => download(`${r.name.replace(/[^\wäöüÄÖÜß-]+/g, "_")}.csv`, toCsv(r), "text/csv") }, icon("download"), "CSV"),
      h("button", { class: "btn dng small rec-del", type: "button", "aria-label": `${r.name} löschen`, onclick: () => { if (view.rec && view.rec.id === r.id) backToLive(); deleteRecording(r.id); } }, icon("delete"))))) : [h("div", { class: "empty" }, mark("pending"), h("p", { class: "h3" }, "Noch keine Aufnahme"), h("p", { class: "sm" }, "Der Ringpuffer hält immer die letzten 10 Minuten, der Vorlauf kommt daraus."))]));
}

/* Schwebende Aufnahmeleiste (rec-bar): Stopp, Markierung und Zeit, solange die Aufnahme läuft. */
function renderRecBar() {
  let bar = $("rec-bar");
  if (!rec.active) { if (bar) bar.remove(); return; }
  if (!bar) { bar = h("div", { class: "recbar run", id: "rec-bar", role: "region", "aria-label": "Aufnahme läuft" }); document.body.append(bar); }
  const secs = buffer.t.filter((t) => t >= rec.startT).length;
  bar.replaceChildren(h("span", { class: "dotr on", "aria-hidden": "true" }), h("span", { class: "num rb-time" }, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`),
    h("span", { class: "sm" }, rec.marks.length ? `${rec.marks.length} Markierung${rec.marks.length > 1 ? "en" : ""}` : "Aufnahme läuft"),
    h("button", { class: "btn sec", type: "button", onclick: () => markRecording() }, icon("marker"), "Markierung"),
    h("button", { class: "btn dng", type: "button", onclick: () => { const r = stopRecording(); if (r) toast(`${r.name} gespeichert`); } }, icon("stop"), "Stopp"));
}

/* ---------- Alle Messwerte ---------- */
/* Ruhig statt neu: Zeilen entstehen einmal je Signal und werden danach nur noch beschriftet. Neu sortiert wird nur,
   wenn ein Wert die Gruppe wechselt, und das erst nach zwei Messungen in Folge (kein Springen an der Grenze). */
/* Stellen nach Auflösung laut SAE J1979 (Recherche 28.10.): Prozent ganzzahlig, Spannung zwei, Lambda drei Stellen. */
const DIGITS = { "1/min": 0, "°C": 0, kPa: 0, "km/h": 0, s: 0, km: 0, "%": 0, "g/s": 1, "°": 1, "l/h": 1, V: 2, "λ": 3 };
export const digitsFor = (unit) => DIGITS[unit] ?? 2;
/* Gemischkorrektur: Abweichung um null, feste Skala −25 bis +25 %, Teilung 5 %, Vorzeichen immer sichtbar. */
const isTrim = (sig) => /^TRIM_/.test(sig);
const signed = (x, dg) => (x > 0 ? "+" : x < 0 ? "−" : "±") + numFix(Math.abs(x), dg);
const rows = new Map();
const shownBad = new Map();
let layoutKey = "";
function settledBad(sig, raw) {
  const s0 = shownBad.get(sig) || { bad: raw, n: 0 };
  if (raw === s0.bad) s0.n = 0; else if (++s0.n >= 2) { s0.bad = raw; s0.n = 0; }
  shownBad.set(sig, s0);
  return s0.bad;
}
/* Skala je Signal: runde Grenzen (1-2-5) um das Sollband, die nur wächst, wenn ein Wert hinausläuft. So bleibt das Band stehen. */
const scales = new Map();
/* Beim Fahrzeugwechsel zurücksetzen, damit Skalen und Schleppzeiger nicht vom alten Auto bleiben. */
export function setzeLiveZurueck() { scales.clear(); rows.clear(); shownBad.clear(); layoutKey = ""; for (const k in needles) delete needles[k]; for (const k in extremes) delete extremes[k]; for (const k in shown) delete shown[k]; }
function niceStep(span) { const p = 10 ** Math.floor(Math.log10(span)), f = span / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
export function scaleFor(sig, soll, wert) {
  if (isTrim(sig)) return { a: -25, b: 25, step: 5, min: soll.soll_min, max: soll.soll_max };
  const lo = Math.min(soll.soll_min, wert), hi = Math.max(soll.soll_max, wert);
  const old = scales.get(sig);
  if (old && old.a <= lo && old.b >= hi && old.min === soll.soll_min && old.max === soll.soll_max) return old;
  const band = soll.soll_max - soll.soll_min || Math.abs(soll.soll_max) || 1;
  const step = niceStep(Math.max(hi - lo, band * 2) / 4);
  const a = Math.min(old && old.min === soll.soll_min ? old.a : Infinity, Math.floor(Math.min(lo, soll.soll_min - band * .5) / step) * step);
  const b = Math.max(old && old.max === soll.soll_max ? old.b : -Infinity, Math.ceil(Math.max(hi, soll.soll_max + band * .5) / step) * step);
  const next = { a, b, step, min: soll.soll_min, max: soll.soll_max };
  scales.set(sig, next);
  return next;
}
function paramRow(sig) {
  const r = { mark: h("span"), t: h("div", { class: "t" }), d: h("div", { class: "d" }), val: h("b"), unit: h("small"),
    bar: h("span", { class: "sollbar", "aria-hidden": "true" }), band: h("span", { class: "band" }), mk: h("span", { class: "mk" }),
    ticks: h("span", { class: "ticks" }), fill: h("span", { class: "fill" }), zero: h("span", { class: "zero" }),
    labs: [0, 1, 2, 3].map((i) => h("span", { class: `sb-l l${i}` })) };
  r.bar.append(h("span", { class: "trk" }), r.band, r.ticks, r.zero, r.fill, ...r.labs, r.mk);
  r.el = h("button", { class: "tap param", type: "button", "data-info": `signal:${sig}` }, r.mark, h("span", {}, r.t, r.d), h("span", { class: "v" }, r.val, r.unit), chev(), r.bar);
  return r;
}
function fillRow(r, sig, v, soll, bad) {
  const meta = WISSEN.signale[sig], dg = digitsFor(v.einheit);
  r.el.classList.toggle("warn", bad);
  if (r.isBad !== bad) { r.mark.replaceWith(r.mark = bad ? mark("warn") : h("span")); r.isBad = bad; }
  r.t.textContent = meta ? meta.titel : sig;
  r.d.textContent = v.warnung || (soll ? `Soll ${numFix(soll.soll_min, dg)} bis ${numFix(soll.soll_max, dg)} ${v.einheit || ""} (${soll.art === "hersteller" ? "Herstellerwert" : "Richtwert"})` : meta ? meta.kurz : "");
  const trim = isTrim(sig), step = 10 ** -dg;
  const shownVal = steadyDigit(`p:${sig}`, v.wert, step);
  r.val.textContent = trim ? signed(shownVal, dg) : numFix(shownVal, dg); r.unit.textContent = v.einheit || "";
  r.bar.hidden = !soll;
  if (!soll) return;
  const sc = scaleFor(sig, soll, v.wert), pct = (x) => ((x - sc.a) / (sc.b - sc.a)) * 100;
  r.band.style.left = `${pct(soll.soll_min)}%`; r.band.style.width = `${pct(soll.soll_max) - pct(soll.soll_min)}%`;
  const clamped = Math.min(Math.max(v.wert, sc.a), sc.b);
  r.mk.style.left = `${pct(clamped)}%`; r.mk.classList.toggle("ok", !bad); r.mk.classList.toggle("cut", clamped < v.wert); r.mk.classList.toggle("cut-l", clamped > v.wert);
  /* Teilstriche im Skalenschritt (Skala beginnt auf einem Vielfachen, die Striche sitzen also auf runden Werten) */
  r.ticks.style.backgroundSize = `${(sc.step / (sc.b - sc.a)) * 100}% 100%`;
  r.zero.hidden = !trim; r.fill.hidden = !trim;
  if (trim) { r.zero.style.left = `${pct(0)}%`; r.fill.style.left = `${Math.min(pct(0), pct(clamped))}%`; r.fill.style.width = `${Math.abs(pct(clamped) - pct(0))}%`; r.fill.classList.toggle("bad", bad); }
  /* Beschriftung: Skalenenden außen, Sollgrenzen unter den Bandkanten */
  [[sc.a, 0], [soll.soll_min, pct(soll.soll_min)], [soll.soll_max, pct(soll.soll_max)], [sc.b, 100]].forEach(([x, at], i) => {
    r.labs[i].textContent = isTrim(sig) ? signed(x, 0) : num(x, dg); r.labs[i].style.left = `${at}%`; });
}
export function renderParams() {
  const list = Object.entries(state.live).filter(([, v]) => v.wert != null);
  const bad = [], fine = [];
  for (const [sig, v] of list) {
    const soll = sollFor(sig);
    const isBad = settledBad(sig, Boolean(v.warnung) || Boolean(soll && soll.bewertung !== "ok"));
    if (!rows.has(sig)) rows.set(sig, paramRow(sig));
    fillRow(rows.get(sig), sig, v, soll, isBad);
    (isBad ? bad : fine).push(sig);
  }
  const key = `${bad.join(",")}|${fine.join(",")}`;
  if (key !== layoutKey) {
    layoutKey = key;
    $("params").replaceChildren(...[
      bad.length ? h("h3", { class: "pgroup t-warn" }, mark("warn"), `Auffällig (${bad.length})`) : null, bad.length ? h("div", { class: "list" }, ...bad.map((sig) => rows.get(sig).el)) : null,
      fine.length ? h("h3", { class: "pgroup" }, mark("ok"), `Im Rahmen (${fine.length})`) : null, fine.length ? h("div", { class: "list" }, ...fine.map((sig) => rows.get(sig).el)) : null].filter(Boolean));
  }
  renderLiveHero(list.length, bad);
  const zustand = state.analysis ? state.analysis.sollwerte.zustand_text : "";
  if ($("live-state").textContent !== zustand) $("live-state").textContent = zustand;
}

/* ---------- Takt ---------- */
export async function pollLive() {
  try {
    const result = await state.src.live();
    for (const v of result.werte || []) state.live[v.signal] = v;
    pushSample(result.werte || []);
    emit("status");
    emit("live-tick");
    if (rec.active) renderRecBar();
    if (isLiveVisible()) { renderParams(); if (view.mode === "live") updateCharts(); }
    misses = 0;
    if (state.connLost) { state.connLost = false; toast("Verbindung wieder da. Messwerte laufen."); logEvent("Verbindung wieder da"); emit("status"); emit("conn"); }
  } catch (_) {
    $("live-state").textContent = "Messwerte gerade nicht lesbar";
    /* Drei Sekunden ohne Antwort: Verbindung als weg melden, mit Weg zum Neu verbinden. Die Abfrage läuft weiter. */
    if (++misses >= 3 && !state.connLost) { state.connLost = true; logEvent("Verbindung unterbrochen"); emit("status"); emit("conn"); }
  }
}
let misses = 0;
let lastFrame = 0;
let animLaeuft = false;
function animate(ts) {
  if (!isLiveVisible()) { animLaeuft = false; lastFrame = 0; return; }  // nicht sichtbar: Schleife anhalten, spart Akku
  if (ts - lastFrame > 33) { gaugeDt = lastFrame ? (ts - lastFrame) / 1000 : 0; lastFrame = ts; GAUGES.forEach(drawGauge); }
  requestAnimationFrame(animate);
}
export function starteGauges() { if (!animLaeuft && isLiveVisible()) { animLaeuft = true; lastFrame = 0; requestAnimationFrame(animate); } }

/* ---------- Überblick oben und Reiter zum Tiefergraben ---------- */
let heroKey = "";
function renderLiveHero(total, badSigs) {
  const rpm = state.live.DREHZAHL && state.live.DREHZAHL.wert;
  const running = typeof rpm === "number" ? (rpm > 100 ? "läuft" : "aus") : "keine";
  const key = `${running}|${total}|${badSigs.join(",")}|${rec.active}`;
  if (key === heroKey) return;
  heroKey = key;
  const tone = !total ? "neutral" : badSigs.length ? "warn" : "ok";
  const title = running === "keine" ? "Warte auf Messwerte" : running === "läuft" ? "Motor läuft" : "Zündung an, Motor aus";
  const sentence = !total ? "Sobald das Auto Werte liefert, stehen sie hier." : badSigs.length
    ? `${badSigs.length} von ${total} Werten ${badSigs.length === 1 ? "liegt" : "liegen"} außerhalb des Rahmens. Tippe einen an, um zu sehen, warum.`
    : `Alle ${total} Werte liegen im Rahmen.`;
  $("live-hero").className = `card hero live-hero t-${tone}`;
  $("live-hero").replaceChildren(
    h("span", { class: "hero-ic", "aria-hidden": "true" }, icon3d("scope")),
    h("div", { class: "hero-b" },
      h("p", { class: "eyebrow" }, "Live-Werte"), h("h2", { class: "hero-t" }, title), h("p", { class: "hero-p" }, sentence),
      badSigs.length ? h("div", { class: "hero-chips" }, ...badSigs.map((sig) => jump({ class: "t-warn", "data-info": `signal:${sig}` }, signalTitle(sig)))) : null,
      h("div", { class: "hero-actions" },
        h("button", { class: "btn pri", type: "button", onclick: () => setLiveTab("diagramm") }, icon("live"), "Verlauf ansehen"),
        h("button", { class: "btn sec", type: "button", onclick: () => setLiveTab("aufnahme") }, icon("rec"), rec.active ? "Aufnahme läuft" : "Aufnehmen"))));
}

const LIVE_TABS = [["werte", "Werte"], ["diagramm", "Diagramm"], ["aufnahme", "Aufnahme"]];
let liveTab = "werte";
function renderLiveTabs() {
  $("live-tabs").replaceChildren(...LIVE_TABS.map(([id, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === liveTab), "aria-pressed": String(id === liveTab), onclick: () => setLiveTab(id) }, label)));
  for (const sec of document.querySelectorAll("#view-live [data-live]")) sec.hidden = sec.dataset.live !== liveTab;
}
function setLiveTab(id) {
  liveTab = id;
  renderLiveTabs();
  if (id === "diagramm") { updateCharts(); resizeCharts(); }
  $("live-tabs").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}

export function renderLive() { renderLiveTabs(); renderChannelPicker(); renderRecorder(); renderParams(); updateCharts(); resizeCharts(); }

export function initLive() {
  buildGauges();
  new ResizeObserver(() => resizeCharts()).observe($("charts"));
  on("theme", () => { if (charts.size) { rebuildCharts(); } });
  on("recording", renderRecorder);
  on("chart-add", (sig) => { if (!channels.includes(sig)) setChannels([...channels, sig]); setLiveTab("diagramm"); });
  on("tab", (id) => { if (id === "live") { renderLive(); starteGauges(); } });
  on("render", () => { if (isLiveVisible()) { renderLive(); starteGauges(); } });
  starteGauges();
}
