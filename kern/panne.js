// @ts-check
/* Pannenhilfe als reine Logik: Rufnummern, tel:-Verweise und der Text für »Standort teilen«. Der Standort wird nirgends
   gespeichert; der Text entsteht nur, wenn jemand ihn teilen will. */

/** Rufnummern wie gedruckt (zum Vorlesen), der tel:-Verweis wird daraus gebaut. Stand der Nummern: Oktober 2026. */
export const RUFNUMMERN = Object.freeze([
  { id: "notruf", label: "Notruf", nummer: "112", unter: "Polizei, Feuerwehr, Rettung, kostenlos" },
  { id: "adac", label: "ADAC Pannenhilfe", nummer: "0 180 2 22 22 22", unter: "Festnetz 6 Cent je Anruf" },
  { id: "ace", label: "ACE Pannenhilfe", nummer: "0 711 530 34 35 36", unter: "Festnetznummer, Kosten nach Tarif" },
]);

/**
 * tel:-Verweis aus einer gedruckten Nummer: nur Ziffern und ein führendes Plus bleiben.
 * @param {string} nummer
 * @returns {string|null} null, wenn keine Ziffern übrig bleiben
 */
export function telHref(nummer) {
  const roh = String(nummer || "").trim();
  const ziffern = roh.replace(/\D/g, "");
  if (!ziffern) return null;
  return `tel:${roh.startsWith("+") ? "+" : ""}${ziffern}`;
}

/** @typedef {{lat: number, lon: number, genau: number, zeit: Date}} Standort */

/**
 * Text zum Teilen: Koordinaten mit fünf Nachkommastellen (etwa 1 m), Genauigkeit, Uhrzeit und ein Kartenlink.
 * @param {Standort} s
 * @param {(d: Date) => string} uhrzeit
 */
export function standortText(s, uhrzeit) {
  if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) throw new Error("Kein Standort.");
  const la = s.lat.toFixed(5), lo = s.lon.toFixed(5);
  return `Mein Standort: ${la}, ${lo} (etwa ${Math.round(s.genau)} m genau, ${uhrzeit(s.zeit)} Uhr). Karte: https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`;
}
