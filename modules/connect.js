/* Verbinden in drei Schritten: Diagnose-Server, Fahrzeug erkennen, Speicher lesen. Jeder Schritt zeigt seinen Stand,
   hat ein Zeitlimit und bei einem Fehler nummerierte Vorschläge mit Erneut versuchen. Danach geht es zur Startseite. */
import { $, h, mark, icon } from "./dom.js";
import { state, logEvent, emit, on } from "./state.js";
import { createServer, createDemo, getJson } from "./sources.js";
import { createDirect } from "../kern/direkt.js";
import { bluetoothVerfuegbar, waehleBleAdapter } from "../kern/ble.js";
import { appBluetoothVerfuegbar, sucheAdapter, appAnschluss } from "../kern/ble-app.js";
import { withTimeout, busy, HILFE } from "./vorgang.js";
import { icon3d } from "./icons3d.js";
import { go, currentTab } from "./shell.js";

const STEPS = [
  { titel: "Diagnose-Server verbinden", laeuft: "Suche das Programm auf diesem Rechner …" },
  { titel: "Fahrzeug erkennen", laeuft: "Adapter fragt Fahrgestellnummer und Protokoll ab …" },
  { titel: "Fehlerspeicher und Bereitschaft lesen", laeuft: "Lese Fehler, Freeze-Frame und Readiness …" },
];
const flow = { states: STEPS.map(() => "pending"), details: STEPS.map(() => ""), failed: null, wahl: null, run: 0, active: false };

function render() {
  const box = $("connect-steps");
  if (!box) return;
  box.replaceChildren(...STEPS.map((s, i) => h("li", { class: `cstep ${flow.states[i]}`, "aria-current": flow.states[i] === "running" ? "step" : null },
    h("span", { class: "cstep-n" }, flow.states[i] === "pending" ? String(i + 1) : mark(flow.states[i])),
    h("span", { class: "cstep-b" }, h("span", { class: "t" }, i === 0 && flow.ble ? "Bluetooth-Adapter verbinden" : s.titel), h("span", { class: "d" }, flow.details[i] || (flow.states[i] === "pending" ? "wartet" : ""))))));
  const f = flow.failed;
  const w = flow.wahl;
  $("connect-help").hidden = !f && !w;
  $("connect-help").classList.toggle("is-wahl", Boolean(w));
  if (w) {
    $("connect-help").replaceChildren(h("p", { class: "eyebrow" }, "Adapter wählen"),
      ...w.funde.map((fund) => h("button", { class: "tap row", type: "button", onclick: () => w.resolve(fund) },
        mark("muted"), h("span", {}, h("div", { class: "t" }, fund.name), h("div", { class: "d" }, `Signal ${fund.rssi} dBm`)))));
  } else if (f) {
    $("connect-help").replaceChildren(
      h("div", { class: "vg-head t-crit" }, mark("crit"), h("h2", { class: "h2" }, f.titel)),
      h("p", { class: "p" }, f.meldung),
      h("p", { class: "eyebrow" }, "Das kannst du tun"), h("ol", {}, ...f.hilfe.map((t) => h("li", {}, t))));
  }
  const actions = flow.active
    ? [h("button", { class: "btn sec", type: "button", onclick: cancel }, "Abbrechen")]
    : f
      ? [h("button", { class: "btn pri", type: "button", onclick: () => connect({ ziel: flow.ziel, ble: flow.ble }) }, icon("reset"), "Erneut versuchen"),
        f.vorschau ? h("button", { class: "btn sec", type: "button", onclick: () => connect({ demo: true, ziel: flow.ziel }) }, "Vorschau mit Beispieldaten") : null,
        h("button", { class: "btn qt", type: "button", onclick: () => go("start") }, "Zur Startseite")]
      : [h("button", { class: "btn pri", type: "button", onclick: () => connect() }, state.status ? "Neu verbinden" : "Verbinden")];
  /* Ohne Server direkt zum Adapter, wo der Browser Bluetooth kann (Chrome am Rechner, Android). */
  if (!flow.active && !appBluetoothVerfuegbar() && bluetoothVerfuegbar()) actions.splice(1, 0, h("button", { class: "btn sec", type: "button", onclick: () => connect({ ble: true, ziel: flow.ziel }) }, icon3d("bluetooth", "btn-i3"), "Adapter per Bluetooth"));
  $("connect-actions").replaceChildren(...actions.filter(Boolean));
  $("connect-state").textContent = flow.active ? "läuft" : f ? "gescheitert" : flow.states.every((x) => x === "ok" || x === "warn") ? "verbunden" : "bereit";
}

/* Ein Bluetooth-Adapter spricht nur mit einem Gerät: die alte Verbindung immer lösen, bevor eine neue beginnt. */
function releaseSource() {
  const src = state.src;
  if (src && typeof src.close === "function") src.close().catch(() => {});
}

function cancel() {
  flow.run++;
  flow.wahl = null;
  if (flow.ble) releaseSource();
  flow.active = false;
  const i = flow.states.indexOf("running");
  if (i >= 0) { flow.states[i] = "crit"; flow.details[i] = "abgebrochen"; }
  flow.failed = { titel: "Verbindung abgebrochen", meldung: "Du hast den Vorgang abgebrochen. Am Auto wurde nichts geändert.", hilfe: ["Erneut versuchen, wenn Adapter und Zündung bereit sind."], vorschau: false };
  logEvent("Verbindung abgebrochen");
  render();
}

/* Eine Vorschau ohne Server (etwa auf dem Handy) startet mit <meta name="candor-quelle" content="vorschau"> gleich mit Beispieldaten. */
const PREVIEW_ONLY = (document.querySelector('meta[name="candor-quelle"]') || {}).content === "vorschau";
/* In der App sucht CANdor selbst und zeigt die gefundenen Adapter; der Browser hat dafür seinen eigenen Dialog. */
async function appAdapter() {
  flow.details[0] = "suche Adapter in der Nähe …"; render();
  const funde = await sucheAdapter();
  if (!funde.length) throw new Error("Kein OBD-Adapter in Reichweite gefunden.");
  if (funde.length === 1) return appAnschluss(funde[0]);
  /* Die Auswahl zeichnet render(); so übersteht sie jedes Neuzeichnen, Abbrechen räumt sie weg. */
  const fund = await new Promise((resolve) => {
    flow.wahl = { funde, resolve: (f) => { flow.wahl = null; resolve(f); } };
    flow.details[0] = `${funde.length} Adapter gefunden, bitte wählen`;
    render();
  });
  return appAnschluss(fund);
}

async function findSource(demo, ble) {
  if (ble) return createDirect({ anschluss: appBluetoothVerfuegbar() ? await appAdapter() : await waehleBleAdapter() });
  if (demo || PREVIEW_ONLY) return createDemo(await getJson("demo-daten.json"));
  let response = null;
  try { response = await withTimeout(fetch("/api/status", { credentials: "same-origin" }), 4000); } catch (_) { return null; }
  if (response.ok && (await response.json().catch(() => ({}))).ok) return createServer();
  /* Keine Schnittstelle unter dieser Adresse (statische Vorschau): Beispieldaten, klar gekennzeichnet. */
  if (response.status === 404) return createDemo(await getJson("demo-daten.json"));
  return null;
}

/* Ein Schritt: Stand setzen, mit Zeitlimit ausführen, bei Abbruch des Laufs still beenden. */
async function step(i, run, work) {
  flow.states[i] = "running"; flow.details[i] = STEPS[i].laeuft; render();
  const result = await work();
  if (run !== flow.run) throw new Error("abgebrochen");
  flow.states[i] = "ok";
  return result;
}

/* ziel: Seite nach dem Verbinden (Start, oder zurück ins Fahrzeugformular beim Erkennen). */
/* In der App ist Bluetooth der normale Weg; einen Diagnose-Server gibt es dort nicht. */
export async function connect({ demo = false, ble = appBluetoothVerfuegbar() && !demo, ziel = "start" } = {}) {
  const run = ++flow.run;
  releaseSource();
  Object.assign(flow, { states: STEPS.map(() => "pending"), details: STEPS.map(() => ""), failed: null, wahl: null, active: true, ziel, ble });
  go("connect");
  const done = busy("Verbinden");
  let at = 0;
  try {
    state.src = await step(0, run, async () => {
      const src = await findSource(demo, ble).catch((e) => { if (!ble) throw e; throw Object.assign(e, { hilfe: HILFE.bluetooth, titel: "Bluetooth-Adapter nicht verbunden", vorschau: true }); });
      if (!src) throw Object.assign(new Error("Das Programm kfzdiag web antwortet nicht."), { hilfe: HILFE.server, titel: "Diagnose-Server nicht erreichbar", vorschau: true });
      return src;
    });
    flow.details[0] = state.src.mode === "server" ? "verbunden" : state.src.mode === "direkt" ? "direkt am Adapter, ohne Server" : "keine Verbindung zum Auto, Vorschau mit Beispieldaten";
    if (state.src.mode === "demo") flow.states[0] = "warn";
    at = 1;
    /* Direkt am Adapter dauern Zurücksetzen und Protokollsuche (K-Line) bis zu 25 Sekunden. */
    const limit = state.src.mode === "direkt" ? 45000 : 10000;
    const [status, vehicle, functions] = await step(1, run, () => withTimeout(Promise.all([state.src.status(), state.src.vehicle().catch(() => null), state.src.functions().catch(() => null)]), limit, `Das Fahrzeug hat in ${limit / 1000} Sekunden nicht geantwortet.`));
    Object.assign(state, { status, vehicle, functions });
    const v = vehicle || {};
    flow.details[1] = [status.fahrzeug, v.vin_maskiert ? `FIN ${v.vin_maskiert}` : "FIN nicht lesbar", status.simuliert ? "Simulator" : null].filter(Boolean).join(" · ");
    at = 2;
    await step(2, run, () => withTimeout(new Promise((resolve, reject) => { emit("reload", { resolve, reject }); }), 20000, "Der Fehlerspeicher wurde in 20 Sekunden nicht vollständig gelesen."));
    flow.details[2] = "gelesen";
    flow.active = false;
    render();
    logEvent(status.simuliert ? "Verbunden (Simulator)" : "Verbunden");
    emit("connected");
    setTimeout(() => { if (run === flow.run && currentTab() === "connect") go(ziel, { replace: true }); }, 700);
  } catch (error) {
    if (run !== flow.run) return;
    if (ble) releaseSource();
    flow.active = false;
    flow.states[at] = "crit";
    flow.details[at] = "gescheitert";
    flow.failed = {
      titel: error.titel || ["Diagnose-Server nicht erreichbar", "Fahrzeug nicht erkannt", "Speicher nicht vollständig gelesen"][at],
      meldung: error.message,
      hilfe: error.hilfe || [HILFE.server, HILFE.adapter, HILFE.lesen][at],
      vorschau: error.vorschau || at === 0,
    };
    logEvent(`Verbindung gescheitert: ${error.message}`);
    render();
    $("connect-help").focus();
  } finally {
    done();
  }
}

export const connected = () => Boolean(state.status) && !flow.active;

export function initConnect() {
  $("connect-ic").replaceChildren(icon3d("plug"));
  on("tab", (id) => { if (id === "connect") render(); });
}
