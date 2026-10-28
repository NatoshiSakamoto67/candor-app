// @ts-check
/* Fehlerarten des Diagnosekerns. `meldung` ist immer für Menschen geschrieben. */

export class KernFehler extends Error {
  /** @param {string} meldung @param {string} art */
  constructor(meldung, art = "kern") { super(meldung); this.name = "KernFehler"; this.art = art; }
}
export class VerbindungsFehler extends KernFehler {
  /** @param {string} meldung */
  constructor(meldung) { super(meldung, "verbindung"); this.name = "VerbindungsFehler"; }
}
export class SperrFehler extends KernFehler {
  /** @param {string} meldung */
  constructor(meldung) { super(meldung, "gesperrt"); this.name = "SperrFehler"; }
}
export class EinstellungsFehler extends KernFehler {
  /** @param {string} meldung */
  constructor(meldung) { super(meldung, "einstellung"); this.name = "EinstellungsFehler"; }
}
