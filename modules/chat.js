/* KI-Chat wie in modernen Assistenten: Verlauf je Fahrzeug, Eingabe mit Plus (Blatt »Kontext hinzufügen« mit Kamera,
   Fotos, Dateien, Websuche, Agent), Chip mit Modell und Stufe, Diktat, Senden und Stopp, Antwort Wort für Wort, Quellen, Vorschlag mit Freigabe. Die KI führt nichts aus.
   Anhänge gehen nur mit der aktuellen Nachricht an den Server; im Verlauf bleiben nur ihre Namen. */
import { $, h, icon, mark, toast, storageGet, storageSet, clockTime, reducedMotion } from "./dom.js";
import { state, on, emit, faultSet, firstReadiness, logEvent } from "./state.js";
import { startAction } from "./approval.js";
import { go } from "./shell.js";
import { render as markdown } from "./md.js";
import { icon3d } from "./icons3d.js";
import { similar, forAi as caseForAi } from "./faelle.js";
import { verlauf, mitWerkzeug, zumSenden } from "./chatverlauf.js";
import { initPanel, zeichnePanel, schliessePanel } from "./chatpanel.js";
import { vehicleName } from "./fahrzeuge.js";
import { oeffneBlatt } from "./kontextblatt.js";
import { modellChip, kannDiktieren } from "../kern/kontext.js";
import { startVorschlaege } from "../kern/assistent-start.js";

const MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024, MAX_EDGE = 2000, MAX_HISTORY = 60, SEND_HISTORY = 20;
const IMAGE = /^image\//, TEXT = /\.(txt|csv|log|json|md|xml)$/i;
/* Kurze Vorschläge im leeren Chat wie bei Claude: kurzer Text auf dem Knopf, ganze Frage beim Senden.
   Dieselbe Auswahl wie die Karte »Assistent« auf der Startseite (kern/assistent-start.js). */
export function aktuelleVorschlaege() {
  const r = firstReadiness();
  return startVorschlaege({ verbunden: Boolean(state.status), scanned: state.scanned, codes: [...faultSet().values()].map((f) => f.code), readinessGesamt: r ? r.tests.length : null });
}
let files = [], web = storageGet("kfzdiag-websuche", true), running = null;
/* Diagnose-Agent: die KI liest selbst am Auto (nur lesend). Nur mit Server und Claude oder einem OpenAI-kompatiblen Anbieter, Anhänge gehen weiter an den Chat. */
let agentLive = storageGet("kfzdiag-agent-live", false);

/* Verlauf: mehrere Chats (chatverlauf.js); jeder Chat gehört zum Fahrzeug, mit dem er begonnen wurde. */
const chats = verlauf({ get: storageGet, set: storageSet });
const aktivId = () => { const id = chats.aktiv(); return id && chats.holen(id) ? id : null; };
const history = (id = aktivId()) => (id ? chats.holen(id).nachrichten : []);
/* Ohne aktiven Chat legt die erste Nachricht einen an; ein laufende Antwort schreibt in ihren eigenen Chat. */
function saveHistory(list, id = aktivId()) {
  let ziel = id;
  if (!ziel) { const fz = state.fahrzeug; ziel = chats.neu(fz ? { id: fz.id, name: vehicleName(fz) } : null).id; }
  chats.setzeNachrichten(ziel, list.slice(-MAX_HISTORY));
  return ziel;
}
const isServer = () => state.src && state.src.mode === "server";
const AGENT_ANBIETER = new Set(["anthropic", "openai_kompatibel"]);
const agentMoeglich = () => isServer() && state.status && AGENT_ANBIETER.has(state.status.ki);
const agentAn = () => agentLive && agentMoeglich();
function agentSetzen(an) {
  agentLive = an; storageSet("kfzdiag-agent-live", agentLive);
  if (agentLive && !storageGet("kfzdiag-agent-hinweis", false)) { toast("Der Agent liest selbst am Auto. Er kann nichts löschen oder schreiben."); storageSet("kfzdiag-agent-hinweis", true); }
  renderToggles();
}
const werkzeugListe = (zeilen) => h("ul", { class: "cx-tools", "aria-label": "Was der Agent gelesen hat" },
  ...zeilen.map((w) => h("li", { class: w.ok ? "" : "nicht" }, mark(w.ok ? "ok" : "crit"), h("span", {}, h("b", {}, w.titel), w.kurz ? ` ${w.kurz}` : ""))));

/* ---------- Anhänge ---------- */
const toBase64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = () => reject(new Error("Datei nicht lesbar")); r.readAsDataURL(blob); });
/* Jedes Bild wird neu gezeichnet: das verkleinert große Fotos und entfernt immer die Metadaten (EXIF mit GPS-Ort,
   Kamera, Zeit), bevor etwas an die KI geht. Kennzeichen im Bild erkennt das nicht, dafür steht der Hinweis am Chat. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Dieses Bildformat kann der Browser nicht lesen. Bitte als JPEG oder PNG."); });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht vorbereitet werden"))), "image/jpeg", .86));
}
async function addFiles(list) {
  for (const file of [...list]) {
    if (files.length >= MAX_FILES) { toast(`Höchstens ${MAX_FILES} Anhänge je Nachricht.`); break; }
    const art = IMAGE.test(file.type) ? "bild" : file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : file.type.startsWith("text/") || TEXT.test(file.name) ? "text" : null;
    if (!art) { toast(`${file.name}: Diese Dateiart geht nicht. Bilder, PDF oder Textdateien.`); continue; }
    try {
      const blob = art === "bild" ? await shrink(file) : file;
      if (blob.size > MAX_BYTES) { toast(`${file.name}: größer als 10 MB.`); continue; }
      files = [...files, { name: file.name, art, daten: await toBase64(blob), vorschau: art === "bild" ? URL.createObjectURL(blob) : null, groesse: blob.size }];
    } catch (err) { toast(`${file.name}: ${err.message}`); }
  }
  renderChips();
}
function removeFile(i) { const f = files[i]; if (f.vorschau) URL.revokeObjectURL(f.vorschau); files = files.filter((_, j) => j !== i); renderChips(); }
const sizeText = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function renderChips() {
  $("cx-chips").hidden = !files.length;
  $("cx-chips").replaceChildren(...files.map((f, i) => h("span", { class: `cx-chip a-${f.art}` },
    f.vorschau ? h("img", { src: f.vorschau, alt: "", width: 40, height: 40 }) : h("span", { class: "cx-chip-ic", "aria-hidden": "true" }, f.art === "pdf" ? "PDF" : "TXT"),
    h("span", { class: "cx-chip-t" }, h("b", {}, f.name), h("small", {}, sizeText(f.groesse))),
    h("button", { class: "cx-x", type: "button", "aria-label": `${f.name} entfernen`, onclick: () => removeFile(i) }, icon("close")))));
  updateSend();
}

/* ---------- Diktat über die Spracherkennung des Browsers, erst nach Zustimmung ---------- */
let recog = null;
function dictate() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (recog) { recog.stop(); return; }
  if (!Speech) { toast("Dieser Browser kann nicht diktieren. In Chrome oder Safari geht es."); return; }
  if (!storageGet("kfzdiag-diktat-ok", false)) { askConsent(); return; }
  const input = $("cx-input"), start = input.value;
  recog = new Speech();
  Object.assign(recog, { lang: "de-DE", interimResults: true, continuous: true });
  recog.onresult = (ev) => { const text = [...ev.results].map((r) => r[0].transcript).join(" "); input.value = (start ? `${start} ` : "") + text; grow(); updateSend(); };
  recog.onerror = (ev) => toast(/not-allowed|denied/.test(ev.error) ? "Mikrofon nicht erlaubt. In der Adressleiste freigeben." : "Diktat abgebrochen.");
  recog.onend = () => { recog = null; $("cx-mic").classList.remove("on"); $("cx-mic").setAttribute("aria-pressed", "false"); };
  recog.start();
  $("cx-mic").classList.add("on"); $("cx-mic").setAttribute("aria-pressed", "true");
}
function askConsent() {
  const box = h("div", { class: "cx-consent glass", role: "dialog", "aria-label": "Diktat" },
    h("b", {}, "Diktat über den Browser"),
    h("span", {}, "Die Spracherkennung macht der Browser: Chrome schickt die Sprache an Google, Safari an Apple. Erst danach steht der Text hier. Sag keine Namen oder Kennzeichen von Kunden."),
    h("span", { class: "row-actions" },
      h("button", { class: "btn pri small", type: "button", onclick: () => { storageSet("kfzdiag-diktat-ok", true); box.remove(); dictate(); } }, "Verstanden, diktieren"),
      h("button", { class: "btn qt small", type: "button", onclick: () => box.remove() }, "Abbrechen")));
  $("cx-composer").append(box);
}

/* ---------- Nachrichten ---------- */
const bubbleBody = (text) => h("div", { class: "cx-md" }, ...markdown(text, h));
function sourcesView(list) {
  return h("div", { class: "cx-sources" }, h("span", { class: "eyebrow" }, "Quellen aus dem Internet, unbestätigt"),
    h("div", { class: "cx-src-list" }, ...list.map((q) => { let host = q.url; try { host = new URL(q.url).hostname.replace(/^www\./, ""); } catch (_) { /* bleibt die Adresse */ }
      return h("a", { class: "cx-src", href: q.url, target: "_blank", rel: "noopener noreferrer nofollow", title: q.titel }, h("b", {}, host), h("span", {}, q.titel)); })));
}
function suggestionView(v) {
  const action = v.art === "vollscan" ? null : v.art === "funktion" ? { typ: "funktion", funktion: v.funktion } : v.art === "obd_fehler_loeschen" ? { typ: "obd_fehler_loeschen" } : { typ: "fehler_loeschen", modul: v.modul };
  const blocked = action && !(state.status && state.status.schreiben_an);
  return h("div", { class: "cx-suggest" }, h("span", { class: "eyebrow" }, "Vorschlag der KI, du entscheidest"), h("span", {}, v.begruendung || ""),
    h("button", { class: "btn sec small", type: "button", disabled: blocked || null, title: blocked ? "Schreiben ist ausgeschaltet" : null, onclick: () => (action ? startAction(action) : (go("car"), emit("run-scan"))) },
      v.art === "vollscan" ? "Vollscan starten" : v.art === "funktion" ? `Funktion ${v.funktion} vorbereiten …` : `${v.modul || "OBD"}: Fehler löschen vorbereiten …`));
}
function messageView(m) {
  if (m.rolle === "nutzer") return h("div", { class: "cx-msg me" },
    m.anhaenge && m.anhaenge.length ? h("div", { class: "cx-att" }, ...m.anhaenge.map((a) => h("span", { class: "cx-att-i" }, a.art === "bild" ? "Bild" : a.art === "pdf" ? "PDF" : "Text", " · ", a.name))) : null,
    m.text ? h("div", { class: "cx-text" }, m.text) : null);
  return h("div", { class: `cx-msg ai${m.fehler ? " err" : ""}` },
    h("span", { class: "cx-avatar", "aria-hidden": "true" }, icon3d("robot")),
    h("div", { class: "cx-body" }, m.werkzeuge && m.werkzeuge.length ? werkzeugListe(m.werkzeuge) : null,
      m.fehler ? h("p", { class: "cx-err" }, mark("crit"), m.text) : bubbleBody(m.text),
      m.quellen && m.quellen.length ? sourcesView(m.quellen) : null,
      m.vorschlag ? suggestionView(m.vorschlag) : null,
      h("div", { class: "cx-meta" }, m.beispiel ? h("span", { class: "tag" }, "Beispielantwort der Vorschau") : null, m.modell ? h("span", {}, m.modell) : null, m.zeit ? h("span", {}, clockTime(new Date(m.zeit))) : null,
        !m.fehler && m.text ? h("button", { class: "cx-copy", type: "button", onclick: (ev) => { navigator.clipboard.writeText(m.text).then(() => { ev.target.textContent = "Kopiert"; }); } }, "Kopieren") : null,
        m.fehler && /kein Fahrzeug verbunden/i.test(m.text) ? h("button", { class: "btn pri small", type: "button", onclick: () => go("connect") }, "Fahrzeug verbinden") : null,
        m.fehler && /Einstellungen/.test(m.text) ? h("button", { class: "btn pri small", type: "button", onclick: () => go("einstellungen") }, "KI einrichten") : null,
        m.fehler && m.frage != null ? h("button", { class: "btn sec small", type: "button", onclick: () => send(m.frage) }, "Erneut senden") : null)));
}
function emptyView() {
  const fz = state.fahrzeug;
  return h("div", { class: "cx-empty" }, h("img", { class: "cx-empty-zeichen", src: "marke/candor-zeichen.svg", alt: "", width: 56, height: 56 }),
    h("h2", { class: "cx-gruss" }, fz ? `Was ist mit dem ${vehicleName(fz)}?` : "Was ist mit dem Auto?"));
}
function renderQuick(leer) {
  const box = $("cx-vorschlaege");
  box.hidden = !leer;
  if (!leer) { box.replaceChildren(); return; }
  box.replaceChildren(...aktuelleVorschlaege().map(({ kurz, frage }) => h("button", { class: "cx-q", type: "button", title: frage, onclick: () => send(frage) }, kurz)));
}
function renderHistory() {
  const list = history(), c = aktivId() && chats.holen(aktivId());
  $("cx-log").replaceChildren(...(list.length ? list.map(messageView) : [emptyView()]));
  $("view-agent").classList.toggle("leer", !list.length);
  renderQuick(!list.length);
  $("cx-titel").textContent = c ? c.titel : "";
  /* Leerer Chat: keine leere Überschrift im Kopf (Screenreader), der Platz bleibt durch die Knöpfe gleich. */
  $("cx-titel").hidden = !c;
  $("cx-clear").hidden = !list.length;
  zeichnePanel();
}

/* ---------- Seitenpanel (chatpanel.js): Bereiche, Suche, Zuletzt, alle Gespräche, Fahrzeuge ---------- */
function oeffneChat(id) { if (running) return; chats.setzeAktiv(id); schliessePanel({ fokus: false }); renderHistory(); requestAnimationFrame(scrollEnd); }
function neuerChat() { if (running) return; chats.setzeAktiv(null); schliessePanel({ fokus: false }); renderHistory(); $("cx-input").focus(); }
const scrollEnd = () => { const last = $("cx-log").lastElementChild; if (last) last.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" }); };

/* ---------- Senden ---------- */
function grow() { const el = $("cx-input"); el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, Math.round(innerHeight * .35))}px`; }
function updateSend() {
  const busy = Boolean(running);
  $("cx-send").hidden = busy; $("cx-stop").hidden = !busy;
  $("cx-send").disabled = !($("cx-input").value.trim() || files.length);
}
async function readStream(response, onEvent) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
      for (const line of chunk.split("\n")) if (line.startsWith("data: ")) { try { onEvent(JSON.parse(line.slice(6))); } catch (_) { /* unvollständige Zeile überspringen */ } }
    }
  }
}

export async function send(textArg) {
  if (running) return;
  const input = $("cx-input");
  const text = (textArg != null ? textArg : input.value).trim();
  if (!text && !files.length) return;
  const sent = files;
  if (agentAn() && sent.length) toast("Mit Anhängen antwortet der normale Chat, der Agent liest ohne Anhänge.");
  files = []; input.value = ""; grow(); renderChips();
  const list = [...history(), { rolle: "nutzer", text, anhaenge: sent.map((f) => ({ name: f.name, art: f.art })), zeit: Date.now() }];
  const chatId = saveHistory(list); chats.setzeAktiv(chatId); renderHistory();
  const answer = { rolle: "ki", text: "", zeit: Date.now() };
  const node = messageView(answer);
  node.classList.add("ki-busy");
  const body = node.querySelector(".cx-body");
  const status = h("span", { class: "cx-status" }, h("span", { class: "cx-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), "Denkt nach …");
  body.prepend(status);
  $("cx-log").append(node); scrollEnd();
  running = new AbortController(); updateSend();
  let raf = 0;
  const paint = () => { raf = 0; const md = bubbleBody(answer.text); const old = body.querySelector(".cx-md"); if (old) old.replaceWith(md); else body.append(md); };
  const zeigeWerkzeuge = () => { const neu = werkzeugListe(answer.werkzeuge); const alt = body.querySelector(".cx-tools"); if (alt) alt.replaceWith(neu); else status.after(neu); };
  try {
    if (!state.src) {
      Object.assign(answer, { text: "Noch kein Fahrzeug verbunden. Verbinde den Adapter oder probier das Beispielfahrzeug, dann lese ich die Daten mit.", fehler: true, frage: text });
    } else if (!isServer()) {
      const r = await state.src.ask(text || "Bitte sieh dir die Anhänge an.");
      Object.assign(answer, r.ok ? { text: r.antwort, vorschlag: r.vorschlag && r.vorschlag.art !== "keiner" ? r.vorschlag : null, beispiel: r.beispiel } : { text: r.meldung || "Keine Antwort.", fehler: true, frage: text });
    } else if (agentAn() && !sent.length) {
      const response = await state.src.agent({ verlauf: zumSenden(list, SEND_HISTORY) }, running.signal);
      if (!response.ok) throw new Error(`Server antwortet mit ${response.status}.`);
      status.lastChild.textContent = "Liest am Auto …";
      await readStream(response, (ev) => {
        if (ev.typ === "text") { answer.text += ev.text; if (!raf) raf = requestAnimationFrame(paint); }
        else if (ev.typ === "werkzeug") {
          if (answer.text && !answer.text.endsWith("\n")) answer.text += "\n\n";   // nächste Runde als eigener Absatz
          Object.assign(answer, mitWerkzeug(answer, ev)); zeigeWerkzeuge(); scrollEnd();
          logEvent(`Agent: ${ev.titel}${ev.ok ? "" : " (abgewiesen)"}`, ev.ok ? "info" : "warn");
        }
        else if (ev.typ === "vorschlag") answer.vorschlag = ev;
        else if (ev.typ === "fertig") { status.remove(); answer.modell = ev.modell; }
        /* Bisherige Analyse bleibt stehen, die Meldung kommt darunter */
        else if (ev.typ === "fehler") Object.assign(answer, answer.text.trim() ? { text: `${answer.text.trim()}\n\n*${ev.meldung}*` } : { text: ev.meldung, fehler: true, frage: text });
      });
    } else {
      const codes = [...faultSet().values()].map((f) => f.code);
      const fz = state.fahrzeug || {};
      const faelle = similar(storageGet("kfzdiag-faelle", []), { codes, marke: fz.marke, modell: fz.modell }).map(caseForAi);
      const payload = { verlauf: zumSenden(list, SEND_HISTORY), anhaenge: sent.map((f) => ({ name: f.name, daten: f.daten })), websuche: web, faelle };
      const response = await state.src.chat(payload, running.signal);
      if (!response.ok) throw new Error(response.status === 413 ? "Die Anhänge sind zusammen zu groß." : `Server antwortet mit ${response.status}.`);
      await readStream(response, (ev) => {
        if (ev.typ === "text") { status.remove(); answer.text += ev.text; if (!raf) raf = requestAnimationFrame(paint); }
        else if (ev.typ === "suche") status.lastChild.textContent = "Sucht im Internet …";
        else if (ev.typ === "quellen") answer.quellen = ev.quellen;
        else if (ev.typ === "vorschlag") answer.vorschlag = ev;
        else if (ev.typ === "fertig") { answer.modell = ev.modell; if (ev.abgeschnitten) answer.text += "\n\n*Antwort wurde gekürzt.*"; }
        else if (ev.typ === "fehler") Object.assign(answer, { text: ev.meldung, fehler: true, frage: text });
      });
    }
  } catch (err) {
    if (err.name === "AbortError") answer.text += answer.text ? "\n\n*Abgebrochen.*" : "Abgebrochen.";
    else Object.assign(answer, { text: `Keine Antwort: ${err.message}`, fehler: true, frage: text });
  } finally {
    if (raf) cancelAnimationFrame(raf);
    for (const f of sent) if (f.vorschau) URL.revokeObjectURL(f.vorschau);
    running = null;
    if (!answer.text) Object.assign(answer, { text: "Keine Antwort erhalten.", fehler: true, frage: text });
    saveHistory([...history(chatId), answer], chatId);
    if (aktivId() === chatId) node.replaceWith(messageView(answer)); else node.remove();
    zeichnePanel();
    updateSend(); scrollEnd();
  }
}

/* Frage von der Startseite (Karte »Assistent«): immer in einem neuen Chat. */
export function neueFrage(text) { if (running) return; chats.setzeAktiv(null); send(text); }

/* ---------- Plus: Blatt »Kontext hinzufügen«, Modell-Chip ---------- */
/* Einstellungen (Modell, Modellnamen, Tagesbudget) liest der Chat vom Server, den Schlüssel sieht er nie. */
let einst = null;
async function ladeEinstellungen() {
  if (!isServer()) { einst = null; renderModell(); return; }
  try { const r = await state.src.settings(); einst = r && r.ok ? r : null; } catch (_) { einst = null; }
  renderModell();
}
const lage = () => ({
  server: isServer(), anbieter: einst ? einst.ki.anbieter : state.status && state.status.ki, modell: einst && einst.ki.modell, modelle: einst ? einst.modelle : [],
  budget: einst && einst.budget, agentMoeglich: agentMoeglich(), agentAn: agentAn(), websuche: web,
});
function renderModell() {
  const chip = modellChip(lage()), el = $("cx-modell");
  el.replaceChildren(...[h("span", {}, chip.text), chip.stufe ? h("span", { class: "cx-stufe" }, chip.stufe) : null].filter(Boolean));
  el.classList.toggle("einrichten", chip.einrichten);
  el.setAttribute("aria-label", chip.einrichten ? `${chip.text}, öffnet die Einstellungen` : `Modell ${chip.text}${chip.stufe ? `, Stufe ${chip.stufe}` : ""}, öffnet die Einstellungen`);
}
function waehleDatei(k) {
  const inp = $(k.eingabe);
  inp.accept = k.accept;
  if (k.capture) inp.setAttribute("capture", k.capture); else inp.removeAttribute("capture");
  inp.click();
}
function schalte(id, an) {
  if (id === "websuche") { web = an; storageSet("kfzdiag-websuche", web); renderToggles(); }
  if (id === "agent") agentSetzen(an);
}
const plusBlatt = () => oeffneBlatt(lage(), { waehle: waehleDatei, schalte, ziel: () => go("einstellungen") }, $("cx-plus"));
function renderToggles() {
  $("cx-plus").classList.toggle("web-an", web); $("cx-plus").title = web ? "Anhängen, Websuche ist an" : "Anhängen, Websuche ist aus";
  const an = agentAn();
  $("view-agent").classList.toggle("agent-an", an);
  $("cx-input").placeholder = an ? "Frag den Agenten, er liest selbst am Auto" : $("cx-input").dataset.platzhalter || $("cx-input").placeholder;
  renderModell();
}

export function initAgent() {
  const input = $("cx-input");
  input.dataset.platzhalter = input.placeholder;
  input.addEventListener("input", () => { grow(); updateSend(); });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); } });
  input.addEventListener("paste", (ev) => { const list = [...(ev.clipboardData.files || [])]; if (list.length) { ev.preventDefault(); addFiles(list); } });
  $("cx-composer").addEventListener("submit", (ev) => { ev.preventDefault(); send(); });
  $("cx-stop").addEventListener("click", () => running && running.abort());
  $("cx-plus").addEventListener("click", plusBlatt);
  $("cx-modell").addEventListener("click", () => go("einstellungen"));
  $("cx-mic").hidden = !kannDiktieren(window);
  $("cx-mic").addEventListener("click", dictate);
  for (const id of ["cx-file", "cx-image", "cx-camera"]) $(id).addEventListener("change", (ev) => { addFiles(ev.target.files); ev.target.value = ""; });
  $("cx-clear").addEventListener("click", neuerChat);
  initPanel({ chats, aktivId, oeffne: oeffneChat, neu: neuerChat, geaendert: renderHistory });
  /* Alte Verläufe je Fahrzeug einmalig als Chats übernehmen */
  const alt = Object.keys(localStorage).filter((k) => /^kfzdiag-chat-(?!aktiv$)/.test(k));
  chats.uebernehmen(alt, (id) => { const fz = (storageGet("kfzdiag-fahrzeuge", []) || []).find((v) => v.id === id); return fz ? vehicleName(fz) : ""; });
  const view = $("view-agent");
  view.addEventListener("dragover", (ev) => { if (ev.dataTransfer.types.includes("Files")) { ev.preventDefault(); view.classList.add("drop"); } });
  view.addEventListener("dragleave", (ev) => { if (ev.target === view || !view.contains(ev.relatedTarget)) view.classList.remove("drop"); });
  view.addEventListener("drop", (ev) => { ev.preventDefault(); view.classList.remove("drop"); addFiles(ev.dataTransfer.files); });
  on("tab", (id) => { if (id === "agent") { renderHistory(); renderToggles(); updateSend(); ladeEinstellungen(); requestAnimationFrame(scrollEnd); } });
  /* Anderes Fahrzeug: neuer leerer Chat, der Verlauf bleibt in der Seitenleiste */
  on("fahrzeug-aktiv", () => { const c = aktivId() && chats.holen(aktivId()); if (c && state.fahrzeug && c.fz && c.fz !== state.fahrzeug.id) chats.setzeAktiv(null); if (!$("view-agent").hidden) renderHistory(); });
  on("status", renderToggles);
  on("chat-prefill", (text) => { const el = $("cx-input"); el.value = text; grow(); updateSend(); requestAnimationFrame(() => el.focus()); });
  renderToggles(); updateSend();
}
