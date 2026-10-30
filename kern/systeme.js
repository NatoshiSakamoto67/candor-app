// @ts-check
/* Systemebenen des 3D-Modells: gleiche Namen wie tools/fahrzeug3d/systeme.py (Zusatzdatum »system« je Bauteil). */

/** @type {[string, string][]} id und Anzeigename, in Bedienreihenfolge */
export const SYSTEME = [
  ["motor", "Motor"], ["ansaugung", "Ansaugung"], ["kraftstoff", "Kraftstoff"], ["kuehlung", "Kühlung"], ["abgas", "Abgas"],
  ["elektrik", "Elektrik"], ["bremse", "Bremse"], ["fahrwerk", "Fahrwerk"], ["innenraum", "Innenraum"],
];
export const SYSTEM_IDS = Object.freeze(new Set(SYSTEME.map(([id]) => id)));

/** Systeme, die im geladenen Modell wirklich Bauteile haben, in Bedienreihenfolge.
 * @param {Iterable<{ system?: string }>} bauteile @returns {[string, string][]} */
export function systemeImModell(bauteile) {
  const da = new Set();
  for (const b of bauteile) if (b.system) da.add(b.system);
  return SYSTEME.filter(([id]) => da.has(id));
}

/** Gehört das Bauteil zur gewählten Ebene? Ohne Wahl gehört alles dazu.
 * @param {{ system?: string }} bauteil @param {string | null} wahl */
export function imSystem(bauteil, wahl) {
  return !wahl || bauteil.system === wahl;
}
