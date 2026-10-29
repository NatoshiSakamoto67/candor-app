// @ts-check
/* Fehlercode → Bauteil im 3D-Modell. Nur genormte Bedeutungen (SAE J2012); herstellerspezifische Codes fallen auf
   das zuständige System zurück. Jede Regel nennt die Bauteil-ids (wie im Modell, Knoten mit Zusatzdatum id) und einen
   kurzen Namen. Kontext: Bauteile, die zum Verständnis sichtbar bleiben (etwa der Motor bei einem Injektor). */

const ZYL = [1, 2, 3, 4, 5, 6];
const alle = (praefix, n = 4) => ZYL.slice(0, n).map((z) => `${praefix}_${z}`);
const RAD = { vl: "vorn links", vr: "vorn rechts", hl: "hinten links", hr: "hinten rechts" };

/** @typedef {{ ids: string[], name: string }} Treffer */

/** @type {[RegExp, (m: RegExpMatchArray) => Treffer][]} */
const REGELN = [
  // Einspritzung und Zündung je Zylinder
  [/^P020([1-9])$/, (m) => ({ ids: [`injektor_${m[1]}`], name: `Injektor Zylinder ${m[1]}` })],
  [/^P0200$/, () => ({ ids: alle("injektor"), name: "Injektoren" })],
  [/^P02(6[1-9]|7[0-9]|8[0-4])$/, (m) => { const z = Math.floor((Number(`2${m[1]}`) - 261) / 3) + 1; return { ids: [`injektor_${z}`], name: `Injektor Zylinder ${z}, Stromkreis` }; }],
  [/^P030([1-9])$/, (m) => ({ ids: [`zuendspule_${m[1]}`, `injektor_${m[1]}`], name: `Zylinder ${m[1]}: Zündung oder Einspritzung` })],
  [/^P031[0-2]$/, (m) => { const z = Number(m[0].slice(3)); return { ids: [`zuendspule_${z}`, `injektor_${z}`], name: `Zylinder ${z}: Zündung oder Einspritzung` }; }],
  [/^P0300$/, () => ({ ids: [...alle("zuendspule"), ...alle("injektor")], name: "Zündaussetzer mehrerer Zylinder" })],
  [/^P035([1-9])$/, (m) => ({ ids: [`zuendspule_${m[1]}`], name: `Zündspule Zylinder ${m[1]}` })],
  // Gemisch, Luft, Drosselklappe
  [/^P01(7[0-5])$/, () => ({ ids: ["luftmassenmesser", ...alle("injektor"), "lambda_vor_kat"], name: "Gemisch: Luftmasse, Einspritzung, Lambdasonde" })],
  [/^P010[0-4]$/, () => ({ ids: ["luftmassenmesser"], name: "Luftmassenmesser" })],
  [/^P011[0-4]$/, () => ({ ids: ["luftmassenmesser"], name: "Ansauglufttemperatur (im Luftmassenmesser)" })],
  [/^P011[5-9]$/, () => ({ ids: ["kuehlmittelsensor"], name: "Kühlmitteltemperatursensor" })],
  [/^P0(12[0-3]|22[0-9]|638)$|^P2135$/, () => ({ ids: ["drosselklappe"], name: "Drosselklappe" })],
  [/^P0505$|^P050[6-7]$/, () => ({ ids: ["drosselklappe"], name: "Leerlaufregelung (Drosselklappe)" })],
  // Abgas
  [/^P01(3[0-5]|5[0-5])$/, () => ({ ids: ["lambda_vor_kat"], name: "Lambdasonde vor Kat" })],
  [/^P01(3[6-9]|4[01]|5[6-9]|6[01])$/, () => ({ ids: ["lambda_nach_kat"], name: "Lambdasonde nach Kat" })],
  [/^P04[23][0-9]$/, () => ({ ids: ["kat"], name: "Katalysator" })],
  [/^P040[0-9]$/, () => ({ ids: ["agr_ventil"], name: "Abgasrückführung" })],
  [/^P2002$|^P2463$|^P244[A-F]$|^P245[2-5]$/, () => ({ ids: ["dpf"], name: "Partikelfilter" })],
  [/^P20E[E-F]$|^P20B[A-F]$|^P20[45][0-9]$/, () => ({ ids: ["adblue"], name: "AdBlue/SCR" })],
  [/^P04[45][0-9]$/, () => ({ ids: ["tank"], name: "Tankentlüftung" })],
  // Sensoren, Elektrik, Getriebe, Steuergerät
  [/^P033[5-9]$/, () => ({ ids: ["kurbelwellensensor"], name: "Kurbelwellensensor" })],
  [/^P034[0-9]$|^P036[5-9]$/, () => ({ ids: ["nockenwellensensor"], name: "Nockenwellensensor" })],
  [/^P056[0-3]$/, () => ({ ids: ["batterie", "lichtmaschine"], name: "Bordnetzspannung" })],
  [/^P062[0-5]$/, () => ({ ids: ["lichtmaschine"], name: "Lichtmaschine" })],
  [/^P050[0-3]$/, () => ({ ids: Object.keys(RAD).map((r) => `raddrehzahl_${r}`), name: "Geschwindigkeitssignal" })],
  [/^P060[0-6]$/, () => ({ ids: ["motorsteuergeraet"], name: "Motorsteuergerät" })],
  [/^P07[0-9][0-9]$/, () => ({ ids: ["getriebe"], name: "Getriebe" })],
  // Fahrwerk: Raddrehzahl je Rad, sonst ABS mit Bremsen, Lenkung
  [/^C00(3[5-9]|4[0-9]|5[0-4])$/, (m) => { const n = Number(m[1]); const r = n < 40 ? "vl" : n < 45 ? "vr" : n < 50 ? "hl" : "hr"; return { ids: [`raddrehzahl_${r}`], name: `Raddrehzahlsensor ${RAD[r]}` }; }],
  [/^C0(4|5[0-4])/, () => ({ ids: ["lenkgetriebe"], name: "Lenkung" })],
  [/^C0/, () => ({ ids: ["abs", ...Object.keys(RAD).map((r) => `bremse_${r}`)], name: "ABS und Bremsen" })],
  [/^C1/, () => ({ ids: ["abs"], name: "ABS/ESP (Herstellercode)" })],
  // Karosserie, Rückhaltesystem
  [/^B00/, () => ({ ids: ["airbag_steuergeraet", "lenkrad"], name: "Airbag-System" })],
  // Kommunikation: das Gerät, das nicht antwortet
  [/^U0100$/, () => ({ ids: ["motorsteuergeraet"], name: "Keine Verbindung zum Motorsteuergerät" })],
  [/^U0101$/, () => ({ ids: ["getriebe"], name: "Keine Verbindung zum Getriebe" })],
  [/^U012[1-9]$/, () => ({ ids: ["abs"], name: "Keine Verbindung zum ABS" })],
  [/^U0131$/, () => ({ ids: ["lenkgetriebe"], name: "Keine Verbindung zur Servolenkung" })],
  [/^U0140$/, () => ({ ids: ["bordnetz"], name: "Keine Verbindung zum Bordnetzsteuergerät" })],
  [/^U015[1-4]$/, () => ({ ids: ["airbag_steuergeraet"], name: "Keine Verbindung zum Airbag" })],
  [/^U0155$/, () => ({ ids: ["kombiinstrument"], name: "Keine Verbindung zum Kombiinstrument" })],
];
/** Rückfall nach Systembuchstabe */
const SYSTEM = { P: { ids: ["motorsteuergeraet", "motor"], name: "Antrieb" }, C: { ids: ["abs"], name: "Fahrwerk" }, B: { ids: ["bordnetz"], name: "Karosserie" }, U: { ids: ["gateway"], name: "Vernetzung" } };

/** @param {string} code @returns {Treffer & { genau: boolean }} */
export function bauteileFuer(code) {
  const c = String(code || "").trim().toUpperCase();
  for (const [re, f] of REGELN) { const m = c.match(re); if (m) return { ...f(m), genau: true }; }
  return { ...(SYSTEM[/** @type {"P"|"C"|"B"|"U"} */ (c[0])] || SYSTEM.P), genau: false };
}

/** Bauteile, die als Umfeld sichtbar bleiben, damit man versteht, wo das Teil sitzt. @param {string} id */
export function kontextFuer(id) {
  if (/^(injektor|zuendspule)_|^(drosselklappe|nockenwellensensor|kurbelwellensensor|kuehlmittelsensor|agr_ventil)$/.test(id)) return ["motor", "zylinderkopf", "ansaugbruecke"];
  if (id === "luftmassenmesser") return ["luftfilter", "ansaugbruecke"];
  const rad = id.match(/^(bremse|raddrehzahl)_(\w+)$/);
  if (rad) return rad[1] === "bremse" ? [`rad_${rad[2]}`] : [`rad_${rad[2]}`, `bremse_${rad[2]}`];
  if (/^lambda_|^kat$|^dpf$/.test(id)) return ["auspuff", "kat"];
  if (id === "abs") return ["bremskraftverstaerker"];
  if (id === "lichtmaschine") return ["motor"];
  return [];
}

/** Ersatz, wenn ein Modell das genaue Teil nicht hat (etwa LKW ohne einzelne Injektoren). @param {string} id */
export function ersatzFuer(id) {
  if (/^(injektor|zuendspule)_|^(drosselklappe|nockenwellensensor|kurbelwellensensor|kuehlmittelsensor|agr_ventil|luftmassenmesser|zylinderkopf|ansaugbruecke)$/.test(id)) return "motor";
  if (/^raddrehzahl_/.test(id)) return id.replace("raddrehzahl", "bremse");
  if (/^lambda_|^kat$/.test(id)) return "auspuff";
  return null;
}

/** Steuergerät (Name aus dem Scan) → sein Bauteil im Modell. Für Herstellercodes, die keine genormte Bedeutung haben.
 * @param {string} name @returns {string[]} */
export function bauteilFuerSteuergeraet(name) {
  const n = String(name || "").toLowerCase();
  const T = [[/motor|engine|dme|ecm/, ["motorsteuergeraet"]], [/getriebe|transmission|tcm/, ["getriebe"]], [/abs|esp|brems/, ["abs"]],
    [/airbag|rückhalte|srs/, ["airbag_steuergeraet"]], [/lenk|eps|servo/, ["lenkgetriebe"]], [/kombi|instrument|cluster/, ["kombiinstrument"]],
    [/gateway/, ["gateway"]], [/park|pdc|einpark/, ["parksensoren"]], [/radar|abstand|acc/, ["frontradar"]], [/kamera|camera/, ["frontkamera"]],
    [/infotain|radio|navi/, ["infotainment"]], [/bordnetz|komfort|bcm|zentral/, ["bordnetz"]], [/batterie|energie/, ["batterie"]]];
  for (const [re, ids] of T) if (/** @type {RegExp} */ (re).test(n)) return /** @type {string[]} */ (ids);
  return ["gateway"];
}
