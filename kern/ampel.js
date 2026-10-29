// @ts-check
/* Ampel für den einfachen Modus: feste, nachvollziehbare Regeln aus Fehlercodes und Messwerten, ohne KI. */
/** @param {number} x @param {number} d */
const numFix = (x, d) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/* Regeln: rot = anhalten bzw. nur noch langsam zur Werkstatt, gelb = bald hin, grün = nichts gespeichert */
/** @type {[RegExp, string][]} */
const ROT = [[/^P0524$/, "Öldruck zu niedrig: Motor sofort abstellen, sonst droht Motorschaden."], [/^P0217$/, "Motor überhitzt: anhalten und abkühlen lassen."],
  [/^P030[0-9]$|^P031[0-2]$/, "Zündaussetzer: nur sanft und kurz zur Werkstatt, keine Vollgas-Fahrt, sonst leidet der Katalysator."]];
/** @type {[RegExp, string][]} */
const GELB = [[/^P052[0-3]$/, "Öldruckgeber meldet einen Fehler: bald prüfen lassen, Ölstand selbst kontrollieren."], [/^C0/, "Bremsen bzw. ABS: Die Grundbremse wirkt, ABS und ESP können ausfallen. Vorsichtig fahren."], [/^B00/, "Airbag-System: Ein Airbag löst im Unfall möglicherweise nicht aus."],
  [/^U0/, "Kommunikation zwischen Steuergeräten gestört: Funktionen können zeitweise ausfallen."]];
/**
 * @param {string[]} codes
 * @param {Record<string, {wert?: number}>} [live]
 */
export function ampel(codes, live = {}) {
  const gruende = [];
  let stufe = codes.length ? "gelb" : "gruen";
  const kuehl = live.KUEHLMITTEL?.wert, volt = live.SPANNUNG?.wert, rpm = live.DREHZAHL?.wert ?? 0;
  for (const c of codes) {
    const rot = ROT.find(([re]) => re.test(c));
    if (rot) { stufe = "rot"; gruende.push(rot[1]); continue; }
    const gelb = GELB.find(([re]) => re.test(c));
    if (gelb) gruende.push(gelb[1]);
  }
  if (typeof kuehl === "number" && kuehl > 112) { stufe = "rot"; gruende.push(`Kühlmittel ${numFix(kuehl, 0)} °C: zu heiß, anhalten.`); }
  if (typeof volt === "number" && rpm > 400 && volt < 12.6) { if (stufe === "gruen") stufe = "gelb"; gruende.push(`Bordnetz nur ${numFix(volt, 1)} V bei laufendem Motor: Lichtmaschine oder Batterie prüfen lassen.`); }
  return { stufe, gruende: [...new Set(gruende)] };
}
