// @ts-check
/* Diagnosepfad je Fehlercode: Karte mit Kette Code → Steuergerät → Messwerte → Bauteil → nächste Messung → Deutung.
   Daten vom Server (/api/diagnosepfad) oder im Direktmodus aus daten/diagnose/*.json plus state.live. */
import { h, num, mark } from "./dom.js";
import { state, signalTitle, logEvent, emit, DTC_REG } from "./state.js";
import { bauteileFuer } from "../kern/bauteilfehler.js";

const BEREICH = (m) => `${num(m.min)} bis ${num(m.max)} ${m.einheit || ""}`.trim();
const SICHERHEIT = { belegt: "belegt", plausibel: "plausibel", vermutung: "Vermutung" };

/** @param {{ status: string }} m */
export function tonFuer(m) { return m.status === "im_bereich" ? "ok" : m.status === "unter" || m.status === "ueber" ? "crit" : "warn"; }

/** @param {any} m */
export function textFuer(m) {
  if (m.status === "fehlt") return `kein Wert, Soll ${BEREICH(m)}`;
  const wert = `${num(m.wert)} ${m.einheit || ""}`.trim();
  if (m.status === "zustand") return `${wert}, gilt erst bei ${m.zustand === "motor_aus" ? "stehendem" : "laufendem"} Motor`;
  if (m.status === "im_bereich") return `${wert}, im Bereich ${BEREICH(m)}`;
  return `${wert}, ${m.status === "unter" ? "unter" : "über"} ${BEREICH(m)}`;
}

/** Reine Sicht auf die Kette, ohne DOM. @param {any} k */
export function kettenSchritte(k) {
  if (!k || !k.ok) return [];
  const teil = bauteileFuer(k.code);
  return [
    { art: "code", titel: k.code, text: k.titel },
    { art: "steuergeraet", titel: "Gespeichert von", text: k.steuergeraet },
    { art: "messwerte", titel: "Messwerte", zeilen: k.messwerte.map((m) => ({ label: signalTitle(m.signal), text: textFuer(m), ton: tonFuer(m), quelle: m.quelle })) },
    { art: "bauteil", titel: "Bauteil", text: teil.genau ? teil.name : k.bauteile.join(", "), ids: k.bauteile },
    { art: "messung", titel: "Nächste Messung", text: k.naechste_messung ? k.naechste_messung.titel : "keine weitere", messung: k.naechste_messung },
    { art: "deutung", titel: "Deutung", text: k.deutung && k.deutung.ursache ? `${k.deutung.ursache} (${k.deutung.sicherheit})` : "noch offen", sicherheit: k.deutung && k.deutung.sicherheit },
  ];
}

async function laden(code) {
  if (state.src && state.src.mode === "server") {
    const r = await fetch(`/api/diagnosepfad?code=${encodeURIComponent(code)}`);
    if (!r.ok) throw new Error(`Diagnosepfad: ${r.status}`);
    return r.json();
  }
  const { ketteImBrowser } = await import("./diagnosepfad-lokal.js");
  return ketteImBrowser(code, state);
}

/* »Im 3D zeigen« nur, wenn der Code im Fehlerspeicher steht; sonst gibt es in der 3D-Ansicht nichts hervorzuheben */
const imSpeicher = (code) => [...DTC_REG.values()].some((e) => e.dtc.code === code);

function schrittInhalt(s, code) {
  if (s.zeilen) return h("ul", { class: "dp-werte" }, ...s.zeilen.map((z) => h("li", { title: z.quelle }, mark(z.ton), h("span", {}, h("b", {}, z.label), ` ${z.text}`))));
  if (s.art === "deutung") return h("div", { class: "dp-text" }, s.sicherheit ? h("span", { class: `lvl ${s.sicherheit}` }, SICHERHEIT[s.sicherheit] || s.sicherheit) : null,
    h("span", {}, s.sicherheit ? s.text.replace(/ \((belegt|plausibel|vermutung)\)$/, "") : s.text));
  return h("div", { class: "dp-text" }, s.text,
    s.art === "bauteil" && imSpeicher(code) ? h("button", { class: "btn sec small", type: "button", onclick: () => emit("zeige-3d", code) }, "Im 3D zeigen") : null,
    s.art === "messung" && s.messung && s.messung.art === "manuell" ? h("span", { class: "sm" }, `${s.messung.werkzeug}, etwa ${s.messung.minuten} min`) : null);
}

/** Karte in die Box zeichnen. @param {HTMLElement} box @param {string} code */
export function renderDiagnosepfad(box, code) {
  box.setAttribute("role", "status");
  box.replaceChildren(h("p", { class: "sm" }, "Diagnosepfad wird geladen …"));
  laden(code).then((k) => {
    if (!k.ok) {
      box.replaceChildren(k.grund === "kein_pfad" ? h("p", { class: "sm" }, `Für ${k.code} gibt es noch keinen geführten Diagnosepfad.`) : h("p", { class: "sm" }, "Zu diesem Code gibt es keinen Diagnosepfad."));
      return;
    }
    box.replaceChildren(h("section", { class: "box diagnosepfad", "aria-label": `Diagnosepfad ${k.code}` },
      h("h3", {}, "Diagnosepfad"),
      h("ol", { class: "dp-kette" }, ...kettenSchritte(k).map((s) => h("li", { class: `dp-schritt dp-${s.art}` },
        h("p", { class: "eyebrow" }, s.titel), schrittInhalt(s, k.code)))),
      h("p", { class: "sm dp-hinweis" }, k.hinweis),
      h("p", { class: "sm dp-quellen" }, `Quellen der Sollbereiche: ${k.quellen.join("; ")}`)));
    box.removeAttribute("role");
    logEvent(`Diagnosepfad ${k.code} angezeigt`, "info");
  }).catch(() => box.replaceChildren(h("p", { class: "sm" }, "Diagnosepfad nicht erreichbar.")));
}
