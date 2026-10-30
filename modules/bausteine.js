/* Bausteine im Stil der iOS-Einstellungen für die älteren Seiten (Werkstattdaten, Handbuch, Bericht, Verlauf, Verbinden,
   Fahrzeuge, Fahrzeug anlegen, KI und Dienste, CAN-Werkbank): Zurück-Zeile, Kopfkarte, Gruppe, Zeilen. Die Klassen
   (sk-nav, sk-kopf, li-gruppe, li-row, li-k, li-fuss) stehen in feinschliff.css. seiten.js hat eigene Kopien, das wird
   später zusammengeführt. Alle Funktionen liefern neue Elemente und verändern nichts, was ihnen übergeben wird. */
import { h, icon, mark } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { back } from "./shell.js";

/** Glas-Icon aus icons/liste (ls zeigt die Namen), 64 px in der Kopfkarte, 30 px in der Zeile. */
export const listenBild = (name, px = 64) => h("img", { src: `icons/liste/${name}.png`, alt: "", width: px, height: px, decoding: "async", draggable: "false" });
export const pfeil = () => h("span", { class: "li-chev", "aria-hidden": "true" }, "›");

/** Runder Zurück-Knopf oben wie in den iOS-Einstellungen; ab 1100 px blendet die CSS die Zeile aus. */
export const zurueckZeile = () => h("div", { class: "sk-nav" }, h("button", { class: "sk-zurueck", type: "button", "aria-label": "Zurück", onclick: back }, icon("back")));

/* Kachel: Bild aus icons/liste, 3D-Zeichen aus icons3d.js oder Linienzeichen auf farbiger Kachel. */
function kachel({ bild, icon3d: drei, icon: ic, farbe, mark: m }, gross = false) {
  const basis = gross ? "sk-ic" : "li-ic";
  if (bild) return h("span", { class: `${basis} li-bild`, "aria-hidden": "true" }, listenBild(bild, gross ? 64 : 30));
  if (drei) return h("span", { class: `${basis} li-3d`, "aria-hidden": "true" }, icon3d(drei));
  if (ic) return h("span", { class: basis, style: farbe ? `--c:${farbe}` : null, "aria-hidden": "true" }, icon(ic));
  if (m) return h("span", { class: "sk-mark" }, mark(m));
  return null;
}

/* »Weitere Infos …« als Knopf in Linkoptik: ziel() ruft eine Funktion, info öffnet das Infoblatt (data-info in info.js). */
const mehrLink = (mehr) => h("button", { class: "sk-mehr", type: "button", "data-info": mehr.info || null, onclick: mehr.ziel || null }, ` ${mehr.text || "Weitere Infos …"}`);

/**
 * Kopfkarte: Kachel 64 px, Titel, ein Satz, optional »Weitere Infos …«.
 * @param {{titel: string, text?: string|Node|(string|Node)[], mehr?: {text?: string, ziel?: () => void, info?: string}, id?: string,
 *   bild?: string, icon3d?: string, icon?: string, farbe?: string}} k
 */
export function kopfkarte({ titel, text, mehr, id, ...kachelSpec }) {
  return h("section", { class: "li-gruppe sk-kopf" }, kachel(kachelSpec, true),
    h("h2", { class: "sk-titel", id: id || null }, titel),
    text || mehr ? h("p", { class: "sk-text" }, text, mehr ? mehrLink(mehr) : null) : null);
}

/**
 * Zeile mit Kachel, Beschriftung und Unterzeile, Wert rechts, Pfeil wenn klickbar.
 * ziel = Funktion beim Antippen, info = data-info für das Infoblatt, rechts = eigenes Element statt Wert.
 * @param {{label: string|Node|(string|Node)[], unter?: string|Node, wert?: string|Node|null, ton?: string, mono?: boolean, ziel?: (ev: Event) => void, info?: string,
 *   rechts?: Node|null, klasse?: string, bild?: string, icon3d?: string, icon?: string, farbe?: string, mark?: string}} z
 */
export function zeile({ label, unter, wert, ton, mono, ziel, info, rechts, klasse, ...kachelSpec }) {
  const klickbar = Boolean(ziel || info);
  return h(klickbar ? "button" : "div", { class: `li-row sk-row${klasse ? ` ${klasse}` : ""}`, type: klickbar ? "button" : null, onclick: ziel || null, "data-info": info || null },
    kachel(kachelSpec),
    h("span", { class: "li-t" }, label, unter ? h("span", { class: "li-unter" }, unter) : null),
    rechts || (wert != null ? h("span", { class: `li-v${ton ? ` t-${ton}` : ""}${mono ? " mono" : ""}` }, wert) : h("span")),
    klickbar ? pfeil() : h("span"));
}

/** Blaue (oder rote) Aktions-Zeile wie »Netzwerk hinzufügen …«. */
export const aktionsZeile = (label, tun, { ton = "blau", aus = false } = {}) =>
  h("button", { class: `li-row sk-row sk-aktion t-${ton}`, type: "button", disabled: aus || null, onclick: tun }, h("span", { class: "li-t" }, label));

/**
 * Gruppe: graue Überschrift, Karte mit Zeilen, Fußnote. Einträge sind Zeilen-Angaben für zeile() oder fertige Elemente
 * (etwa ein Formularblock aus formBlock()).
 * @param {{titel?: string|Node, zeilen?: (object|Node|null|false|undefined)[], fuss?: string|Node, id?: string, klasse?: string}} g
 */
export function gruppe({ titel, zeilen = [], fuss, id, klasse }) {
  const kinder = zeilen.filter(Boolean).map((z) => (z instanceof Node ? z : zeile(/** @type {any} */ (z))));
  return h("section", { class: "sk-block", id: id || null },
    titel ? h("h3", { class: "li-k" }, titel) : null,
    kinder.length ? h("div", { class: `li-gruppe${klasse ? ` ${klasse}` : ""}` }, ...kinder) : null,
    fuss ? h("p", { class: "li-fuss" }, fuss) : null);
}

/** Formularblock innerhalb einer Gruppe: Felder mit Innenabstand auf der Karte. */
export const formBlock = (...kinder) => h("div", { class: "sk-form" }, ...kinder);
