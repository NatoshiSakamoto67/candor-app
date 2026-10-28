// @ts-check
/* Fehlercodes nach SAE J2012 / ISO 14229-1, wie kfzdiag/dtc.py. Herstellercodes werden nie geraten. */
import { KernFehler } from "./fehler.js";

const SYSTEME = ["P", "C", "B", "U"];
const MUSTER = /^([PCBU])([0-3])([0-9A-F])([0-9A-F])([0-9A-F])(?:-([0-9A-F]{2}))?$/;

/** ISO 14229-1 Anhang D */
export const STATUS_BITS = [
  [0, "Beim letzten Test fehlgeschlagen"], [1, "In diesem Fahrzyklus fehlgeschlagen"],
  [2, "Vorläufig (noch nicht bestätigt)"], [3, "Bestätigt und gespeichert"],
  [4, "Seit dem Löschen nicht getestet"], [5, "Seit dem Löschen mindestens einmal fehlgeschlagen"],
  [6, "In diesem Fahrzyklus noch nicht getestet"], [7, "Warnleuchte angefordert"],
];

/** Gleiche Kurztexte wie GENERIC_DESCRIPTIONS im Server; ausführlich erklärt OBDex (dtcwissen.js). */
export const GENERISCH = Object.freeze({
  P0087: "Kraftstoffdruck im Rail zu niedrig", P0088: "Kraftstoffdruck im Rail zu hoch",
  P0100: "Luftmassenmesser, Stromkreis gestört", P0101: "Luftmassenmesser, Messwert unplausibel",
  P0115: "Kühlmitteltemperaturfühler, Stromkreis gestört", P0130: "Lambdasonde vor Kat (Bank 1), Stromkreis gestört",
  P0171: "Gemisch zu mager (Bank 1)", P0172: "Gemisch zu fett (Bank 1)",
  P0234: "Ladedruck zu hoch (Überladung)", P0299: "Ladedruck zu niedrig (Unterladung)",
  P0300: "Zündaussetzer, zufällig oder mehrere Zylinder", P0301: "Zündaussetzer Zylinder 1",
  P0302: "Zündaussetzer Zylinder 2", P0303: "Zündaussetzer Zylinder 3", P0304: "Zündaussetzer Zylinder 4",
  P0335: "Kurbelwellensensor, Stromkreis gestört", P0340: "Nockenwellensensor, Stromkreis gestört",
  P0401: "Abgasrückführung, Durchfluss zu gering", P0420: "Katalysator Wirkungsgrad zu niedrig (Bank 1)",
  P0500: "Geschwindigkeitssignal gestört", P0562: "Bordnetzspannung zu niedrig", P0563: "Bordnetzspannung zu hoch",
  P2002: "Partikelfilter Wirkungsgrad zu niedrig (Bank 1)", P2015: "Saugrohrklappen, Positionssensor unplausibel (Bank 1)",
  P242F: "Partikelfilter Rußbeladung zu hoch",
  U0100: "Keine Kommunikation mit Motorsteuergerät", U0121: "Keine Kommunikation mit ABS-Steuergerät",
});

/** P0, P2, P34–P39 sowie C0, B0, U0 sind genormt. @param {string} code */
export function istGenerisch(code) {
  const [system, erste, zweite] = code;
  if (system === "P") return erste === "0" || erste === "2" || (erste === "3" && "456789".includes(zweite));
  return erste === "0";
}

/** @param {string} code @returns {Uint8Array} */
export function kodiere(code) {
  const m = MUSTER.exec(code.trim().toUpperCase());
  if (!m) throw new KernFehler(`Ungültiger Fehlercode: ${code}`);
  const [, system, d1, d2, d3, d4, ftb] = m;
  return Uint8Array.of((SYSTEME.indexOf(system) << 6) | (Number(d1) << 4) | parseInt(d2, 16), (parseInt(d3, 16) << 4) | parseInt(d4, 16), parseInt(ftb || "00", 16));
}

/**
 * @typedef {{ code: string, fehlerart: string, status: string, bestaetigt: boolean, aktiv: boolean,
 *   beschreibung: string, bekannt: boolean, quelle: string | null, statusbits: string[] }} Dtc
 */

/** Gleiche Form wie Dtc.to_dict() im Server. @param {ArrayLike<number>} record 4 Bytes @returns {Dtc} */
export function dekodiere(record) {
  if (record.length !== 4) throw new KernFehler(`DTC-Datensatz muss 4 Bytes haben, nicht ${record.length}`);
  const [hoch, mitte, ftb, status] = Array.from(record);
  const hex = (n) => n.toString(16).toUpperCase();
  const code = `${SYSTEME[hoch >> 6]}${(hoch >> 4) & 3}${hex(hoch & 15)}${hex(mitte >> 4)}${hex(mitte & 15)}`;
  const text = istGenerisch(code) ? GENERISCH[code] : undefined;
  return {
    code,
    fehlerart: ftb.toString(16).toUpperCase().padStart(2, "0"),
    status: `0x${status.toString(16).toUpperCase().padStart(2, "0")}`,
    bestaetigt: Boolean(status & 0x08),
    aktiv: Boolean(status & 0x01),
    beschreibung: text || "Unbekannt (herstellerspezifisch, kein Profil mit Quelle)",
    bekannt: Boolean(text),
    quelle: text ? "SAE J2012 (generisch)" : null,
    statusbits: STATUS_BITS.filter(([bit]) => status & (1 << Number(bit))).map(([, t]) => String(t)),
  };
}
