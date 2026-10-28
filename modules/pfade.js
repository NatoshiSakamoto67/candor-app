/* Geführte Prüfpfade: Schritt-Karten mit Live-Messung, Sollbereich samt Quelle, automatischem Pass/Fail
   und Verzweigung. Fortschritt bleibt je Fahrzeug gespeichert. Die Pfade stehen in wissen.json. */
import { $, h, num, mark, toast, jump, storageGet, storageSet } from "./dom.js";
import { state, WISSEN, on, emit, signalTitle, firstReadiness, totalFaults, obdList, vehicleKey, logEvent } from "./state.js";
import { startAction } from "./approval.js";

let progress = {};
let active = null;
const key = () => `kfzdiag-pfade|${vehicleKey()}`;
const load = () => { progress = storageGet(key(), {}); };
const save = () => storageSet(key(), progress);
const stepOf = (pfad, id) => pfad.schritte.find((s) => s.id === id);

/* Automatische Bewertung: ok, fehler oder offen (Wert fehlt oder Zustand passt nicht) */
export function evaluate(step) {
  const p = step.pruefung;
  if (!p) return { verdict: "offen" };
  if (p.typ === "signal") {
    const v = state.live[p.signal];
    if (!v || typeof v.wert !== "number") return { verdict: "offen", text: "Messwert fehlt" };
    const rpm = state.live.DREHZAHL && state.live.DREHZAHL.wert;
    if (p.zustand === "motor_aus" && typeof rpm === "number" && rpm > 100) return { verdict: "offen", wert: v.wert, einheit: v.einheit, text: "Motor abstellen, Zündung an lassen" };
    if (p.zustand === "motor_laeuft" && !(typeof rpm === "number" && rpm > 100)) return { verdict: "offen", wert: v.wert, einheit: v.einheit, text: "Motor starten" };
    const ok = v.wert >= p.min && v.wert <= p.max;
    return { verdict: ok ? "ok" : "fehler", wert: v.wert, einheit: v.einheit, text: ok ? "im Bereich" : v.wert > p.max ? "über dem Bereich" : "unter dem Bereich" };
  }
  const r = firstReadiness();
  if (p.typ === "mil_aus") return r ? { verdict: r.mil ? "fehler" : "ok", text: r.mil ? "Motorkontrollleuchte an" : "Motorkontrollleuchte aus" } : { verdict: "offen", text: "keine Readiness-Daten" };
  if (p.typ === "fehler_keine") { const n = obdList("gespeichert").length; return { verdict: n ? "fehler" : "ok", text: n ? `${n} Abgasfehler gespeichert` : "kein Abgasfehler gespeichert" }; }
  if (p.typ === "readiness_alle") { if (!r) return { verdict: "offen", text: "keine Readiness-Daten" }; const open = r.tests.filter((t) => !t.fertig); return { verdict: open.length ? "fehler" : "ok", text: open.length ? `offen: ${open.map((t) => t.name).join(", ")}` : "alle Tests fertig" }; }
  if (p.typ === "freeze") { const f = state.freeze && Object.values(state.freeze.steuergeraete || {})[0]; return f ? { verdict: "ok", text: `Freeze-Frame zu ${f.ausloeser}: ${f.werte.slice(0, 4).map((v) => `${signalTitle(v.signal)} ${num(v.wert)} ${v.einheit}`).join(", ")}` } : { verdict: "offen", text: "kein Freeze-Frame gespeichert" }; }
  return { verdict: "offen" };
}

function record(pfad, step, verdict) {
  const entry = progress[pfad.id] || { schritte: {}, aktuell: step.id, fertig: null };
  const next = verdict === "ok" ? step.bei_ok : step.bei_fehler;
  const ev = evaluate(step);
  entry.schritte = { ...entry.schritte, [step.id]: { verdict, wert: ev.wert, einheit: ev.einheit, at: Date.now() } };
  entry.aktuell = next || null;
  entry.fertig = next && next.startsWith("ende") ? next : null;
  progress = { ...progress, [pfad.id]: entry };
  save();
  logEvent(`Prüfpfad ${pfad.titel}: ${step.titel} ${verdict === "ok" ? "bestanden" : "nicht bestanden"}${ev.wert != null ? ` (${num(ev.wert, 2)} ${ev.einheit})` : ""}`, "check");
  renderPfade();
}
function reset(pfad) { const copy = { ...progress }; delete copy[pfad.id]; progress = copy; save(); renderPfade(); }

export function pfadSummary(pfad) {
  const entry = progress[pfad.id];
  const done = entry ? Object.keys(entry.schritte).length : 0;
  const total = pfad.schritte.filter((s) => !s.id.startsWith("ende")).length;
  const result = entry && entry.fertig ? pfad.ergebnisse[entry.fertig] : null;
  return { entry, done, total, result, failed: entry ? Object.values(entry.schritte).some((s) => s.verdict === "fehler") : false };
}

const verdictClass = (ev) => (ev.verdict === "ok" ? "ok" : ev.verdict === "fehler" ? "crit" : "warn");
const bigValue = (ev) => [ev.wert == null ? "–" : num(ev.wert, 2), h("small", {}, ev.einheit || "")];
const verdictContent = (ev, p) => [mark(verdictClass(ev)), ev.verdict === "ok" ? "Pass" : ev.verdict === "fehler" ? "Fail" : "offen", ev.text && p.typ === "signal" ? ` · ${ev.text}` : ""];
const goLabel = (ev) => (ev.verdict === "ok" ? "Pass übernehmen, weiter" : ev.verdict === "fehler" ? "Fail übernehmen, weiter" : "Warte auf Messwert");

/* Jede Sekunde nur die Messung auf der offenen Schritt-Karte nachführen, nicht die ganze Karte neu bauen. */
function refreshStep() {
  const pfad = active && (WISSEN.pruefpfade || []).find((p) => p.id === active);
  if (!pfad) return;
  const entry = progress[pfad.id];
  if (entry && entry.fertig) return;
  const step = stepOf(pfad, entry ? entry.aktuell : pfad.schritte[0].id) || pfad.schritte[0];
  const ev = evaluate(step), p = step.pruefung || {};
  const val = $("pf-val"), verdict = $("pf-verdict"), go = $("pf-go"), text = $("pf-text"), mk = $("pf-mark");
  if (val) val.replaceChildren(...bigValue(ev));
  if (text) text.textContent = ev.text || "";
  if (mk) mk.replaceChildren(mark(verdictClass(ev)));
  if (verdict) { verdict.className = `verdict t-${verdictClass(ev)}`; verdict.replaceChildren(...verdictContent(ev, p)); }
  if (go) { go.disabled = ev.verdict === "offen"; go.textContent = goLabel(ev); }
}

function stepCard(pfad) {
  const entry = progress[pfad.id] || { schritte: {}, aktuell: pfad.schritte[0].id, fertig: null };
  const trail = pfad.schritte.filter((s) => !s.id.startsWith("ende")).map((s) => h("span", { class: entry.schritte[s.id] ? entry.schritte[s.id].verdict === "ok" ? "ok" : "crit" : s.id === entry.aktuell ? "now" : "" }));
  if (entry.fertig) {
    const res = pfad.ergebnisse[entry.fertig] || { titel: "Fertig", text: "" };
    return h("div", { class: "step", id: "step-focus" }, h("span", { class: "state-lbl" }, pfad.titel + " · Ergebnis"), h("div", { class: "trail", "aria-hidden": "true" }, ...trail), h("h2", { class: "h2" }, res.titel), h("p", { class: "p" }, res.text),
      h("div", { class: "btns" }, h("button", { class: "btn sec", type: "button", onclick: () => reset(pfad) }, "Pfad neu starten"), h("button", { class: "btn qt", type: "button", onclick: () => { active = null; renderPfade(); } }, "Zur Übersicht")));
  }
  const step = stepOf(pfad, entry.aktuell) || pfad.schritte[0];
  const index = pfad.schritte.indexOf(step) + 1;
  const ev = evaluate(step);
  const p = step.pruefung || {};
  const measure = p.typ === "signal" ? h("div", { class: "measure" },
    h("div", { class: "m-head" }, h("span", { class: "state-lbl" }, signalTitle(p.signal)), jump({ "data-info": `signal:${p.signal}` }, "Infoblatt")),
    h("span", { class: "m-big num", id: "pf-val" }, ...bigValue(ev)),
    h("span", { class: "sm" }, `Soll ${num(p.min, 2)} bis ${num(p.max, 2)} ${ev.einheit || ""} · ${p.quelle}`))
    : ev.text ? h("div", { class: "measure" }, h("div", { class: "m-head" }, h("span", { id: "pf-text", class: "p" }, ev.text), h("span", { id: "pf-mark" }, mark(verdictClass(ev)))), p.quelle ? h("span", { class: "sm" }, p.quelle) : null) : null;
  const verdictEl = step.art === "auto" ? h("span", { class: `verdict t-${verdictClass(ev)}`, id: "pf-verdict", role: "status" }, ...verdictContent(ev, p)) : null;
  const action = step.aktion ? h("button", { class: "btn sec", type: "button", onclick: () => {
    if (step.aktion.typ === "tab") emit("show-tab", step.aktion.tab);
    else if (step.aktion.typ === "scan") { emit("show-tab", "car"); emit("run-scan"); }
    else if (step.aktion.typ === "funktion") { const fn = state.functions && state.functions.funktionen.find((f) => f.id === step.aktion.funktion); if (!fn || !state.functions.verfuegbar || !state.status.schreiben_an) { toast("Funktion in dieser Version nicht freigeschaltet."); return; } startAction({ typ: "funktion", funktion: fn.id }); }
    else startAction(step.aktion);
  } }, step.aktion.text || "Ausführen …") : null;
  const buttons = step.art === "auto"
    ? [h("button", { class: "btn pri big-btn", type: "button", id: "pf-go", disabled: ev.verdict === "offen", onclick: () => { const now = evaluate(step); if (now.verdict !== "offen") record(pfad, step, now.verdict); } }, goLabel(ev)),
      h("button", { class: "btn qt small", type: "button", onclick: () => record(pfad, step, "ok") }, "Von Hand: bestanden"), h("button", { class: "btn qt small", type: "button", onclick: () => record(pfad, step, "fehler") }, "Von Hand: nicht bestanden")]
    : [h("button", { class: "btn pri big-btn", type: "button", onclick: () => record(pfad, step, "ok") }, step.ja || "Ja, bestanden"), h("button", { class: "btn sec big-btn", type: "button", onclick: () => record(pfad, step, "fehler") }, step.nein || "Nein, nicht bestanden")];
  return h("div", { class: "step", id: "step-focus" },
    h("div", { class: "sec-head" }, h("span", { class: "state-lbl" }, `${pfad.titel} · Schritt ${index} von ${pfad.schritte.filter((s) => !s.id.startsWith("ende")).length}`), h("button", { class: "btn qt small", type: "button", onclick: () => { active = null; renderPfade(); } }, "Übersicht")),
    h("div", { class: "trail", "aria-hidden": "true" }, ...trail),
    h("h2", { class: "h2" }, step.titel), h("p", { class: "p" }, step.ziel),
    measure, verdictEl,
    step.hinweis ? h("div", { class: "blk" }, h("p", { class: "eyebrow" }, "So geht es"), step.hinweis) : null,
    action,
    h("div", { class: "btns" }, ...buttons),
    h("button", { class: "btn qt small", type: "button", onclick: () => reset(pfad) }, "Pfad zurücksetzen"));
}

export function renderPfade() {
  const root = $("pfade");
  const pfade = WISSEN.pruefpfade || [];
  if (!pfade.length) { root.replaceChildren(h("p", { class: "hint" }, "Keine Prüfpfade hinterlegt.")); return; }
  const pfad = active && pfade.find((p) => p.id === active);
  if (pfad) { root.replaceChildren(stepCard(pfad)); return; }
  root.replaceChildren(h("div", { class: "pfade" }, ...pfade.map((p) => {
    const sum = pfadSummary(p);
    const pct = Math.round((sum.done / Math.max(1, sum.total)) * 100);
    return h("button", { class: "tap pfad", type: "button", onclick: () => { active = p.id; renderPfade(); } },
      h("span", {}, h("div", { class: "t" }, p.titel), h("div", { class: "d" }, sum.result ? `Ergebnis: ${sum.result.titel}` : sum.done ? `${sum.done} von ${sum.total} Schritten` : p.kurz)),
      h("span", { class: "r " + (sum.result ? (sum.failed ? "warn" : "ok") : "muted") }, sum.result ? "fertig" : sum.done ? `${pct} %` : `${sum.total} Schritte`),
      h("span", { class: "chev", "aria-hidden": "true" }, "›"),
      sum.done ? h("span", { class: "prog" }, h("i", { class: sum.result ? (sum.failed ? "crit" : "ok") : "", style: `width:${sum.result ? 100 : pct}%` })) : null);
  })));
}

export function pfadResults() {
  return (WISSEN.pruefpfade || []).map((p) => ({ pfad: p, ...pfadSummary(p) })).filter((x) => x.done > 0);
}

export function initPfade() {
  load();
  on("render", () => { load(); renderPfade(); });
  on("tab", (id) => { if (id === "check") renderPfade(); });
  on("live-tick", () => { if (active && !$("view-check").hidden) refreshStep(); });
}
