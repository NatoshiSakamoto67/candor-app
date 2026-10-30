// @ts-check
/* Technische Sperre wie kfzdiag/guard.py: nur diese Dienste verlassen das Gerät.
   Im Direktmodus der App gibt es (noch) keine Profil-Funktionen, darum auch keine Ausnahmen:
   kein Security Access (0x27), kein Schreiben (0x2E), keine Stellglieder, Routinen oder Flashen.
   Seit dem Audit 29.10.2026 auch kein Löschen (OBD 0x04, UDS 0x14): der Direktmodus liest nur, technisch erzwungen. */
import { SperrFehler, KernFehler } from "./fehler.js";

export const ERLAUBTE_DIENSTE = Object.freeze(new Set([0x01, 0x02, 0x03, 0x07, 0x09, 0x0a, 0x10, 0x19, 0x22, 0x3e]));
export const ERLAUBTE_SITZUNGEN = Object.freeze(new Set([0x01, 0x03]));
/** ReadDTCInformation nur lesend: 01 Anzahl, 02 nach Maske, 04 Snapshot, 06 Extended Data, 0A alle unterstützten. */
export const ERLAUBTE_DTC_UNTERFUNKTIONEN = Object.freeze(new Set([0x01, 0x02, 0x04, 0x06, 0x0a]));

/** @param {Uint8Array} payload */
export function pruefeAusgehend(payload) {
  if (!payload.length) throw new KernFehler("Leere Anfrage");
  const sid = payload[0];
  if (!ERLAUBTE_DIENSTE.has(sid)) throw new SperrFehler(`Dienst 0x${sid.toString(16).toUpperCase().padStart(2, "0")} ist gesperrt und wird nicht gesendet.`);
  if (sid === 0x10 && (payload.length < 2 || !ERLAUBTE_SITZUNGEN.has(payload[1] & 0x7f))) {
    throw new SperrFehler("Nur Standard- und erweiterte Diagnosesitzung erlaubt (keine Programmiersitzung).");
  }
  if (sid === 0x19 && (payload.length < 2 || !ERLAUBTE_DTC_UNTERFUNKTIONEN.has(payload[1] & 0x7f))) {
    throw new SperrFehler("Fehlerspeicher nur mit den Unterfunktionen 01, 02, 04, 06 und 0A lesen.");
  }
}
