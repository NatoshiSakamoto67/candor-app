// @ts-check
/* Datenquelle „direkt am Adapter“: dieselbe Schnittstelle wie createServer und createDemo (modules/sources.js),
   aber ohne Server. Läuft im Browser mit Web Bluetooth und später in der App mit dem Capacitor-Plugin.
   Nur Lesen: Löschen und Funktionen kommen erst mit einer eigenen Freigabe-Schicht wie im Server. */
import { Elm327 } from "./elm327.js";
import { ObdClient, elmAnfrager, DTC_ARTEN } from "./obd.js";
import { PIDS, PID_NACH_NUMMER, PLAUSIBEL } from "./pids.js";
import { markeAusFin, grundmarke, istGueltigeFin } from "./wmi.js";
import { leseSollwerte, vergleiche } from "./sollwerte.js";
import { toHex, toAscii } from "./bytes.js";
import { KernFehler } from "./fehler.js";

const NUR_LESEN = "In der App liest CANdor bisher nur. Löschen und Funktionen kommen mit eigener Freigabe.";
/** Bevorzugt das Motorsteuergerät. @param {Record<string, Uint8Array>} antworten */
const motorAntwort = (antworten) => antworten["0x7E8"] || antworten["0x10"] || Object.values(antworten)[0] || null;
const meldung = (e) => (e instanceof Error ? e.message : String(e));
const runde = (wert, stellen) => Math.round(wert * 10 ** stellen) / 10 ** stellen;

/**
 * @param {{ anschluss: import("./elm327.js").Anschluss, ladeJson?: (pfad: string) => Promise<any>, elmOptionen?: ConstructorParameters<typeof Elm327>[1] }} optionen
 */
export function createDirect({ anschluss, ladeJson = (p) => fetch(p).then((r) => r.json()), elmOptionen }) {
  const elm = new Elm327(anschluss, elmOptionen);
  const obd = new ObdClient(elmAnfrager(elm));
  /** @type {number[] | null} */ let unterstuetzt = null;
  /** @type {Promise<import("./sollwerte.js").Sollwert[]> | null} */ let sollwerte = null;

  async function motorPids() {
    if (!unterstuetzt) {
      const je = await obd.unterstuetztePids();
      const liste = je["0x7E8"] || je["0x10"] || Object.values(je)[0] || [];
      // Leere Antwort (Zündung aus, Adapter beschäftigt) nicht merken: beim nächsten Mal neu fragen.
      if (!liste.length) return liste;
      unterstuetzt = liste;
    }
    return unterstuetzt;
  }

  async function vehicle() {
    try {
      const fin = await obd.leseFin();
      if (!fin) return { ok: false, fehler: "keine_vin", meldung: "Das Auto meldet keine FIN (vor 2005 häufig)." };
      const marke = grundmarke(markeAusFin(fin));
      return { ok: true, vin: fin, vin_maskiert: fin.slice(0, 3) + "*".repeat(Math.max(fin.length - 3, 0)), gueltig: istGueltigeFin(fin), marke: marke || "unbekannt", passende_profile: [] };
    } catch (e) { return { ok: false, fehler: "lesen", meldung: meldung(e) }; }
  }

  async function obdFaults() {
    /** @type {Record<string, any>} */
    const ergebnis = { ok: true, simuliert: false, anzahl_gespeichert: 0 };
    for (const art of /** @type {(keyof typeof DTC_ARTEN)[]} */ (Object.keys(DTC_ARTEN))) {
      try {
        ergebnis[art] = await obd.leseFehler(art);
      } catch (e) { ergebnis[art] = { fehler: meldung(e) }; }
    }
    const gespeichert = ergebnis.gespeichert;
    ergebnis.anzahl_gespeichert = gespeichert && !gespeichert.fehler ? Object.values(gespeichert).reduce((n, l) => n + l.length, 0) : 0;
    return ergebnis;
  }

  /** Ein Durchgang dauert über Bluetooth Sekunden. Wer fragt, während er läuft, bekommt dessen Ergebnis,
      statt einen zweiten in die Warteschlange zu stellen. */
  /** @type {Promise<any> | null} */ let liveLauf = null;
  const live = () => (liveLauf ||= messeLive().finally(() => { liveLauf = null; }));

  /** Nur Werte, die das Motorsteuergerät meldet: spart über Bluetooth viele Anfragen. */
  async function messeLive() {
    let pids;
    try { pids = await motorPids(); } catch (e) { return { ok: false, werte: [], simuliert: false, meldung: meldung(e) }; }
    const werte = [];
    for (const pid of Object.values(PIDS).filter((p) => pids.includes(p.pid))) {
      try {
        const roh = motorAntwort(await obd.lesePid(pid.pid));
        if (!roh) { werte.push({ signal: pid.name, wert: null, einheit: pid.einheit, fehler: "keine Antwort" }); continue; }
        const wert = runde(pid.dekodiere(roh), 2);
        if (!Number.isFinite(wert)) throw new KernFehler("Antwort zu kurz");
        const [min, max, text] = PLAUSIBEL[pid.name] || [pid.min, pid.max, "Wert außerhalb des Messbereichs."];
        werte.push({ signal: pid.name, wert, einheit: pid.einheit, beschreibung: pid.beschreibung, ...(wert < min || wert > max ? { warnung: text } : {}) });
      } catch (e) { werte.push({ signal: pid.name, wert: null, einheit: pid.einheit, fehler: meldung(e) }); }
    }
    return { ok: werte.some((w) => w.wert != null), werte, simuliert: false };
  }

  async function readiness() {
    try {
      const steuergeraete = await obd.bereitschaft();
      return { ok: Object.keys(steuergeraete).length > 0, steuergeraete, simuliert: false };
    } catch (e) { return { ok: false, meldung: meldung(e) }; }
  }

  async function freeze() {
    try {
      const roh = await obd.freezeFrame();
      const steuergeraete = Object.fromEntries(Object.entries(roh).map(([sender, f]) => [sender, {
        ausloeser: f.ausloeser, beschreibung: f.beschreibung,
        werte: [...f.werte].flatMap(([nummer, bytes]) => {
          const pid = PID_NACH_NUMMER.get(nummer);
          const wert = pid ? runde(pid.dekodiere(bytes), 1) : NaN;
          return pid && Number.isFinite(wert) ? [{ signal: pid.name, beschreibung: pid.beschreibung, wert, einheit: pid.einheit }] : [];
        }),
      }]));
      return { ok: true, steuergeraete, simuliert: false };
    } catch (e) { return { ok: false, meldung: meldung(e) }; }
  }

  async function analysis() {
    const fahrzeug = await vehicle();
    const obdFehler = await obdFaults();
    const messung = await live();
    const werte = Object.fromEntries(messung.werte.filter((w) => typeof w.wert === "number").map((w) => [w.signal, /** @type {number} */ (w.wert)]));
    sollwerte ||= ladeJson("daten/sollwerte-allgemein.json").then(leseSollwerte).catch(() => { sollwerte = null; return []; });
    return {
      ok: true, simuliert: false, fahrzeug, obd_fehler: obdFehler, steuergeraete: [],
      readiness: await readiness(), freeze_frame: await freeze(), live: messung,
      sollwerte: vergleiche(werte, await sollwerte), rmi_fundstellen: {}, rmi_dokumente: 0,
    };
  }

  /** Kennung per UDS 0x22 (nur Lesen), gezielt an ein CAN-Steuergerät. */
  async function did(adresse, kennung) {
    const anfrage = parseInt(adresse, 16), nummer = parseInt(kennung, 16);
    if (!(anfrage >= 0x700 && anfrage <= 0x7f7) || !(nummer >= 0 && nummer <= 0xffff)) return { ok: false, meldung: "Adresse 700 bis 7F7 und eine vierstellige Kennung eingeben." };
    try {
      await elm.open();
      const antworten = await elm.frage(Uint8Array.of(0x22, nummer >> 8, nummer & 0xff), elm.zielKopf(anfrage, anfrage + 8));
      const antwort = antworten.find((f) => f.sender === anfrage + 8);
      if (!antwort) return { ok: false, meldung: "Keine Antwort unter dieser Adresse." };
      if (antwort.data[0] === 0x7f) return { ok: false, meldung: `Steuergerät lehnt ab (NRC 0x${toHex([antwort.data[2] ?? 0])})` };
      const daten = antwort.data.slice(3);
      return { ok: true, adresse: `0x${adresse.toUpperCase()}`, did: `0x${kennung.toUpperCase()}`, laenge: daten.length, hex: toHex(daten).replace(/(..)(?=.)/g, "$1 "), ascii: toAscii(daten).replace(/\0/g, "") };
    } catch (e) { return { ok: false, meldung: meldung(e) }; }
  }

  return {
    mode: "direkt",
    async status() {
      const protokoll = await elm.open();
      return {
        ok: true, profil: "direkt", fahrzeug: `Auto über ${anschluss.name || "OBD-Adapter"}`, simuliert: false, schreiben_an: false,
        version: "app", ki: "aus", module: [], protokoll: `${protokoll.kurz}, ${protokoll.name}`, adapter: elm.version,
        hinweise: ["Generisches OBD direkt am Adapter. Vollscan aller Steuergeräte folgt in der App."],
      };
    },
    vehicle, obdFaults, live, readiness, freeze, analysis, did,
    info: async () => { try { return { ok: true, steuergeraete: await obd.fahrzeugInfo() }; } catch (e) { return { ok: false, meldung: meldung(e) }; } },
    functions: async () => ({ ok: true, version: "app", verfuegbar: false, funktionen: [] }),
    ki: async () => ({ ok: false, meldung: "KI in der App folgt: Schlüssel kommt in den Schlüsselbund des Geräts." }),
    ask: async () => ({ ok: false, antwort: "Die KI ist in der App noch nicht eingerichtet.", vorschlag: { art: "keiner" } }),
    rmi: async () => ({ ok: false, meldung: "Herstellerdokumente sind in der App noch nicht eingebunden." }),
    async scan(onEvent) {
      onEvent({ typ: "scan_ende", anzahl_steuergeraete: 0, anzahl_fehler: 0, neu_entdeckt: [], simuliert: false, hinweis: "Vollscan aller Steuergeräte folgt in der App. Generisches OBD ist gelesen." });
    },
    request: async () => ({ typ: "fehler", meldung: NUR_LESEN }),
    answer: async () => ({ typ: "fehler", meldung: NUR_LESEN }),
    stop: async () => ({ typ: "fehler", meldung: NUR_LESEN }),
    close: () => elm.close(),
  };
}
