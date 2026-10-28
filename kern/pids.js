// @ts-check
/* Genormte Messwerte (SAE J1979, Dienst 01) wie kfzdiag/pids.py, mit Rückrichtung für Tests und Simulator. */

/** @typedef {{ pid: number, name: string, beschreibung: string, einheit: string, dekodiere: (b: Uint8Array) => number, kodiere: (v: number) => Uint8Array, min: number, max: number }} Pid */

const u8 = (v) => Uint8Array.of(Math.round(v) & 0xff);
const u16 = (v) => { const r = Math.round(v) & 0xffff; return Uint8Array.of(r >> 8, r & 0xff); };
/* Zu kurze Antwort ergibt NaN statt einer falschen Zahl. */
const w = (b) => (b.length < 2 ? NaN : (b[0] << 8) | b[1]);
const prozent = { dekodiere: (b) => (b[0] * 100) / 255, kodiere: (v) => u8((v * 255) / 100), min: 0, max: 100 };
const temperatur = (max = 215) => ({ dekodiere: (b) => b[0] - 40, kodiere: (v) => u8(v + 40), min: -40, max });
const trim = { dekodiere: (b) => ((b[0] - 128) * 100) / 128, kodiere: (v) => u8((v * 128) / 100 + 128), min: -100, max: 99.2 };
const roh8 = { dekodiere: (b) => b[0], kodiere: u8, min: 0, max: 255 };
const roh16 = { dekodiere: w, kodiere: u16, min: 0, max: 65535 };

/** @type {Array<[number, string, string, string, Omit<Pid, "pid" | "name" | "beschreibung" | "einheit">]>} */
const TABELLE = [
  [0x04, "LAST", "Motorlast berechnet", "%", prozent],
  [0x05, "KUEHLMITTEL", "Kühlmitteltemperatur", "°C", temperatur()],
  [0x0b, "SAUGROHRDRUCK", "Saugrohrdruck absolut", "kPa", roh8],
  [0x0c, "DREHZAHL", "Motordrehzahl", "1/min", { dekodiere: (b) => w(b) / 4, kodiere: (v) => u16(v * 4), min: 0, max: 16383.75 }],
  [0x0d, "GESCHWINDIGKEIT", "Fahrzeuggeschwindigkeit", "km/h", roh8],
  [0x0f, "ANSAUGLUFT", "Ansauglufttemperatur", "°C", temperatur()],
  [0x10, "LUFTMASSE", "Luftmasse", "g/s", { dekodiere: (b) => w(b) / 100, kodiere: (v) => u16(v * 100), min: 0, max: 655.35 }],
  [0x11, "DROSSELKLAPPE", "Drosselklappenstellung", "%", prozent],
  [0x2f, "TANK", "Tankfüllstand", "%", prozent],
  [0x33, "LUFTDRUCK", "Umgebungsluftdruck", "kPa", roh8],
  [0x42, "SPANNUNG", "Steuergerätespannung", "V", { dekodiere: (b) => w(b) / 1000, kodiere: (v) => u16(v * 1000), min: 0, max: 65.535 }],
  [0x46, "UMGEBUNG", "Umgebungstemperatur", "°C", temperatur()],
  [0x5c, "OELTEMPERATUR", "Motoröltemperatur", "°C", temperatur(210)],
  [0x06, "TRIM_KURZ_B1", "Gemischkorrektur kurzfristig Bank 1", "%", trim],
  [0x07, "TRIM_LANG_B1", "Gemischkorrektur langfristig Bank 1", "%", trim],
  [0x08, "TRIM_KURZ_B2", "Gemischkorrektur kurzfristig Bank 2", "%", trim],
  [0x09, "TRIM_LANG_B2", "Gemischkorrektur langfristig Bank 2", "%", trim],
  [0x44, "LAMBDA_SOLL", "Lambda Sollwert", "λ", { dekodiere: (b) => (w(b) * 2) / 65536, kodiere: (v) => u16(v * 32768), min: 0, max: 2 }],
  [0x0e, "ZUENDWINKEL", "Zündzeitpunkt (vor OT)", "°", { dekodiere: (b) => b[0] / 2 - 64, kodiere: (v) => u8((v + 64) * 2), min: -64, max: 63.5 }],
  [0x43, "LAST_ABSOLUT", "Motorlast absolut", "%", { dekodiere: (b) => (w(b) * 100) / 255, kodiere: (v) => u16((v * 255) / 100), min: 0, max: 25700 }],
  [0x45, "DROSSEL_RELATIV", "Drosselklappe relativ", "%", prozent],
  [0x62, "DREHMOMENT", "Motordrehmoment Ist", "%", { dekodiere: (b) => b[0] - 125, kodiere: (v) => u8(v + 125), min: -125, max: 130 }],
  [0x1f, "LAUFZEIT", "Laufzeit seit Motorstart", "s", roh16],
  [0x23, "RAILDRUCK", "Kraftstoff-Raildruck", "kPa", { dekodiere: (b) => w(b) * 10, kodiere: (v) => u16(v / 10), min: 0, max: 655350 }],
  [0x5e, "VERBRAUCH", "Kraftstoffverbrauch", "l/h", { dekodiere: (b) => w(b) / 20, kodiere: (v) => u16(v * 20), min: 0, max: 3276.75 }],
  [0x2c, "AGR_SOLL", "Abgasrückführung Soll", "%", prozent],
  [0x3c, "KAT_TEMP_B1", "Katalysatortemperatur Bank 1", "°C", { dekodiere: (b) => w(b) / 10 - 40, kodiere: (v) => u16((v + 40) * 10), min: -40, max: 6513.5 }],
  [0x21, "KM_MIT_MIL", "Strecke mit leuchtender Motorkontrollleuchte", "km", roh16],
  [0x31, "KM_SEIT_LOESCHEN", "Strecke seit dem letzten Löschen", "km", roh16],
];

/** @type {Readonly<Record<string, Pid>>} */
export const PIDS = Object.freeze(Object.fromEntries(TABELLE.map(([pid, name, beschreibung, einheit, f]) => [name, Object.freeze({ pid, name, beschreibung, einheit, ...f })])));
/** @type {ReadonlyMap<number, Pid>} */
export const PID_NACH_NUMMER = new Map(Object.values(PIDS).map((p) => [p.pid, p]));

const UNPLAUSIBEL = "Unplausibel. Fühler oder Leitung prüfen.";
const TRIM_WARNUNG = "Gemischkorrektur über ±15 %. Falschluft, Einspritzung oder Lambdasonde prüfen.";
/** Eigene Warngrenzen: ein Hinweis, kein Verstecken. @type {Readonly<Record<string, [number, number, string]>>} */
export const PLAUSIBEL = Object.freeze({
  KUEHLMITTEL: [-35, 130, UNPLAUSIBEL], ANSAUGLUFT: [-35, 90, UNPLAUSIBEL], OELTEMPERATUR: [-35, 160, UNPLAUSIBEL],
  SPANNUNG: [11.8, 15.2, "Bordnetz außerhalb 11,8 bis 15,2 V. Batterie und Lichtmaschine prüfen."],
  TRIM_LANG_B1: [-15, 15, TRIM_WARNUNG], TRIM_LANG_B2: [-15, 15, TRIM_WARNUNG],
  KAT_TEMP_B1: [-40, 900, "Katalysator über 900 °C. Überhitzung durch Zündaussetzer möglich."],
});
