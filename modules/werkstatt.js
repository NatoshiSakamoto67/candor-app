/* Werkstattdaten: beim ersten Start abgefragt (überspringbar), später über Anzeige oder Bericht änderbar.
   Sie stehen im Briefkopf des Berichts, der Mechaniker an der Unterschrift. Nur lokal gespeichert. */
import { $, h, icon, mark, storageGet, storageSet, toast } from "./dom.js";
import { state, emit, on, logEvent } from "./state.js";
import { go, back, currentRoute } from "./shell.js";
import { formField } from "./formular.js";
import { lockup } from "./marke.js";
import { checkWorkshop } from "./befund.js";
import { zurueckZeile, kopfkarte, gruppe, formBlock } from "./bausteine.js";
import { FARBE } from "../kern/einstellungs-baum.js";

const KEY = "kfzdiag-werkstatt";
const PREFIX = "ws";
const FIELDS = [
  { k: "name", label: "Name der Werkstatt", ph: "z. B. Kfz Gorski", req: true, auto: "organization" },
  { k: "strasse", label: "Straße und Nummer", ph: "Musterstraße 1", auto: "street-address" },
  { k: "plz", label: "PLZ", ph: "10115", mode: "numeric", max: 5, auto: "postal-code" },
  { k: "ort", label: "Ort", ph: "Berlin", auto: "address-level2" },
  { k: "telefon", label: "Telefon", ph: "030 123456", mode: "tel", auto: "tel" },
  { k: "email", label: "E-Mail", ph: "info@werkstatt.de", mode: "email", auto: "email" },
  { k: "mechaniker", label: "Mechaniker oder Mechanikerin", ph: "Name für die Unterschrift", hint: "Steht im Bericht an der Unterschrift." },
];

/* Ältere Fassungen hatten nur ein freies Feld im Bericht: das wird zum Namen. */
function load() {
  const stored = storageGet(KEY, null);
  if (stored) return stored;
  const old = (storageGet("kfzdiag-bericht", {}) || {}).werkstatt;
  return old ? { name: old } : null;
}
let record = load();
export const workshop = () => (record && record.name ? record : null);
export const setupDone = () => Boolean(record);

const readForm = () => Object.fromEntries(FIELDS.map((f) => [f.k, ($(`${PREFIX}-${f.k}`) || {}).value ?? ""]));
function persist(next) { record = next; storageSet(KEY, next); state.werkstatt = workshop(); emit("werkstatt", state.werkstatt); }

/* Nach der Einrichtung: beim ersten Start weiter zum Fahrzeug, sonst zurück. */
function done(first) {
  if (!first) { back(); return; }
  go(state.fahrzeug ? "start" : "fahrzeug", { replace: true });
}

function render(errors = {}, values = null) {
  const first = !record;
  const v = values || workshop() || {};
  const count = Object.keys(errors).length;
  /* Kopf wie die Einstellungs-Unterseiten; beim ersten Start ohne Zurück, davor steht die Begrüßung mit der Marke. */
  $("werkstatt-form").replaceChildren(...[
    first ? null : zurueckZeile(),
    first ? h("div", { class: "card brand-hero" }, lockup(76, "big"), h("p", { class: "p" }, "Willkommen bei CANdor. Fehler lesen, verstehen und belegt beheben: vom Fahrzeug anlegen bis zum Bericht.")) : null,
    kopfkarte({ icon: "werkstatt", farbe: FARBE.blau, titel: first ? "Deine Werkstatt" : "Werkstattdaten",
      text: first ? "Schritt 1 von 2. Diese Angaben stehen später oben im Diagnosebericht. Du kannst sie überspringen und jederzeit nachtragen. Danach legst du das erste Fahrzeug an."
        : "Stehen im Briefkopf jedes Berichts. Sie bleiben nur auf diesem Gerät." }),
    h("form", { class: "sk-block", id: "ws-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); submit(first); } },
      count ? h("div", { class: "form-sum t-crit", role: "alert" }, mark("crit"), `${count} Angabe${count === 1 ? "" : "n"} fehlen oder passen nicht.`) : null,
      gruppe({ titel: "Angaben", zeilen: [formBlock(h("div", { class: "fgrid ws-grid" }, ...FIELDS.map((f) => formField(f, v, errors, PREFIX))))],
        fuss: "Pflicht ist nur der Name. Die Angaben stehen im Briefkopf, der Mechaniker oder die Mechanikerin an der Unterschrift." }),
      h("div", { class: "form-actions" },
        h("button", { class: "btn pri", type: "submit" }, icon("tick"), first ? "Speichern und weiter" : "Speichern"),
        first ? h("button", { class: "btn qt", type: "button", onclick: skip }, "Überspringen") : h("button", { class: "btn qt", type: "button", onclick: back }, "Abbrechen"))),
  ].filter(Boolean));
  const bad = Object.keys(errors)[0];
  if (bad) $(`${PREFIX}-${bad}`).focus();
}

function submit(first) {
  const input = readForm();
  const { werte, fehler } = checkWorkshop(input);
  if (Object.keys(fehler).length) { render(fehler, input); return; }
  persist(werte);
  logEvent("Werkstattdaten gespeichert");
  toast("Werkstattdaten gespeichert.");
  done(first);
}

/* Überspringen merkt sich nur, dass gefragt wurde; der Bericht zeigt dann »Werkstatt«. */
function skip() { persist({ uebersprungen: true }); done(true); }

export function initWerkstatt() {
  state.werkstatt = workshop();
  on("tab", (id) => { if (id === "werkstatt") render(); });
}
