/* Einstellungen, oben über das Zahnrad erreichbar: KI und API-Schlüssel, Werkstatt, Anzeige, Verbindung, Daten.
   Der API-Schlüssel geht einmal an den Diagnose-Server und kommt nie zurück, die Seite zeigt nur »sk-ant-…abcd«. */
import { $, h, icon, mark, toast, storageGet } from "./dom.js";
import { state, on, emit, logEvent } from "./state.js";
import { go, openDisplaySettings } from "./shell.js";
import { icon3d } from "./icons3d.js";

const ANBIETER = [["aus", "Aus"], ["anthropic", "Claude (Anthropic)"], ["ollama", "Ollama, lokal"]];
let data = null, choice = null, errors = {}, busy = false, testResult = null;

const isServer = () => state.src && state.src.mode === "server";

async function load() {
  if (!isServer()) { data = null; render(); return; }
  try { data = await state.src.settings(); choice = null; } catch (err) { data = { ok: false, meldung: `Einstellungen nicht lesbar: ${err.message}` }; }
  render();
}

function section(title, ic, sub, ...body) {
  return h("section", { class: "card set-sec" }, h("div", { class: "set-head" }, h("span", { class: "set-ic", "aria-hidden": "true" }, icon3d(ic)),
    h("div", {}, h("h2", { class: "h3" }, title), sub ? h("p", { class: "sm" }, sub) : null)), ...body);
}
const fieldErr = (k) => (errors[k] ? h("span", { class: "fld-err", id: `set-${k}-err` }, mark("crit"), errors[k]) : null);

/* KI: Anbieter, Modell, Schlüssel; Speichern und Testen gehen an den Server. */
function kiSection() {
  if (!isServer()) return section("KI und API-Schlüssel", "robot", null,
    h("p", { class: "p" }, "Diese Einstellung braucht den Diagnose-Server (kfzdiag web). In der Vorschau mit Beispieldaten ist sie gesperrt, damit kein Schlüssel im Browser landet."));
  if (!data) return section("KI und API-Schlüssel", "robot", null, h("p", { class: "sm" }, "Lade …"));
  if (!data.ok) return section("KI und API-Schlüssel", "robot", null, h("p", { class: "p" }, data.meldung));
  const ki = data.ki, sel = choice || ki.anbieter || "aus";
  const key = ki.schluessel || {};
  const seg = h("div", { class: "seg", role: "group", "aria-label": "KI-Anbieter" }, ...ANBIETER.map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(sel === id), onclick: () => { choice = id; errors = {}; testResult = null; render(); } }, label)));
  const parts = [h("div", { class: "blk" }, h("p", { class: "eyebrow" }, "Anbieter"), seg)];
  if (sel === "anthropic") {
    parts.push(
      h("div", { class: "fgrid set-grid" },
        h("div", { class: `fld${errors.modell ? " bad" : ""}` }, h("label", { for: "set-modell" }, "Modell"),
          h("select", { class: "inp", id: "set-modell" }, ...data.modelle.map((m) => h("option", { value: m.id, selected: (ki.modell || data.modelle[0].id) === m.id || null }, `${m.name} · ${m.hinweis}`))), fieldErr("modell")),
        h("div", { class: `fld${errors.schluessel ? " bad" : ""}` }, h("label", { for: "set-key" }, "API-Schlüssel"),
          h("input", { class: "inp mono", id: "set-key", type: "password", autocomplete: "off", spellcheck: "false", placeholder: key.gesetzt ? "leer = gespeicherten behalten" : "sk-ant-…", "aria-invalid": errors.schluessel ? "true" : null, "aria-describedby": "set-key-state" }),
          errors.schluessel ? fieldErr("schluessel") : h("span", { class: "fld-hint", id: "set-key-state" }, key.gesetzt ? `Gespeichert: ${key.maske}${key.quelle === "umgebung" ? " (aus der Umgebungsvariable)" : ""}` : "Noch kein Schlüssel gespeichert."))),
      h("p", { class: "sm" }, "Den Schlüssel erstellst du in der Console von Anthropic unter »API Keys«. Er wird nur auf diesem Rechner in der Datei ki.key gespeichert (nur für dich lesbar) und nie an den Browser zurückgegeben. Die KI bekommt Messwerte und Fehlercodes, nie die FIN. Mit Kundendaten nur mit Auftragsverarbeitungsvertrag."),
      key.quelle === "datei" ? h("button", { class: "btn qt small", type: "button", onclick: () => save({ schluessel_loeschen: true }) }, icon("delete"), "Gespeicherten Schlüssel entfernen") : null);
  } else if (sel === "ollama") {
    parts.push(h("div", { class: "fgrid" },
      h("div", { class: `fld${errors.modell ? " bad" : ""}` }, h("label", { for: "set-omodell" }, "Modell in Ollama"), h("input", { class: "inp mono", id: "set-omodell", value: ki.anbieter === "ollama" ? ki.modell || "" : "qwen3:8b", spellcheck: "false" }), fieldErr("modell")),
      h("div", { class: `fld${errors.ollama_url ? " bad" : ""}` }, h("label", { for: "set-ourl" }, "Adresse"), h("input", { class: "inp mono", id: "set-ourl", value: ki.ollama_url || "http://127.0.0.1:11434", spellcheck: "false" }), fieldErr("ollama_url"))),
      h("p", { class: "sm" }, "Ollama läuft auf diesem Rechner oder im eigenen Netz. Nichts verlässt das Netz. Modell vorher mit »ollama pull qwen3:8b« laden."));
  } else parts.push(h("p", { class: "sm" }, "Ohne KI funktionieren alle Diagnosefunktionen, nur Assistent und KI-Bewertung bleiben aus."));
  parts.push(
    testResult ? h("div", { class: `set-result t-${testResult.ok ? "ok" : "crit"}`, role: "status" }, mark(testResult.ok ? "ok" : "crit"), testResult.meldung) : null,
    h("div", { class: "form-actions" },
      h("button", { class: "btn pri", type: "button", disabled: busy || null, onclick: () => save() }, icon("tick"), busy ? "Speichere …" : "Speichern"),
      sel !== "aus" ? h("button", { class: "btn sec", type: "button", disabled: busy || null, onclick: test }, icon("gateway"), "Verbindung testen") : null),
    h("p", { class: "sm" }, data.quelle === "umgebung" ? "Gerade gilt die Einstellung aus den Umgebungsvariablen beim Start. Speichern hier hat Vorrang." : "Gespeichert in einstellungen.json neben der Datenbank."));
  const modelName = (data.modelle.find((m) => m.id === ki.modell) || { name: ki.modell }).name;
  return section("KI und API-Schlüssel", "robot", `Aktiv: ${ki.anbieter === "aus" || !ki.anbieter ? "keine KI" : ki.anbieter === "anthropic" ? modelName : `Ollama, ${ki.modell}`}`, ...parts);
}

function body(extra = {}) {
  const sel = choice || data.ki.anbieter || "aus";
  if (sel === "anthropic") return { anbieter: sel, modell: $("set-modell").value, schluessel: $("set-key").value.trim() || undefined, ...extra };
  if (sel === "ollama") return { anbieter: sel, modell: $("set-omodell").value.trim(), ollama_url: $("set-ourl").value.trim(), ...extra };
  return { anbieter: "aus" };
}

async function save(extra = {}) {
  const payload = { ...body(), ...extra };
  busy = true; render();
  try {
    const r = await state.src.saveKi(payload);
    if (!r.ok) { errors = r.fehler || {}; toast(r.meldung || "Bitte die markierten Angaben prüfen."); return; }
    data = r; choice = null; errors = {}; testResult = null;
    state.status = await state.src.status();
    logEvent(`KI-Einstellung: ${r.ki.anbieter === "aus" ? "aus" : `${r.ki.anbieter} ${r.ki.modell}`}`);
    toast(extra.schluessel_loeschen ? "Schlüssel entfernt." : "Gespeichert.");
    emit("status"); emit("render");
  } catch (err) { toast(`Speichern gescheitert: ${err.message}`); } finally { busy = false; render(); }
}

async function test() {
  busy = true; testResult = null; render();
  try { testResult = await state.src.testKi(); } catch (err) { testResult = { ok: false, meldung: `Test gescheitert: ${err.message}` }; } finally { busy = false; render(); }
}

function linkRow(title, text, ic, onclick) {
  return h("button", { class: "tap row set-link", type: "button", onclick }, h("span", { class: "set-ic sm-ic", "aria-hidden": "true" }, icon3d(ic)),
    h("span", {}, h("span", { class: "t" }, title), h("span", { class: "d" }, text)), h("span"), h("span", { class: "chev", "aria-hidden": "true" }, "›"));
}

function render() {
  const box = $("einstellungen");
  if (!box || $("view-einstellungen").hidden) return;
  const st = state.status || {}, w = state.werkstatt;
  const vehicles = (storageGet("kfzdiag-fahrzeuge", []) || []).length, hist = (storageGet("kfzdiag-verlauf", []) || []).length;
  box.replaceChildren(
    kiSection(),
    h("section", { class: "card set-sec" }, h("div", { class: "list set-list" },
      linkRow("Werkstattdaten", w ? [w.name, w.ort].filter(Boolean).join(", ") : "noch nicht eingetragen", "garage", () => go("werkstatt")),
      linkRow("Anzeige", "Akzentfarbe, Symbolfarben, hell oder dunkel, Kontrast, Dichte", "palette", openDisplaySettings),
      linkRow("Fahrzeuge", `${vehicles} auf diesem Gerät`, "car", () => go("fahrzeuge")),
      linkRow("Verlauf", `${hist} gespeicherte Diagnose${hist === 1 ? "" : "n"}`, "clock", () => go("history")),
      linkRow("Handbuch", "So funktioniert das Programm, mit Installation und Bluetooth", "book", () => go("handbuch")))),
    section("Verbindung", "plug", "Kommt aus dem Start des Diagnose-Servers; ändern über die Umgebungsvariablen, siehe Handbuch.",
      h("dl", { class: "facts" }, ...[["Quelle", isServer() ? (st.simuliert ? "Diagnose-Server mit Simulator" : "Diagnose-Server mit Adapter") : "Vorschau mit Beispieldaten"],
        ["Profil", st.fahrzeug], ["Version", st.version === "intern" ? "intern" : st.version ? "Markt" : null], ["Schreiben", st.schreiben_an == null ? null : st.schreiben_an ? "an, nur mit Freigabe" : "aus"]]
        .filter(([, v]) => v).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))));
}

export function initEinstellungen() {
  on("tab", (id) => { if (id === "einstellungen") { testResult = null; errors = {}; load(); } });
  on("werkstatt", render);
}
