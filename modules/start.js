/* Startseite wie am Werkstatt-Tester: oben das gewählte Fahrzeug, darunter eine große Kachel je Aufgabe,
   unten die zuletzt benutzten Fahrzeuge zum schnellen Wechsel. Jede Kachel sagt in einer Zeile, wie es dort steht.
   Ohne Fahrzeug führt alles zuerst zum Anlegen, ohne Verbindung zum Verbinden. */
import { $, h, icon, mark, chev, clockFull, reducedMotion } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, on, emit, logEvent, obdList, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go, CHECK_SUBS } from "./shell.js";

import { vehicles, plate, selectVehicle, setVehicleKm } from "./garage.js";
import { checkSessionKm } from "./befund.js";
import { renderVehicleCard } from "./vehicle.js";
import { sortVehicles, vehicleName } from "./fahrzeuge.js";
import { ablauf, weiterText } from "../kern/ablauf.js";
import { erledigtHeute } from "./service.js";

/* 3D-Neigung: die Kachel kippt leicht zum Zeiger, das Icon schwebt davor. Ohne Bewegungswunsch bleibt sie still. */
export function tilt(el) {
  const reset = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
  el.addEventListener("pointermove", (ev) => {
    if (reducedMotion() || ev.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${((x + .5) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${((y + .5) * 100).toFixed(1)}%`);
  });
  el.addEventListener("pointerleave", reset);
  return el;
}

export function tile({ label, icon: ic, tone, text, disabled, onclick, cls }) {
  return tilt(h("button", { class: `tile-big ${cls || ""}`.trim(), type: "button", disabled: disabled || null, onclick },
    h("span", { class: "tile-ic", "aria-hidden": "true" }, icon3d(ic)),
    h("span", { class: "tile-t" }, label),
    h("span", { class: "tile-s" }, tone ? mark(tone) : null, text ? h("span", {}, text) : null)));
}

const RECENT = 4;

/* Kilometerstand je Sitzung, wie in der Werkstatt-Software Pflicht für den Bericht. Die Karte wird nur bei
   einem Zustandswechsel neu gebaut, damit Messwerte im Sekundentakt das Tippen nicht stören. */
let kmBuiltFor = null;
let kmEdit = false;
function renderKm() {
  const box = $("start-km"), fz = state.fahrzeug;
  const show = Boolean(fz && state.status);
  const key = show ? `${fz.id}|${state.sitzung.km}|${kmEdit}` : "aus";
  box.hidden = !show;
  if (key === kmBuiltFor) return;
  kmBuiltFor = key;
  if (!show) { box.replaceChildren(); return; }
  if (state.sitzung.km != null && !kmEdit) {
    box.className = "card km-card done";
    box.replaceChildren(mark("ok"), h("span", {}, h("span", { class: "state-lbl" }, "Kilometerstand heute "), h("strong", { class: "num" }, `${state.sitzung.km.toLocaleString("de-DE")} km`)),
      h("button", { class: "btn qt small", type: "button", onclick: () => { kmEdit = true; renderKm(); } }, "Ändern"));
    return;
  }
  let confirmLower = false;
  const input = h("input", { class: "inp num", id: "km-heute", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: fz.km != null ? `zuletzt ${fz.km.toLocaleString("de-DE")}` : "vom Tacho ablesen", "aria-describedby": "km-msg", value: kmEdit && state.sitzung.km != null ? String(state.sitzung.km) : "" });
  const msg = h("span", { class: "fld-hint", id: "km-msg" }, "Steht im Bericht und in der Fahrzeugakte.");
  const submit = h("button", { class: "btn pri", type: "submit" }, icon("tick"), "Übernehmen");
  input.addEventListener("input", () => { confirmLower = false; submit.lastChild.textContent = "Übernehmen"; input.removeAttribute("aria-invalid"); });
  box.className = "card km-card";
  box.onsubmit = (ev) => {
    ev.preventDefault();
    const r = checkSessionKm(input.value, fz.km);
    if (r.fehler) { input.setAttribute("aria-invalid", "true"); msg.className = "fld-err"; msg.replaceChildren(mark("crit"), r.fehler); input.focus(); return; }
    if (r.warnung && !confirmLower) { confirmLower = true; msg.className = "fld-err warn"; msg.replaceChildren(mark("warn"), r.warnung); submit.lastChild.textContent = "Trotzdem übernehmen"; return; }
    state.sitzung = { ...state.sitzung, km: r.km };
    if (state.snapshot && state.snapshot.km == null) state.snapshot = { ...state.snapshot, km: r.km };
    setVehicleKm(fz.id, r.km);
    logEvent(`Kilometerstand erfasst: ${r.km.toLocaleString("de-DE")} km`);
    kmEdit = false;
    emit("saved-state");
    emit("fahrzeug-aktiv", state.fahrzeug);
  };
  box.replaceChildren(
    h("span", { class: "km-ic", "aria-hidden": "true" }, icon3d("gauge")),
    h("div", { class: "km-txt" }, h("label", { class: "h3", for: "km-heute" }, "Kilometerstand heute"), msg),
    h("span", { class: "with-suffix km-in" }, input, h("span", { class: "suffix" }, "km")),
    submit);
}

/* Zuletzt benutzte Fahrzeuge außer dem aktiven: ein Tippen wählt und verbindet. */
function renderRecent() {
  const active = state.fahrzeug && state.fahrzeug.id;
  const others = sortVehicles(vehicles(), "benutzt").filter((v) => v.id !== active).slice(0, RECENT);
  $("start-recent").hidden = !others.length;
  if (!others.length) return;
  $("start-recent").replaceChildren(
    h("div", { class: "sec-head" }, h("h2", { class: "h3" }, "Zuletzt benutzte Fahrzeuge"), h("button", { class: "btn qt", type: "button", onclick: () => go("fahrzeuge") }, `Alle ${vehicles().length}`, chev())),
    h("div", { class: "recent" }, ...others.map((v) => h("button", { class: "recent-i", type: "button", onclick: () => selectVehicle(v.id), "aria-label": `${vehicleName(v)} wählen und verbinden` },
      plate(v, true), h("span", { class: "t" }, vehicleName(v)), h("span", { class: "sm" }, `zuletzt ${clockFull(new Date(v.benutzt))}`)))));
}

/* Teile der Startseite nur neu bauen, wenn sich ihr Inhalt ändert. Messwerte kommen jede Sekunde; ein ständiger
   Neuaufbau kostet Zeit und kann beim Scrollen stören. */
const built = new Map();
function once(name, key, build) {
  if (built.get(name) === key) return;
  built.set(name, key);
  build();
}
const cardKey = () => {
  const st = state.status, fz = state.fahrzeug, v = state.vehicle || {};
  return JSON.stringify([fz, st && [st.fahrzeug, st.protokoll, st.version, st.schreiben_an, st.ki, st.hinweise], v.vin_maskiert, state.finWarnung]);
};

/* Der rote Faden: sieben Schritte wie in der Werkstatt, der nächste ist hervorgehoben, darunter ein Weiter-Knopf. */
function stand() {
  const live = state.live || {}, r = firstReadiness();
  const rpm = live.DREHZAHL && live.DREHZAHL.wert, volt = live.SPANNUNG && live.SPANNUNG.wert;
  return {
    fahrzeug: Boolean(state.fahrzeug), verbunden: Boolean(state.status), scanning: state.scanning, scanPct: state.scanPct, scanned: state.scanned,
    steuergeraete: state.ecus.length, mitFehler: state.ecus.filter((e) => e.fehler.length).length,
    gespeichert: totalFaults(), vorlaeufig: pendingFaults().length,
    motorLaeuft: typeof rpm === "number" && rpm > 100, spannung: typeof volt === "number" ? volt : null,
    readinessOffen: r ? r.tests.filter((t) => !t.fertig).length : null,
    serviceErledigt: erledigtHeute(), eingang: Boolean(state.snapshot), nachher: Boolean(state.postscan),
  };
}
const ZEICHEN = { fertig: "ok", problem: "crit", laeuft: "running", gesperrt: "locked" };
function oeffnen(id, ziel) {
  if (id === "scan" && state.status && !state.scanned && !state.scanning) { go("car"); emit("run-scan"); return; }
  if (id === "fahrzeug" && !vehicles().length) { go("fahrzeug"); return; }
  go(ziel);
}
let ablaufFuer = "";
function renderAblauf() {
  const s = stand(), a = ablauf(s);
  const jetzt = a.schritte.find((x) => x.jetzt);
  /* Neu bauen nur bei Zustandswechsel; Messwerte und Scan-Prozente nur als Text tauschen (Fokus bleibt). */
  const key = JSON.stringify([a.schritte.map((x) => [x.zustand, x.jetzt]), weiterText(a.jetzt, s), s.nachher, vehicles().length]);
  if (key === ablaufFuer) {
    $("start-ablauf").querySelectorAll(".s-d").forEach((el, i) => { if (el.textContent !== a.schritte[i].text) el.textContent = a.schritte[i].text; });
    return;
  }
  ablaufFuer = key;
  const zielJetzt = jetzt.id === "fahrzeug" && !vehicles().length ? "fahrzeug" : jetzt.ziel;
  $("start-ablauf").replaceChildren(
    h("div", { class: "ablauf-kopf" },
      h("div", {}, h("p", { class: "eyebrow" }, "Diagnose in sieben Schritten"), h("h2", { class: "h2", id: "ablauf-titel" }, jetzt.id === "abschluss" && s.nachher ? "Fertig. Bericht bereit." : `Als Nächstes: ${jetzt.label}`)),
      h("button", { class: "btn pri big-btn ablauf-weiter", type: "button", onclick: () => oeffnen(jetzt.id, zielJetzt) }, weiterText(a.jetzt, s), icon("next"))),
    h("ol", { class: "schritte" }, ...a.schritte.map((x, i) => h("li", { class: `schritt ${x.zustand}${x.jetzt ? " jetzt" : ""}` },
      h("button", { type: "button", disabled: x.zustand === "gesperrt" || null, "aria-current": x.jetzt ? "step" : null, onclick: () => oeffnen(x.id, x.ziel) },
        h("span", { class: `s-nr${x.zustand === "laeuft" ? " lk" : ""}`, "aria-hidden": "true" }, x.zustand === "fertig" ? "✓" : x.zustand === "problem" ? "!" : String(i + 1)),
        h("span", { class: "s-t" }, x.label, h("span", { class: "sr" }, `, ${{ fertig: "erledigt", problem: "Befund", laeuft: "läuft", gesperrt: "gesperrt", offen: "offen" }[x.zustand]}`)),
        h("span", { class: "s-d" }, x.text))))),
    h("div", { class: "ablauf-mehr" }, ...[["agent", "Assistent", "chat"], ["report", "Bericht", "report"], ["history", "Verlauf", "clock"], ["fahrzeuge", "Fahrzeuge", "car"], ["handbuch", "Handbuch", "doc"]]
      .map(([z, l, ic]) => h("button", { class: "btn qt small", type: "button", onclick: () => go(z) }, icon(ic), l))));
}

export function renderStart() {
  const hasVehicle = Boolean(state.fahrzeug);
  $("vehicle-card").hidden = !hasVehicle;
  once("card", cardKey(), renderVehicleCard);
  renderKm();
  once("recent", JSON.stringify([state.fahrzeug && state.fahrzeug.id, vehicles().map((v) => [v.id, v.benutzt, v.kennzeichen, v.marke, v.modell])]), renderRecent);
  renderAblauf();
}

export function renderCheckTiles() {
  $("check-tiles").replaceChildren(...CHECK_SUBS.map((c) => tile({ label: c.label, icon: c.icon, tone: null, text: c.text, onclick: () => go("check", { sub: c.id }) })));
}

export function initStart() {
  renderCheckTiles();
  $("start-handbuch").replaceChildren(h("span", { class: "hb-link-ic", "aria-hidden": "true" }, icon3d("book")),
    h("span", {}, h("span", { class: "t" }, "Handbuch"), h("span", { class: "d" }, "Jede Funktion erklärt: Hardware, Installation, Bluetooth, Datenfluss, Sicherheit, RMI")), chev());
  $("start-handbuch").addEventListener("click", () => go("handbuch"));
  on("tab", (id) => { if (id === "start") renderStart(); });
  for (const ev of ["render", "status", "connected", "history", "fahrzeug-aktiv"]) on(ev, () => { if (!$("view-start").hidden) renderStart(); });
}
