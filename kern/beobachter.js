// @ts-check
/* Fahrt-Agent ohne DOM: Auslöser zwischen zwei Ständen (neuer Fehler, Wert außerhalb nach drei Messungen in Folge,
   Spannungseinbruch, Readiness fertig) mit Entprellung alle zehn Minuten. Dieselben Regeln wie kfzdiag/beobachter.py.
   Dazu die Einstellungen der Seite (localStorage) und das Erkennen neuer Ereignisse zwischen zwei Abfragen. */

/** @typedef {{ code: string, steuergeraet?: string }} Fehler */
/** @typedef {{ fehler?: Fehler[], werte?: Record<string, number | null | undefined>, readiness?: { au_bereit?: boolean | null } | null, zeit?: number }} Stand */
/** @typedef {Record<string, [number, number]>} Richtwerte */
/** @typedef {{ ausserhalb: Record<string, number>, zuletzt: Record<string, number> }} Zustand */
/** @typedef {{ art: string, zeit: number, code?: string, steuergeraet?: string, signal?: string, wert?: number, bereich?: [number, number], grenze?: number, motor_laeuft?: boolean, text?: string, zeit_iso?: string, bericht?: string | null }} Ereignis */
/** @typedef {{ ton: boolean, vibration: boolean, toast: boolean, intervall: number, mitKi: boolean }} Einstellungen */

export const ENTPRELLUNG_S = 600;
export const AUSSERHALB_AB = 3;
export const MOTOR_LAEUFT_AB = 100;
export const SPANNUNG_FAHRT_MIN = 11.5;
export const SPANNUNG_START_MIN = 9.6;
export const INTERVALLE = [2, 5, 10, 30];
/** @type {Richtwerte} Richtwerte wie PLAUSIBLE im Server */
export const RICHTWERTE = { KUEHLMITTEL: [-35, 130], ANSAUGLUFT: [-35, 90], SPANNUNG: [11.8, 15.2], OELTEMPERATUR: [-35, 160], TRIM_LANG_B1: [-15, 15], TRIM_LANG_B2: [-15, 15], KAT_TEMP_B1: [-40, 900] };
/** @type {Zustand} */
export const LEERER_ZUSTAND = Object.freeze({ ausserhalb: Object.freeze({}), zuletzt: Object.freeze({}) });
/** @type {Einstellungen} */
export const EINSTELLUNGEN_STANDARD = Object.freeze({ ton: true, vibration: false, toast: true, intervall: 5, mitKi: false });

/** @param {unknown} w @returns {number | null} */
const zahl = (w) => (typeof w === "number" && Number.isFinite(w) ? w : null);
/** @param {Stand} s */
const fehlerMenge = (s) => new Set((s.fehler || []).filter((f) => f && f.code).map((f) => `${f.code}|${f.steuergeraet || ""}`));

/** @param {Stand} vorher @param {Stand} nachher @param {number} zeit @returns {Ereignis[]} */
function neueFehler(vorher, nachher, zeit) {
  const alt = fehlerMenge(vorher);
  return [...fehlerMenge(nachher)].filter((k) => !alt.has(k)).sort().map((k) => {
    const [code, steuergeraet] = k.split("|");
    return { art: "neuer_fehler", code, steuergeraet, zeit };
  });
}
/** @param {Stand} nachher @param {Richtwerte} richtwerte @param {number} zeit @returns {Ereignis[]} */
function ausserhalb(nachher, richtwerte, zeit) {
  const werte = nachher.werte || {};
  /** @type {Ereignis[]} */
  const treffer = [];
  for (const [signal, [low, high]] of Object.entries(richtwerte)) {
    const wert = zahl(werte[signal]);
    if (wert !== null && (wert < low || wert > high)) treffer.push({ art: "wert_ausserhalb", signal, wert, bereich: [low, high], zeit });
  }
  return treffer;
}
/** @param {Stand} nachher @param {number} zeit @returns {Ereignis[]} */
function spannung(nachher, zeit) {
  const werte = nachher.werte || {};
  const u = zahl(werte.SPANNUNG), n = zahl(werte.DREHZAHL);
  if (u === null) return [];
  const laeuft = n !== null && n >= MOTOR_LAEUFT_AB;
  const grenze = laeuft ? SPANNUNG_FAHRT_MIN : SPANNUNG_START_MIN;
  return u >= grenze ? [] : [{ art: "spannung_einbruch", wert: u, grenze, motor_laeuft: laeuft, zeit }];
}
/** @param {Stand} vorher @param {Stand} nachher @param {number} zeit @returns {Ereignis[]} */
function readiness(vorher, nachher, zeit) {
  const v = vorher.readiness || {}, n = nachher.readiness || {};
  return v.au_bereit === false && n.au_bereit === true ? [{ art: "readiness_fertig", zeit }] : [];
}

/** Entprell-Schlüssel: Art plus Code oder Signal. @param {Ereignis} e */
export const schluessel = (e) => `${e.art}:${e.code || e.signal || ""}`;

/**
 * Ereignisse zwischen zwei Ständen. Rein: neue Objekte, Eingaben bleiben unverändert.
 * @param {Stand} vorher @param {Stand} nachher @param {Richtwerte} [richtwerte] @param {Zustand} [zustand]
 * @returns {{ ereignisse: Ereignis[], zustand: Zustand }}
 */
export function ausloeser(vorher, nachher, richtwerte = RICHTWERTE, zustand = LEERER_ZUSTAND) {
  const zeit = zahl(nachher.zeit) || 0;
  const roh = ausserhalb(nachher, richtwerte, zeit);
  /** @type {Record<string, number>} */
  const zaehler = Object.fromEntries(roh.map((e) => [e.signal, (zustand.ausserhalb[String(e.signal)] || 0) + 1]));
  const kandidaten = [...neueFehler(vorher, nachher, zeit), ...roh.filter((e) => zaehler[String(e.signal)] >= AUSSERHALB_AB), ...spannung(nachher, zeit), ...readiness(vorher, nachher, zeit)];
  /** @type {Record<string, number>} */
  let zuletzt = { ...zustand.zuletzt };
  /** @type {Ereignis[]} */
  const ereignisse = [];
  for (const e of kandidaten) {
    const k = schluessel(e);
    if (k in zuletzt && zeit - zuletzt[k] < ENTPRELLUNG_S) continue;
    zuletzt = { ...zuletzt, [k]: zeit };
    ereignisse.push(e);
  }
  return { ereignisse, zustand: { ausserhalb: zaehler, zuletzt } };
}

/** Klartext einer Ereigniszeile. @param {Ereignis} e */
export function ereignisText(e) {
  if (e.art === "neuer_fehler") return `Neuer Fehler ${e.code} (${e.steuergeraet || "Steuergerät unbekannt"})`;
  if (e.art === "wert_ausserhalb") { const [low, high] = e.bereich || [null, null]; return `${e.signal} ${e.wert} außerhalb ${low} bis ${high}`; }
  if (e.art === "spannung_einbruch") return `Bordspannung ${e.wert} V unter ${e.grenze} V (${e.motor_laeuft ? "Motor läuft" : "Start"})`;
  if (e.art === "readiness_fertig") return "Bereitschaftstests abgeschlossen";
  return String(e.art);
}
/** Farbton der Markierung je Art. @param {Ereignis} e @returns {"crit" | "warn" | "ok" | "pending"} */
export const ereignisTon = (e) => (e.art === "neuer_fehler" ? "crit" : e.art === "readiness_fertig" ? "ok" : e.art === "wert_ausserhalb" || e.art === "spannung_einbruch" ? "warn" : "pending");

/** Einstellungen der Seite prüfen und mit Standardwerten auffüllen; immer ein neues Objekt. @param {unknown} roh @returns {Einstellungen} */
export function einstellungen(roh) {
  const r = roh && typeof roh === "object" ? /** @type {Record<string, unknown>} */ (roh) : {};
  const bool = (/** @type {string} */ k) => (typeof r[k] === "boolean" ? /** @type {boolean} */ (r[k]) : EINSTELLUNGEN_STANDARD[/** @type {"ton" | "vibration" | "toast" | "mitKi"} */ (k)]);
  const intervall = INTERVALLE.includes(Number(r.intervall)) ? Number(r.intervall) : EINSTELLUNGEN_STANDARD.intervall;
  return { ton: bool("ton"), vibration: bool("vibration"), toast: bool("toast"), intervall, mitKi: bool("mitKi") };
}

/** Ereignisse, die in der neuen Liste stehen und in der alten fehlen (Zeit und Schlüssel). @param {Ereignis[]} alt @param {Ereignis[]} neu */
export function neueEreignisse(alt, neu) {
  const kennung = (/** @type {Ereignis} */ e) => `${e.zeit_iso || e.zeit}|${schluessel(e)}`;
  const bekannt = new Set(alt.map(kennung));
  return neu.filter((e) => !bekannt.has(kennung(e)));
}

/** Berichtname 20261030-140509-P0171.md lesbar machen. @param {string} name */
export function berichtTitel(name) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([A-Z0-9_]+)\.md$/.exec(name);
  return m ? { titel: m[7], unter: `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}:${m[6]}` } : { titel: name, unter: "" };
}
