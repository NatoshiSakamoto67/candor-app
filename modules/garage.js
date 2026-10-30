/* Fahrzeuge wie in der Werkstatt-Software: zuerst das Fahrzeug anlegen oder wählen, dann verbinden.
   Der Bestand bleibt auf diesem Gerät (localStorage); das zuletzt gewählte Fahrzeug ist nach dem Neustart wieder aktiv.
   Seiten: »fahrzeuge« (Liste mit Suche und Sortierung), »fahrzeug« (Formular, Unterseite = id zum Bearbeiten). */
import { $, h, icon, mark, chev, clockFull, storageGet, storageSet, toast } from "./dom.js";
import { zurueckZeile, kopfkarte, gruppe, zeile, aktionsZeile, formBlock } from "./bausteine.js";
import { state, on, emit, logEvent, resetDiagnosis } from "./state.js";
import { go, back, openPane, currentRoute } from "./shell.js";
import { connect } from "./connect.js";
import { fahrzeugAusWerkhof } from "./werkhof.js";
import { kundenfassung } from "./mandant.js";
import { nutzungJetzt } from "./werkstatt.js";
import { schritt } from "../kern/erststart.js";
import { historyFor } from "./history.js";
import { formField } from "./formular.js";
import { checkVehicle, upsertVehicle, removeVehicle, touchVehicle, findVehicle, sortVehicles, searchVehicles, vehicleName, finMatches, KRAFTSTOFFE, BAUARTEN, SORTIERUNG } from "./fahrzeuge.js";

const KEY = "kfzdiag-fahrzeuge", ACTIVE = "kfzdiag-fahrzeug-aktiv", SORT = "kfzdiag-fahrzeuge-sort";
const MARKEN = ["Audi", "BMW", "Citroën", "Dacia", "Fiat", "Ford", "Honda", "Hyundai", "Kia", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Renault", "Seat", "Škoda", "Smart", "Suzuki", "Tesla", "Toyota", "Volvo", "VW"];
const RECENT = 4;

let list = (() => { const raw = storageGet(KEY, []); return Array.isArray(raw) ? raw : []; })();
let sortMode = storageGet(SORT, "benutzt");
let query = "";
let draft = null;

function save(next) { list = next; storageSet(KEY, list); state.fahrzeug = findVehicle(list, storageGet(ACTIVE, null)); }
export const vehicles = () => list;
const fuelName = (id) => (KRAFTSTOFFE.find(([k]) => k === id) || [, ""])[1];
const kmText = (km) => (km != null ? `${km.toLocaleString("de-DE")} km` : "");
export const vehicleFacts = (v) => [v.baujahr, fuelName(v.kraftstoff), v.motor, kmText(v.km)].filter(Boolean).join(" · ");

/* Kennzeichen als Schild mit Euro-Streifen; ohne Kennzeichen steht die maskierte FIN da. */
export function plate(v, small = false) {
  if (!v.kennzeichen) return h("span", { class: `plate fin${small ? " sm" : ""}` }, v.fin || "ohne Kennzeichen");
  return h("span", { class: `plate${small ? " sm" : ""}`, "aria-label": `Kennzeichen ${v.kennzeichen}` }, h("span", { class: "plate-eu", "aria-hidden": "true" }, "D"), h("span", { class: "plate-t" }, v.kennzeichen));
}

/* Fahrzeug wählen: neue Sitzung, alter Fehlerspeicher fliegt aus der Anzeige, auf Wunsch gleich verbinden. */
export function selectVehicle(id, { verbinden = true } = {}) {
  const changed = storageGet(ACTIVE, null) !== id;
  storageSet(ACTIVE, id);
  save(touchVehicle(list, id));
  if (changed) { resetDiagnosis(); logEvent(`Fahrzeug gewählt: ${vehicleName(state.fahrzeug)}`); }
  emit("fahrzeug-aktiv", state.fahrzeug);
  if (verbinden) connect(); else go("start");
}

function lastDiagnosis(v) {
  const [last] = historyFor(v.id);
  if (!last) return "noch keine Diagnose";
  const n = last.fehler.length;
  return `letzte Diagnose ${clockFull(new Date(last.at))}, ${n ? `${n} Fehlercode${n === 1 ? "" : "s"}` : "ohne Fehler"}`;
}

/* Kilometerstand der Sitzung am Fahrzeug merken. Kleiner nur nach Bestätigung (Tacho getauscht). */
export function setVehicleKm(id, km) {
  const v = findVehicle(list, id);
  if (v) save(upsertVehicle(list, { ...v, km }, new Date(), id));
}

/* ---------- Liste ---------- */
function renderList() {
  const box = $("garage");
  const active = state.fahrzeug && state.fahrzeug.id;
  const anzahl = list.length ? `${list.length} Fahrzeug${list.length === 1 ? "" : "e"}, nur auf diesem Gerät.` : "Noch kein Fahrzeug angelegt.";
  $("garage-kopf").replaceChildren(zurueckZeile(), kopfkarte({ bild: "auto", titel: "Fahrzeuge", text: `Jede Diagnose gehört zu einem Fahrzeug. ${anzahl}` }));
  $("garage-sort").replaceChildren(...SORTIERUNG.map(([id, label]) => h("button", { type: "button", "aria-pressed": String(sortMode === id), onclick: () => { sortMode = id; storageSet(SORT, id); renderList(); } }, label)));
  if (!list.length) {
    box.replaceChildren(gruppe({ zeilen: [
      { icon3d: "garage", label: "Noch kein Fahrzeug angelegt", unter: "Lege das erste Fahrzeug an. Danach findest du es hier mit allen Diagnosen wieder." },
      aktionsZeile("Fahrzeug anlegen", () => go("fahrzeug"))] }));
    return;
  }
  const shown = sortVehicles(searchVehicles(list, query), sortMode);
  if (!shown.length) { box.replaceChildren(gruppe({ zeilen: [{ label: `Kein Fahrzeug passt zu »${query}«.` }] })); return; }
  const stempel = (v) => (sortMode === "angelegt" ? `angelegt ${clockFull(new Date(v.angelegt))}` : `benutzt ${clockFull(new Date(v.benutzt))}`);
  box.replaceChildren(gruppe({ titel: SORTIERUNG.find(([id]) => id === sortMode)[1], klasse: "garage-list", zeilen: shown.map((v) => zeile({
    bild: "auto", info: `fahrzeug:${v.id}`,
    label: [vehicleName(v), v.id === active ? h("span", { class: "cs t-running" }, "aktiv") : null],
    unter: [vehicleFacts(v), lastDiagnosis(v), stempel(v)].filter(Boolean).join(" · "),
    rechts: plate(v, true),
  })) }));
}

/* Detailseite je Fahrzeug: Daten, Diagnosen, Wählen, Bearbeiten, Löschen mit zweitem Tippen. */
export function openVehicle(id) {
  const v = findVehicle(list, id);
  if (!v) { toast("Dieses Fahrzeug gibt es auf diesem Gerät nicht mehr."); go("fahrzeuge", { replace: true }); return; }
  const diag = historyFor(id);
  let confirm = false;
  const del = h("button", { class: "btn dng", type: "button", onclick: () => {
    if (!confirm) { confirm = true; del.textContent = "Wirklich löschen? Noch einmal tippen"; return; }
    save(removeVehicle(list, id));
    if (storageGet(ACTIVE, null) === id) { storageSet(ACTIVE, null); state.fahrzeug = null; resetDiagnosis(); emit("fahrzeug-aktiv", null); }
    toast(`${vehicleName(v)} gelöscht. Die Diagnosen bleiben im Verlauf.`);
    go("fahrzeuge", { replace: true });
  } }, icon("delete"), "Fahrzeug löschen");
  const isActive = state.fahrzeug && state.fahrzeug.id === id;
  openPane([
    h("p", { class: "eyebrow" }, isActive ? "Aktives Fahrzeug" : "Fahrzeug"), h("div", { class: "veh-head" }, plate(v), h("h2", {}, vehicleName(v))),
    h("dl", { class: "facts" }, ...[["Baujahr", v.baujahr], ["Kraftstoff", fuelName(v.kraftstoff)], ["Motor", v.motor], ["Kilometerstand", kmText(v.km)], ["FIN", v.fin], ["HSN / TSN", [v.hsn, v.tsn].filter(Boolean).join(" / ")],
      ["Bauart", (BAUARTEN.find(([k]) => k === v.bauart) || [, ""])[1]], ["Notiz", v.notiz], ["Angelegt", clockFull(new Date(v.angelegt))]].filter(([, x]) => x).flatMap(([k, x]) => [h("dt", {}, k), h("dd", { class: k === "FIN" ? "mono" : null }, String(x))])),
    h("div", { class: "row-actions" },
      h("button", { class: "btn pri", type: "button", onclick: () => selectVehicle(id) }, icon("gateway"), isActive ? "Neu verbinden" : "Wählen und verbinden"),
      isActive ? null : h("button", { class: "btn sec", type: "button", onclick: () => selectVehicle(id, { verbinden: false }) }, "Nur wählen"),
      h("button", { class: "btn sec", type: "button", onclick: () => go("fahrzeug", { sub: id }) }, "Bearbeiten")),
    h("h3", {}, diag.length ? `${diag.length} Diagnose${diag.length === 1 ? "" : "n"}` : "Noch keine Diagnose"),
    diag.length ? h("div", { class: "list" }, ...diag.map((e) => h("button", { class: "tap row", type: "button", "data-info": `verlauf:${e.id}` },
      mark(e.fehler.some((f) => f.art === "gespeichert") ? "crit" : e.fehler.length ? "warn" : "ok"),
      h("span", {}, h("span", { class: "t" }, clockFull(new Date(e.at))), h("span", { class: "d" }, e.fehler.length ? e.fehler.map((f) => f.code).slice(0, 6).join(", ") : "keine Fehler")), h("span"), chev()))) : h("p", { class: "sm" }, "Nach dem Verbinden legt das Programm automatisch einen Eintrag an."),
    del,
  ], `fahrzeug:${id}`);
}

/* ---------- Formular: Anlegen und Bearbeiten ---------- */
const FIELDS = [
  { group: "Fahrzeug", items: [
    { k: "kennzeichen", label: "Kennzeichen", ph: "B-XD 2022", auto: "off", cap: true, hint: "Pflicht, wenn keine FIN eingetragen ist." },
    { k: "marke", label: "Marke", ph: "z. B. Hyundai", list: "marken", req: true },
    { k: "modell", label: "Modell", ph: "z. B. i20", req: true },
    { k: "baujahr", label: "Baujahr", ph: "2022", mode: "numeric", max: 4 },
    { k: "kraftstoff", label: "Kraftstoff", options: [["", "bitte wählen"], ...KRAFTSTOFFE] },
    { k: "motor", label: "Motor oder Motorcode", ph: "1.0 T-GDI, G3LE" },
  ] },
  { group: "Kennung aus dem Fahrzeugschein", note: "Mit FIN, HSN und TSN lassen sich Herstellerdaten genau zuordnen. Alles freiwillig.", items: [
    { k: "fin", label: "FIN (Feld E)", ph: "17 Zeichen", auto: "off", cap: true, max: 17, mono: true },
    { k: "hsn", label: "HSN (Feld 2.1)", ph: "8252", mode: "numeric", max: 4, mono: true },
    { k: "tsn", label: "TSN (Feld 2.2)", ph: "AAX", auto: "off", cap: true, max: 3, mono: true },
  ] },
  { group: "Werkstatt", items: [
    { k: "km", label: "Kilometerstand", ph: "41250", mode: "numeric", suffix: "km" },
    { k: "bauart", label: "Bauart für die Steuergeräte-Grafik", options: BAUARTEN },
    { k: "notiz", label: "Notiz", ph: "z. B. Auftrag, Beanstandung des Kunden", area: true },
  ] },
];
const PREFIX = "fz";
const fid = (k) => `${PREFIX}-${k}`;
const field = (f, values, errors) => formField(f, values, errors, PREFIX);

function readForm() { return Object.fromEntries(FIELDS.flatMap((g) => g.items).map((f) => [f.k, ($(fid(f.k)) || {}).value ?? ""])); }

/* Was der Adapter beim letzten Verbinden erkannt hat, als Vorschlag zum Übernehmen. */
function detected() {
  if (!state.status || !state.vehicle) return null;
  const marke = state.vehicle.marke && state.vehicle.marke !== "unbekannt" ? state.vehicle.marke : "";
  const name = state.status.fahrzeug || "";
  const modell = marke && name.startsWith(marke) ? name.slice(marke.length).trim() : name;
  return marke || modell ? { marke, modell, wmi: (state.vehicle.vin_maskiert || "").slice(0, 3), simuliert: Boolean(state.status.simuliert) } : null;
}

function renderForm(errors = {}) {
  const editId = currentRoute().sub;
  const editing = editId ? findVehicle(list, editId) : null;
  if (editId && !editing) { go("fahrzeuge", { replace: true }); return; }
  const values = draft || (editing ? { ...editing } : { bauart: "limousine" });
  const first = !list.length;
  const found = detected();
  const count = Object.keys(errors).length;
  const uebernehmen = () => { draft = { ...readForm(), marke: found.marke || readForm().marke, modell: found.modell || readForm().modell }; renderForm(); };
  const erkennen = () => { draft = readForm(); connect({ ziel: "fahrzeug", ble: Boolean(state.src && state.src.mode === "direkt") }); };
  const ausWerkhof = async () => {
    const r = await fahrzeugAusWerkhof(readForm().kennzeichen);
    if (!r.ok) { toast(r.meldung); return; }
    draft = { ...readForm(), ...Object.fromEntries(Object.entries(r.werte).filter(([, v]) => v)) }; renderForm(); toast("Aus Werkhof übernommen. Bitte prüfen und speichern.");
  };
  const titel = editing ? "Fahrzeug bearbeiten" : first ? "Zuerst das Fahrzeug anlegen" : "Fahrzeug anlegen";
  const zaehler = kundenfassung() ? "" : schritt("fahrzeug", nutzungJetzt());
  const text = first ? `${zaehler ? `${zaehler}. ` : "Willkommen. "}Jede Diagnose gehört zu einem Fahrzeug. Trag das Nötigste ein, den Rest kannst du später ergänzen. Die Daten bleiben auf diesem Gerät.`
    : editing ? "Kennzeichen, FIN und Notiz bleiben auf diesem Gerät und gehen nicht an die KI." : "Marke und Modell, dazu Kennzeichen oder FIN, damit du das Fahrzeug wiederfindest. Alles bleibt auf diesem Gerät.";
  $("garage-form").replaceChildren(...[
    first ? null : zurueckZeile(),
    kopfkarte({ bild: "auto", titel, text }),
    first ? gruppe({ zeilen: [aktionsZeile("Mit Beispielfahrzeug ausprobieren", tryDemo)], fuss: "Legt ein klar gekennzeichnetes Beispiel an und verbindet mit dem Simulator." }) : null,
    editing ? null : gruppe({ titel: "Schneller", zeilen: [
      { icon: "adapter", farbe: "#0A84FF", label: "Mit dem Adapter erkennen", unter: found ? `Erkannt: ${[found.marke, found.modell].filter(Boolean).join(" ")}${found.wmi ? `, Herstellercode ${found.wmi}` : ""}${found.simuliert ? " (Simulator)" : ""}.` : "Adapter einstecken, Zündung an. Das Programm liest Marke und Modell aus und trägt sie ein." },
      found ? aktionsZeile("Erkanntes übernehmen", uebernehmen) : aktionsZeile("Jetzt erkennen", erkennen),
      !kundenfassung() && !(state.src && state.src.mode !== "server") ? aktionsZeile("Aus Werkhof holen", ausWerkhof) : null] }),
    h("form", { class: "sk-block", id: "fz-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); submit(editing, ev.submitter && ev.submitter.dataset.connect === "1"); } },
      h("datalist", { id: "marken" }, ...MARKEN.map((m) => h("option", { value: m }))),
      count ? h("div", { class: "form-sum t-crit", role: "alert" }, mark("crit"), `${count} Angabe${count === 1 ? "" : "n"} fehlen oder passen nicht. Bitte unten prüfen.`) : null,
      ...FIELDS.map((g) => gruppe({ titel: g.group, fuss: g.note, zeilen: [formBlock(h("fieldset", { class: "fgroup" }, h("legend", { class: "sr" }, g.group), h("div", { class: "fgrid" }, ...g.items.map((f) => field(f, values, errors)))))] })),
      h("p", { class: "li-fuss" }, h("span", { "aria-hidden": "true" }, "* "), "Pflichtfeld. Kennzeichen, FIN und Notiz bleiben auf diesem Gerät und gehen nicht an die KI."),
      h("div", { class: "form-actions" },
        h("button", { class: "btn pri", type: "submit", "data-connect": "1" }, icon("gateway"), editing ? "Speichern und verbinden" : "Anlegen und verbinden"),
        h("button", { class: "btn sec", type: "submit", "data-connect": "0" }, editing ? "Speichern" : "Nur anlegen"),
        first ? null : h("button", { class: "btn qt", type: "button", onclick: () => { draft = null; back(); } }, "Abbrechen"))),
  ].filter(Boolean));
  $("fz-form").addEventListener("input", () => { draft = readForm(); });
  const bad = Object.keys(errors)[0];
  if (bad) $(fid(bad)).focus();
}

function submit(editing, andConnect) {
  const { werte, fehler } = checkVehicle(readForm());
  if (Object.keys(fehler).length) { draft = readForm(); renderForm(fehler); return; }
  const next = upsertVehicle(list, werte, new Date(), editing ? editing.id : null);
  const saved = next[0];
  save(next);
  draft = null;
  logEvent(editing ? `Fahrzeug geändert: ${vehicleName(saved)}` : `Fahrzeug angelegt: ${vehicleName(saved)}`);
  toast(editing ? "Gespeichert." : `${vehicleName(saved)} angelegt.`);
  if (editing && !andConnect) { if (state.fahrzeug && state.fahrzeug.id === saved.id) emit("fahrzeug-aktiv", state.fahrzeug); back(); return; }
  selectVehicle(saved.id, { verbinden: andConnect });
}

/* Ausprobieren ohne Tippen: ein klar gekennzeichnetes Beispielfahrzeug, verbunden mit dem Simulator des Servers
   (ohne Server mit den Beispieldaten der Vorschau). Es lässt sich wie jedes andere Fahrzeug löschen. */
const DEMO = { kennzeichen: "SIM 1", marke: "Beispiel", modell: "Simulator-Fahrzeug", baujahr: "2022", kraftstoff: "benzin", motor: "1.0 Turbo", km: "41250", bauart: "kleinwagen", notiz: "Beispielfahrzeug, alle Werte sind synthetisch." };
function tryDemo() {
  const next = upsertVehicle(list, checkVehicle(DEMO).werte, new Date());
  save(next);
  draft = null;
  logEvent("Beispielfahrzeug angelegt");
  selectVehicle(next[0].id);
}

/* Nach dem Verbinden: passt der Herstellercode des Autos zur hinterlegten FIN? */
function checkMatch() {
  const v = state.fahrzeug;
  /* Der Simulator meldet immer denselben Fantasie-Code, dort wäre die Warnung nur Lärm. */
  state.finWarnung = Boolean(v && state.vehicle && !(state.status && state.status.simuliert) && finMatches(v.fin, state.vehicle.vin_maskiert) === false);
  if (state.finWarnung) logEvent(`Achtung: Das verbundene Auto (${state.vehicle.vin_maskiert.slice(0, 3)}) passt nicht zur FIN von ${vehicleName(v)}.`);
}

export function initGarage() {
  save(list);
  $("garage-q").addEventListener("input", (ev) => { query = ev.target.value; renderList(); });
  $("garage-new").addEventListener("click", () => { draft = null; go("fahrzeug"); });
  on("tab", (id) => { if (id === "fahrzeuge") renderList(); if (id === "fahrzeug") renderForm(); });
  on("connected", checkMatch);
  on("open-vehicle", openVehicle);
  on("history", () => { if (!$("view-fahrzeuge").hidden) renderList(); });
  /* Bauart in der Grafik geändert: am Fahrzeug merken. */
  on("bauart", (b) => { if (state.fahrzeug && state.fahrzeug.bauart !== b) save(upsertVehicle(list, { ...state.fahrzeug, bauart: b }, new Date(), state.fahrzeug.id)); });
}
