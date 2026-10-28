// @ts-check
/* Technische Sperre wie kfzdiag/guard.py: nur diese Dienste verlassen das Gerät.
   Im Direktmodus der App gibt es (noch) keine Profil-Funktionen, darum auch keine Ausnahmen:
   kein Security Access (0x27), kein Schreiben (0x2E), keine Stellglieder, Routinen oder Flashen. */
import { SperrFehler, KernFehler } from "./fehler.js";

export const ERLAUBTE_DIENSTE = Object.freeze(new Set([0x01, 0x02, 0x03, 0x04, 0x07, 0x09, 0x0a, 0x10, 0x14, 0x19, 0x22, 0x3e]));
export const ERLAUBTE_SITZUNGEN = Object.freeze(new Set([0x01, 0x03]));

/** @param {Uint8Array} payload */
export function pruefeAusgehend(payload) {
  if (!payload.length) throw new KernFehler("Leere Anfrage");
  const sid = payload[0];
  if (!ERLAUBTE_DIENSTE.has(sid)) throw new SperrFehler(`Dienst 0x${sid.toString(16).toUpperCase().padStart(2, "0")} ist gesperrt und wird nicht gesendet.`);
  if (sid === 0x10 && (payload.length < 2 || !ERLAUBTE_SITZUNGEN.has(payload[1] & 0x7f))) {
    throw new SperrFehler("Nur Standard- und erweiterte Diagnosesitzung erlaubt (keine Programmiersitzung).");
  }
}
