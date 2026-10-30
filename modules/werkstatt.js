/* Erststart und Werkstattangaben. Beim ersten Start fragt CANdor zuerst »Wofür nutzt du CANdor?« (#werkstatt/wahl):
   eigenes Auto führt direkt zum Fahrzeug, Werkstatt zuerst zu den Werkstattangaben. Die Angaben sind nie Pflicht,
   stehen im Briefkopf des Berichts (der Mechaniker an der Unterschrift) und bleiben später über Einstellungen änderbar.
   Nur lokal gespeichert. Welche Seite folgt, entscheidet kern/erststart.js. */
import { $, h, icon, mark, storageGet, storageSet, toast } from "./dom.js";
import { state, emit, on, logEvent } from "./state.js";
import { go, back, currentRoute } from "./shell.js";
import { formField } from "./formular.js";
import { lockup } from "./marke.js";
import { checkWorkshop, hasWorkshopData } from "./befund.js";
import { zurueckZeile, kopfkarte, gruppe, formBlock, listenBild } from "./bausteine.js";
import { FARBE } from "../kern/einstellungs-baum.js";
import { NUTZUNG_KEY, STANDARD_NUTZUNG, nutzungLesen, ersterSchritt, nachWahl, schritt, wahlImErststart, nutzungText } from "../kern/erststart.js";

const KEY = "kfzdiag-werkstatt";
const PREFIX = "ws";
const FIELDS = [
  { k: "name", label: "Name der Werkstatt", ph: "z. B. Autoservice Muster", auto: "organization" },
  { k: "strasse", label: "Straße und Nummer", ph: "Musterstraße 1", auto: "street-address" },
  { k: "plz", label: "PLZ", ph: "10115", mode: "numeric", max: 5, auto: "postal-code" },
  { k: "ort", label: "Ort", ph: "Berlin", auto: "address-level2" },
  { k: "telefon", label: "Telefon", ph: "030 123456", mode: "tel", auto: "tel", hint: "Steht auch in der Pannenhilfe unter »Anrufen«." },
  { k: "email", label: "E-Mail", ph: "info@werkstatt.de", mode: "email", auto: "email" },
  { k: "mechaniker", label: "Mechaniker oder Mechanikerin", ph: "Name für die Unterschrift", hint: "Steht im Bericht an der Unterschrift." },
];
const WAHL = [
  { id: "privat", bild: "auto", label: "Für mein eigenes Auto", unter: "Fehler lesen und verstehen, kurzer Bericht für dich." },
  { id: "werkstatt", bild: "service", label: "In meiner Werkstatt", unter: "Mit Werkstattangaben im Briefkopf und Fassung für die Kundschaft." },
];

/* Ältere Fassungen hatten nur ein freies Feld im Bericht: das wird zum Namen. */
function load() {
  const stored = storageGet(KEY, null);
  if (stored) return stored;
  const old = (storageGet("kfzdiag-bericht", {}) || {}).werkstatt;
  return old ? { name: old } : null;
}
let record = load();
let nutzung = nutzungLesen(storageGet(NUTZUNG_KEY, null));
let gewaehlt = nutzung || STANDARD_NUTZUNG;
export const workshop = () => (hasWorkshopData(record) ? record : null);
export const nutzungJetzt = () => nutzung;
/** Offene Erststart-Seite (»wahl«, »werkstatt«) oder null. */
export const erstSeite = (kunde) => ersterSchritt({ nutzung, werkstattGefragt: Boolean(record), kundenfassung: kunde });

const readForm = () => Object.fromEntries(FIELDS.map((f) => [f.k, ($(`${PREFIX}-${f.k}`) || {}).value ?? ""]));
function persist(next) { record = next; storageSet(KEY, next); state.werkstatt = workshop(); emit("werkstatt", state.werkstatt); }

/* Nach der Einrichtung: beim ersten Start weiter zum Fahrzeug, sonst zurück. */
function done(first) {
  if (!first) { back(); return; }
  go(state.fahrzeug ? "start" : "fahrzeug", { replace: true });
}

/* ---------- Wahl »Wofür nutzt du CANdor?« ---------- */
function wahlZeile(w) {
  const an = gewaehlt === w.id;
  return h("button", { class: "li-row sk-row sk-wahl", type: "button", role: "radio", "aria-checked": String(an), "data-wahl": w.id,
    onclick: () => { gewaehlt = w.id; renderWahl(); $("ws-weiter").focus(); } },
  h("span", { class: "li-ic li-bild", "aria-hidden": "true" }, listenBild(w.bild, 48)),
  h("span", { class: "li-t" }, w.label, h("span", { class: "li-unter" }, w.unter)),
  h("span", { class: "sk-haken", "aria-hidden": "true" }, an ? "✓" : ""));
}
const imErststart = () => wahlImErststart({ nutzung, werkstattGefragt: Boolean(record) });
function weiter() {
  nutzung = gewaehlt;
  storageSet(NUTZUNG_KEY, nutzung);
  const ziel = nachWahl(nutzung);
  if (ziel === "werkstatt" && !record) go("werkstatt");
  else go(state.fahrzeug ? "start" : "fahrzeug", { replace: true });
}
/* Aus den Einstellungen geändert: speichern und zurück. Wer zur Werkstatt wechselt und noch keine Angaben hat,
   landet gleich bei den (freiwilligen) Werkstattangaben, ohne dass der nächste Start sie erzwingt. */
function uebernehmen() {
  const vorher = nutzung;
  nutzung = gewaehlt;
  storageSet(NUTZUNG_KEY, nutzung);
  emit("nutzung", nutzung);
  if (nutzung !== vorher) toast(`Nutzung: ${nutzungText(nutzung)}.`);
  if (nutzung === "werkstatt" && !hasWorkshopData(record)) {
    if (!record) persist({ uebersprungen: true });
    go("werkstatt", { replace: true });
    return;
  }
  back();
}
function renderWahl() {
  const erst = imErststart();
  const kopf = erst
    ? [h("section", { class: "card brand-hero" }, lockup(76, "big"),
      h("h2", { class: "sk-titel", id: "ws-wahl-titel" }, "Wofür nutzt du CANdor?"),
      h("p", { class: "p" }, "Willkommen. Fehler lesen, verstehen und belegt beheben. Je nach Antwort fragt CANdor beim Start nur das, was du brauchst."))]
    : [zurueckZeile(), kopfkarte({ icon: "car", farbe: FARBE.gruen, titel: "Wofür nutzt du CANdor?", id: "ws-wahl-titel",
      text: "Davon hängen der Bericht und die Fragen beim Start ab. Deine Fahrzeuge und Diagnosen bleiben, wie sie sind." })];
  $("werkstatt-form").replaceChildren(...kopf,
    h("section", { class: "sk-block" },
      h("div", { class: "li-gruppe", role: "radiogroup", "aria-labelledby": "ws-wahl-titel" }, ...WAHL.map(wahlZeile)),
      h("p", { class: "li-fuss" }, "Werkstattangaben sind nie Pflicht. Du findest sie später unter Einstellungen."),
      h("div", { class: "form-actions" }, erst
        ? h("button", { class: "btn pri", type: "button", id: "ws-weiter", onclick: weiter }, "Weiter", icon("next"))
        : h("button", { class: "btn pri", type: "button", id: "ws-weiter", onclick: uebernehmen }, icon("tick"), "Übernehmen"))));
  /* Seitentitel: im Erststart »Willkommen« (shell.js), aus den Einstellungen »Nutzung«. */
  if (!erst) { $("page-title").textContent = "Nutzung"; document.title = "Nutzung · CANdor"; }
}

/* ---------- Werkstattangaben ---------- */
function render(errors = {}, values = null) {
  if (currentRoute().sub === "wahl") { gewaehlt = nutzung || STANDARD_NUTZUNG; renderWahl(); return; }
  /* Aus der Pannenhilfe (#werkstatt/telefon): kein Erststart, nach dem Speichern zurück, Telefon gleich im Fokus. */
  const telefon = currentRoute().sub === "telefon";
  const first = !record && !telefon;
  const v = values || workshop() || {};
  const count = Object.keys(errors).length;
  const zaehler = first ? schritt("werkstatt", nutzung) : "";
  /* Beim ersten Start führt Zurück zur Wahl; danach wie die Einstellungs-Unterseiten. */
  const zurueck = first
    ? h("div", { class: "sk-nav" }, h("button", { class: "sk-zurueck", type: "button", "aria-label": "Zurück zur Wahl", onclick: () => go("werkstatt", { sub: "wahl", replace: true }) }, icon("back")))
    : zurueckZeile();
  $("werkstatt-form").replaceChildren(...[
    zurueck,
    kopfkarte({ icon: "werkstatt", farbe: FARBE.blau, titel: first ? "Deine Werkstatt" : "Werkstattangaben",
      text: first ? `${zaehler ? `${zaehler}. ` : ""}Diese Angaben stehen oben im Diagnosebericht. Alles ist freiwillig: Du kannst sie überspringen und später unter Einstellungen nachtragen.`
        : "Stehen im Briefkopf jedes Berichts. Alles ist freiwillig, die Angaben bleiben nur auf diesem Gerät." }),
    h("form", { class: "sk-block", id: "ws-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); submit(first); } },
      count ? h("div", { class: "form-sum t-crit", role: "alert" }, mark("crit"), `${count} Angabe${count === 1 ? "" : "n"} passen nicht.`) : null,
      gruppe({ titel: "Angaben", zeilen: [formBlock(h("div", { class: "fgrid ws-grid" }, ...FIELDS.map((f) => formField(f, v, errors, PREFIX))))],
        fuss: "Alle Felder sind freiwillig. Die Angaben stehen im Briefkopf, der Mechaniker oder die Mechanikerin an der Unterschrift." }),
      h("div", { class: "form-actions" },
        h("button", { class: "btn pri", type: "submit" }, icon("tick"), first ? "Speichern und weiter" : "Speichern"),
        first ? h("button", { class: "btn qt", type: "button", onclick: skip }, "Überspringen") : h("button", { class: "btn qt", type: "button", onclick: back }, "Abbrechen"))),
  ]);
  const bad = Object.keys(errors)[0];
  if (bad) $(`${PREFIX}-${bad}`).focus();
  else if (telefon) $(`${PREFIX}-telefon`).focus();
}

function submit(first) {
  const input = readForm();
  const { werte, fehler } = checkWorkshop(input);
  if (Object.keys(fehler).length) { render(fehler, input); return; }
  /* Leeres Formular beim ersten Start zählt wie Überspringen. */
  if (first && !hasWorkshopData(werte)) { skip(); return; }
  persist(werte);
  logEvent("Werkstattdaten gespeichert");
  toast("Werkstattdaten gespeichert.");
  done(first);
}

/* Überspringen merkt sich nur, dass gefragt wurde; der Bericht zeigt dann keinen Briefkopf. */
function skip() { persist({ uebersprungen: true }); done(true); }

export function initWerkstatt() {
  state.werkstatt = workshop();
  on("tab", (id) => { if (id === "werkstatt") render(); });
}
