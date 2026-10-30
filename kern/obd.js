// @ts-check
/* Generisches OBD-II (SAE J1979) wie kfzdiag/obd.py: Rundruf, Antworten je Absender, CAN und K-Line ausgeglichen. */
import { concat, senderName, toAscii } from "./bytes.js";
import { dekodiere } from "./dtc.js";

/** @typedef {import("./elm327.js").Rahmen} Rahmen */
/** @typedef {{ istCan(): Promise<boolean>, (payload: Uint8Array): Promise<Rahmen[]> }} Anfrager */

/** Art -> [Modus, Statusbyte für die Anzeige] */
export const DTC_ARTEN = Object.freeze({ gespeichert: [0x03, 0x08], vorlaeufig: [0x07, 0x04], permanent: [0x0a, 0x08] });
export const BEREIT_BENZIN = Object.freeze({ 0: "Katalysator", 1: "Kat-Heizung", 2: "Tankentlüftung", 3: "Sekundärluft", 5: "Lambdasonde", 6: "Lambdasonden-Heizung", 7: "Abgasrückführung" });
export const BEREIT_DIESEL = Object.freeze({ 0: "NMHC-Katalysator", 1: "NOx/SCR", 3: "Ladedruck", 5: "Abgassensor", 6: "Partikelfilter", 7: "AGR/VVT" });
export const FREEZE_PIDS = Object.freeze([0x04, 0x05, 0x06, 0x07, 0x0c, 0x0d, 0x0f, 0x11]);

/** Anfrager über einen ELM327. @param {import("./elm327.js").Elm327} elm @returns {Anfrager} */
export function elmAnfrager(elm) {
  const frage = /** @type {Anfrager} */ (async (payload) => { await elm.open(); return elm.frage(payload); });
  frage.istCan = async () => (await elm.open()).istCan;
  return frage;
}

const text = (bytes) => toAscii(bytes).replace(/\0/g, " ").trim();

export class ObdClient {
  /** @param {Anfrager} anfrage */
  constructor(anfrage) { this.anfrage = anfrage; }

  /** Nur positive Antworten auf genau diesen Dienst. @param {Uint8Array} payload */
  async frage(payload) {
    const erwartet = payload[0] + 0x40;
    return (await this.anfrage(payload)).filter((f) => f.data.length && f.data[0] === erwartet);
  }

  /** Welche Messwerte jedes Steuergerät liefert. @returns {Promise<Record<string, number[]>>} */
  async unterstuetztePids() {
    /** @type {Map<string, Set<number>>} */
    const sammlung = new Map();
    for (let basis = 0x00; basis <= 0xe0; basis += 0x20) {
      const rahmen = (await this.frage(Uint8Array.of(0x01, basis))).filter((f) => f.data.length >= 6 && f.data[1] === basis);
      if (!rahmen.length) break;
      let weiter = false;
      for (const f of rahmen) {
        const maske = ((f.data[2] << 24) | (f.data[3] << 16) | (f.data[4] << 8) | f.data[5]) >>> 0;
        const name = senderName(f.sender);
        const pids = sammlung.get(name) || new Set();
        for (let bit = 0; bit < 32; bit++) if (maske & (2 ** (31 - bit))) pids.add(basis + bit + 1);
        sammlung.set(name, pids);
        weiter ||= Boolean(maske & 1);
      }
      if (!weiter) break;
    }
    return Object.fromEntries([...sammlung].map(([name, pids]) => [name, [...pids].filter((p) => p % 0x20).sort((a, b) => a - b)]));
  }

  /** @param {number} pid @returns {Promise<Record<string, Uint8Array>>} */
  async lesePid(pid) {
    const rahmen = (await this.frage(Uint8Array.of(0x01, pid))).filter((f) => f.data.length > 2 && f.data[1] === pid);
    return Object.fromEntries(rahmen.map((f) => [senderName(f.sender), f.data.slice(2)]));
  }

  /** @param {keyof typeof DTC_ARTEN} art @returns {Promise<Record<string, import("./dtc.js").Dtc[]>>} */
  async leseFehler(art = "gespeichert") {
    const [modus, status] = DTC_ARTEN[art];
    const istCan = await this.anfrage.istCan();
    /** @type {Map<string, Uint8Array>} */
    const sammlung = new Map();
    for (const f of await this.frage(Uint8Array.of(modus))) {
      // CAN: Zähler-Byte vor den Paaren; K-Line: bis zu drei Paare je Nachricht, ohne Zähler.
      const body = istCan && f.data.length > 1 ? f.data.slice(2, 2 + 2 * f.data[1]) : f.data.slice(1);
      const name = senderName(f.sender);
      sammlung.set(name, concat(sammlung.get(name) || new Uint8Array(), body));
    }
    return Object.fromEntries([...sammlung].map(([name, roh]) => {
      const paare = [];
      for (let i = 0; i + 1 < roh.length; i += 2) if (roh[i] || roh[i + 1]) paare.push(dekodiere([roh[i], roh[i + 1], 0x00, status]));
      return [name, paare];
    }));
  }

  /** Fahrgestellnummer (Modus 09 PID 02). @returns {Promise<string | null>} */
  async leseFin() {
    const rahmen = (await this.frage(Uint8Array.of(0x09, 0x02))).filter((f) => f.data.length > 3 && f.data[1] === 0x02);
    if (!rahmen.length) return null;
    let roh;
    if (await this.anfrage.istCan()) {
      roh = rahmen[0].data.slice(3);
    } else {
      const erster = rahmen[0].sender;
      const teile = rahmen.filter((f) => f.sender === erster).sort((a, b) => a.data[2] - b.data[2]);
      roh = concat(...teile.map((f) => f.data.slice(3)));
    }
    const fin = toAscii(roh.filter((b) => b !== 0)).trim();
    return fin || null;
  }

  /** Motorkontrollleuchte, Fehleranzahl, Bereitschaftstests (AU). */
  async bereitschaft() {
    /** @type {Record<string, { mil: boolean, anzahl_fehler: number, motor: string, tests: { name: string, fertig: boolean }[], au_bereit: boolean }>} */
    const ergebnis = {};
    for (const [name, roh] of Object.entries(await this.lesePid(0x01))) {
      if (roh.length < 4) continue;
      const [a, b, c, d] = roh;
      const diesel = Boolean(b & 0x08);
      const tests = ["Zündaussetzer", "Kraftstoffsystem", "Bauteile"].flatMap((t, bit) => (b & (1 << bit) ? [{ name: t, fertig: !(b & (1 << (bit + 4))) }] : []));
      const namen = diesel ? BEREIT_DIESEL : BEREIT_BENZIN;
      for (const [bit, t] of Object.entries(namen)) if (c & (1 << Number(bit))) tests.push({ name: t, fertig: !(d & (1 << Number(bit))) });
      ergebnis[name] = { mil: Boolean(a & 0x80), anzahl_fehler: a & 0x7f, motor: diesel ? "Diesel" : "Benzin", tests, au_bereit: tests.every((t) => t.fertig) };
    }
    return ergebnis;
  }

  /** Modus 02 Rahmen 0: Messwerte beim Speichern des Fehlers. @param {readonly number[]} [pids] */
  async freezeFrame(pids = FREEZE_PIDS) {
    /** @type {Record<string, { ausloeser: string, beschreibung: string, werte: Map<number, Uint8Array> }>} */
    const ergebnis = {};
    for (const f of await this.anfrage(Uint8Array.of(0x02, 0x02, 0x00))) {
      if (f.data.length >= 5 && f.data[0] === 0x42 && f.data[1] === 0x02 && (f.data[3] || f.data[4])) {
        const dtc = dekodiere([f.data[3], f.data[4], 0x00, 0x08]);
        ergebnis[senderName(f.sender)] = { ausloeser: dtc.code, beschreibung: dtc.beschreibung, werte: new Map() };
      }
    }
    if (!Object.keys(ergebnis).length) return ergebnis;
    for (const pid of pids) {
      for (const f of await this.anfrage(Uint8Array.of(0x02, pid, 0x00))) {
        const ziel = ergebnis[senderName(f.sender)];
        if (ziel && f.data.length > 3 && f.data[0] === 0x42 && f.data[1] === pid) ziel.werte.set(pid, f.data.slice(3));
      }
    }
    return ergebnis;
  }

  /** Modus 09: Kalibrier-Kennung und Name des Steuergeräts. */
  async fahrzeugInfo() {
    /** @type {Record<string, Record<string, string>>} */
    const ergebnis = {};
    for (const [pid, schluessel] of /** @type {const} */ ([[0x04, "kalibrierung"], [0x0a, "name"]])) {
      for (const f of await this.frage(Uint8Array.of(0x09, pid))) {
        const wert = f.data.length > 3 && f.data[1] === pid ? text(f.data.slice(3)) : "";
        if (wert) ergebnis[senderName(f.sender)] = { ...ergebnis[senderName(f.sender)], [schluessel]: wert };
      }
    }
    return ergebnis;
  }

  /** Modus 04: Fehler aller OBD-Steuergeräte löschen. Nur nach Freigabe aufrufen. */
}
