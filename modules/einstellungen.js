/* Einstellungen, oben über das Zahnrad erreichbar: KI und API-Schlüssel, Werkstatt, Anzeige, Verbindung, Daten.
   Der API-Schlüssel geht einmal an den Diagnose-Server und kommt nie zurück, die Seite zeigt nur »sk-ant-…abcd«.
   Anbieter: Aus, Claude, Ollama, OpenAI-kompatibel (DeepSeek, OpenAI, Mistral, LM Studio: Adresse, Modell, Schlüssel). */
import { $, h, icon, mark, toast, storageGet } from "./dom.js";
import { state, on, emit, logEvent } from "./state.js";
import { werkhofSektion } from "./werkhof.js";
import { zurueckZeile, kopfkarte, gruppe, formBlock } from "./bausteine.js";

const ANBIETER = [["aus", "Aus"], ["anthropic", "Claude (Anthropic)"], ["ollama", "Ollama, lokal"], ["openai_kompatibel", "OpenAI-kompatibel"]];
const hostVon = (u) => { try { return new URL(u).host; } catch { return u || "?"; } };
let data = null, choice = null, errors = {}, busy = false, testResult = null;

const isServer = () => state.src && state.src.mode === "server";

async function load() {
  if (!isServer()) { data = null; render(); return; }
  try { data = await state.src.settings(); choice = null; } catch (err) { data = { ok: false, meldung: `Einstellungen nicht lesbar: ${err.message}` }; }
  render();
}

/* Abschnitt als Gruppe: graue Überschrift, Karte mit dem Formular, der Untertitel steht als Fußnote darunter. */
function section(title, ic, sub, ...body) {
  return gruppe({ titel: title, id: `set-${ic}`, zeilen: [formBlock(...body)], fuss: sub });
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
      budgetFeld(),
      h("p", { class: "sm" }, "Den Schlüssel erstellst du in der Console von Anthropic unter »API Keys«. Er wird nur auf diesem Rechner in der Datei ki.key gespeichert (nur für dich lesbar) und nie an den Browser zurückgegeben. Die KI bekommt Messwerte und Fehlercodes, nie die FIN. Mit Kundendaten nur mit Auftragsverarbeitungsvertrag."),
      key.quelle === "datei" ? h("button", { class: "btn qt small", type: "button", onclick: () => save({ schluessel_loeschen: true }) }, icon("delete"), "Gespeicherten Schlüssel entfernen") : null);
  } else if (sel === "ollama") {
    parts.push(h("div", { class: "fgrid" },
      h("div", { class: `fld${errors.modell ? " bad" : ""}` }, h("label", { for: "set-omodell" }, "Modell in Ollama"), h("input", { class: "inp mono", id: "set-omodell", value: ki.anbieter === "ollama" ? ki.modell || "" : "qwen3:8b", spellcheck: "false" }), fieldErr("modell")),
      h("div", { class: `fld${errors.ollama_url ? " bad" : ""}` }, h("label", { for: "set-ourl" }, "Adresse"), h("input", { class: "inp mono", id: "set-ourl", value: ki.ollama_url || "http://127.0.0.1:11434", spellcheck: "false" }), fieldErr("ollama_url"))),
      h("p", { class: "sm" }, "Ollama läuft auf diesem Rechner oder im eigenen Netz. Nichts verlässt das Netz. Modell vorher mit »ollama pull qwen3:8b« laden."));
  } else if (sel === "openai_kompatibel") {
    parts.push(...offenFelder(ki));
  } else parts.push(h("p", { class: "sm" }, "Ohne KI funktionieren alle Diagnosefunktionen, nur Assistent und KI-Bewertung bleiben aus."));
  parts.push(
    testResult ? h("div", { class: `set-result t-${testResult.ok ? "ok" : "crit"}`, role: "status" }, mark(testResult.ok ? "ok" : "crit"), testResult.meldung) : null,
    h("div", { class: "form-actions" },
      h("button", { class: "btn pri", type: "button", disabled: busy || null, onclick: () => save() }, icon("tick"), busy ? "Speichere …" : "Speichern"),
      sel !== "aus" ? h("button", { class: "btn sec", type: "button", disabled: busy || null, onclick: test }, icon("gateway"), "Verbindung testen") : null),
    h("p", { class: "sm" }, data.quelle === "umgebung" ? "Gerade gilt die Einstellung aus den Umgebungsvariablen beim Start. Speichern hier hat Vorrang." : "Gespeichert in einstellungen.json neben der Datenbank."));
  const modelName = (data.modelle.find((m) => m.id === ki.modell) || { name: ki.modell }).name;
  const aktiv = ki.anbieter === "aus" || !ki.anbieter ? "keine KI" : ki.anbieter === "anthropic" ? modelName : ki.anbieter === "ollama" ? `Ollama, ${ki.modell}` : `${ki.modell} über ${hostVon(ki.basis_url)}`;
  return section("KI und API-Schlüssel", "robot", `Aktiv: ${aktiv}`, ...parts);
}

/* OpenAI-kompatibel: Voreinstellung antippen füllt Adresse und Modell, der Schlüssel ist optional (lokale Server). */
function offenFelder(ki) {
  const offen = ki.anbieter === "openai_kompatibel", key = ki.schluessel_offen || {};
  const waehlen = (v) => { $("set-burl").value = v.basis_url; if (v.modell) $("set-bmodell").value = v.modell; $(v.modell ? "set-bkey" : "set-bmodell").focus(); };
  const chips = h("div", { class: "ki-chips", role: "group", "aria-label": "Voreinstellungen" }, ...(data.voreinstellungen || []).map((v) =>
    h("button", { class: "ki-chip", type: "button", "aria-pressed": String(offen && ki.basis_url === v.basis_url), onclick: () => waehlen(v) }, h("b", {}, v.name), h("span", {}, v.hinweis))));
  const feld = (k, id, label, attrs) => h("div", { class: `fld${errors[k] ? " bad" : ""}` }, h("label", { for: id }, label),
    h("input", { class: "inp mono", id, spellcheck: "false", "aria-invalid": errors[k] ? "true" : null, ...attrs }), fieldErr(k));
  return [
    h("div", { class: "blk" }, h("p", { class: "eyebrow" }, "Voreinstellung antippen"), chips),
    h("div", { class: "fgrid set-grid" },
      feld("basis_url", "set-burl", "Adresse", { type: "url", value: offen ? ki.basis_url || "" : "", placeholder: "https://api.deepseek.com/v1" }),
      feld("modell", "set-bmodell", "Modell", { value: offen ? ki.modell || "" : "", placeholder: "deepseek-chat" }),
      h("div", { class: `fld${errors.schluessel ? " bad" : ""}` }, h("label", { for: "set-bkey" }, "Schlüssel"),
        h("input", { class: "inp mono", id: "set-bkey", type: "password", autocomplete: "off", spellcheck: "false", placeholder: key.gesetzt ? "leer = gespeicherten behalten" : "optional bei lokalen Servern", "aria-invalid": errors.schluessel ? "true" : null, "aria-describedby": "set-bkey-state" }),
        errors.schluessel ? fieldErr("schluessel") : h("span", { class: "fld-hint", id: "set-bkey-state" }, key.gesetzt ? `Gespeichert: ${key.maske}` : "Noch kein Schlüssel gespeichert."))),
    budgetFeld(),
    h("p", { class: "sm" }, "Der Schlüssel liegt nur auf diesem Rechner. Du akzeptierst die Bedingungen deines Anbieters selbst. Kennzeichen und FIN werden vor dem Senden entfernt. Websuche und PDF-Anhänge gibt es nur mit Claude."),
    key.gesetzt ? h("button", { class: "btn qt small", type: "button", onclick: () => save({ schluessel_loeschen: true }) }, icon("delete"), "Gespeicherten Schlüssel entfernen") : null,
  ];
}

/* Tagesbudget des Diagnose-Agenten: Grenze und Verbrauch heute (im Server gezählt, Neustart setzt den Zähler zurück) */
const tausender = (n) => Number(n || 0).toLocaleString("de-DE");
function budgetFeld() {
  const b = data.budget || {};
  return h("div", { class: `fld${errors.budget_tokens ? " bad" : ""}` }, h("label", { for: "set-budget" }, "Tagesbudget des Agenten (Token)"),
    h("input", { class: "inp mono", id: "set-budget", type: "number", inputmode: "numeric", min: 100000, max: 20000000, step: 100000, value: b.grenze || 1000000, "aria-describedby": "set-budget-hint" }),
    errors.budget_tokens ? fieldErr("budget_tokens") : h("span", { class: "fld-hint", id: "set-budget-hint" }, `Heute verbraucht: ${tausender(b.verbraucht)} von ${tausender(b.grenze)} Token. Ist es aufgebraucht, liest der Agent erst morgen wieder.`));
}

function body(extra = {}) {
  const sel = choice || data.ki.anbieter || "aus";
  if (sel === "anthropic") {
    const budget = Number.parseInt($("set-budget").value, 10);
    return { anbieter: sel, modell: $("set-modell").value, schluessel: $("set-key").value.trim() || undefined, budget_tokens: Number.isFinite(budget) ? budget : undefined, ...extra };
  }
  if (sel === "ollama") return { anbieter: sel, modell: $("set-omodell").value.trim(), ollama_url: $("set-ourl").value.trim(), ...extra };
  if (sel === "openai_kompatibel") {
    const budget = Number.parseInt($("set-budget").value, 10);
    return { anbieter: sel, basis_url: $("set-burl").value.trim(), modell: $("set-bmodell").value.trim(), schluessel: $("set-bkey").value.trim() || undefined, budget_tokens: Number.isFinite(budget) ? budget : undefined, ...extra };
  }
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


function render() {
  const box = $("einstellungen");
  if (!box || $("view-einstellungen").hidden) return;
  const st = state.status || {}, w = state.werkstatt;
  /* Werkhof-Abschnitt kommt nach, sobald der Stand vom Server da ist. */
  werkhofSektion(render).then((el) => { const alt = $("werkhof-einrichten"); if (alt) alt.replaceWith(el); else { const ki = $("set-robot"); if (ki) ki.after(el); else box.append(el); } });
  box.replaceChildren(
    zurueckZeile(),
    kopfkarte({ bild: "ki", titel: "KI und Dienste", text: "KI-Anbieter und Schlüssel, die Anbindung an Werkhof und die Verbindung des Diagnose-Servers. Schlüssel bleiben auf dem Server und kommen nie in den Browser." }),
    kiSection(),
    section("Verbindung", "plug", "Kommt aus dem Start des Diagnose-Servers; ändern über die Umgebungsvariablen, siehe Handbuch.",
      h("dl", { class: "facts" }, ...[["Quelle", isServer() ? (st.simuliert ? "Diagnose-Server mit Simulator" : "Diagnose-Server mit Adapter") : "Vorschau mit Beispieldaten"],
        ["Profil", st.fahrzeug], ["Version", st.version === "intern" ? "intern" : st.version ? "Markt" : null], ["Schreiben", st.schreiben_an == null ? null : st.schreiben_an ? "an, nur mit Freigabe" : "aus"]]
        .filter(([, v]) => v).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))));
}

export function initEinstellungen() {
  on("tab", (id) => { if (id === "einstellungen") { testResult = null; errors = {}; load(); } });
  on("werkstatt", render);
}
