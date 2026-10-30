// @ts-check
/* Genormte Messwerte (SAE J1979, Dienst 01) wie kfzdiag/pids.py, mit Rückrichtung für Tests und Simulator.
   Quelle ist eine Signaldefinition für Server und App: daten/signale.json (C1); Formeln über formel.js, kein eval. */
import { kompiliere, kompiliereUmkehr } from "./formel.js";

/** @typedef {{ pid: number, name: string, beschreibung: string, einheit: string, dekodiere: (b: Uint8Array) => number, kodiere: (v: number) => Uint8Array, min: number, max: number, id: string, groesse: string, formel: string }} Pid */
/** @typedef {{ weg: string, mode?: string, pid?: string, formel?: string, umkehr?: string, bytes?: number, sg?: string, did?: string, quelle?: string }} Zugriff */
/** @typedef {{ id: string, name: string, beschreibung: string, einheit: string, groesse: string, zugriffe: Zugriff[], bereich: { min: number, max: number }, richtwerte: Record<string, [number, number]>, status: string, quelle: any, region: string[], warngrenzen?: { min: number, max: number, text: string } }} Signal */

const DATEI = new URL("../daten/signale.json", import.meta.url);

/** Im Browser und in der App per fetch, in Node (Tests) aus der Datei. @returns {Promise<{ signale: Signal[] }>} */
async function lade() {
  const node = /** @type {any} */ (globalThis).process?.versions?.node;
  if (node) {
    const fs = "node:fs/promises";
    const { readFile } = await import(/* @vite-ignore */ fs);
    return JSON.parse(await readFile(DATEI, "utf8"));
  }
  const antwort = await fetch(DATEI);
  if (!antwort.ok) throw new Error(`signale.json: ${antwort.status}`);
  return antwort.json();
}

const daten = await lade();

/** @param {string} umkehr @param {number} laenge */
function kodierer(umkehr, laenge) {
  const rechne = kompiliereUmkehr(umkehr);
  return (v) => {
    let r = Math.round(rechne(v));
    const bytes = new Uint8Array(laenge);
    for (let i = laenge - 1; i >= 0; i--) { bytes[i] = ((r % 256) + 256) % 256; r = Math.floor(r / 256); }
    return bytes;
  };
}

/** Alle Signaldefinitionen nach Name. @type {Readonly<Record<string, Signal>>} */
export const SIGNALE = Object.freeze(Object.fromEntries(daten.signale.map((s) => [s.name, Object.freeze(s)])));

/** @type {Readonly<Record<string, Pid>>} */
export const PIDS = Object.freeze(Object.fromEntries(daten.signale.flatMap((s) => {
  const z = s.zugriffe.find((x) => x.weg === "obd" && x.mode === "01");
  if (!z || !z.pid || !z.formel || !z.umkehr) return [];
  return [[s.name, Object.freeze({
    pid: parseInt(z.pid, 16), name: s.name, beschreibung: s.beschreibung, einheit: s.einheit,
    dekodiere: kompiliere(z.formel), kodiere: kodierer(z.umkehr, z.bytes || 1), min: s.bereich.min, max: s.bereich.max,
    id: s.id, groesse: s.groesse, formel: z.formel,
  })]];
})));
/** @type {ReadonlyMap<number, Pid>} */
export const PID_NACH_NUMMER = new Map(Object.values(PIDS).map((p) => [p.pid, p]));

/** Eigene Warngrenzen: ein Hinweis, kein Verstecken. @type {Readonly<Record<string, [number, number, string]>>} */
export const PLAUSIBEL = Object.freeze(Object.fromEntries(daten.signale.filter((s) => s.warngrenzen)
  .map((s) => [s.name, /** @type {[number, number, string]} */ ([s.warngrenzen.min, s.warngrenzen.max, s.warngrenzen.text])])));
