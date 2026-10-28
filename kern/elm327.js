// @ts-check
/* ELM327/STN-Adapter wie kfzdiag/elm327.py: Protokoll-Automatik, Kopfzeilen an, ISO-TP selbst zusammengesetzt.
   Der Anschluss (Bluetooth LE, später auch WLAN) liefert nur Text hin und her; die Logik hier ist für alle gleich. */
import { fromHex, toHex } from "./bytes.js";
import { VerbindungsFehler, EinstellungsFehler } from "./fehler.js";
import { pruefeAusgehend } from "./sperre.js";

/**
 * Ein Weg zum Adapter. `open` bekommt den Empfänger für eingehenden Text.
 * `getrennt` meldet einen Verbindungsabbruch von unten (Bluetooth weg).
 * @typedef {{ open(empfang: (text: string) => void, getrennt?: () => void): Promise<void>, write(text: string): Promise<void>, close(): Promise<void>, name?: string }} Anschluss
 * @typedef {{ nummer: string, name: string, kurz: string, familie: "can11" | "can29" | "kline" | "j1850", istCan: boolean }} Protokoll
 * @typedef {{ sender: number, data: Uint8Array }} Rahmen
 */

/** Kurzname für die Statusleiste, wie der Server ihn liefert („CAN 11 Bit, 500 kbit/s“). */
const KURZ = { can11: "CAN 11 Bit", can29: "CAN 29 Bit", kline: "K-Line", j1850: "J1850" };
/** @type {Readonly<Record<string, Protokoll>>} */
export const PROTOKOLLE = Object.freeze(Object.fromEntries(/** @type {Array<[string, string, Protokoll["familie"]]>} */ ([
  ["1", "SAE J1850 PWM (41,6 kbit/s)", "j1850"], ["2", "SAE J1850 VPW (10,4 kbit/s)", "j1850"],
  ["3", "ISO 9141-2 (K-Line, 5 Baud Init)", "kline"], ["4", "ISO 14230-4 KWP2000 (5 Baud Init)", "kline"],
  ["5", "ISO 14230-4 KWP2000 (schnelle Init)", "kline"], ["6", "ISO 15765-4 CAN (11 Bit, 500 kbit/s)", "can11"],
  ["7", "ISO 15765-4 CAN (29 Bit, 500 kbit/s)", "can29"], ["8", "ISO 15765-4 CAN (11 Bit, 250 kbit/s)", "can11"],
  ["9", "ISO 15765-4 CAN (29 Bit, 250 kbit/s)", "can29"],
]).map(([nummer, name, familie]) => [nummer, Object.freeze({ nummer, name, kurz: KURZ[familie], familie, istCan: familie.startsWith("can") })])));

/** Meldungen des Adapters mit der wahrscheinlichen Ursache. */
export const ELM_MELDUNGEN = Object.freeze({
  "UNABLE TO CONNECT": "Keine Verbindung zum Auto. Zündung an? Stecker fest? Auto hat womöglich kein OBD.",
  "BUS INIT: ...ERROR": "K-Line-Initialisierung gescheitert. Zündung an, nochmal versuchen.",
  "BUS INIT: ERROR": "K-Line-Initialisierung gescheitert. Zündung an, nochmal versuchen.",
  "CAN ERROR": "Adapter kann nicht auf den CAN-Bus senden. Stecker, Protokoll prüfen.",
  "BUS ERROR": "Busfehler. Verkabelung prüfen.",
  "BUS BUSY": "Bus belegt. Ist ein zweites Diagnosegerät angesteckt?",
  "FB ERROR": "Rückkopplungsfehler. Verkabelung prüfen.",
  "DATA ERROR": "Beschädigter Rahmen empfangen.",
  "BUFFER FULL": "Adapterpuffer übergelaufen.",
  "STOPPED": "Vorgang vom Adapter abgebrochen.",
  "ACT ALERT": "Adapter hat sich wegen Inaktivität schlafen gelegt.",
  "LV RESET": "Unterspannung am Adapter. Batterie prüfen.",
  "?": "Adapter versteht den Befehl nicht. Billige ELM327-Klone können oft nur einen Teil.",
});
const RAUSCHEN = ["SEARCHING", "BUSINIT", "OK"];
const istHex = (t) => /^[0-9A-F]+$/.test(t);

/** Antwort (ATH1, ATS0) in Nachrichten je Steuergerät zerlegen. @param {string} roh @param {Protokoll} protokoll @returns {Rahmen[]} */
export function zerlegeAntwort(roh, protokoll) {
  const zeilen = roh.replace(/\r/g, "\n").split("\n").map((z) => z.trim().toUpperCase().replace(/ /g, ""));
  for (const zeile of zeilen) {
    if (zeile === "NODATA") return [];
    for (const [marke, ursache] of Object.entries(ELM_MELDUNGEN)) {
      if (zeile.startsWith(marke.replace(/ /g, ""))) throw new VerbindungsFehler(`Adapter meldet „${marke}“: ${ursache}`);
    }
    if (zeile.startsWith("<")) throw new VerbindungsFehler(`Adapter meldet beschädigte Daten (${zeile}). Nochmal versuchen.`);
  }
  const daten = zeilen.filter((z) => z && !RAUSCHEN.some((r) => z.startsWith(r)) && istHex(z));
  return protokoll.istCan ? zerlegeCan(daten, protokoll.familie === "can11" ? 3 : 8) : zerlegeKline(daten);
}

/** ISO-TP: Einzel-, Erst- und Folgerahmen je Absender. @param {string[]} zeilen @param {number} kopf */
function zerlegeCan(zeilen, kopf) {
  /** @type {Map<number, { daten: number[], laenge: number }>} */
  const puffer = new Map();
  for (const zeile of zeilen) {
    if (zeile.length <= kopf || (zeile.length - kopf) % 2) continue;
    const sender = parseInt(zeile.slice(0, kopf), 16);
    const body = fromHex(zeile.slice(kopf));
    const art = body[0] >> 4;
    if (art === 0) {
      const laenge = body[0] & 0x0f;
      puffer.set(sender, { daten: [...body.slice(1, 1 + laenge)], laenge });
    } else if (art === 1 && body.length >= 2) {
      puffer.set(sender, { daten: [...body.slice(2)], laenge: ((body[0] & 0x0f) << 8) | body[1] });
    } else if (art === 2 && puffer.has(sender)) {
      const alt = /** @type {{ daten: number[], laenge: number }} */ (puffer.get(sender));
      puffer.set(sender, { ...alt, daten: [...alt.daten, ...body.slice(1)] });
    }
  }
  return [...puffer].filter(([, p]) => p.daten.length >= p.laenge).map(([sender, p]) => ({ sender, data: Uint8Array.from(p.daten.slice(0, p.laenge)) }));
}

/** K-Line/J1850: drei Kopfbytes, Daten, Prüfsumme. @param {string[]} zeilen */
function zerlegeKline(zeilen) {
  return zeilen.filter((z) => z.length % 2 === 0 && z.length >= 10).map((z) => {
    const roh = fromHex(z);
    return { sender: roh[2], data: roh.slice(3, -1) };
  });
}

export class Elm327 {
  /**
   * @param {Anschluss} anschluss
   * @param {{ protokoll?: string, lesezeit?: number, suchzeit?: number, resetzeit?: number, ruhezeit?: number, warte?: (ms: number) => Promise<void> }} [optionen]
   */
  constructor(anschluss, { protokoll = "0", lesezeit = 5000, suchzeit = 20000, resetzeit = 5000, ruhezeit = 400, warte = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    if (protokoll !== "0" && !PROTOKOLLE[protokoll]) throw new EinstellungsFehler(`Unbekanntes Protokoll „${protokoll}“. Erlaubt: 0 (automatisch) oder 1 bis 9`);
    this.anschluss = anschluss;
    this.gewuenscht = protokoll;
    this.lesezeit = lesezeit;
    this.suchzeit = suchzeit;
    this.resetzeit = resetzeit;
    this.ruhezeit = ruhezeit;
    this.warte = warte;
    /** @type {Protokoll | null} */ this.protokoll = null;
    this.version = "";
    this.puffer = "";
    /** @type {string[] | null} */ this.kopf = null;
    /** @type {(() => void) | null} */ this.wecker = null;
    /** Ein Befehl nach dem anderen: Warteschlange als Promise-Kette. */
    this.reihe = Promise.resolve();
    this.offen = false;
    /** @type {Promise<Protokoll> | null} */ this.oeffnen = null;
    /** @type {((fehler: Error) => void) | null} */ this.abbruch = null;
    /** Nach Zeitüberschreitung: vor dem nächsten Befehl neu synchronisieren. */
    this.verstimmt = false;
  }

  /** Gleichzeitige Aufrufe teilen sich ein Öffnen, sonst stellt sich der Adapter doppelt ein.
   * @returns {Promise<Protokoll>} */
  open() {
    if (this.offen && this.protokoll) return Promise.resolve(this.protokoll);
    if (!this.oeffnen) this.oeffnen = this.oeffne().finally(() => { this.oeffnen = null; });
    return this.oeffnen;
  }

  async oeffne() {
    try {
      await this.anschluss.open(
        (text) => { this.puffer += text; if (this.wecker) this.wecker(); },
        () => { this.close("Verbindung zum Adapter abgebrochen. Adapter noch gesteckt und in Reichweite?"); },
      );
    } catch (e) {
      try { await this.anschluss.close(); } catch { /* halb offene Verbindung trotzdem lösen */ }
      throw new VerbindungsFehler(`Adapter nicht erreichbar: ${e instanceof Error ? e.message : e}. Bluetooth an? Adapter im Auto gesteckt?`);
    }
    this.offen = true;
    this.verstimmt = false;
    try {
      return await this.exklusiv(() => this.initialisiere());
    } catch (e) {
      await this.close();
      throw e;
    }
  }

  async initialisiere() {
    this.version = (await this.sende("ATZ", this.resetzeit)).trim();
    await this.warte(200);
    for (const at of ["ATE0", "ATL0", "ATS0", "ATH1", "ATAT1", "ATCAF1", `ATSP${this.gewuenscht}`]) await this.at(at);
    // Erste Anfrage löst die Protokollsuche aus; bei K-Line dauert das.
    const antwort = await this.sende("0100", this.suchzeit);
    if (/UNABLE TO CONNECT|ERROR/i.test(antwort)) zerlegeAntwort(antwort, PROTOKOLLE["6"]);
    const nummer = (await this.sende("ATDPN")).trim().toUpperCase().replace(/^A/, "");
    const protokoll = PROTOKOLLE[nummer.slice(0, 1)];
    if (!protokoll) throw new VerbindungsFehler(`Adapter meldet unbekanntes Protokoll „${nummer}“`);
    this.protokoll = protokoll;
    this.kopf = null;
    return protokoll;
  }

  /** Schließen bricht auch einen wartenden Befehl ab, statt ihn bis zur Zeitgrenze hängen zu lassen.
   * @param {string} [grund] */
  async close(grund = "Verbindung zum Adapter getrennt.") {
    this.offen = false;
    this.protokoll = null;
    this.kopf = null;
    if (this.abbruch) this.abbruch(new VerbindungsFehler(grund));
    try { await this.anschluss.close(); } catch { /* Aufräumen darf nicht werfen */ }
  }

  /** Bis zum Prompt „>“ lesen. @param {number} zeit @returns {Promise<string>} */
  leseBisPrompt(zeit) {
    return new Promise((resolve, reject) => {
      const fertig = () => { clearTimeout(uhr); this.wecker = null; this.abbruch = null; };
      const pruefe = () => {
        const ende = this.puffer.indexOf(">");
        if (ende < 0) return;
        const text = this.puffer.slice(0, ende);
        this.puffer = this.puffer.slice(ende + 1);
        fertig();
        resolve(text);
      };
      const uhr = setTimeout(() => {
        fertig();
        this.verstimmt = true;
        reject(new VerbindungsFehler(`Adapter antwortet nicht (nach ${zeit / 1000} s). Teilantwort: ${JSON.stringify(this.puffer.slice(0, 60))}`));
      }, zeit);
      this.abbruch = (fehler) => { fertig(); reject(fehler); };
      this.wecker = pruefe;
      pruefe();
    });
  }

  /** Nach einer Zeitüberschreitung kann die verspätete Antwort noch kommen und den nächsten Befehl verschieben.
      Darum: harmloses ATI senden (ein leeres CR würde den letzten Befehl wiederholen) und alles bis zur Ruhe verwerfen. */
  async synchronisiere() {
    this.verstimmt = false;
    this.puffer = "";
    await this.anschluss.write("ATI\r");
    for (let i = 0; i < 3; i++) {
      try { await this.leseBisPrompt(this.ruhezeit); } catch { break; }
    }
    this.verstimmt = false;
    this.puffer = "";
  }

  /** Ein Befehl ohne Warteschlange: nur innerhalb von exklusiv() aufrufen. @param {string} text @param {number} [zeit] */
  async sende(text, zeit) {
    if (!this.offen) throw new VerbindungsFehler("Adapter ist nicht verbunden");
    if (this.verstimmt) await this.synchronisiere();
    this.puffer = "";
    try { await this.anschluss.write(`${text}\r`); } catch (e) { throw new VerbindungsFehler(`Schreiben zum Adapter gescheitert: ${e instanceof Error ? e.message : e}`); }
    return this.leseBisPrompt(zeit ?? this.lesezeit);
  }

  /** Arbeit, die niemand unterbrechen darf (Kopfzeile wählen und Anfrage senden), als ein Schritt der Warteschlange.
   * @template T @param {() => Promise<T>} arbeit @returns {Promise<T>} */
  exklusiv(arbeit) {
    const lauf = this.reihe.then(arbeit);
    this.reihe = lauf.catch(() => undefined);
    return lauf;
  }

  /** Einzelner Befehl über die Warteschlange. @param {string} text @param {number} [zeit] @returns {Promise<string>} */
  befehl(text, zeit) {
    return this.exklusiv(() => this.sende(text, zeit));
  }

  /** @param {string} text @param {boolean} [dulden] */
  async at(text, dulden = false) {
    const antwort = await this.sende(text);
    if (antwort.includes("?") && !dulden) throw new VerbindungsFehler(`Adapter lehnt ${text} ab. ${ELM_MELDUNGEN["?"]} Empfehlung: vLinker oder OBDLink.`);
  }

  /** Halb gesetzte Kopfzeilen werden nie weiterverwendet. @param {string[]} kopf */
  async waehle(kopf) {
    if (this.kopf && this.kopf.join() === kopf.join()) return;
    this.kopf = null;
    for (const at of kopf) await this.at(at, /^AT(FC|CRA|AR)/.test(at));
    this.kopf = kopf;
  }

  /** @returns {Protokoll} */
  brauche() {
    if (!this.protokoll) throw new VerbindungsFehler("Adapter ist nicht verbunden");
    return this.protokoll;
  }

  /** Rundruf an alle OBD-Steuergeräte. @returns {string[]} */
  rundrufKopf() {
    const p = this.brauche();
    if (p.familie === "can11") return ["ATSH7DF", "ATAR", "ATFCSM0"];
    if (p.familie === "can29") return ["ATCP18", "ATSHDB33F1", "ATAR"];
    if (p.familie === "kline") return ["4", "5"].includes(p.nummer) ? ["ATSHC133F1"] : ["ATSH686AF1"];
    return p.nummer === "1" ? ["ATSH616AF1"] : ["ATSH686AF1"];
  }

  /** Gezielte Anfrage an ein Steuergerät, bisher nur CAN. @param {number} anfrage @param {number} antwort @returns {string[]} */
  zielKopf(anfrage, antwort) {
    const p = this.brauche();
    const h = (n, l) => n.toString(16).toUpperCase().padStart(l, "0");
    if (p.familie === "can11") return [`ATSH${h(anfrage, 3)}`, `ATCRA${h(antwort, 3)}`, `ATFCSH${h(anfrage, 3)}`, "ATFCSD300000", "ATFCSM1"];
    if (p.familie === "can29") return [`ATCP${h((anfrage >>> 24) & 0x1f, 2)}`, `ATSH${h(anfrage & 0xffffff, 6)}`, `ATCRA${h(antwort, 8)}`];
    throw new EinstellungsFehler("Gezielte Steuergeräte-Anfragen über K-Line/J1850 sind noch nicht gebaut. Generisches OBD funktioniert trotzdem.");
  }

  /** Anfrage senden, alle Antworten sammeln. Leere Liste: niemand hat geantwortet.
   * @param {Uint8Array} payload @param {string[]} [kopf] @param {number} [zeit] @returns {Promise<Rahmen[]>} */
  async frage(payload, kopf, zeit) {
    pruefeAusgehend(payload);
    const protokoll = this.brauche();
    return this.exklusiv(async () => {
      await this.waehle(kopf || this.rundrufKopf());
      return zerlegeAntwort(await this.sende(toHex(payload), zeit), protokoll);
    });
  }

  beschreibung() {
    return { art: "elm327", adapter: this.version, protokoll: this.protokoll ? this.protokoll.name : null, anschluss: this.anschluss.name || null };
  }
}
