/* Gemeinsamer Zustand und ein kleiner Ereignisbus, damit sich die Bereiche nicht gegenseitig importieren müssen. */
export const state = {
  src: null, status: null, vehicle: null, obd: null, ecus: [], live: {}, readiness: null, freeze: null, analysis: null,
  functions: null, ki: null, kiChecked: new Set(), events: [], scanning: false, scanned: false,
  /* Stand beim Sitzungsstart für den Vorher/Nachher-Vergleich im Bericht */
  snapshot: null,
  /* Gewähltes Fahrzeug aus dem eigenen Bestand (garage.js) und ob das verbundene Auto nicht dazu passt */
  fahrzeug: null, finWarnung: false,
  /* Werkstattdaten (werkstatt.js), Sitzung mit Kilometerstand, Ausgangsbefund nach dem Nachher-Scan */
  werkstatt: null, sitzung: { km: null }, postscan: null, postscanLaeuft: false,
};

/* Neues Fahrzeug, neue Sitzung: alles vom alten Auto aus der Anzeige nehmen. Die Verbindung baut connect() neu auf. */
export function resetDiagnosis() {
  Object.assign(state, { status: null, vehicle: null, obd: null, ecus: [], live: {}, readiness: null, freeze: null, analysis: null,
    functions: null, ki: null, kiChecked: new Set(), scanning: false, scanned: false, snapshot: null, finWarnung: false, connLost: false, sitzung: { km: null }, postscan: null, postscanLaeuft: false });
  DTC_REG.clear();
  emit("status");
}

export const WISSEN = { signale: {}, readiness: {}, begriffe: {}, funktionsarten: {}, pruefpfade: [] };
export function setWissen(data) { Object.assign(WISSEN, data || {}); }

/* Fehlercodes, die gerade in der Oberfläche stehen, mit Herkunft. Schlüssel: obd|sender|code oder ecu|adresse|code */
export const DTC_REG = new Map();

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (ev) => fn(ev.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function logEvent(text, kind = "info") {
  state.events.unshift({ at: new Date(), text, kind });
  emit("events");
}

export const sev = (dtc) => (dtc.aktiv && dtc.bestaetigt ? "crit" : dtc.bestaetigt ? "warn" : "");
const SENDER = { "0x7E8": "Motor", "0x7E9": "Getriebe", "0x10": "Motor (K-Line)" };
export const senderName = (x) => SENDER[x] || `Steuergerät ${x}`;
export const obdList = (kind, obd = state.obd) => Object.entries((obd && obd[kind]) || {}).flatMap(([sender, list]) => (Array.isArray(list) ? list.map((d) => ({ ...d, sender })) : []));
export const signalTitle = (name) => (WISSEN.signale[name] && WISSEN.signale[name].titel) || name;
export const sollFor = (name) => ((state.analysis && state.analysis.sollwerte && state.analysis.sollwerte.vergleich) || []).find((r) => r.signal === name);
export const firstReadiness = (readiness = state.readiness) => readiness && Object.values(readiness.steuergeraete || {})[0];
/* Vorläufige Codes, die nicht schon gespeichert sind (ein Code kann in beiden Listen stehen). */
export const pendingFaults = () => { const stored = new Set(obdList("gespeichert").map((d) => `${d.sender}|${d.code}`)); return obdList("vorlaeufig").filter((d) => !stored.has(`${d.sender}|${d.code}`)); };
export const totalFaults = () => obdList("gespeichert").length + state.ecus.filter((e) => !/^0x7E[01]$/i.test(e.adresse)).reduce((n, e) => n + e.fehler.length, 0);
export const vehicleKey = () => `${(state.status && state.status.profil) || "x"}|${(state.vehicle && state.vehicle.vin_maskiert) || "-"}`;

/* Alle Fehler als flache Liste für Vergleich und Bericht: {code, wo, status} */
export function faultSet(obd = state.obd, ecus = state.ecus) {
  const out = new Map();
  for (const d of obdList("gespeichert", obd)) out.set(`${senderName(d.sender)}|${d.code}`, { code: d.code, wo: senderName(d.sender), beschreibung: d.beschreibung, art: "gespeichert" });
  for (const d of obdList("vorlaeufig", obd)) if (!out.has(`${senderName(d.sender)}|${d.code}`)) out.set(`${senderName(d.sender)}|${d.code}`, { code: d.code, wo: senderName(d.sender), beschreibung: d.beschreibung, art: "vorläufig" });
  for (const e of ecus) if (!/^0x7E[01]$/i.test(e.adresse)) for (const d of e.fehler) out.set(`${e.name}|${d.code}`, { code: d.code, wo: e.name, beschreibung: d.beschreibung, art: d.bestaetigt ? "gespeichert" : "vorläufig" });
  return out;
}

/* Befund: Fehler, Readiness und Steuergeräte zu einem Zeitpunkt. ecus zählt die gescannten Steuergeräte (0 = ohne Vollscan). */
export function captureBefund() {
  return { at: new Date(), faults: faultSet(), readiness: structuredClone(firstReadiness() || null), ecus: state.ecus.length,
    ecuList: state.ecus.map((e) => ({ name: e.name, adresse: e.adresse, fehler: e.fehler.length })), km: state.sitzung.km };
}

/* Eingangsbefund (Pre-Scan): der erste gelesene Stand der Sitzung. */
export function takeSnapshot() {
  if (state.snapshot) return;
  state.snapshot = captureBefund();
}

/* Der erste Vollscan gehört noch zum Eingangsbefund, solange am Auto nichts geschrieben wurde. */
export function completeSnapshot() {
  const snap = state.snapshot;
  if (!snap || snap.ecus || state.postscanLaeuft || state.events.some((e) => e.kind === "write")) return;
  state.snapshot = { ...captureBefund(), at: snap.at };
}
