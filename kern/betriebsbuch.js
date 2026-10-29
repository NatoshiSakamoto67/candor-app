// @ts-check
/* Betriebsbuch nach dem Vorbild des XDAB-Leitstands (cockpit/journal.py): jede Freigabe, jede Ausführung und jeder
   Abbruch wird als Glied einer Kette gespeichert. hash = SHA-256(prev + kanonisches JSON). Eine Änderung an einem
   alten Eintrag bricht die Kette und wird beim Prüfen gefunden. Erkennt Manipulation, verhindert sie nicht. */

export const ANFANG = "0".repeat(64);
/** @typedef {{zeit: string, typ: string, daten: Record<string, unknown>, prev: string, hash: string}} Glied */

/** Schlüssel sortiert, damit derselbe Inhalt immer denselben Text ergibt. @param {unknown} v @returns {string} */
export function kanonisch(v) {
  if (Array.isArray(v)) return `[${v.map(kanonisch).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${kanonisch(/** @type {any} */ (v)[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** @param {string} text */
async function sha256(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** @param {string} prev @param {{zeit: string, typ: string, daten: Record<string, unknown>}} e */
export const gliedHash = (prev, e) => sha256(prev + kanonisch({ zeit: e.zeit, typ: e.typ, daten: e.daten }));

/**
 * Neues Glied anhängen. Gibt eine neue Kette zurück, die alte bleibt unverändert.
 * @param {Glied[]} kette @param {{typ: string, daten?: Record<string, unknown>, zeit?: string}} e
 */
export async function anhaengen(kette, e) {
  const prev = kette.length ? kette[kette.length - 1].hash : ANFANG;
  const glied = { zeit: e.zeit || new Date().toISOString(), typ: e.typ, daten: e.daten || {}, prev };
  return [...kette, { ...glied, hash: await gliedHash(prev, glied) }];
}

/** Kette nachrechnen. bruch = Index des ersten falschen Glieds oder -1. @param {Glied[]} kette */
export async function pruefen(kette) {
  let prev = ANFANG;
  for (let i = 0; i < kette.length; i++) {
    const g = kette[i];
    if (g.prev !== prev || g.hash !== await gliedHash(prev, g)) return { ok: false, bruch: i, laenge: kette.length };
    prev = g.hash;
  }
  return { ok: true, bruch: -1, laenge: kette.length };
}
