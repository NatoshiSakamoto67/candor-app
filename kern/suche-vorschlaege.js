// @ts-check
/* Suche wie in den iOS-Einstellungen: ohne Eingabe stehen Vorschläge (feste Einstiege aus der Liste) und die zuletzt
   geöffneten Seiten; mit Eingabe Treffer mit Pfad (»Einstellungen → KI und Dienste«). Reine Funktionen, kein DOM;
   gezeichnet wird in modules/search.js. */

/** Reihenfolge der Vorschläge; nur Zeilen, die im aktuellen Modus sichtbar sind. */
export const VORSCHLAG_IDS = Object.freeze(["fehler", "live", "ki", "bericht", "service", "bordnetz", "pruefungen", "faelle"]);
/** Höchstens so viele Einträge unter »Zuletzt«. */
export const ZULETZT_MAX = 5;
/** Trenner zwischen den Stufen eines Pfads. */
export const PFAD_TRENNER = " → ";

/**
 * @template {{id: string}} Z
 * @param {Z[]} zeilen sichtbare Zeilen der Einstellungsliste
 * @param {number} [max]
 * @returns {Z[]}
 */
export function vorschlaege(zeilen, max = 4) {
  const je = new Map(zeilen.map((z) => [z.id, z]));
  return VORSCHLAG_IDS.map((id) => je.get(id)).filter((z) => z !== undefined).slice(0, max);
}

/** @typedef {{key: string, title: string, kind: string, detail?: string}} Zuletzt */

/**
 * Neuer Eintrag kommt nach vorn, gleiche Schlüssel fallen weg; das alte Array bleibt unverändert.
 * @param {Zuletzt[]} liste @param {Zuletzt} eintrag @param {number} [max] @returns {Zuletzt[]}
 */
export function zuletztMerken(liste, eintrag, max = ZULETZT_MAX) {
  const alt = Array.isArray(liste) ? liste.filter((e) => e && typeof e.key === "string" && typeof e.title === "string") : [];
  if (!eintrag || !eintrag.key || !eintrag.title) return alt.slice(0, max);
  return [eintrag, ...alt.filter((e) => e.key !== eintrag.key)].slice(0, max);
}

/**
 * Schlüssel eines Treffers, damit er sich später wieder öffnen lässt; null, wenn er nicht wiederholbar ist.
 * @param {{spec?: string, key?: string}} treffer @returns {string|null}
 */
export const trefferSchluessel = (treffer) => treffer.key || treffer.spec || null;

/**
 * @typedef {{id: string, label: string, icon: string, farbe: string, bild?: string, ziel?: string, sub?: string, aktion?: string,
 *   kunde?: boolean, nurKunde?: boolean, profi?: boolean, bald?: boolean, schalter?: string}} ZielZeile
 * @typedef {{id: string, label: string, icon: string, farbe: string, bild?: string, ziel?: string, sub?: string, aktion?: string, pfad: string[]}} Ziel
 */

/** Wohin eine Zeile führt; gleiche Ziele aus Start und Einstellungen zählen nur einmal. @param {ZielZeile} z */
const wohin = (z) => (z.aktion ? `aktion:${z.aktion}` : z.ziel ? `${z.ziel}/${z.sub || ""}` : `zeile:${z.id}`);

/**
 * Alle Seiten, die die Suche als Ziel kennt, mit Pfad. Zuerst die Übersicht »Einstellungen« (und ihre Unterseiten),
 * dann die Startliste; ein Ziel, das schon vorkam, fällt weg. Schalter-Zeilen sind keine Seiten.
 * @param {{einstellungen: {titel?: string, zeilen: ZielZeile[]}[], unterzeilen?: Record<string, ZielZeile[]>, start: {titel?: string, zeilen: ZielZeile[]}[],
 *   sichtbar?: (z: ZielZeile) => boolean, startName?: string}} q
 * @returns {Ziel[]}
 */
export function sucheZiele({ einstellungen, unterzeilen = {}, start, sichtbar = () => true, startName = "Start" }) {
  /** @type {Ziel[]} */
  const out = [];
  const gesehen = new Set();
  /** @param {ZielZeile} z @param {string[]} pfad */
  const nimm = (z, pfad) => {
    if (z.schalter || !sichtbar(z) || gesehen.has(wohin(z))) return;
    gesehen.add(wohin(z));
    out.push({ id: z.id, label: z.label, icon: z.icon, farbe: z.farbe, bild: z.bild, ziel: z.ziel, sub: z.sub, aktion: z.aktion, pfad });
  };
  for (const g of einstellungen) for (const z of g.zeilen) {
    nimm(z, ["Einstellungen"]);
    for (const k of unterzeilen[z.id] || []) nimm(k, ["Einstellungen", z.label]);
  }
  for (const g of start) for (const z of g.zeilen) nimm(z, g.titel ? [startName, g.titel] : [startName]);
  return out;
}

/** Pfad als Text, etwa »Einstellungen → Allgemein«. @param {string[]} pfad */
export const pfadText = (pfad) => pfad.join(PFAD_TRENNER);

/** Schlüssel eines Ziels für »Zuletzt«. @param {{id: string}} z */
export const zielSchluessel = (z) => `ziel:${z.id}`;

/** Ziel zu einer offenen Seite (Route aus shell.js), sonst null. @param {Ziel[]} ziele @param {{page: string, sub?: string|null}} route */
export function zielFuerRoute(ziele, route) {
  if (!route || !route.page) return null;
  return ziele.find((z) => z.ziel === route.page && (z.sub || null) === (route.sub || null)) || null;
}

const klein = (s) => String(s || "").toLocaleLowerCase("de-DE");

/**
 * Ziele zur Eingabe, beste zuerst: Titel beginnt mit der Eingabe, Titel enthält sie, Pfad enthält sie, alle Wörter kommen vor.
 * Gleich gute behalten ihre Reihenfolge.
 * @param {Ziel[]} ziele @param {string} eingabe @param {number} [max] @returns {Ziel[]}
 */
export function zieleFinden(ziele, eingabe, max = 8) {
  const q = klein(eingabe).trim();
  if (!q) return [];
  const teile = q.split(/\s+/).filter(Boolean);
  /** @param {Ziel} z */
  const punkte = (z) => {
    const t = klein(z.label), alles = `${t} ${klein(z.pfad.join(" "))}`;
    if (t.startsWith(q)) return 80;
    if (t.split(/[\s&-]+/).some((w) => w.startsWith(q))) return 70;
    if (t.includes(q)) return 60;
    if (alles.includes(q)) return 40;
    return teile.length > 1 && teile.every((p) => alles.includes(p)) ? 30 : 0;
  };
  return ziele.map((z, i) => ({ z, i, p: punkte(z) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || a.i - b.i).slice(0, max).map((x) => x.z);
}
