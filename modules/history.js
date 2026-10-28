/* Verlauf: jede Diagnose bleibt mit Datum, Fahrzeug, Zahl der Steuergeräte und Fehlercodes auf diesem Gerät,
   nach Monaten gruppiert. Gespeichert wird nur die maskierte FIN, nichts verlässt den Rechner. */
import { $, h, mark, chev, clockFull, storageGet, storageSet } from "./dom.js";
import { state, on, emit, faultSet } from "./state.js";
import { befundSummary } from "./befund.js";
import { openPane, back } from "./shell.js";

const KEY = "kfzdiag-verlauf";
const MAX = 200;
const load = () => storageGet(KEY, []);
export const historyCount = () => load().length;
export const historyFor = (fahrzeugId) => load().filter((e) => e.fahrzeugId === fahrzeugId);
let sessionId = null;

/* Stand dieser Sitzung speichern (ersetzt den eigenen Eintrag, legt beim ersten Mal einen neuen an). */
export function saveSession() {
  if (!state.status) return;
  sessionId = sessionId || new Date().toISOString();
  const fz = state.fahrzeug;
  const faults = [...faultSet().values()].map((f) => ({ code: f.code, wo: f.wo, art: f.art, text: f.beschreibung || "" }));
  const entry = {
    id: sessionId, at: sessionId, fahrzeugId: fz ? fz.id : null, kennzeichen: fz ? fz.kennzeichen : "", km: state.sitzung.km ?? (fz ? fz.km : null), kmErfasst: state.sitzung.km != null,
    vorher: befundSummary(state.snapshot), nachher: befundSummary(state.postscan),
    fahrzeug: fz ? [fz.marke, fz.modell].filter(Boolean).join(" ") : state.status.fahrzeug || "Fahrzeug",
    marke: fz ? "" : state.vehicle && state.vehicle.marke !== "unbekannt" ? state.vehicle.marke : "",
    fin: (state.vehicle && state.vehicle.vin_maskiert) || "", simuliert: Boolean(state.status.simuliert),
    systeme: state.scanned ? state.ecus.length : null, fehler: faults,
  };
  storageSet(KEY, [entry, ...load().filter((e) => e.id !== sessionId)].slice(0, MAX));
  emit("history");
}

const monthKey = (iso) => iso.slice(0, 7);
const monthName = (key) => new Date(`${key}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

function summary(e) {
  const n = e.fehler.length;
  return [e.systeme != null ? `${e.systeme} Steuergeräte` : "ohne Vollscan", n ? `${n} Fehlercode${n === 1 ? "" : "s"}` : "keine Fehler"].join(" · ");
}

const befundBox = (title, b) => h("div", { class: "box" }, h("h3", {}, `${title} · ${clockFull(new Date(b.at))}`),
  h("span", {}, `${b.fehler} Fehler${b.steuergeraete != null ? `, ${b.steuergeraete} Steuergeräte` : ""}${b.km != null ? `, ${b.km.toLocaleString("de-DE")} km` : ""}`),
  b.codes.length ? h("span", { class: "sm mono" }, b.codes.join(", ")) : null);

function openEntry(e) {
  let confirm = false;
  const del = h("button", { class: "btn dng", type: "button", onclick: () => {
    if (!confirm) { confirm = true; del.textContent = "Wirklich löschen? Noch einmal tippen"; return; }
    storageSet(KEY, load().filter((x) => x.id !== e.id));
    emit("history");
    back();
  } }, "Eintrag löschen");
  openPane([
    h("p", { class: "eyebrow" }, `Diagnose vom ${clockFull(new Date(e.at))}`), h("h2", {}, e.fahrzeug),
    h("dl", { class: "facts" }, e.kennzeichen ? [h("dt", {}, "Kennzeichen"), h("dd", {}, e.kennzeichen)] : null, e.km != null ? [h("dt", {}, "Kilometerstand"), h("dd", {}, `${e.km.toLocaleString("de-DE")} km`)] : null, h("dt", {}, "FIN"), h("dd", { class: "mono" }, e.fin || "nicht gelesen"), h("dt", {}, "Steuergeräte"), h("dd", {}, e.systeme != null ? String(e.systeme) : "kein Vollscan"),
      h("dt", {}, "Quelle"), h("dd", {}, e.simuliert ? "Simulator" : "Fahrzeug")),
    e.vorher ? h("div", { class: "befund-pair" },
      befundBox("Eingangsbefund", e.vorher), e.nachher ? befundBox("Ausgangsbefund", e.nachher) : h("div", { class: "box" }, h("h3", {}, "Ausgangsbefund"), "kein Nachher-Scan")) : null,
    h("h3", {}, e.fehler.length ? `${e.fehler.length} Fehlercodes` : "Keine Fehler gespeichert"),
    e.fehler.length ? h("div", { class: "list" }, ...e.fehler.map((f) => h("div", { class: "tap row static" }, mark(f.art === "gespeichert" ? "crit" : "warn"),
      h("span", {}, h("span", { class: "t mono" }, f.code), h("span", { class: "d" }, [f.wo, f.text].filter(Boolean).join(" · "))), h("span", { class: "sm" }, f.art), h("span")))) : null,
    del,
  ], `verlauf:${e.id}`);
}

export function renderHistory() {
  const list = load();
  $("history-count").textContent = list.length ? `${list.length} ${list.length === 1 ? "Eintrag" : "Einträge"}, nur auf diesem Gerät` : "";
  if (!list.length) {
    $("history").replaceChildren(h("p", { class: "empty" }, "Noch keine Diagnose gespeichert. Nach dem Verbinden legt das Programm hier automatisch einen Eintrag an."));
    return;
  }
  const groups = new Map();
  for (const e of list) groups.set(monthKey(e.at), [...(groups.get(monthKey(e.at)) || []), e]);
  $("history").replaceChildren(...[...groups].map(([key, entries]) => h("section", { class: "hist-month" },
    h("h3", { class: "hist-h" }, monthName(key), h("span", { class: "sm" }, ` (${entries.length})`)),
    h("div", { class: "list" }, ...entries.map((e) => h("button", { class: "tap row", type: "button", onclick: () => openEntry(e) },
      mark(e.fehler.some((f) => f.art === "gespeichert") ? "crit" : e.fehler.length ? "warn" : "ok"),
      h("span", {}, h("span", { class: "t" }, [e.kennzeichen, [e.marke, e.fahrzeug].filter(Boolean).join(" ")].filter(Boolean).join(" · ")), h("span", { class: "d" }, `${e.fin ? `FIN ${e.fin} · ` : ""}${summary(e)}`)),
      h("span", { class: "sm mono" }, clockFull(new Date(e.at))), chev()))))));
}

export function openHistoryEntry(id) { const e = load().find((x) => x.id === id); if (e) openEntry(e); }

export function initHistory() {
  on("tab", (id) => { if (id === "history") renderHistory(); });
  on("history", () => { if (!$("view-history").hidden) renderHistory(); });
  on("connected", saveSession);
  on("saved-state", saveSession);
  on("fahrzeug-aktiv", () => { sessionId = null; });
}
