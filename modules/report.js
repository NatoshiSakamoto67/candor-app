/* Bereich Bericht in drei Arten wie in der Werkstatt-Software: Eingangsbefund (Pre-Scan), Ausgangsbefund (Post-Scan
   nach der Reparatur) und Vergleich. Dazu Readiness, Ist-Soll, KI mit Belegen, Prüfpfade, Aufnahmen, Verlauf.
   Lokal gedruckt (Browser: als PDF speichern) oder als HTML geteilt. Keine Hersteller-Cloud. */
import { $, h, num, icon, mark, clockFull, clockTime, download, storageGet, storageSet, toast } from "./dom.js";
import { vehicleLabel } from "./fahrzeuge.js";
import { lockup } from "./marke.js";
import { buildCase, addCase } from "./faelle.js";
import { state, on, emit, logEvent, faultSet, firstReadiness, signalTitle, captureBefund } from "./state.js";
import { compareFaults, unscannedBefore, workshopLines } from "./befund.js";
import { runScan } from "./vehicle.js";
import { go } from "./shell.js";
import { busy, withTimeout } from "./vorgang.js";
import { recordings, stats } from "./recorder.js";
import { pfadResults } from "./pfade.js";

const opts = { auftrag: "", vin: true, fassung: "werkstatt", art: "vergleich", abschnitte: null, ...storageGet("kfzdiag-bericht", {}) };
const ARTEN = [["vorher", "Eingangsbefund", "vor der Reparatur"], ["nachher", "Ausgangsbefund", "nach der Reparatur"], ["vergleich", "Vergleich", "vorher und nachher"]];
/* Abschnitte je Fassung: Kunde bekommt das Verständliche, Werkstatt alles. Die Wahl lässt sich vor dem Druck ändern. */
const SECTIONS = [
  ["diff", "Befund", befundSection, true],
  ["readiness", "Readiness", readinessSection, true],
  ["soll", "Ist gegen Soll", sollSection, false],
  ["ki", "KI-Bewertung", kiSection, true],
  ["pfade", "Prüfpfade", pfadSection, true],
  ["arbeiten", "Durchgeführte Arbeiten", arbeitenSection, true],
  ["rec", "Aufnahmen", recSection, false],
  ["log", "Verlauf und Schreibprotokoll", logSection, false],
];
const activeSections = () => opts.abschnitte || SECTIONS.filter(([, , , kunde]) => opts.fassung === "werkstatt" || kunde).map(([id]) => id);
const saveOpts = () => storageSet("kfzdiag-bericht", opts);
const SICHER = { belegt: "belegt", plausibel: "plausibel", vermutung: "Vermutung" };

function table(head, rows) {
  return h("table", {}, h("thead", {}, h("tr", {}, ...head.map((x) => h("th", {}, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c, i) => h("td", { class: typeof c === "number" || (typeof c === "string" && /^[-−+]?\d/.test(c) && i > 0) ? "num" : "" }, c))))));
}

const faultRow = (f, status) => [f.code, f.wo, f.beschreibung, f.art, ...(status ? [status] : [])];
const kmText = (km) => (km != null ? `${km.toLocaleString("de-DE")} km` : "Kilometerstand nicht erfasst");

/* Ein Befund für sich: Zeitpunkt, Kilometer, Fehler, Steuergeräte. */
function singleBefund(b, title) {
  if (!b) return h("section", { class: "sec" }, h("h3", {}, title), h("p", { class: "hint" }, "Noch nicht erfasst. Den Nachher-Scan startest du oben über »Nachher-Scan starten«, nachdem repariert oder gelöscht wurde."));
  const faults = [...b.faults.values()];
  return h("section", { class: "sec" }, h("h3", {}, `${title} · ${clockFull(b.at)} · ${kmText(b.km)}`),
    h("div", { class: "diff" },
      h("div", { class: `box ${faults.length ? "up" : "ok"}` }, h("h3", {}, "Fehlercodes"), h("span", { class: "n" }, faults.length)),
      h("div", { class: "box" }, h("h3", {}, "Steuergeräte"), h("span", { class: "n" }, b.ecus || "–")),
      h("div", { class: "box" }, h("h3", {}, "Motorlampe"), h("span", { class: "n" }, b.readiness ? (b.readiness.mil ? "AN" : "AUS") : "–"))),
    faults.length ? table(["Code", "Steuergerät", "Bedeutung", "Art"], faults.map((f) => faultRow(f))) : h("p", { class: "hint" }, "Kein Fehler gespeichert."),
    b.ecuList && b.ecuList.length && opts.fassung === "werkstatt" ? table(["Steuergerät", "Adresse", "Fehler"], b.ecuList.map((e) => [e.name, e.adresse, e.fehler || "keine"])) : null,
    b.ecus ? null : h("p", { class: "hint" }, "Ohne Vollscan: nur die OBD-Fehler aus Motor und Getriebe."));
}

/* Vergleich: Eingangsbefund gegen Ausgangsbefund, ohne Nachher-Scan gegen den aktuellen Stand. */
function compareBefund() {
  const before = state.snapshot ? state.snapshot.faults : faultSet();
  const after = state.postscan ? state.postscan.faults : faultSet();
  const afterBefund = state.postscan || { ecus: state.ecus.length, ecuList: state.ecus.map((e) => ({ name: e.name, adresse: e.adresse })) };
  const { gone, fresh, unchecked, stay } = compareFaults(before, after, unscannedBefore(state.snapshot, afterBefund));
  const nachher = state.postscan ? `Ausgangsbefund ${clockTime(state.postscan.at)}` : `aktueller Stand ${clockTime(new Date())}, noch kein Nachher-Scan`;
  return h("section", { class: "sec" }, h("h3", {}, `Eingangsbefund (${state.snapshot ? clockTime(state.snapshot.at) : "Start"}) gegen ${nachher}`),
    h("div", { class: "diff" },
      h("div", { class: "box ok" }, h("h3", {}, "Behoben oder gelöscht"), h("span", { class: "n" }, gone.length)),
      h("div", { class: "box up" }, h("h3", {}, "Neu dazugekommen"), h("span", { class: "n" }, fresh.length)),
      h("div", { class: "box" }, h("h3", {}, "Weiter bestehend"), h("span", { class: "n" }, stay.length))),
    gone.length + fresh.length + stay.length + unchecked.length ? table(["Code", "Steuergerät", "Bedeutung", "Art", "Stand"], [...fresh.map((f) => faultRow(f, "neu")), ...stay.map((f) => faultRow(f, "weiter bestehend")), ...unchecked.map((f) => faultRow(f, "vorher nicht geprüft")), ...gone.map((f) => faultRow(f, "behoben/gelöscht"))]) : h("p", { class: "hint" }, "Kein Fehler gespeichert, weder vorher noch nachher."),
    unchecked.length ? h("p", { class: "hint" }, `${unchecked.length} Fehler stammen aus Steuergeräten, die beim Eingangsbefund noch nicht abgefragt waren (kein Vollscan vorher). Ob sie schon da waren, lässt sich nicht sagen.`) : null);
}

function befundSection() {
  if (opts.art === "vorher") return singleBefund(state.snapshot, "Eingangsbefund");
  if (opts.art === "nachher") return singleBefund(state.postscan, "Ausgangsbefund");
  return compareBefund();
}

function readinessSection() {
  const r = opts.art === "vorher" && state.snapshot ? state.snapshot.readiness : opts.art === "nachher" && state.postscan ? state.postscan.readiness : firstReadiness();
  if (!r) return null;
  const open = r.tests.filter((t) => !t.fertig);
  return h("section", { class: "sec" }, h("h3", {}, "Bereitschaftstests (Readiness) und Motorkontrollleuchte"),
    h("p", {}, `Motorkontrollleuchte ${r.mil ? "AN" : "AUS"}, ${r.anzahl_fehler} Abgasfehler gemeldet, ${r.tests.length - open.length} von ${r.tests.length} Tests fertig${open.length ? `. Offen: ${open.map((t) => t.name).join(", ")}` : ". AU-bereit aus Sicht der Readiness."}`));
}

function sollSection() {
  const a = state.analysis;
  if (!a || !a.sollwerte.vergleich.length) return null;
  return h("section", { class: "sec" }, h("h3", {}, `Ist gegen Soll · ${a.sollwerte.zustand_text}`),
    table(["Messwert", "Ist", "Soll", "Bewertung", "Art"], a.sollwerte.vergleich.map((r) => [signalTitle(r.signal), num(r.ist, 2), `${num(r.soll_min)} bis ${num(r.soll_max)}`, r.bewertung === "ok" ? "im Bereich" : r.bewertung === "zu_hoch" ? "zu hoch" : "zu niedrig", r.art === "hersteller" ? `Herstellerwert (${r.quelle})` : "Richtwert, kein Herstellerwert"])));
}

function kiSection() {
  if (!state.ki || !state.ki.ok) return null;
  const b = state.ki.bewertung;
  return h("section", { class: "sec" }, h("h3", {}, `KI-Bewertung (${state.ki.modell}) · Ampel ${b.ampel}`),
    h("p", {}, b.zusammenfassung, " ", b.fahrbereit),
    table(["Ursache", "Wahrscheinlichkeit", "Stufe", "Belege"], b.ursachen.map((u) => [u.titel, u.wahrscheinlichkeit, SICHER[u.sicherheit] || "Vermutung", (u.belege || []).map((x) => x.text).join("; ") || "kein Beleg in den Daten"])),
    h("p", {}, h("b", {}, "Prüfschritte: "), b.pruefschritte.map((p, i) => `${i + 1}. ${p.schritt} (${p.werkzeug}, ${p.minuten} min)${state.kiChecked.has(i) ? " ✓ erledigt" : ""}`).join(" ")),
    b.unklar.length ? h("p", {}, h("b", {}, "Unklar, keine Quelle: "), b.unklar.join(" ")) : null);
}

const ERGEBNIS_TEXT = { behoben: "behoben, durch den Nachher-Scan belegt", teilweise: "teilweise behoben", offen: "nicht behoben" };
function arbeitenSection() {
  const f = state.sitzung.fall;
  if (!f) return null;
  return h("section", { class: "sec" }, h("h3", {}, "Durchgeführte Arbeiten"),
    h("p", {}, f.massnahme), f.teile ? h("p", {}, h("b", {}, "Teile: "), f.teile) : null,
    h("p", {}, h("b", {}, "Ergebnis: "), ERGEBNIS_TEXT[f.ergebnis], f.behoben.length ? ` (weg: ${f.behoben.join(", ")})` : "", f.bleibt.length ? `, weiter vorhanden: ${f.bleibt.join(", ")}` : "", f.neu.length ? `, neu: ${f.neu.join(", ")}` : ""));
}

/* Nach dem Nachher-Scan: kurz festhalten, was gemacht wurde. Der Vergleich der Befunde belegt das Ergebnis. */
function renderCaseBox() {
  const box = $("case-box");
  if (!box) return;
  const ready = state.snapshot && state.postscan;
  box.hidden = !ready;
  if (!ready) return;
  const f = state.sitzung.fall;
  box.classList.toggle("saved", Boolean(f && !box.dataset.edit));
  if (f && !box.dataset.edit) {
    box.replaceChildren(h("span", { class: `cs t-${f.ergebnis === "behoben" ? "ok" : f.ergebnis === "teilweise" ? "warn" : "crit"}` }, ERGEBNIS_TEXT[f.ergebnis]),
      h("span", { class: "sm" }, `Fall gespeichert: ${f.massnahme.slice(0, 80)}${f.massnahme.length > 80 ? " …" : ""}`),
      h("button", { class: "btn qt small", type: "button", onclick: () => { box.dataset.edit = "1"; renderCaseBox(); } }, "Ändern"));
    return;
  }
  const m = h("textarea", { class: "inp txt", id: "case-massnahme", rows: 2, maxlength: 600, placeholder: "Was wurde gemacht? z. B. Zündspule Zylinder 1 ersetzt, Unterdruckschlauch erneuert" }, f ? f.massnahme : "");
  const t = h("input", { class: "inp txt", id: "case-teile", maxlength: 300, placeholder: "Teile (optional), z. B. Bosch 0221504470", value: f ? f.teile : "" });
  const msg = h("span", { class: "sm", role: "status" });
  box.replaceChildren(h("label", { class: "eyebrow", for: "case-massnahme" }, "Durchgeführte Arbeiten"), m, t,
    h("div", { class: "rt-row" }, h("button", { class: "btn pri", type: "button", onclick: () => {
      const r = buildCase({ fahrzeug: state.fahrzeug || {}, vorher: state.snapshot, nachher: state.postscan, massnahme: m.value, teile: t.value, km: state.sitzung.km, id: f && f.id });
      if (r.fehler) { msg.textContent = r.fehler; m.focus(); return; }
      storageSet("kfzdiag-faelle", addCase(storageGet("kfzdiag-faelle", []), r.fall));
      state.sitzung = { ...state.sitzung, fall: r.fall };
      delete box.dataset.edit;
      logEvent(`Fall gespeichert: ${ERGEBNIS_TEXT[r.fall.ergebnis]}`);
      toast("Fall gespeichert. Er hilft bei ähnlichen Autos.");
      renderCaseBox(); renderReport();
    } }, icon("tick"), "Fall speichern"), msg),
    h("p", { class: "sm" }, "Wird ohne Kennzeichen und FIN gespeichert. Taucht derselbe Code bei einem ähnlichen Auto auf, zeigen Infoblatt und KI diesen Fall."));
}

function pfadSection() {
  const res = pfadResults();
  if (!res.length) return null;
  return h("section", { class: "sec" }, h("h3", {}, "Geführte Prüfpfade"),
    table(["Pfad", "Schritte", "Ergebnis"], res.map((x) => [x.pfad.titel, `${x.done} von ${x.total}`, x.result ? `${x.result.titel}` : "nicht abgeschlossen"])),
    ...res.map((x) => h("p", { class: "hint" }, `${x.pfad.titel}: `, Object.entries(x.entry.schritte).map(([id, s]) => { const st = x.pfad.schritte.find((q) => q.id === id); return `${st ? st.titel : id} ${s.verdict === "ok" ? "Pass" : "Fail"}${s.wert != null ? ` (${num(s.wert, 2)} ${s.einheit || ""})` : ""}`; }).join(" · "))));
}

function recSection() {
  if (!recordings.length) return null;
  return h("section", { class: "sec" }, h("h3", {}, "Aufnahmen"),
    ...recordings.slice(0, 5).map((r) => h("div", {}, h("p", {}, h("b", {}, r.name), ` · ${new Date(r.von * 1000).toLocaleString("de-DE")} · ${r.t.length} s${r.marks.length ? ` · ${r.marks.map((m) => `${num(m.t - r.t[0], 0)} s: ${m.text}`).join("; ")}` : ""}`),
      table(["Kanal", "min", "max", "Ø"], Object.entries(r.sig).map(([sig, arr]) => { const st = stats(arr) || {}; return [signalTitle(sig), num(st.min, 2), num(st.max, 2), num(st.avg, 2)]; })))));
}

function logSection() {
  if (!state.events.length) return null;
  return h("section", { class: "sec" }, h("h3", {}, "Verlauf und Schreibprotokoll dieser Sitzung"),
    table(["Zeit", "Ereignis"], [...state.events].reverse().map((e) => [clockTime(e.at), e.text])));
}

export function renderReport() {
  const st = state.status || {}, v = state.vehicle || {};
  const art = ARTEN.find(([id]) => id === opts.art) || ARTEN[2];
  const mech = state.werkstatt && state.werkstatt.mechaniker;
  const paper = $("report");
  paper.replaceChildren(
    h("header", {}, h("div", { class: "letterhead" }, ...(workshopLines(state.werkstatt).length ? workshopLines(state.werkstatt) : ["Werkstatt"]).map((line, i) => h("p", { class: i ? "hint" : "eyebrow" }, line))),
      h("h2", {}, `${art[1]} ${art[2]}`), h("p", { class: "hint" }, opts.fassung === "kunde" ? "Fassung für Kundin oder Kunde" : "Werkstattfassung"),
      h("p", {}, `${state.fahrzeug ? `${vehicleLabel(state.fahrzeug)} · ${kmText(state.sitzung.km)} · erkannt als ` : ""}${st.fahrzeug || "Fahrzeug"}${v.marke && v.marke !== "unbekannt" ? ` · ${v.marke}` : ""} · FIN ${opts.vin ? ((state.fahrzeug && state.fahrzeug.fin) || v.vin_maskiert || "–") : "geschwärzt"}${opts.auftrag ? ` · Auftrag ${opts.auftrag}` : ""}`),
      h("p", { class: "hint" }, `${clockFull(new Date())} · ${st.protokoll || "Protokoll automatisch"} · ${state.ecus.length ? `${state.ecus.length} Steuergeräte gescannt` : "kein Vollscan"}${st.simuliert ? " · SIMULATOR, synthetische Werte" : ""}`)),
    ...SECTIONS.filter(([id]) => activeSections().includes(id)).map(([, , fn]) => fn()).filter(Boolean),
    h("div", { class: "report-brand" }, lockup(22, "small")),
    h("div", { class: "sign" }, h("div", {}, `Datum, Unterschrift Werkstatt${mech ? ` (${mech})` : ""}`), h("div", {}, "Datum, Unterschrift Kunde")),
    h("p", { class: "foot" }, "Richtwerte sind allgemeine Werkstattwerte ohne Herstellerbezug, Herstellerwerte sind mit Quelle gekennzeichnet. Unbekannte Herstellercodes werden als unbekannt geführt, nichts wird geraten. Der Diagnose-Server speichert die FIN nur als Hash. Erstellt lokal mit CANdor, keine Übertragung an Dritte."));
}

/* Export als eigenständige Datei: Farben aus den Tokens von hell (Druckregel), nicht fest eingetragen. */
function printTokens() {
  const probe = h("div", { "data-accent": "signal", "data-theme": "hell", hidden: true });
  document.body.append(probe);
  const css = getComputedStyle(probe), t = (n) => css.getPropertyValue(n).trim();
  const out = { text: t("--text"), muted: t("--text-muted"), line: t("--line"), strong: t("--line-strong"), bg: t("--surface-1"), well: t("--surface-2"), crit: t("--crit") };
  probe.remove();
  return out;
}
function standaloneHtml() {
  const k = printTokens();
  const css = `body{font:13px/1.45 system-ui,sans-serif;color:${k.text};background:${k.bg};margin:24px;max-width:900px}h2{font-size:22px;margin:0}h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${k.muted};border-bottom:1px solid ${k.line};padding-bottom:4px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:5px 7px;border-bottom:1px solid ${k.line};vertical-align:top}th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${k.muted}}td.num{text-align:right}.eyebrow,.hint,.sm,.foot{color:${k.muted}}.box{padding:10px 12px;border:1px solid ${k.line};border-radius:6px;background:${k.well}}.diff{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.diff .n{font-size:26px;font-weight:600}.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}.sign div{border-top:1px solid ${k.text};padding-top:6px;font-size:12px;color:${k.muted}}header{border-bottom:2px solid ${k.text};padding-bottom:10px}.report-brand{display:flex;gap:8px;align-items:center;margin-top:20px;color:${k.muted};font-size:12px}.report-brand img{display:none}.wordmark b{font-family:monospace}.letterhead p{margin:0}svg{display:none}`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Diagnosebericht</title><style>${css}</style></head><body>${$("report").innerHTML}</body></html>`;
}
async function share() {
  renderReport();
  const html = standaloneHtml();
  const name = `Diagnosebericht_${new Date().toISOString().slice(0, 10)}.html`;
  try {
    const file = new File([html], name, { type: "text/html" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Diagnosebericht" }); return; }
  } catch (err) { if (err && err.name === "AbortError") return; }
  download(name, html, "text/html");
  toast("Teilen wird hier nicht unterstützt, Bericht als HTML gespeichert.");
}

function renderTools() {
  const werkstatt = h("button", { class: "btn sec", type: "button", onclick: () => go("werkstatt") }, state.werkstatt ? `Werkstatt: ${state.werkstatt.name}` : "Werkstattdaten eintragen");
  const auftrag = h("input", { class: "inp txt", value: opts.auftrag, placeholder: "Auftrag oder Kennzeichen", "aria-label": "Auftrag" });
  auftrag.addEventListener("input", () => { opts.auftrag = auftrag.value; saveOpts(); renderReport(); });
  const version = h("div", { class: "seg", id: "report-version", role: "group", "aria-label": "Fassung" }, ...[["kunde", "Kunde"], ["werkstatt", "Werkstatt"]].map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(opts.fassung === id), onclick: () => set({ fassung: id, abschnitte: null }) }, label)));
  const vin = h("div", { class: "seg", role: "group", "aria-label": "FIN" }, ...[[true, "FIN zeigen"], [false, "FIN geschwärzt"]].map(([val, label]) =>
    h("button", { type: "button", "aria-pressed": String(opts.vin === val), onclick: () => set({ vin: val }) }, label)));
  const active = activeSections();
  const sections = h("div", { class: "report-sections", id: "report-sections", role: "group", "aria-label": "Abschnitte" }, ...SECTIONS.map(([id, label]) =>
    h("button", { class: "chan-row", type: "button", "aria-pressed": String(active.includes(id)), onclick: () => set({ abschnitte: active.includes(id) ? active.filter((x) => x !== id) : [...active, id] }) },
      h("span", { class: "chk" }, icon("tick")), h("span", { class: "cr-t" }, label))));
  const arten = h("div", { class: "seg", id: "report-art", role: "group", "aria-label": "Berichtsart" }, ...ARTEN.map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(opts.art === id), onclick: () => set({ art: id }) }, label)));
  $("report-tools").replaceChildren(
    h("div", { class: "rt-row" }, arten),
    h("div", { class: "rt-row scan-state", id: "scan-state" }),
    h("div", { class: "case-box", id: "case-box", hidden: true }),
    h("div", { class: "rt-row" }, version, vin),
    h("div", { class: "rt-row" }, werkstatt, auftrag),
    sections,
    TOOL_ACTIONS());
  scanKey = null;
  renderScanState();
  renderCaseBox();
}

/* Stand von Eingangs- und Ausgangsbefund; nur bei Änderung neu gebaut (die Statusleiste meldet sich jede Sekunde). */
let scanKey = null;
function renderScanState() {
  const box = $("scan-state");
  const pre = state.snapshot, post = state.postscan;
  const key = [pre && pre.at.getTime(), pre && pre.faults.size, pre && pre.ecus, state.scanning, post && post.at.getTime(), Boolean(state.status), state.postscanLaeuft].join("|");
  if (!box || key === scanKey) return;
  scanKey = key;
  box.replaceChildren(...[
    h("span", { class: "sm" }, mark(pre ? (pre.ecus ? "ok" : "warn") : "pending"), pre ? ` Eingangsbefund ${clockTime(pre.at)}, ${pre.faults.size} Fehler${pre.ecus ? `, ${pre.ecus} Steuergeräte` : ", ohne Vollscan"}` : " Eingangsbefund nach dem Verbinden"),
    pre && !pre.ecus && !post && state.status ? h("button", { class: "btn qt", type: "button", disabled: state.scanning || state.postscanLaeuft || null, onclick: async () => { await runScan(); scanKey = null; renderScanState(); renderReport(); } }, "Vollscan für Eingangsbefund") : null,
    h("span", { class: "sm" }, mark(post ? "ok" : "pending"), post ? ` Ausgangsbefund ${clockTime(post.at)}, ${post.faults.size} Fehler` : " Ausgangsbefund offen"),
    h("button", { class: "btn sec", type: "button", id: "postscan-btn", disabled: !state.status || state.postscanLaeuft || null, onclick: runPostScan }, icon("reset"), state.postscanLaeuft ? "Nachher-Scan läuft …" : post ? "Nachher-Scan wiederholen" : "Nachher-Scan starten"),
  ].filter(Boolean));
}

const TOOL_ACTIONS = () => h("div", { class: "rt-row" },
  h("button", { class: "btn pri", type: "button", onclick: () => { renderReport(); window.print(); } }, icon("print"), "Drucken / PDF"),
  h("button", { class: "btn sec", type: "button", onclick: share }, icon("share"), "Teilen"),
  h("button", { class: "btn qt", type: "button", onclick: () => { renderReport(); download(`Diagnosebericht_${new Date().toISOString().slice(0, 10)}.html`, standaloneHtml(), "text/html"); } }, icon("download"), "HTML"));

/* Nachher-Scan: Vollscan plus Fehlerspeicher neu lesen, dann als Ausgangsbefund festhalten. */
async function runPostScan() {
  if (!state.status || state.postscanLaeuft) return;
  state.postscanLaeuft = true;
  renderTools();
  const done = busy("Nachher-Scan");
  try {
    const ok = await runScan();
    if (!ok) return;
    await withTimeout(new Promise((resolve, reject) => emit("reload", { resolve, reject })), 20000, "Der Fehlerspeicher wurde in 20 Sekunden nicht neu gelesen.");
    state.postscan = captureBefund();
    logEvent(`Nachher-Scan: ${state.postscan.faults.size} Fehler, ${state.postscan.ecus} Steuergeräte`, "scan");
    toast("Ausgangsbefund erfasst.");
    set({ art: "vergleich" });
    emit("saved-state");
  } catch (error) {
    toast(`Nachher-Scan gescheitert: ${error.message}`);
  } finally {
    state.postscanLaeuft = false;
    done();
    renderTools();
    renderReport();
  }
}
function set(patch) { Object.assign(opts, patch); saveOpts(); renderTools(); renderReport(); }

export function initReport() {
  renderTools();
  on("status", () => { if (!$("view-report").hidden) renderScanState(); });
  on("werkstatt", () => renderTools());
  on("tab", (id) => { if (id === "report") renderTools(); });
  on("tab", (id) => { if (id === "report") renderReport(); });
  on("render", () => { if (!$("view-report").hidden) renderReport(); });
}
