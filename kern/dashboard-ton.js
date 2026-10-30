// @ts-check
/* Ampel für den Dashboard-Modus: reine Funktion, bewertet einen Live-Wert gegen feste Grenzen.
   Kühlmittel über 105 °C ist rot, Bordspannung unter 12 V (Motor aus) oder unter 13,2 V (Motor läuft) ist rot.
   Gelb liegt knapp davor, damit der Fahrer die Entwicklung sieht, bevor es ernst wird. */

/** @typedef {"ok"|"warn"|"crit"} Ton */

export const GRENZEN = Object.freeze({
  KUEHLMITTEL: { warn: 100, crit: 105 },
  OELTEMPERATUR: { warn: 125, crit: 135 },
  DREHZAHL: { warn: 6000, crit: 6500 },
  SPANNUNG_RUHE: { crit: 12, warn: 12.2 },
  SPANNUNG_LADEN: { crit: 13.2, warn: 13.6, hoch: 15 },
});

/**
 * Bewertung eines Signals für die Dashboard-Kachel.
 * @param {string} signal Signalname wie in state.live (DREHZAHL, KUEHLMITTEL, SPANNUNG, LAST, GESCHWINDIGKEIT)
 * @param {number|null|undefined} wert Messwert
 * @param {boolean} motorLaeuft Drehzahl über 100 1/min
 * @returns {Ton|null} null ohne Wert
 */
export function dashboardTon(signal, wert, motorLaeuft) {
  if (typeof wert !== "number" || Number.isNaN(wert)) return null;
  if (signal === "SPANNUNG") {
    if (motorLaeuft) { const g = GRENZEN.SPANNUNG_LADEN; return wert < g.crit || wert > g.hoch ? "crit" : wert < g.warn ? "warn" : "ok"; }
    const g = GRENZEN.SPANNUNG_RUHE; return wert < g.crit ? "crit" : wert < g.warn ? "warn" : "ok";
  }
  const g = signal === "KUEHLMITTEL" ? GRENZEN.KUEHLMITTEL : signal === "OELTEMPERATUR" ? GRENZEN.OELTEMPERATUR : signal === "DREHZAHL" ? GRENZEN.DREHZAHL : null;
  if (!g) return "ok";
  return wert > g.crit ? "crit" : wert > g.warn ? "warn" : "ok";
}

/** Kachelgruppen des Dashboards: welche Signale zusammen auf dem Armaturenbrett stehen. */
export const KACHELGRUPPEN = Object.freeze([
  { id: "motor", titel: "Motor", signale: ["DREHZAHL", "GESCHWINDIGKEIT", "KUEHLMITTEL", "LAST"] },
  { id: "gemisch", titel: "Gemisch", signale: ["TRIM_KURZ_B1", "TRIM_LANG_B1", "LUFTMASSE", "ANSAUGLUFT"] },
  { id: "bordnetz", titel: "Bordnetz", signale: ["SPANNUNG", "OELTEMPERATUR", "LAUFZEIT", "TANK"] },
]);

/** Kurze Namen für die Kacheln, damit nichts abgeschnitten wird; andere Signale nehmen den Titel aus dem Wissen. */
export const KURZ = Object.freeze({ DREHZAHL: "Drehzahl", GESCHWINDIGKEIT: "Geschwindigkeit", KUEHLMITTEL: "Kühlmittel", LAST: "Motorlast", TRIM_KURZ_B1: "Trim kurz", TRIM_LANG_B1: "Trim lang",
  LUFTMASSE: "Luftmasse", ANSAUGLUFT: "Ansaugluft", SPANNUNG: "Bordspannung", OELTEMPERATUR: "Öltemperatur", LAUFZEIT: "Motorlaufzeit", TANK: "Tank" });

/** Nächste Gruppe im Kreis. @param {string} id */
export function naechsteGruppe(id) {
  const i = KACHELGRUPPEN.findIndex((g) => g.id === id);
  return KACHELGRUPPEN[(i + 1) % KACHELGRUPPEN.length].id;
}
