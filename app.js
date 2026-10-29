/* KFZ-Diagnose Oberfläche, Einstieg.
   Ablauf wie am Werkstatt-Tester: Startseite, Verbinden in drei Schritten, danach je Aufgabe eine Seite.
   Server vorhanden: echte Daten über /api und /ws. Sonst Vorschau mit Daten, die das Backend gegen den
   Simulator erzeugt hat (demo-daten.json). Die Bereiche liegen in modules/. */
import { toast } from "./modules/dom.js";
import { state, setWissen, on, emit, takeSnapshot } from "./modules/state.js";
import { getJson } from "./modules/sources.js";
import { initShell, renderStatus, openDisplaySettings, initialRoute, openRoute } from "./modules/shell.js";
import { initVorgang } from "./modules/vorgang.js";
import { initConnect, connect } from "./modules/connect.js";
import { initStart } from "./modules/start.js";
import { initWidgets } from "./modules/widgets.js";
import { initEinfach } from "./modules/einfach.js";
import { initHistory } from "./modules/history.js";
import { initGarage, vehicles } from "./modules/garage.js";
import { initWerkstatt, setupDone } from "./modules/werkstatt.js";
import { initHandbuch } from "./modules/handbuch.js";
import { initEinstellungen } from "./modules/einstellungen.js";
import { initInfo } from "./modules/info.js";
import { initApproval } from "./modules/approval.js";
import { initVehicle } from "./modules/vehicle.js";
import { initFaults } from "./modules/faults.js";
import { initLive, pollLive } from "./modules/live.js";
import { initCheck } from "./modules/check.js";
import { initPfade } from "./modules/pfade.js";
import { initAgent } from "./modules/chat.js";
import { initReport } from "./modules/report.js";
import { initSearch } from "./modules/search.js";
import { initService } from "./modules/service.js";
import { initNavigation } from "./modules/navigation.js";

/* Jeder Bereich hängt am Ereignis "render" (start, vehicle, faults, check, pfade, live, report). */
function renderAll() {
  renderStatus();
  emit("render");
}

/* Speicher neu lesen. Beim Verbinden meldet der Aufrufer über resolve/reject, ob es geklappt hat. */
async function reload(done) {
  try {
    const [obd, readiness, freeze, analysis] = await Promise.all([state.src.obdFaults(), state.src.readiness(), state.src.freeze(), state.src.analysis()]);
    Object.assign(state, { obd, readiness, freeze, analysis });
    if (analysis.steuergeraete && analysis.steuergeraete.length) { state.ecus = analysis.steuergeraete; state.scanned = true; }
    takeSnapshot();
    renderAll();
    emit("saved-state");
    if (done) done.resolve();
  } catch (error) {
    if (done) done.reject(error); else toast(`Neu lesen gescheitert: ${error.message}`);
  }
}

let ticking = false;
function startLive() {
  if (ticking) return;
  ticking = true;
  pollLive();
  setInterval(() => { if (!document.hidden && state.status) pollLive(); }, 1000);
}

async function start() {
  const wanted = initialRoute();
  initShell(); initVorgang(); initWerkstatt(); initHandbuch(); initEinstellungen(); initGarage(); initConnect(); initStart(); initWidgets(); initEinfach(); initHistory(); initInfo(); initApproval();
  initVehicle(); initFaults(); initLive(); initCheck(); initPfade(); initAgent(); initReport(); initSearch(); initService(); initNavigation();
  on("open-settings", openDisplaySettings);
  on("reload", reload);
  on("reconnect", () => connect());
  on("connected", () => { renderAll(); startLive(); });
  setWissen(await getJson("wissen.json").catch(() => null));
  renderStatus();
  /* Allererster Start: Werkstattdaten (überspringbar), dann Fahrzeug. */
  if (!setupDone()) { openRoute({ page: "werkstatt" }); return; }
  /* Erster Start ohne Fahrzeug: zuerst anlegen. Sonst ist das zuletzt gewählte Fahrzeug wieder aktiv und wird verbunden. */
  if (!state.fahrzeug) { openRoute(wanted && ["fahrzeuge", "fahrzeug", "history", "werkstatt", "handbuch", "einstellungen"].includes(wanted.page) ? wanted : { page: vehicles().length ? "start" : "fahrzeug" }); return; }
  await connect();
  /* Kam der Aufruf mit einer Adresse (etwa #faults), nach dem Verbinden dorthin. */
  if (state.status && wanted && wanted.page !== "start") openRoute(wanted);
}

start();
