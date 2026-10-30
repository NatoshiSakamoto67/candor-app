// @ts-check
/* Suche wie in den iOS-Einstellungen: ohne Eingabe stehen Vorschläge (feste Einstiege aus der Liste) und
   die zuletzt geöffneten Treffer. Reine Funktionen, kein DOM; gezeichnet wird in modules/search.js. */

/** Reihenfolge der Vorschläge; nur Zeilen, die im aktuellen Modus sichtbar sind. */
export const VORSCHLAG_IDS = Object.freeze(["fehler", "live", "service", "bordnetz", "bericht", "ki", "pruefungen", "faelle"]);

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
export function zuletztMerken(liste, eintrag, max = 6) {
  if (!eintrag || !eintrag.key || !eintrag.title) return liste.slice(0, max);
  return [eintrag, ...liste.filter((e) => e && e.key !== eintrag.key)].slice(0, max);
}

/**
 * Schlüssel eines Treffers, damit er sich später wieder öffnen lässt; null, wenn er nicht wiederholbar ist.
 * @param {{spec?: string, key?: string}} treffer @returns {string|null}
 */
export const trefferSchluessel = (treffer) => treffer.key || treffer.spec || null;
