// @ts-check
/* Erststart (30.10.2026): zuerst »Wofür nutzt du CANdor?«. Eigenes Auto führt direkt zum Fahrzeug, Werkstatt zuerst
   zu den freiwilligen Werkstattangaben. Reine Daten und reine Funktionen; gezeichnet wird in modules/werkstatt.js. */

/** Schlüssel im localStorage, Werte »privat« oder »werkstatt«. */
export const NUTZUNG_KEY = "kfzdiag-nutzung";
/** @typedef {"privat"|"werkstatt"} Nutzung */
/** @type {readonly Nutzung[]} */
export const NUTZUNGEN = Object.freeze(["privat", "werkstatt"]);
/** @type {Nutzung} */
export const STANDARD_NUTZUNG = "privat";

/** Gespeicherten Wert prüfen: alles Unbekannte zählt als »noch nicht gewählt«. @param {unknown} wert @returns {Nutzung|null} */
export function nutzungLesen(wert) {
  return NUTZUNGEN.find((n) => n === wert) || null;
}

/**
 * Welche Erststart-Seite ist offen? »wahl«, »werkstatt« oder null (dann wie bisher Fahrzeug oder Start).
 * werkstattGefragt: Werkstattangaben gespeichert oder übersprungen (auch aus älteren Fassungen ohne Wahl).
 * @param {{nutzung: unknown, werkstattGefragt: boolean, kundenfassung: boolean}} s
 * @returns {"wahl"|"werkstatt"|null}
 */
export function ersterSchritt({ nutzung, werkstattGefragt, kundenfassung }) {
  if (kundenfassung || werkstattGefragt) return null;
  const n = nutzungLesen(nutzung);
  if (!n) return "wahl";
  return n === "werkstatt" ? "werkstatt" : null;
}

/** Seite nach der Wahl. @param {Nutzung} nutzung @returns {"werkstatt"|"fahrzeug"} */
export const nachWahl = (nutzung) => (nutzung === "werkstatt" ? "werkstatt" : "fahrzeug");

/** Schrittzähler für die Kopfkarte, leer wenn die Seite nicht zum Erststart dieser Wahl gehört. @param {"werkstatt"|"fahrzeug"} seite @param {unknown} nutzung */
export function schritt(seite, nutzung) {
  const n = nutzungLesen(nutzung);
  if (!n) return "";
  const folge = n === "werkstatt" ? ["wahl", "werkstatt", "fahrzeug"] : ["wahl", "fahrzeug"];
  const i = folge.indexOf(seite);
  return i < 0 ? "" : `Schritt ${i + 1} von ${folge.length}`;
}

/**
 * Unterschriftszeilen im Bericht. Beim eigenen Auto ohne Werkstattangaben genügt eine Zeile.
 * @param {{werkstatt: {mechaniker?: string}|null|undefined, nutzung: unknown}} s
 * @returns {string[]}
 */
export function unterschriften({ werkstatt, nutzung }) {
  if (!werkstatt && nutzungLesen(nutzung) === "privat") return ["Datum, Unterschrift"];
  const mech = werkstatt && werkstatt.mechaniker;
  return [`Datum, Unterschrift Werkstatt${mech ? ` (${mech})` : ""}`, "Datum, Unterschrift Kunde"];
}

/** Wert rechts in der Einstellungszeile »Nutzung«. @param {unknown} nutzung */
export function nutzungText(nutzung) {
  const n = nutzungLesen(nutzung);
  return n === "privat" ? "Eigenes Auto" : n === "werkstatt" ? "Werkstatt" : "Nicht gewählt";
}

/** Gehört die Wahlseite gerade zum Erststart (dann »Weiter«) oder wird die Nutzung aus den Einstellungen geändert?
 * @param {{nutzung: unknown, werkstattGefragt: boolean}} s */
export const wahlImErststart = ({ nutzung, werkstattGefragt }) => ersterSchritt({ nutzung, werkstattGefragt, kundenfassung: false }) !== null;

/** @typedef {"kunde"|"werkstatt"} Fassung */
/** Berichtsfassung: ausdrücklich gewählt bleibt, sonst beim eigenen Auto die kurze, sonst die Werkstattfassung.
 * @param {{gewaehlt: unknown, nutzung: unknown}} s @returns {Fassung} */
export function berichtFassung({ gewaehlt, nutzung }) {
  if (gewaehlt === "kunde" || gewaehlt === "werkstatt") return gewaehlt;
  return nutzungLesen(nutzung) === "privat" ? "kunde" : "werkstatt";
}
/** Unterzeile unter dem Berichtstitel. @param {Fassung} fassung @param {unknown} nutzung */
export function fassungTitel(fassung, nutzung) {
  if (nutzungLesen(nutzung) === "privat") return fassung === "kunde" ? "Mein Bericht" : "Mein Bericht, ausführlich";
  return fassung === "kunde" ? "Fassung für Kundin oder Kunde" : "Werkstattfassung";
}
/** Beschriftung der Fassungsknöpfe. @param {unknown} nutzung @returns {[Fassung, string][]} */
export const fassungKnoepfe = (nutzung) => (nutzungLesen(nutzung) === "privat" ? [["kunde", "Kurz"], ["werkstatt", "Ausführlich"]] : [["kunde", "Kunde"], ["werkstatt", "Werkstatt"]]);

/** Knopf im Werkzeugbereich des Berichts, der zu den Angaben im Briefkopf führt. Beim eigenen Auto ohne »Werkstatt«.
 * @param {{werkstatt: {name?: string}|null|undefined, nutzung: unknown}} s @returns {string} */
export function briefkopfKnopf({ werkstatt, nutzung }) {
  const privat = nutzungLesen(nutzung) === "privat";
  if (werkstatt) return `${privat ? "Briefkopf" : "Werkstatt"}: ${werkstatt.name || "Angaben"}`;
  return privat ? "Angaben im Briefkopf" : "Werkstattdaten eintragen";
}

/** Zeile unter »Anrufen« in der Pannenhilfe, solange keine eigene Nummer hinterlegt ist.
 * @param {unknown} nutzung @returns {{label: string, unter: string}} */
export function panneNummerZeile(nutzung) {
  return nutzungLesen(nutzung) === "privat"
    ? { label: "Eigene Nummer", unter: "Eigene Werkstatt oder Pannennummer hinterlegen" }
    : { label: "Eigene Werkstatt", unter: "Telefon in den Werkstattdaten hinterlegen" };
}
