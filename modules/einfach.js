/* Einfacher Modus: ein Knopf »Auto prüfen«, eine Ampel, Fehler in Alltagssprache, »Darf ich weiterfahren?« und der
   Aufwand in Werkstattstunden (aus OBDex). Die Ampel folgt festen, sichtbaren Regeln, nicht der KI. */
import { $, h, icon, numFix, storageGet, storageSet } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, on, emit, faultSet } from "./state.js";
import { go } from "./shell.js";
import { lookup } from "./dtcwissen.js";
import { ampel } from "../kern/ampel.js";

export const modus = () => storageGet("kfzdiag-modus", "profi");
export function setzeModus(m) { storageSet("kfzdiag-modus", m); document.documentElement.dataset.modus = m; emit("modus", m); emit("render"); }

const SATZ = {
  gruen: ["Alles in Ordnung", "Im Fehlerspeicher steht nichts. Weiterfahren ist kein Problem."],
  gelb: ["Bald in die Werkstatt", "Es sind Fehler gespeichert. Weiterfahren geht, aber lass es in den nächsten Tagen prüfen."],
  rot: ["Bitte nicht weiterfahren", "Ein Fehler kann jetzt Schaden anrichten. Lies die Hinweise unten."],
};
const SCHWIERIG = { leicht: "leicht, oft selbst machbar", mittel: "mittel, Werkstatt empfohlen", schwer: "schwer, Werkstatt", shop_only: "nur in der Werkstatt" };

let stand = "";
export async function zeichneEinfach() {
  const box = $("einfach");
  if (!box) return;
  box.hidden = modus() !== "einfach";
  if (box.hidden) return;
  const fehler = [...faultSet().values()];
  const verbunden = Boolean(state.status);
  const { stufe, gruende } = ampel(fehler.map((f) => f.code), state.live);
  const key = JSON.stringify([verbunden, fehler.map((f) => f.code + f.art), stufe, gruende]);
  if (key === stand) return;
  stand = key;
  const [titel, satz] = verbunden ? SATZ[stufe] : ["Auto prüfen", "Adapter einstecken, Zündung an, dann auf »Auto prüfen« tippen. Das dauert etwa eine halbe Minute."];
  let liste;
  try {
    liste = await Promise.all(fehler.map(async (f) => ({ f, w: await lookup(f.code).catch(() => null) })));
  } catch (_) { stand = ""; return; }
  if (stand !== key) return;
  box.replaceChildren(
    h("div", { class: `card ef-held t-${verbunden ? { gruen: "ok", gelb: "warn", rot: "crit" }[stufe] : "neutral"}` },
      h("div", { class: "ef-ampel", "aria-hidden": "true" }, ...["rot", "gelb", "gruen"].map((s) => h("i", { class: verbunden && s === stufe ? "an" : "" }))),
      h("div", { class: "ef-text" }, h("p", { class: "eyebrow" }, "Auto-Check"), h("h2", { class: "ef-titel" }, titel), h("p", { class: "p" }, satz),
        gruende.length ? h("ul", { class: "ef-gruende" }, ...gruende.map((g) => h("li", {}, g))) : null,
        h("div", { class: "row-actions" },
          h("button", { class: "btn pri", type: "button", onclick: () => emit("reconnect") }, verbunden ? "Erneut prüfen" : "Auto prüfen"),
          verbunden && fehler.length ? h("button", { class: "btn sec", type: "button", onclick: () => go("agent") }, icon3d("robot", "btn-i3"), "KI fragen") : null))),
    verbunden && fehler.length ? h("section", { class: "ef-liste", "aria-label": "Gefundene Fehler" }, h("h3", { class: "h3" }, `${fehler.length} Fehler, einfach erklärt`),
      ...liste.map(({ f, w }) => h("article", { class: "card ef-fehler" },
        h("p", { class: "eyebrow" }, `${f.code} · ${f.art === "gespeichert" ? "gespeichert" : "vorläufig, noch nicht bestätigt"}`),
        h("h4", {}, (w && w.t) || f.beschreibung || "Unbekannter Herstellercode"),
        w && w.s && w.s.length ? h("p", { class: "sm" }, "Woran man es merkt: ", w.s.slice(0, 2).join("; "), ".") : null,
        w && w.u && w.u.length ? h("p", { class: "sm" }, "Häufigste Ursache: ", w.u[0][1], ".") : null,
        w && (w.h || w.sw) ? h("p", { class: "ef-aufwand" }, icon("info"),
          [w.h ? `Aufwand etwa ${numFix(w.h[0], 1)} bis ${numFix(w.h[1], 1)} Werkstattstunden (ohne Teile)` : null, w.sw ? `Schwierigkeit ${SCHWIERIG[w.sw] || w.sw}` : null].filter(Boolean).join(" · ")) : null,
        h("button", { class: "btn qt small", type: "button", onclick: () => go("faults") }, "Details für die Werkstatt")))) : null);
}

export function initEinfach() {
  document.documentElement.dataset.modus = modus();
  const box = h("section", { class: "einfach", id: "einfach", "aria-label": "Auto-Check", hidden: true });
  const wahl = h("div", { class: "seg modus-wahl", role: "group", "aria-label": "Ansicht" });
  const wahlZeichnen = () => wahl.replaceChildren(...[["einfach", "Einfach"], ["profi", "Profi"]].map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(modus() === id), onclick: () => { setzeModus(id); stand = ""; wahlZeichnen(); } }, label)));
  wahlZeichnen();
  $("vehicle-card").before(wahl, box);
  on("modus", () => { stand = ""; wahlZeichnen(); });
  on("modus-setzen", (m) => setzeModus(m));
  on("render", zeichneEinfach);
  on("status", zeichneEinfach);
}
