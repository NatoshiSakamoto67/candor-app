/* Fehlerspeicher: oben auf einen Blick (wie viele, wie dringend, Motorlampe), darunter eine Liste nach Dringlichkeit,
   daneben zum Tiefergraben die KI mit Belegen. Ein Tipp auf einen Fehler öffnet seine Detailseite. */
import { $, h, chev, mark, jump, infoBtn, icon } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, DTC_REG, sev, obdList, senderName, logEvent, on, emit, faultSet, firstReadiness } from "./state.js";
import { belegSpec } from "./info.js";
import { startAction } from "./approval.js";
import { busy, withTimeout } from "./vorgang.js";

/* Vorher/Nachher direkt an der Karte: neu seit Sitzungsbeginn oder weiter bestehend (obd-diff). */
function diffOf(diffKey, kind) {
  const snap = state.snapshot;
  if (!snap || (kind === "ecu" && !snap.ecus)) return null;
  return snap.faults.has(diffKey) ? "weiter" : "neu";
}
function faultCard({ dtc, where, key, diffKey, kind }) {
  const diff = diffOf(diffKey, kind);
  return h("button", { class: `tap fcard ${sev(dtc)}`, type: "button", "data-info": `dtc:${key}` },
    h("span", { class: "stripe", "aria-hidden": "true" }),
    h("span", { class: "body" },
      h("span", { class: "top" }, h("span", { class: "code" }, dtc.code), diff === "neu" ? h("span", { class: "cs t-crit diff", "data-diff": "neu" }, "neu") : null, h("span", { class: "where" }, where)),
      h("span", { class: "desc" + (dtc.bekannt === false ? " unknown" : "") }, dtc.bekannt === false ? "Herstellerspezifisch, keine Beschreibung hinterlegt" : dtc.beschreibung)), chev());
}

/* Alle Fehler aus OBD und Vollscan in einer Liste, je Fehler einmal, mit Herkunft für die Detailseite. */
function collect() {
  DTC_REG.clear();
  const out = [];
  const seen = new Set();
  for (const d of [...obdList("gespeichert"), ...obdList("permanent"), ...obdList("vorlaeufig")]) {
    const key = `obd|${d.sender}|${d.code}`;
    if (seen.has(key)) continue;
    seen.add(key); DTC_REG.set(key, { dtc: d, where: senderName(d.sender), kind: "obd" });
    out.push({ dtc: d, where: `${senderName(d.sender)} · Abgas (OBD)`, key, diffKey: `${senderName(d.sender)}|${d.code}`, kind: "obd" });
  }
  /* Motor und Getriebe (0x7E0, 0x7E1) melden ihre Abgasfehler schon über OBD, wie in totalFaults nicht doppelt zählen. */
  for (const e of state.ecus.filter((x) => !/^0x7E[01]$/i.test(x.adresse))) for (const d of e.fehler) {
    const key = `ecu|${e.adresse}|${d.code}`;
    DTC_REG.set(key, { dtc: d, where: e.name, kind: "ecu", ecu: e });
    out.push({ dtc: d, where: e.name, key, diffKey: `${e.name}|${d.code}`, kind: "ecu" });
  }
  return out;
}
const GROUPS = [
  { id: "aktiv", tone: "crit", titel: "Jetzt aktiv", text: "Der Fehler liegt gerade vor. Hier zuerst suchen.", test: (d) => d.aktiv },
  { id: "gespeichert", tone: "warn", titel: "Gespeichert, gerade nicht aktiv", text: "Trat auf und wurde bestätigt, ist im Moment aber nicht da. Oft sporadisch.", test: (d) => !d.aktiv && d.bestaetigt !== false },
  { id: "vorlaeufig", tone: "neutral", titel: "Vorläufig", text: "Einmal erkannt, noch nicht bestätigt. Kann von selbst wieder verschwinden.", test: (d) => !d.aktiv && d.bestaetigt === false },
];

function renderHero(list) {
  const r = firstReadiness();
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, list.filter((x) => g.test(x.dtc)).length]));
  const fresh = list.filter((x) => diffOf(x.diffKey, x.kind) === "neu").length;
  const tone = counts.aktiv ? "crit" : counts.gespeichert ? "warn" : list.length ? "warn" : "ok";
  const n = list.length;
  const lamp = r ? (r.mil ? "Die Motorkontrollleuchte ist an." : "Die Motorkontrollleuchte ist aus.") : "";
  const now = counts.aktiv ? `${counts.aktiv} ${counts.aktiv === 1 ? "Fehler ist" : "Fehler sind"} gerade aktiv.` : n ? "Keiner ist gerade aktiv." : "Das Auto meldet nichts.";
  const scanNote = state.scanned ? "" : " Bisher nur Abgasfehler gelesen, die übrigen Steuergeräte kommen mit dem Vollscan.";
  const stat = (label, value, t, info) => h(info ? "button" : "span", { class: `hstat t-${t}`, type: info ? "button" : null, "data-info": info }, h("span", { class: "hv" }, String(value)), h("span", { class: "hl" }, label));
  $("fault-hero").className = `card hero fault-hero t-${tone}`;
  $("fault-hero").replaceChildren(
    h("span", { class: "hero-ic", "aria-hidden": "true" }, icon3d("mil")),
    h("div", { class: "hero-b" },
      h("p", { class: "eyebrow" }, "Fehlerspeicher"),
      h("h2", { class: "hero-t" }, n ? `${n} ${n === 1 ? "Fehler" : "Fehler"} im Speicher` : "Kein Fehler gespeichert"),
      h("p", { class: "hero-p" }, [lamp, now].filter(Boolean).join(" ") + scanNote),
      h("div", { class: "hero-actions" },
        n ? h("button", { class: "btn pri", type: "button", onclick: findCause }, icon("bolt"), state.ki && state.ki.ok ? "Ursachen ansehen" : "Ursache finden lassen") : null,
        state.scanned ? null : h("button", { class: "btn sec", type: "button", onclick: () => { emit("show-tab", "car"); emit("run-scan"); } }, "Vollscan starten"))),
    h("div", { class: "hero-stats" },
      stat("aktiv", counts.aktiv, counts.aktiv ? "crit" : "neutral", "begriff:aktiv"),
      stat("gespeichert", counts.gespeichert, counts.gespeichert ? "warn" : "neutral", "begriff:gespeichert"),
      stat("vorläufig", counts.vorlaeufig, "neutral", "begriff:vorlaeufig"),
      stat("neu seit Start", fresh, fresh ? "crit" : "neutral", null)));
}

function findCause() {
  const panel = $("ki-panel");
  panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  if (!state.ki || !state.ki.ok) runKi();
}

export function renderFaults() {
  const list = collect();
  renderHero(list);
  const groups = GROUPS.map((g) => ({ ...g, items: list.filter((x) => g.test(x.dtc)) })).filter((g) => g.items.length);
  $("fault-list").replaceChildren(...goneNote(), ...(groups.length ? groups.map((g) => h("section", { class: `fgroup t-${g.tone}` },
    h("div", { class: "fgroup-h" }, mark(g.tone === "neutral" ? "pending" : g.tone), h("h3", {}, g.titel), h("span", { class: "fgroup-n" }, String(g.items.length))),
    h("p", { class: "fgroup-p" }, g.text),
    h("div", { class: "list" }, ...g.items.map(faultCard))))
    : [h("div", { class: "empty card" }, icon3d("clipboard", "t-ok"), h("p", { class: "h3" }, "Fehlerspeicher leer"), h("p", { class: "sm" }, state.scanned ? "Weder die Abgas-Steuergeräte noch der Vollscan melden einen Fehler." : "Die Abgas-Steuergeräte melden nichts. Für alle anderen Steuergeräte den Vollscan starten."))]));
  $("obd-clear").disabled = !state.status.schreiben_an || !obdList("gespeichert").length;
  $("obd-clear").hidden = !obdList("gespeichert").length;
  renderKi();
}

const LAMP = { gruen: "ok", gelb: "warn", rot: "crit" };
/* Seit Sitzungsbeginn verschwundene Fehler, als Zeile über den Karten. */
function goneNote() {
  const snap = state.snapshot;
  if (!snap) return [];
  const now = faultSet();
  const gone = [...snap.faults.keys()].filter((k) => !now.has(k) && (snap.ecus || !state.ecus.some((e) => k.startsWith(e.name + "|"))));
  return gone.length ? [h("p", { class: "gone-note" }, h("span", { class: "cs t-ok", "data-diff": "geloescht" }, "gelöscht"), `${gone.length} Fehler seit ${snap.at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} nicht mehr gemeldet: ${gone.map((k) => k.split("|")[1]).join(", ")}`)] : [];
}

const BELEG_KURZ = { messwert: "Messwert", freeze_frame: "Freeze-Frame", readiness: "Readiness", fehlercode: "Code", dokument: "Dokument" };
function causeRow(u, i) {
  const width = { hoch: 88, mittel: 55, niedrig: 25 };
  const belege = u.belege || [];
  return h("div", { class: "tap cause" + (causesRevealed ? " on" : ""), role: "group", style: causesRevealed ? null : `transition-delay:${i * 80}ms` },
    h("button", { class: "unbtn t", type: "button", "data-info": `ursache:${i}` }, u.titel, h("span", { class: `lvl ${u.sicherheit || "vermutung"}` }, u.sicherheit || "Vermutung")),
    h("span", { class: "bar" }, h("i", { style: `width:${width[u.wahrscheinlichkeit] || 30}%` })),
    h("span", { class: "d" }, `Wahrscheinlichkeit ${u.wahrscheinlichkeit}` + (u.codes.length ? ` · ${u.codes.join(", ")}` : "")),
    h("span", { class: "chips belege" },
      ...belege.map((b) => jump({ "data-info": belegSpec(b) || "begriff:belege", title: b.text }, `${BELEG_KURZ[b.art] || b.art}: ${b.bezug}`)),
      belege.length ? null : jump({ class: "t-warn", "data-info": `ursache:${i}` }, "kein Beleg in den Daten")));
}

export function renderKi() {
  renderKiPanel();
  revealCauses();
}
function renderKiPanel() {
  const panel = $("ki-panel");
  const head = h("div", { class: "sec-head" }, h("div", { class: "ki-title" }, icon3d("robot", "sm3"), h("div", {}, h("p", { class: "eyebrow" }, "Tiefer graben, mit Belegen"), h("h2", {}, "Ursachen finden"))),
    infoBtn("begriff:belege", "Wie belegt die KI ihre Aussagen?"));
  if (!state.ki) {
    panel.replaceChildren(head, h("p", { class: "p" }, "Verknüpft Fehler, Freeze-Frame, Live-Werte, Readiness und Sollwert-Vergleich zu Ursachen und Prüfschritten. Jede Ursache zeigt ihre Belege und die Stufe belegt, plausibel oder Vermutung."),
      h("button", { class: "btn pri", type: "button", onclick: runKi }, icon("bolt"), "Ursachen finden lassen"));
    return;
  }
  if (!state.ki.ok) { panel.replaceChildren(head, h("p", { class: "p" }, state.ki.meldung), h("button", { class: "btn sec", type: "button", onclick: runKi }, "Erneut versuchen")); return; }
  const b = state.ki.bewertung;
  panel.replaceChildren(...[head,
    h("div", { class: "ki-verdict" }, h("span", { class: `lamp t-${LAMP[b.ampel] || "neutral"}` }, mark(LAMP[b.ampel] || "pending"), b.ampel.toUpperCase()), h("div", {}, h("p", { class: "ki-sum" }, b.zusammenfassung), h("p", { class: "sm" }, b.fahrbereit))),
    h("div", { class: "list" }, h("p", { class: "eyebrow" }, "Wahrscheinliche Ursachen, mit Belegen"), ...b.ursachen.map(causeRow)),
    h("div", { class: "list" }, h("p", { class: "eyebrow" }, "Prüfschritte, günstig zuerst"), h("ol", { class: "steps" }, ...b.pruefschritte.map((p, i) => h("li", {},
      h("button", { class: "tap kstep" + (state.kiChecked.has(i) ? " done" : ""), type: "button", "aria-pressed": String(state.kiChecked.has(i)), onclick: () => { state.kiChecked.has(i) ? state.kiChecked.delete(i) : state.kiChecked.add(i); renderKi(); } },
        h("span", { class: "num" }, i + 1), h("span", { class: "txt" }, p.schritt, h("span", { class: "d" }, " · " + p.werkzeug)), h("span", { class: "min" }, p.minuten + " min")))))),
    b.unklar.length ? h("div", { class: "blk" }, h("p", { class: "eyebrow" }, "Unklar, keine Quelle"), ...b.unklar.map((u) => h("div", {}, u))) : null,
    h("p", { class: "sm" }, `${state.ki.modell}${state.ki.anbieter === "beispiel" ? " · in der echten Software liefert das gewählte KI-Modell diese Bewertung" : ""}`)].filter(Boolean));
}

/* Ursachen blenden gestaffelt ein, Balken wachsen (motion.css, Abschnitt 5). */
let causesRevealed = false;
function revealCauses() {
  if (causesRevealed || !state.ki || !state.ki.ok) return;
  causesRevealed = true;
  requestAnimationFrame(() => requestAnimationFrame(() => $("ki-panel").querySelectorAll(".cause").forEach((el) => el.classList.add("on"))));
}
export async function runKi() {
  causesRevealed = false;
  $("ki-panel").replaceChildren(h("div", { class: "skel", "aria-label": "KI wertet aus", role: "status" }, h("p", { class: "sm" }, "KI wertet aus …"),
    ...[90, 70, 80].map((w) => h("span", { class: "sk", style: `height:14px;width:${w}%` }))));
  const done = busy("KI wertet aus");
  state.ki = await withTimeout(state.src.ki(), 60000, "Die KI hat in 60 Sekunden nicht geantwortet.").catch((e) => ({ ok: false, meldung: e.message })).finally(done);
  renderKi();
  if (state.ki.ok) logEvent("KI-Bewertung: " + state.ki.bewertung.ampel + ", " + state.ki.bewertung.ursachen.length + " Ursachen");
}

export function initFaults() {
  $("obd-clear").addEventListener("click", () => startAction({ typ: "obd_fehler_loeschen" }));
  on("render", renderFaults);
}
