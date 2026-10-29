/* Startseite wie am Werkstatt-Tester: oben das gewählte Fahrzeug, darunter eine große Kachel je Aufgabe,
   unten die zuletzt benutzten Fahrzeuge zum schnellen Wechsel. Jede Kachel sagt in einer Zeile, wie es dort steht.
   Ohne Fahrzeug führt alles zuerst zum Anlegen, ohne Verbindung zum Verbinden. */
import { $, h, icon, mark, num, chev, clockFull, reducedMotion } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, on, emit, logEvent, obdList, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go, CHECK_SUBS } from "./shell.js";
import { historyCount } from "./history.js";
import { vehicles, plate, selectVehicle, setVehicleKm } from "./garage.js";
import { checkSessionKm } from "./befund.js";
import { renderVehicleCard } from "./vehicle.js";
import { sortVehicles, vehicleName } from "./fahrzeuge.js";

function tileState(id) {
  const live = state.live || {};
  switch (id) {
    case "car": {
      if (state.scanning) return ["running", `Vollscan läuft, ${state.scanPct || 0} %`];
      if (!state.scanned) return ["pending", "Vollscan noch nicht gelaufen"];
      const bad = state.ecus.filter((e) => e.fehler.length).length;
      return [bad ? "crit" : "ok", `${state.ecus.length} gefunden, ${bad ? `${bad} mit Fehler` : "alle ohne Fehler"}`];
    }
    case "faults": {
      const stored = totalFaults(), pending = pendingFaults().length;
      if (!stored && !pending) return ["ok", "Keine Fehler gespeichert"];
      return [stored ? "crit" : "warn", [stored ? `${stored} gespeichert` : null, pending ? `${pending} vorläufig` : null].filter(Boolean).join(", ")];
    }
    case "live": {
      const rpm = live.DREHZAHL && live.DREHZAHL.wert, volt = live.SPANNUNG && live.SPANNUNG.wert;
      if (typeof rpm !== "number") return ["pending", "Noch keine Messwerte"];
      return ["running", `${rpm > 100 ? "Motor läuft" : "Zündung an"}${typeof volt === "number" ? ` · ${num(volt, 1)} V` : ""}`];
    }
    case "check": {
      const r = firstReadiness();
      if (!r) return ["pending", `${CHECK_SUBS.length} Prüfungen und Service`];
      const open = r.tests.filter((t) => !t.fertig).length;
      return [open ? "warn" : "ok", open ? `AU: ${open} Test${open === 1 ? "" : "s"} offen` : "AU-Tests alle fertig"];
    }
    case "agent": return state.status && state.status.ki ? ["ok", state.status.ki === "beispiel" ? "Beispielantworten" : "bereit"] : ["pending", "ohne KI-Zugang"];
    case "report": return state.postscan ? ["ok", "Vorher und nachher erfasst"] : state.snapshot ? ["pending", "Eingangsbefund da, Nachher-Scan offen"] : ["pending", "Vorher und nachher, zum Drucken"];
    case "history": { const n = historyCount(); return ["pending", n ? `${n} gespeicherte Diagnose${n === 1 ? "" : "n"}` : "Noch keine Diagnose gespeichert"]; }
    case "fahrzeuge": { const n = vehicles().length; return [null, n ? `${n} Fahrzeug${n === 1 ? "" : "e"} angelegt` : "Erstes Fahrzeug anlegen"]; }
    default: return [null, ""];
  }
}

const TILES = [
  { id: "faults", label: "Fehlerspeicher", icon: "mil", needs: true },
  { id: "car", label: "Steuergeräte", icon: "chip", needs: true },
  { id: "live", label: "Live-Werte", icon: "scope", needs: true },
  { id: "check", label: "Prüfen und Service", icon: "clipboard", needs: true },
  { id: "agent", label: "Assistent", icon: "robot", needs: true },
  { id: "report", label: "Bericht", icon: "report", needs: true },
  { id: "history", label: "Verlauf", icon: "clock", needs: false },
  { id: "fahrzeuge", label: "Fahrzeuge", icon: "garage", needs: false },
];

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

function renderEmpty(hasVehicle, ready) {
  const box = $("start-empty");
  box.hidden = hasVehicle && ready;
  if (!hasVehicle) {
    const known = vehicles().length;
    box.replaceChildren(
      h("span", { class: "hero-ic", "aria-hidden": "true" }, icon3d("carplus")),
      h("div", {}, h("p", { class: "eyebrow" }, "Noch kein Fahrzeug gewählt"), h("h2", { class: "h2" }, known ? "Fahrzeug wählen oder anlegen" : "Zuerst das Fahrzeug anlegen"),
        h("p", { class: "p" }, "Jede Diagnose gehört zu einem Fahrzeug. So findest du Fehler, Messungen und Berichte später wieder.")),
      h("div", { class: "row-actions" },
        h("button", { class: "btn pri big-btn", type: "button", onclick: () => go("fahrzeug") }, icon3d("carplus", "btn-i3"), "Fahrzeug anlegen"),
        known ? h("button", { class: "btn sec", type: "button", onclick: () => go("fahrzeuge") }, `Aus ${known} wählen`) : null));
  } else if (!ready) {
    box.replaceChildren(
      h("span", { class: "hero-ic", "aria-hidden": "true" }, icon3d("plug")),
      h("div", {}, h("p", { class: "eyebrow" }, "Noch nicht verbunden"), h("h2", { class: "h2" }, "Fahrzeug verbinden"),
        h("ol", { class: "prep" }, h("li", {}, "Adapter in die OBD-Buchse stecken, meist unter dem Lenkrad."), h("li", {}, "Zündung an, Motor darf laufen."), h("li", {}, "Verbinden antippen. Das Programm prüft, ob das Auto zum gewählten Fahrzeug passt."))),
      h("button", { class: "btn pri big-btn", type: "button", onclick: () => go("connect") }, icon("gateway"), "Verbinden"));
  }
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

let builtFor = null;
export function renderStart() {
  const ready = Boolean(state.status), hasVehicle = Boolean(state.fahrzeug);
  $("vehicle-card").hidden = !hasVehicle;
  once("card", cardKey(), renderVehicleCard);
  once("empty", JSON.stringify([hasVehicle, ready, vehicles().length]), () => renderEmpty(hasVehicle, ready));
  renderKm();
  once("recent", JSON.stringify([state.fahrzeug && state.fahrzeug.id, vehicles().map((v) => [v.id, v.benutzt, v.kennzeichen, v.marke, v.modell])]), renderRecent);
  /* Kacheln einmal bauen, danach nur die Zustandszeile tauschen: der Fokus bleibt, auch wenn jede Sekunde Messwerte kommen. */
  if (builtFor !== ready) {
    builtFor = ready;
    $("start-tiles").replaceChildren(...TILES.map((t) => tile({ label: t.label, icon: t.icon, disabled: t.needs && !ready, onclick: t.open || (() => go(t.id)) })));
  }
  TILES.forEach((t, i) => {
    const [tone, text] = t.text ? [null, t.text] : ready || !t.needs ? tileState(t.id) : ["locked", hasVehicle ? "Erst verbinden" : "Erst Fahrzeug anlegen"];
    const el = $("start-tiles").children[i];
    el.classList.toggle("hot", t.id === "faults" && tone === "crit");
    el.querySelector(".tile-s").replaceChildren(...[tone ? mark(tone) : null, h("span", {}, text)].filter(Boolean));
  });
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
