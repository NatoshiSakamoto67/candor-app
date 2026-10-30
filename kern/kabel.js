// @ts-check
/* Kabelwege, schematisch: welches Steuergerät mit welchem Sensor oder Aktor verbunden ist, und ein Leitungsweg über
   den Kabelbaum in der Fahrzeugmitte. Kein Herstellerverlauf, nur Verständnis: wo hängt was dran. Reine Rechnung. */

/** @typedef {{ x: number, y: number, z: number }} V3 */

/** Verbindungen je Steuergerät (ids wie im Modell). Fehlende Teile werden übersprungen. */
export const VERBINDUNGEN = {
  motorsteuergeraet: ["luftmassenmesser", "drosselklappe", "kurbelwellensensor", "nockenwellensensor", "kuehlmittelsensor", "lambda_vor_kat", "lambda_nach_kat",
    "agr_ventil", "dpf", "adblue", "tank", "lichtmaschine", "anlasser", "getriebe", "kuehler"],
  abs: ["raddrehzahl_vl", "raddrehzahl_vr", "raddrehzahl_hl", "raddrehzahl_hr", "raddrehzahl_v", "raddrehzahl_h", "bremskraftverstaerker", "lenkgetriebe", "ebs_vorn", "druckluft"],
  airbag_steuergeraet: ["lenkrad"],
  bordnetz: ["batterie", "kombiinstrument", "infotainment", "parksensoren", "frontradar", "frontkamera"],
  gateway: ["motorsteuergeraet", "abs", "airbag_steuergeraet", "bordnetz", "kombiinstrument", "obd_buchse"],
};
/** Farbe je Steuergerät (schematisch) */
export const KABELFARBE = { motorsteuergeraet: 0xffb347, abs: 0x7fd1ff, airbag_steuergeraet: 0xff7b7b, bordnetz: 0xb8f36b, gateway: 0xd7b4ff };

/** Anschlüsse eines Bauteils: als Steuergerät seine Sensoren, als Sensor sein Steuergerät.
 * @param {string} id @param {Set<string> | Map<string, any>} vorhanden @returns {{ als: "steuergeraet" | "teil", ids: string[] }} */
export function anschluesse(id, vorhanden) {
  const da = (x) => vorhanden.has(x);
  if (VERBINDUNGEN[id]) return { als: "steuergeraet", ids: VERBINDUNGEN[id].filter(da) };
  return { als: "teil", ids: Object.keys(VERBINDUNGEN).filter((sg) => da(sg) && VERBINDUNGEN[sg].includes(id)) };
}

/** Leitungsweg: vom Teil hinunter auf die Kabelbaumhöhe, zur Fahrzeugmitte, längs, wieder hinaus, hinauf zum Ziel.
 * @param {V3} von @param {V3} nach @param {number} hoehe Kabelbaumhöhe (y) @param {number} mitteZ Fahrzeugmitte quer */
export function leitungsweg(von, nach, hoehe, mitteZ) {
  const pts = [von, { x: von.x, y: hoehe, z: von.z }];
  if (Math.abs(von.z - mitteZ) > .05) pts.push({ x: von.x, y: hoehe, z: mitteZ });
  if (Math.abs(nach.z - mitteZ) > .05 || Math.abs(von.x - nach.x) > .05) pts.push({ x: nach.x, y: hoehe, z: Math.abs(nach.z - mitteZ) > .05 ? mitteZ : nach.z });
  if (Math.abs(nach.z - mitteZ) > .05) pts.push({ x: nach.x, y: hoehe, z: nach.z });
  pts.push(nach);
  return pts;
}

/** Alle Kabelwege eines Modells.
 * @param {Map<string, { mitte: V3 }>} bauteile @param {number} hoehe @param {number} mitteZ
 * @returns {{ von: string, nach: string, farbe: number, punkte: V3[] }[]} */
export function kabelwege(bauteile, hoehe, mitteZ) {
  const out = [];
  for (const [sg, ziele] of Object.entries(VERBINDUNGEN)) {
    const q = bauteile.get(sg);
    if (!q) continue;
    for (const ziel of ziele) {
      const z = bauteile.get(ziel);
      if (!z) continue;
      out.push({ von: sg, nach: ziel, farbe: KABELFARBE[sg] || 0xcccccc, punkte: leitungsweg(q.mitte, z.mitte, hoehe, mitteZ) });
    }
  }
  return out;
}
