// @ts-check
/* Fall je Fehlercode ohne DOM: Signale bewerten, Hypothesen mit stützt, widerspricht, fehlt bilden, Nachweis
   vorher/nachher je Signal. Dieselben Regeln wie kfzdiag/fall.py, für die Vorschau ohne Server und die Seite. */

/** @typedef {{ signal: string, zustand: string, min: number, max: number, einheit?: string, quelle?: string }} Soll */
/** @typedef {Soll & { wert: number | null, status: "im_bereich" | "unter" | "ueber" | "fehlt" | "zustand" }} Messwert */
/** @typedef {{ wenn: string, ursache: string, sicherheit: "belegt" | "plausibel" | "vermutung", hypothese: string }} Deutung */
/** @typedef {{ id: string, titel: string, art: "auto" | "manuell", signal?: string, werkzeug?: string, minuten?: number, deutung: Deutung[] }} Messung */
/** @typedef {{ signale: Soll[], messungen: Messung[] }} Pfad */
/** @typedef {{ klartext: string, massnahme: string, service?: string, art?: string }} KatalogEintrag */
/** @typedef {Record<string, KatalogEintrag>} Katalog */
/** @typedef {{ messung: string, titel: string, text: string }} Eintrag */
/** @typedef {"belegt" | "plausibel" | "vermutung"} Stufe */
/** @typedef {{ id: string, klartext: string, massnahme: string, service: string | null, art: string, stufe: Stufe, stuetzt: Eintrag[], widerspricht: Eintrag[], fehlt: Eintrag[], quellen: string[] }} Hypothese */
/** @typedef {Record<string, number>} Werte */
/** @typedef {Record<string, string>} Manuell */

/** Drehzahl, ab der der Motor als laufend gilt (wie MOTOR_LAEUFT_AB im Server) */
export const MOTOR_LAEUFT_AB = 100;
export const STUFEN = { vermutung: 1, plausibel: 2, belegt: 3 };
export const ANTWORTEN = ["ja", "nein"];
const HINWEIS = "hinweis";

/** @param {Soll} soll @param {Werte} werte @returns {Messwert} */
export function bewerteSignal(soll, werte) {
  const aus = { signal: soll.signal, min: soll.min, max: soll.max, einheit: soll.einheit, quelle: soll.quelle, zustand: soll.zustand };
  const wert = werte[soll.signal];
  if (typeof wert !== "number") return { ...aus, wert: null, status: "fehlt" };
  const drehzahl = werte.DREHZAHL;
  const laeuft = typeof drehzahl === "number" && drehzahl > MOTOR_LAEUFT_AB;
  if ((soll.zustand === "motor_laeuft" && !laeuft) || (soll.zustand === "motor_aus" && laeuft)) return { ...aus, wert, status: "zustand" };
  return { ...aus, wert, status: wert < soll.min ? "unter" : wert > soll.max ? "ueber" : "im_bereich" };
}

/** Zahl wie im Server: ganze Zahlen ohne Nachkommastelle, sonst eine, mit Komma. @param {number} w */
export const zahl = (w) => (Number.isInteger(w) ? String(w) : w.toFixed(1).replace(".", ","));
/** @param {{ min: number, max: number, einheit?: string }} m */
const bereich = (m) => `${zahl(m.min)} bis ${zahl(m.max)} ${m.einheit || ""}`.trim();

/** Kurztext zu einem bewerteten Signal, identisch zu messwert_text in fall.py. @param {Messwert} m */
export function messwertText(m) {
  if (m.status === "fehlt") return `kein Wert, Soll ${bereich(m)}`;
  const wert = `${zahl(/** @type {number} */ (m.wert))} ${m.einheit || ""}`.trim();
  if (m.status === "zustand") return `${wert}, gilt erst bei ${m.zustand === "motor_aus" ? "stehendem" : "laufendem"} Motor`;
  if (m.status === "im_bereich") return `${wert}, im Bereich ${bereich(m)}`;
  return `${wert}, ${m.status === "unter" ? "unter" : "über"} ${bereich(m)}`;
}

/** @param {string} key @param {Katalog} katalog @returns {Hypothese} */
function neu(key, katalog) {
  const e = katalog[key];
  if (!e) throw new Error(`Hypothese ${key} fehlt in hypothesen.json`);
  return { id: key, klartext: e.klartext, massnahme: e.massnahme, service: e.service || null, art: e.art || "ursache", stufe: "vermutung", stuetzt: [], widerspricht: [], fehlt: [], quellen: [] };
}
/** @param {Hypothese} h @param {string | undefined} quelle */
const mitQuelle = (h, quelle) => (!quelle || h.quellen.includes(quelle) ? h : { ...h, quellen: [...h.quellen, quelle] });
/** Neue Hypothese mit angehängtem Eintrag; die Stufe steigt nur durch stützende Deutungen.
 * @param {Hypothese} h @param {"stuetzt" | "widerspricht" | "fehlt"} liste @param {Eintrag} eintrag @param {{ sicherheit?: Stufe, quelle?: string }} [opt] */
function mit(h, liste, eintrag, opt = {}) {
  const stufe = opt.sicherheit && STUFEN[opt.sicherheit] > STUFEN[h.stufe] ? opt.sicherheit : h.stufe;
  return mitQuelle({ ...h, [liste]: [...h[liste], eintrag], stufe }, opt.quelle);
}
/** @param {Messung} m @param {string} text @returns {Eintrag} */
const eintrag = (m, text) => ({ messung: m.id, titel: m.titel, text });
/** Hypothesen, die eine Messung nennt, ohne den Hinweis für fehlende Werte. @param {Messung} m */
const genannte = (m) => [...new Set(m.deutung.filter((d) => d.wenn !== "fehlt").map((d) => d.hypothese))];

/** @param {Messung} m @param {Messwert} mw @param {Record<string, Hypothese>} acc @param {Katalog} katalog */
function auto(m, mw, acc, katalog) {
  const status = mw.status === "zustand" ? "fehlt" : mw.status;
  const aktuelle = m.deutung.find((d) => d.wenn === status);
  const text = messwertText(mw), quelle = mw.quelle;
  const aus = { ...acc };
  for (const key of genannte(m)) {
    const h = aus[key] || neu(key, katalog);
    if (status === "fehlt") aus[key] = mit(h, "fehlt", eintrag(m, text), { quelle });
    else if (aktuelle && aktuelle.hypothese === key) aus[key] = mit(h, "stuetzt", eintrag(m, text), { sicherheit: aktuelle.sicherheit, quelle });
    else if (status === "im_bereich") aus[key] = mit(h, "widerspricht", eintrag(m, text), { quelle });
    else aus[key] = mitQuelle(h, quelle);
  }
  return aus;
}

/** @param {Messung} m @param {string | undefined} ergebnis @param {Record<string, Hypothese>} acc @param {Katalog} katalog */
function manuell(m, ergebnis, acc, katalog) {
  const befund = m.deutung.find((d) => d.wenn === ergebnis);
  const aus = { ...acc };
  for (const key of genannte(m)) {
    const h = aus[key] || neu(key, katalog);
    if (!befund) aus[key] = mit(h, "fehlt", eintrag(m, `${m.titel} (${m.werkzeug || "manuell"}, etwa ${m.minuten ?? "?"} min)`));
    else if (befund.hypothese === key) aus[key] = mit(h, "stuetzt", eintrag(m, `${m.titel}: ${befund.ursache}`), { sicherheit: befund.sicherheit });
    else aus[key] = mit(h, "widerspricht", eintrag(m, `${m.titel}: ${befund.ursache}`));
  }
  return aus;
}

/** @param {Hypothese} a @param {Hypothese} b */
const reihenfolge = (a, b) => STUFEN[b.stufe] - STUFEN[a.stufe] || b.stuetzt.length - a.stuetzt.length || a.widerspricht.length - b.widerspricht.length
  || b.fehlt.length - a.fehlt.length || a.klartext.localeCompare(b.klartext, "de");

/** @param {Pfad} pfad @param {Werte} werte @returns {Record<string, Messwert>} */
const bewertet = (pfad, werte) => Object.fromEntries(pfad.signale.map((s) => [s.signal, bewerteSignal(s, werte)]));

/** Je Hypothese stützt, widerspricht, fehlt, Stufe und Quellen; ohne jeden Bezug zum Stand bleibt sie weg.
 * @param {Pfad} pfad @param {Werte} werte @param {Manuell} manuellErgebnisse @param {Katalog} katalog @returns {Hypothese[]} */
export function hypothesen(pfad, werte, manuellErgebnisse, katalog) {
  const mw = bewertet(pfad, werte);
  let acc = /** @type {Record<string, Hypothese>} */ ({});
  for (const m of pfad.messungen) acc = m.art === "auto" ? auto(m, mw[/** @type {string} */ (m.signal)], acc, katalog) : manuell(m, (manuellErgebnisse || {})[m.id], acc, katalog);
  return Object.values(acc).filter((h) => h.art !== HINWEIS && (h.stuetzt.length || h.widerspricht.length || h.fehlt.length)).sort(reihenfolge);
}

/** Die eine nächste Messung: erst ein Signal ohne Wert, dann eine manuelle ohne Ergebnis, sonst null.
 * @param {Pfad} pfad @param {Werte} werte @param {Manuell} [manuellErgebnisse] @returns {(Messung & { messwert?: Messwert }) | null} */
export function naechsteMessung(pfad, werte, manuellErgebnisse = {}) {
  const mw = bewertet(pfad, werte);
  const offen = pfad.messungen.find((m) => m.art === "auto" && ["fehlt", "zustand"].includes(mw[/** @type {string} */ (m.signal)].status));
  if (offen) return { ...offen, messwert: mw[/** @type {string} */ (offen.signal)] };
  const hand = pfad.messungen.find((m) => m.art === "manuell" && !ANTWORTEN.includes(manuellErgebnisse[m.id]));
  return hand ? { ...hand } : null;
}

/** @typedef {{ wert: number | null, status: string, text: string }} Seite */
/** @param {Soll} s @param {Werte | null} werte @returns {Seite | null} */
function seite(s, werte) {
  if (!werte) return null;
  const mw = bewerteSignal(s, werte);
  return { wert: mw.wert, status: mw.status, text: messwertText(mw) };
}

/** Je Signal vorher, nachher (null ohne Nachher-Stand) und ok, wenn nachher im Bereich liegt.
 * @param {Pfad} pfad @param {Werte} vorher @param {Werte | null} nachher */
export function nachweis(pfad, vorher, nachher) {
  return pfad.signale.map((s) => {
    const n = seite(s, nachher);
    return { signal: s.signal, einheit: s.einheit || "", quelle: s.quelle || "", vorher: seite(s, vorher), nachher: n, ok: n !== null && n.status === "im_bereich" };
  });
}

/** Knopftext aus einer Deutung: der Teil vor dem Doppelpunkt (»Undichtigkeit gefunden«, »Dicht«). @param {Deutung} d */
export const knopfText = (d) => d.ursache.split(":")[0].trim();

/** Stand des Falls für den Kopf: offen, in Prüfung, repariert, nachgeprüft.
 * @param {{ manuell?: Manuell, massnahme?: string, nachher?: boolean, codeWeg?: boolean }} f */
export function fallStatus(f) {
  if (f.nachher && f.codeWeg) return "nachgeprüft";
  if (f.massnahme) return "repariert";
  if (f.manuell && Object.keys(f.manuell).length) return "in Prüfung";
  return "offen";
}

/** Messwerte aus state.live ({SIG: {wert}}) als flache Zahlen. @param {Record<string, { wert?: unknown } | undefined>} live @returns {Werte} */
export const liveWerte = (live) => Object.fromEntries(Object.entries(live || {}).filter(([, v]) => v && typeof v.wert === "number").map(([k, v]) => [k, /** @type {number} */ (v && v.wert)]));
