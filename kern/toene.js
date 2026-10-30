// @ts-check
/* Töne & Haptik als reine Logik: welche Ereignisse sich melden, wie laut, mit welchem Muster. Das Abspielen über WebAudio
   und navigator.vibrate liegt in modules/toene.js; hier steht nur, was gespielt werden soll, damit es ohne Browser testbar ist. */

/** @typedef {"leise"|"normal"|"laut"} Lautstaerke */
/** @typedef {{an: boolean, vibration: boolean, lautstaerke: Lautstaerke, ereignisse: Record<string, boolean>}} Toneinstellung */

/* Muster je Art: Töne als [Frequenz Hz, Dauer s, Pause danach s], Vibration als Muster in ms. */
export const TONARTEN = Object.freeze({
  warnung: { label: "Neuer Fehler", kurz: "Warnton", toene: [[660, .18, .06], [440, .3, 0]], vibration: [120, 60, 200] },
  grenze: { label: "Wertgrenze verletzt", kurz: "Doppelter Ton", toene: [[880, .12, .1], [880, .12, 0]], vibration: [80, 80, 80] },
  fertig: { label: "Vollscan fertig", kurz: "Bestätigung", toene: [[523, .1, .04], [784, .2, 0]], vibration: [40] },
  klick: { label: "Freigabe ausgeführt", kurz: "Klick", toene: [[1200, .04, 0]], vibration: [15] },
});

/** Pegel der WebAudio-Hüllkurve je Stufe (0 bis 1). */
export const PEGEL = Object.freeze({ leise: .07, normal: .18, laut: .4 });

/** @type {Toneinstellung} */
export const STANDARD = Object.freeze({ an: true, vibration: true, lautstaerke: "normal", ereignisse: Object.freeze({ warnung: true, grenze: true, fertig: true, klick: true }) });

/**
 * Gespeicherte Einstellung (beliebiger Inhalt aus localStorage) auf eine gültige bringen; Unbekanntes fällt weg.
 * @param {any} roh
 * @returns {Toneinstellung}
 */
export function normalisieren(roh) {
  const r = roh && typeof roh === "object" ? roh : {};
  const ev = r.ereignisse && typeof r.ereignisse === "object" ? r.ereignisse : {};
  return {
    an: typeof r.an === "boolean" ? r.an : STANDARD.an,
    vibration: typeof r.vibration === "boolean" ? r.vibration : STANDARD.vibration,
    lautstaerke: Object.prototype.hasOwnProperty.call(PEGEL, r.lautstaerke) ? r.lautstaerke : STANDARD.lautstaerke,
    ereignisse: Object.fromEntries(Object.keys(TONARTEN).map((k) => [k, typeof ev[k] === "boolean" ? ev[k] : true])),
  };
}

/**
 * Was soll für ein Ereignis passieren? Die Vorschau spielt auch abgeschaltete Ereignisse, damit man sie vorher hören kann.
 * @param {Toneinstellung} e
 * @param {string} art
 * @param {{vorschau?: boolean}} [opt]
 * @returns {{ton: boolean, vibration: boolean, pegel: number, toene: number[][], muster: number[]}}
 */
export function plan(e, art, opt = {}) {
  const m = /** @type {Record<string, {toene: number[][], vibration: number[]}>} */ (TONARTEN)[art];
  if (!m) throw new Error(`Unbekannte Tonart: ${art}`);
  const gewollt = Boolean(opt.vorschau) || e.ereignisse[art] !== false;
  return { ton: gewollt && e.an, vibration: gewollt && e.vibration, pegel: PEGEL[e.lautstaerke] ?? PEGEL.normal, toene: m.toene, muster: m.vibration };
}
