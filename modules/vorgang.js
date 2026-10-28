/* Vorgänge: Alles, was wartet (Verbinden, Vollscan, KI, Lesen, Schreiben), meldet hier seinen Stand.
   Läuft, fertig, gescheitert oder abgebrochen: es gibt immer eine Anzeige und einen Ausweg, nie einen stillen Hänger. */
import { $, h, mark, icon } from "./dom.js";

/* Vorschläge je Fehlerart, nummeriert angezeigt. */
export const HILFE = {
  server: [
    "Prüfe, ob das Programm kfzdiag web auf diesem Rechner läuft.",
    "Lade die Seite neu, wenn das Programm gerade neu gestartet wurde.",
    "Läuft das Programm auf einem anderen Rechner, öffne dort die Adresse aus dem Startfenster.",
  ],
  adapter: [
    "Steckt der Adapter fest in der OBD-Buchse (meist unter dem Lenkrad)?",
    "Ist die Zündung an? Viele Steuergeräte antworten erst mit Zündung.",
    "Leuchtet die Lampe am Adapter? Wenn nicht: abziehen, 5 Sekunden warten, neu stecken.",
    "Ist der Adapter noch mit einem anderen Gerät gekoppelt, dort zuerst trennen.",
  ],
  bluetooth: [
    "Adapter in die OBD-Buchse stecken und die Zündung einschalten, dann blinkt oder leuchtet er.",
    "Den Adapter nicht in den Bluetooth-Einstellungen des Geräts koppeln: CANdor verbindet ihn selbst.",
    "Im Auswahlfenster den Adapter wählen (oft „vLinker“, „OBDII“, „IOS-Vlink“ oder „OBDLink“).",
    "Ist eine andere App mit dem Adapter verbunden, diese schließen. Ein Adapter spricht nur mit einem Gerät.",
  ],
  lesen: [
    "Zündung an lassen und den Motor nicht starten oder abstellen, solange gelesen wird.",
    "Batteriespannung prüfen. Unter 12 V brechen manche Steuergeräte die Antwort ab.",
    "Noch einmal versuchen. Einzelne Steuergeräte antworten beim ersten Mal zu langsam.",
  ],
  ki: [
    "Prüfe die Internetverbindung des Rechners.",
    "Ist ein KI-Zugang eingerichtet? Ohne Zugang bleibt die Diagnose vollständig nutzbar, nur ohne Bewertung.",
    "Später noch einmal versuchen.",
  ],
  schreiben: [
    "Nichts abziehen und die Zündung an lassen.",
    "Fehlerspeicher neu lesen, um zu sehen, was im Auto angekommen ist.",
    "Bleibt der Fehler, das Steuergerät einzeln über Steuergeräte öffnen und erneut versuchen.",
  ],
};

/* Zeitlimit für jedes Warten: ohne Antwort gibt es nach ms eine klare Meldung statt eines endlosen Kreisels. */
export function withTimeout(promise, ms, meldung) {
  let timer = null;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(meldung || `Keine Antwort nach ${Math.round(ms / 1000)} Sekunden.`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/* ---------- Laufende Vorgänge in der Statusleiste ---------- */
const running = new Map();
let seq = 0;
function renderChip() {
  const chip = $("task-chip");
  if (!chip) return;
  const list = [...running.values()];
  chip.hidden = !list.length;
  if (!list.length) return;
  chip.replaceChildren(...[mark("running"), h("span", { class: "l" }, list[list.length - 1]), list.length > 1 ? h("span", { class: "v" }, `+${list.length - 1}`) : null].filter(Boolean));
}
export function busy(label) {
  const id = ++seq;
  running.set(id, label);
  renderChip();
  return () => { running.delete(id); renderChip(); };
}

/* ---------- Meldungsfenster ---------- */
const dlg = () => $("vorgang");
function show(...children) {
  $("vorgang-body").replaceChildren(...children.flat().filter(Boolean));
  if (!dlg().open) dlg().showModal();
}
export function closeVorgang() { if (dlg().open) dlg().close(); }

/* Gescheitert: was passiert ist, was jetzt im Auto steht, nummerierte Vorschläge, Erneut versuchen oder Schließen. */
export function showFailure({ titel, meldung, hilfe = [], retry = null, retryLabel = "Erneut versuchen", extra = null }) {
  const again = retry ? h("button", { class: "btn pri", type: "button", onclick: () => { closeVorgang(); retry(); } }, icon("reset"), retryLabel) : null;
  show(
    h("div", { class: "dlg-body" },
      h("div", { class: "vg-head t-crit" }, mark("crit"), h("h2", { class: "h2" }, titel)),
      meldung ? h("p", { class: "p" }, meldung) : null,
      hilfe.length ? h("div", { class: "vg-help" }, h("p", { class: "eyebrow" }, "Das kannst du tun"), h("ol", {}, ...hilfe.map((t) => h("li", {}, t)))) : null),
    h("div", { class: "dlg-foot" }, extra || h("span"), h("div", { class: "vg-actions" }, h("button", { class: "btn sec", type: "button", onclick: closeVorgang }, "Schließen"), again)));
  (again || $("vorgang-body").querySelector(".btn")).focus();
}

/* Mehrere Schritte mit Stand je Schritt, für Abläufe, bei denen der Nutzer warten muss (etwa Schreiben). */
export function vorgang({ titel, schritte, hinweis = null, abbrechen = null }) {
  const done = busy(titel);
  const states = schritte.map(() => "pending");
  const details = schritte.map(() => "");
  let cancelled = false;
  const draw = () => show(
    h("div", { class: "dlg-body" },
      h("div", { class: "vg-head t-running" }, mark("running"), h("h2", { class: "h2" }, titel)),
      hinweis ? h("p", { class: "p" }, hinweis) : null,
      h("ol", { class: "steps-st", "aria-live": "polite" }, ...schritte.map((s, i) => h("li", { class: `st ${states[i]}` }, mark(states[i]), h("span", {}, h("span", { class: "t" }, s), details[i] ? h("span", { class: "d" }, details[i]) : null))))),
    abbrechen ? h("div", { class: "dlg-foot" }, h("span"), h("button", { class: "btn sec", type: "button", onclick: () => { cancelled = true; abbrechen(); done(); closeVorgang(); } }, "Abbrechen")) : null);
  draw();
  return {
    get cancelled() { return cancelled; },
    step(i, detail = "") { for (let k = 0; k < i; k++) if (states[k] !== "crit") states[k] = "ok"; states[i] = "running"; details[i] = detail; if (!cancelled) draw(); },
    finish() { done(); states.fill("ok"); if (!cancelled) { draw(); setTimeout(closeVorgang, 700); } },
    fail(info) { done(); if (!cancelled) showFailure(info); },
  };
}

export function initVorgang() {
  dlg().addEventListener("cancel", (ev) => { if (running.size && !$("vorgang-body").querySelector(".vg-head.t-crit")) ev.preventDefault(); });
}
