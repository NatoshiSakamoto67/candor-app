// @ts-check
/* Explosionsansicht: jedes Bauteil gleitet vom Fahrzeugmittelpunkt weg. Reine Rechnung ohne three.js, damit sie
   testbar bleibt. Richtung = Bauteilmitte minus Fahrzeugmitte, Höhe betont, Weite wächst mit Abstand und Anteil. */

/** @typedef {{ x: number, y: number, z: number }} V3 */

/** Versatz eines Bauteils bei Anteil 0 bis 1.
 * @param {V3} teilMitte Mitte des Bauteils @param {V3} fahrzeugMitte @param {number} laenge Fahrzeuglänge (Maßstab)
 * @param {number} anteil 0 = zusammengebaut, 1 = ganz auseinander @returns {V3} */
export function explosionsVersatz(teilMitte, fahrzeugMitte, laenge, anteil) {
  const a = Math.max(0, Math.min(1, Number(anteil) || 0));
  if (!a) return { x: 0, y: 0, z: 0 };
  const dx = teilMitte.x - fahrzeugMitte.x, dy = (teilMitte.y - fahrzeugMitte.y) * 1.8, dz = teilMitte.z - fahrzeugMitte.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { x: 0, y: a * laenge * .12, z: 0 };  // Teil in der Mitte: nach oben heraus
  const weite = a * laenge * (.06 + .15 * Math.min(1, len / (laenge / 2)));
  return { x: dx / len * weite, y: dy / len * weite, z: dz / len * weite };
}
