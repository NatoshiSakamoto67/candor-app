// @ts-check
/* Diagnosepfad im Browser (Direktmodus, Vorschau): dieselben Regeln wie kfzdiag/diagnosepfad.py.
   Pakete aus daten/diagnose/, Codebedeutung aus OBDex (dtcwissen.js), Messwerte aus state.live. */
import { lookup, normCode } from "./dtcwissen.js";
import { bewerteSignal } from "../kern/fall.js";

/* Bewertung der Signale lebt jetzt in kern/fall.js (gleich für Pfad und Fall); hier weiter exportiert. */
export { bewerteSignal };

const CODE_RE = /^[PCBU][0-3][0-9A-F]{3}$/;
const HINWEIS = "Richtwerte sind allgemein, keine Herstellerwerte. Deutungen sind Hilfen, keine Diagnose.";

/* Vorhandene Pakete unter daten/diagnose/ (Test prüft, dass die Liste zum Ordner passt) */
export const PAKETE = ["P01", "P03", "P04", "P05"];

const holenStandard = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
const pakete = new Map();

/** Erste automatische Messung außerhalb des Bereichs oder ohne Wert, sonst die erste manuelle. @param {any[]} messungen @param {Record<string, string>} status */
function naechste(messungen, status) {
  for (const m of messungen) {
    if (m.art !== "auto") continue;
    let st = status[m.signal] || "fehlt";
    if (st === "zustand") st = "fehlt";
    if (st === "im_bereich") continue;
    const d = m.deutung.find((x) => x.wenn === st);
    return [m, d ? { ...d, wenn: st } : { wenn: st, ursache: "", sicherheit: "vermutung" }];
  }
  const manuell = messungen.find((m) => m.art === "manuell");
  return manuell ? [manuell, { wenn: "offen", ursache: "", sicherheit: "vermutung" }] : [null, null];
}

async function ladePfad(code, holen) {
  const p = code.slice(0, 3);
  if (!pakete.has(p)) pakete.set(p, holen(`daten/diagnose/${p}.json`).catch(() => ({})));
  return (await pakete.get(p))[code] || null;
}

/** Kette wie GET /api/diagnosepfad. @param {string} code @param {any} st Zustand mit live und ecus */
export async function ketteImBrowser(code, st, holen = holenStandard) {
  const c = normCode(code);
  const wissen = CODE_RE.test(c) ? await lookup(c, holen).catch(() => null) : null;
  if (!wissen) return { ok: false, grund: "unbekannt", code, titel: null };
  const ursachen = (wissen.u || []).slice(0, 4).map(([w, t]) => `${t} (${w || "?"})`);
  const pfad = await ladePfad(c, holen);
  if (!pfad) return { ok: false, grund: "kein_pfad", code: c, titel: wissen.t, ursachen };
  const werte = Object.fromEntries(Object.entries(st.live || {}).filter(([, v]) => v && typeof v.wert === "number").map(([k, v]) => [k, v.wert]));
  const messwerte = pfad.signale.map((s) => bewerteSignal(s, werte));
  const status = Object.fromEntries(messwerte.map((m) => [m.signal, m.status]));
  const speichernd = (st.ecus || []).find((e) => (e.fehler || []).some((f) => f.code === c));
  const [naechsteMessung, deutung] = naechste(pfad.messungen, status);
  return {
    ok: true, code: c, titel: wissen.t, beschreibung: (wissen.d || "").slice(0, 400),
    steuergeraet: speichernd ? speichernd.name : pfad.steuergeraet, bauteile: [...pfad.bauteile], messwerte,
    messungen: pfad.messungen, naechste_messung: naechsteMessung, deutung,
    ursachen, folgecodes: [...pfad.folgecodes], quellen: [...pfad.quellen], hinweis: HINWEIS,
  };
}

/** Suchindex über alle Pfade: Code, Bauteile, Signale, Messungen. @returns {Promise<{ code: string, bauteile: string[], worte: string }[]>} */
export async function suchIndex(holen = holenStandard) {
  const pakete = await Promise.all(PAKETE.map((p) => holen(`daten/diagnose/${p}.json`).catch(() => ({}))));
  return pakete.flatMap((paket) => Object.entries(paket).map(([code, e]) => ({
    code, bauteile: [...e.bauteile],
    worte: [code, ...e.bauteile, ...e.signale.map((x) => x.signal), ...e.messungen.map((m) => m.titel)].join(" "),
  })));
}
