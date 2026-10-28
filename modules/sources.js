/* Datenquellen: der lokale Server (/api, /ws) oder die Vorschau mit Daten, die das Backend gegen den Simulator erzeugt hat. */
async function getJson(path, options) {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, ...options });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

export function createServer() {
  let socket = null;
  let waiting = [];
  let streamHandler = null;
  function connect() {
    if (socket && socket.readyState <= 1) return Promise.resolve(socket);
    return new Promise((resolve, reject) => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      socket.addEventListener("open", () => resolve(socket));
      socket.addEventListener("error", () => reject(new Error("Verbindung zum Server gescheitert")));
      socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.typ && data.typ.startsWith("scan_") && streamHandler) return streamHandler(data);
        const next = waiting.shift();
        if (next) next(data);
      });
      socket.addEventListener("close", () => {
        waiting.forEach((r) => r({ typ: "fehler", meldung: "Verbindung getrennt. Nichts geschrieben." }));
        waiting = [];
      });
    });
  }
  async function send(message) {
    const ws = await connect();
    return new Promise((resolve) => { waiting.push(resolve); ws.send(JSON.stringify(message)); });
  }
  return {
    mode: "server",
    status: () => getJson("/api/status"),
    vehicle: () => getJson("/api/obd/fahrzeug"),
    obdFaults: () => getJson("/api/obd/fehler"),
    live: () => getJson("/api/live"),
    readiness: () => getJson("/api/obd/bereitschaft"),
    freeze: () => getJson("/api/obd/freeze"),
    analysis: () => getJson("/api/vollanalyse"),
    functions: () => getJson("/api/funktionen"),
    ki: () => getJson("/api/ki/bewertung", { method: "POST" }),
    ask: (frage) => getJson("/api/ki/frage", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ frage }) }),
    did: (adresse, did) => getJson(`/api/did?adresse=${encodeURIComponent(adresse)}&did=${encodeURIComponent(did)}`),
    rmi: (q) => getJson(`/api/rmi/suche?q=${encodeURIComponent(q)}`),
    settings: () => getJson("/api/einstellungen"),
    saveKi: (body) => getJson("/api/einstellungen/ki", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }),
    testKi: () => getJson("/api/einstellungen/ki/test", { method: "POST" }),
    /* Chat als Strom: die Antwort kommt als Server-Sent Events, gelesen in chat.js. */
    chat: (body, signal) => fetch("/api/ki/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body), signal }),
    async scan(onEvent) {
      const ws = await connect();
      return new Promise((resolve) => {
        streamHandler = (event) => { onEvent(event); if (event.typ === "scan_ende" || event.typ === "scan_fehler") { streamHandler = null; resolve(); } };
        ws.send(JSON.stringify({ typ: "vollscan" }));
      });
    },
    request: (action) => send(action),
    answer: (id, approved) => send({ typ: "freigabe", freigabe_id: id, genehmigt: approved }),
    stop: (funktion) => send({ typ: "funktion_stopp", funktion }),
  };
}

export function createDemo(data) {
  const d = structuredClone(data);
  const pending = new Map();
  let seq = 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = { DREHZAHL: 16, TRIM_KURZ_B1: 2.5, LAST: 1.1, LUFTMASSE: .12, ZUENDWINKEL: 1.6, SAUGROHRDRUCK: .9, KAT_TEMP_B1: 3, SPANNUNG: .04, VERBRAUCH: .03, DROSSEL_RELATIV: .2, DREHMOMENT: .6 };
  const scanEcus = () => d.scan.filter((e) => e.typ === "scan_fund").map((e) => e.steuergeraet);
  const stored = () => d.obd_fehler.gespeichert;
  const answers = {
    gemisch: ["Die Langzeitkorrektur steht bei +17 %. Das Steuergerät spritzt dauerhaft mehr ein, weil die Lambdasonde mageres Gemisch meldet. Bei normaler Leerlaufdrehzahl und unauffälliger Luftmasse ist Falschluft hinter dem Luftmassenmesser am wahrscheinlichsten: Unterdruckschläuche, Kurbelgehäuseentlüftung, Saugrohrdichtung. Ein Rauchtest findet das in 20 Minuten.", { art: "keiner" }],
    aussetzer: ["P0301 ist aktiv und bestätigt. Laut Freeze-Frame trat er bei 2340 1/min und 64 % Last auf, also unter Last. Schnellster Test: Zündspule von Zylinder 1 mit Zylinder 2 tauschen, Fehler löschen, Probefahrt. Wandert der Fehler zu P0302, ist die Spule defekt.", { art: "fehler_loeschen", modul: "Motor", code: "P0301", begruendung: "Nach dem Spulentausch löschen, um zu sehen, ob der Fehler wandert." }],
    au: ["Für die AU ist ein Bereitschaftstest noch offen: Tankentlüftung. Er läuft oft nur bei 15 bis 85 % Tank nach mehreren Stunden Standzeit. Außerdem sind zwei Abgasfehler gespeichert, die Motorkontrollleuchte ist an. So besteht das Auto die AU nicht. Erst Aussetzer und Magerkeit beheben, dann löschen und fahren, bis alle Tests fertig sind.", { art: "keiner" }],
    kat: ["P0420 ist nur vorläufig. Bei Zündaussetzern gelangt unverbranntes Gemisch in den Kat, er überhitzt und die Diagnose meldet schlechten Wirkungsgrad. Erst die Aussetzer beheben, dann nach einigen Fahrten neu prüfen. Kat nicht vorschnell tauschen.", { art: "keiner" }],
  };
  return {
    mode: "demo",
    status: async () => d.status,
    vehicle: async () => d.fahrzeug,
    obdFaults: async () => d.obd_fehler,
    readiness: async () => d.bereitschaft,
    freeze: async () => d.freeze,
    analysis: async () => ({ ...d.vollanalyse, steuergeraete: scanEcus() }),
    functions: async () => d.funktionen,
    async live() {
      const t = Date.now() / 1000;
      /* Leerlaufrauschen plus eine langsame Welle, damit Verlauf und Aufnahme in der Vorschau etwas zeigen. */
      return { werte: d.live.werte.map((v) => (typeof v.wert !== "number" || !jitter[v.signal] ? v
        : { ...v, wert: Math.round((v.wert + Math.sin(t * 1.7 + v.wert) * jitter[v.signal] * .6 + Math.sin(t / 23) * jitter[v.signal] * 1.5 + (Math.random() - .5) * jitter[v.signal]) * 100) / 100 })) };
    },
    async ki() { await wait(1400); return d.ki_beispiel; },
    async ask(frage) {
      await wait(900);
      const q = frage.toLowerCase();
      const key = /gemisch|trim|mager|korrektur|falschluft/.test(q) ? "gemisch" : /aussetz|p0301|zünd|spule/.test(q) ? "aussetzer" : /au\b|tüv|hu|readiness|bereit/.test(q) ? "au" : /kat|p0420/.test(q) ? "kat" : null;
      const [antwort, vorschlag] = key ? answers[key] : [d.ki_beispiel.bewertung.zusammenfassung + " Frag gezielt nach Gemisch, Aussetzern, Kat oder AU.", { art: "keiner" }];
      return { ok: true, antwort, vorschlag, beispiel: true };
    },
    async did(adresse, did) {
      await wait(250);
      const ecu = scanEcus().find((e) => e.adresse.toUpperCase() === `0X${adresse.toUpperCase()}`);
      const map = { F197: "system", F187: "teilenummer", F18C: "seriennummer", F195: "software" };
      const text = ecu && (did.toUpperCase() === "F190" && adresse.toUpperCase() === "7E0" ? "SMLTR000000000000" : ecu.kennung[map[did.toUpperCase()]]);
      if (!text) return { ok: false, meldung: ecu ? "Steuergerät lehnt ab: Wert außerhalb des Bereichs (NRC 0x31)" : "Keine Antwort unter dieser Adresse." };
      const hex = [...text].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")).join(" ");
      return { ok: true, adresse: `0x${adresse.toUpperCase()}`, did: `0x${did.toUpperCase()}`, laenge: text.length, hex, ascii: text };
    },
    rmi: async () => ({ ok: false, meldung: "In der Vorschau sind keine Herstellerdokumente eingebunden. Am eigenen Rechner: PDFs aus dem Herstellerportal in den Ordner rmi_dokumente legen." }),
    async scan(onEvent) {
      const found = d.scan.filter((e) => e.typ === "scan_fund");
      const step = 248 / found.length;
      for (let i = 0; i < found.length; i++) {
        for (let k = 0; k < 4; k++) { onEvent({ typ: "scan_fortschritt", prozent: Math.round(((i + k / 4) * step / 248) * 100), geprueft: Math.round((i + k / 4) * step), gesamt: 248, adresse: "0x" + (0x700 + Math.round((i + k / 4) * step)).toString(16).toUpperCase() }); await wait(70); }
        onEvent(found[i]);
      }
      onEvent(d.scan.find((e) => e.typ === "scan_ende"));
    },
    async request(action) {
      const id = String(seq++);
      pending.set(id, action);
      const fn = action.typ === "funktion" ? d.funktionen.funktionen.find((f) => f.id === action.funktion) : null;
      const codes = action.typ === "obd_fehler_loeschen" ? Object.values(stored()).flat().map((x) => x.code)
        : action.typ === "fehler_loeschen" ? (scanEcus().find((e) => e.name === action.modul)?.fehler || []).map((x) => x.code) : [];
      return {
        typ: "freigabe_anfrage", freigabe_id: id, gueltig_noch_sekunden: 300,
        operation: fn ? fn.id : action.typ, risiko: ["ABS", "Servolenkung", "Airbag"].includes(action.modul) ? "hoch" : "mittel",
        auswirkung: fn
          ? { funktion: fn.name, modul: fn.modul, art: fn.art, anfrage: fn.anfrage, quelle: fn.quelle, beschreibung: fn.beschreibung, umkehrbar: fn.art === "stellglied", simuliert: true }
          : { modul: action.modul || "alle Abgas-Steuergeräte", betroffene_codes: codes, umkehrbar: false, simuliert: true,
              beschreibung: action.typ === "obd_fehler_loeschen" ? "Generischer OBD-Löschbefehl (Modus 04). Fehler, Freeze-Frames und Readiness werden zurückgesetzt." : "Fehlerspeicher eines Steuergeräts löschen. Freeze-Frame-Daten gehen verloren." },
      };
    },
    async answer(id, approved) {
      const action = pending.get(id);
      pending.delete(id);
      if (!action) return { typ: "fehler", meldung: "Diese Freigabe ist nicht mehr offen. Nichts geschrieben." };
      if (!approved) return { typ: "freigabe_erledigt", genehmigt: false };
      await wait(500);
      if (action.typ === "obd_fehler_loeschen") {
        d.obd_fehler.gespeichert = Object.fromEntries(Object.keys(stored()).map((k) => [k, []]));
        d.obd_fehler.vorlaeufig = {};
        for (const r of Object.values(d.bereitschaft.steuergeraete)) { r.mil = false; r.anzahl_fehler = 0; r.tests.forEach((t) => { t.fertig = false; }); r.au_bereit = false; }
        d.freeze.steuergeraete = {};
      } else if (action.typ === "fehler_loeschen") {
        const ecu = scanEcus().find((e) => e.name === action.modul);
        if (ecu) ecu.fehler = [];
      }
      return { typ: "ergebnis", ok: true, antwort: action.typ === "funktion" ? "71 01 0F 01 00" : undefined, stopp_moeglich: action.funktion === "kuehlerluefter_test",
        naechster_schritt: action.typ === "funktion" ? "Ausgeführt." : "Nach einer Probefahrt neu auslesen. Kommt ein Code sofort zurück, ist die Ursache noch da." };
    },
    stop: async () => ({ typ: "ergebnis", ok: true, meldung: "Gestoppt, Steuergerät hat die Kontrolle zurück." }),
  };
}

export async function pickSource() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch("/api/status", { credentials: "same-origin", signal: controller.signal });
    clearTimeout(timer);
    if (response.ok && (await response.json()).ok) return createServer();
  } catch (_) { /* kein Server: Vorschau */ }
  return createDemo(await getJson("demo-daten.json"));
}

export { getJson };
