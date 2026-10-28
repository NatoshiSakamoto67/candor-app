// @ts-check
/* Ist-Soll-Vergleich wie kfzdiag/rmi.py (detect_state, compare). Richtwerte aus daten/sollwerte-allgemein.json,
   einer Kopie von sollwerte/allgemein.json (ein Test hält beide gleich). */

export const ZUSTAENDE = Object.freeze({
  leerlauf_warm: "Leerlauf, Motor betriebswarm (Kühlmittel über 75 °C), Fahrzeug steht",
  zuendung_an: "Zündung an, Motor aus",
  fahrt: "Fahrt",
});
const LEERLAUF_MAX = 1200, STILLSTAND_KMH = 5, WARM_AB = 75, MOTOR_AUS_UNTER = 100;

/** @typedef {{ signal: string, zustand: string, min: number, max: number, art: "hersteller" | "richtwert", quelle: string, hinweis: string }} Sollwert */

/** Datei prüfen wie _load im Server: Herstellerwerte nur mit Quelle. @param {any} daten @returns {Sollwert[]} */
export function leseSollwerte(daten) {
  return (daten && Array.isArray(daten.werte) ? daten.werte : []).map((e) => {
    const art = e.art || "richtwert";
    if (art !== "hersteller" && art !== "richtwert") throw new Error(`Sollwert ${e.signal}: art muss hersteller oder richtwert sein`);
    if (art === "hersteller" && !e.quelle) throw new Error(`Herstellerwert für ${e.signal} ohne Quelle`);
    return { signal: String(e.signal).toUpperCase(), zustand: String(e.zustand || "leerlauf_warm"), min: Number(e.min), max: Number(e.max), art, quelle: String(e.quelle || daten.quelle || ""), hinweis: String(e.hinweis || "") };
  });
}

/** @param {Record<string, number>} live @returns {keyof typeof ZUSTAENDE | null} */
export function erkenneZustand(live) {
  const { DREHZAHL: rpm, GESCHWINDIGKEIT: kmh, KUEHLMITTEL: kuehl } = live;
  if (rpm == null) return null;
  if (rpm < MOTOR_AUS_UNTER) return "zuendung_an";
  if (kmh != null && kmh > STILLSTAND_KMH) return "fahrt";
  if (rpm < LEERLAUF_MAX && (kmh || 0) <= STILLSTAND_KMH && kuehl != null && kuehl >= WARM_AB) return "leerlauf_warm";
  return null;
}

/** @param {Record<string, number>} live @param {Sollwert[]} sollwerte */
export function vergleiche(live, sollwerte) {
  const zustand = erkenneZustand(live);
  const zeilen = sollwerte.filter((s) => s.zustand === zustand && s.signal in live).map((s) => {
    const ist = live[s.signal];
    return { signal: s.signal, ist, soll_min: s.min, soll_max: s.max, bewertung: ist < s.min ? "zu_niedrig" : ist > s.max ? "zu_hoch" : "ok", art: s.art, quelle: s.quelle, hinweis: s.hinweis };
  }).sort((a, b) => Number(a.bewertung === "ok") - Number(b.bewertung === "ok") || a.signal.localeCompare(b.signal));
  return {
    zustand,
    zustand_text: (zustand && ZUSTAENDE[zustand]) || "Betriebszustand nicht sicher erkennbar. Für den Vergleich Motor warmlaufen lassen und im Leerlauf messen.",
    vergleich: zeilen,
    abweichungen: zeilen.filter((z) => z.bewertung !== "ok").length,
  };
}
