/* KI-Chat wie in modernen Assistenten: Verlauf je Fahrzeug, Eingabe mit Plus (Datei, Bild, Foto, Websuche),
   Diktat, Senden und Stopp, Antwort Wort für Wort, Quellen, Vorschlag mit Freigabe. Die KI führt nichts aus.
   Anhänge gehen nur mit der aktuellen Nachricht an den Server; im Verlauf bleiben nur ihre Namen. */
import { $, h, icon, mark, toast, storageGet, storageSet, clockTime, reducedMotion } from "./dom.js";
import { state, on, emit, faultSet } from "./state.js";
import { startAction } from "./approval.js";
import { go } from "./shell.js";
import { render as markdown } from "./md.js";
import { icon3d } from "./icons3d.js";
import { similar, forAi as caseForAi } from "./faelle.js";

const MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024, MAX_EDGE = 2000, MAX_HISTORY = 60, SEND_HISTORY = 20;
const IMAGE = /^image\/(png|jpeg|webp|gif)$/, TEXT = /\.(txt|csv|log|json|md|xml)$/i;
const QUICK = ["Was bedeuten meine Fehlercodes?", "Wo fange ich bei der Fehlersuche an?", "Besteht das Auto die AU?", "Such im Internet nach bekannten Problemen zu diesem Modell"];
let files = [], web = storageGet("kfzdiag-websuche", true), running = null;

const key = () => `kfzdiag-chat-${(state.fahrzeug && state.fahrzeug.id) || "ohne"}`;
const history = () => storageGet(key(), []);
const saveHistory = (list) => storageSet(key(), list.slice(-MAX_HISTORY));
const isServer = () => state.src && state.src.mode === "server";

/* ---------- Anhänge ---------- */
const toBase64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = () => reject(new Error("Datei nicht lesbar")); r.readAsDataURL(blob); });
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", .86));
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
    h("div", { class: "cx-body" }, m.fehler ? h("p", { class: "cx-err" }, mark("crit"), m.text) : bubbleBody(m.text),
      m.quellen && m.quellen.length ? sourcesView(m.quellen) : null,
      m.vorschlag ? suggestionView(m.vorschlag) : null,
      h("div", { class: "cx-meta" }, m.beispiel ? h("span", { class: "tag" }, "Beispielantwort der Vorschau") : null, m.modell ? h("span", {}, m.modell) : null, m.zeit ? h("span", {}, clockTime(new Date(m.zeit))) : null,
        !m.fehler && m.text ? h("button", { class: "cx-copy", type: "button", onclick: (ev) => { navigator.clipboard.writeText(m.text).then(() => { ev.target.textContent = "Kopiert"; }); } }, "Kopieren") : null,
        m.fehler && m.frage != null ? h("button", { class: "btn sec small", type: "button", onclick: () => send(m.frage) }, "Erneut senden") : null)));
}
function emptyView() {
  return h("div", { class: "cx-empty" }, h("span", { class: "cx-empty-ic", "aria-hidden": "true" }, icon3d("robot")),
    h("h2", { class: "h2" }, "Frag die KI am Auto"),
    h("p", { class: "p" }, "Sie sieht den aktuellen Fahrzeugstand, liest Fotos und PDFs und sucht auf Wunsch im Internet. Sie führt nichts aus; jeder Schritt am Auto braucht deine Freigabe."),
    h("div", { class: "cx-quick" }, ...QUICK.map((q) => h("button", { class: "cx-q glass", type: "button", onclick: () => send(q) }, q))));
}
function renderHistory() {
  const list = history();
  $("cx-log").replaceChildren(...(list.length ? list.map(messageView) : [emptyView()]));
  $("cx-clear").hidden = !list.length;
}
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
  files = []; input.value = ""; grow(); renderChips();
  const list = [...history(), { rolle: "nutzer", text, anhaenge: sent.map((f) => ({ name: f.name, art: f.art })), zeit: Date.now() }];
  saveHistory(list); renderHistory();
  const answer = { rolle: "ki", text: "", zeit: Date.now() };
  const node = messageView(answer);
  node.classList.add("ki-busy");
  const body = node.querySelector(".cx-body");
  const status = h("span", { class: "cx-status" }, h("span", { class: "cx-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), "Denkt nach …");
  body.prepend(status);
  $("cx-log").append(node); scrollEnd();
  running = new AbortController(); updateSend();
  let raf = 0;
  const paint = () => { raf = 0; const md = bubbleBody(answer.text); const old = body.querySelector(".cx-md"); if (old) old.replaceWith(md); else body.prepend(md); };
  try {
    if (!state.src) {
      Object.assign(answer, { text: "Noch kein Fahrzeug verbunden. Verbinde den Adapter oder probier das Beispielfahrzeug, dann lese ich die Daten mit.", fehler: true, frage: text });
    } else if (!isServer()) {
      const r = await state.src.ask(text || "Bitte sieh dir die Anhänge an.");
      Object.assign(answer, r.ok ? { text: r.antwort, vorschlag: r.vorschlag && r.vorschlag.art !== "keiner" ? r.vorschlag : null, beispiel: r.beispiel } : { text: r.meldung || "Keine Antwort.", fehler: true, frage: text });
    } else {
      const codes = [...faultSet().values()].map((f) => f.code);
      const fz = state.fahrzeug || {};
      const faelle = similar(storageGet("kfzdiag-faelle", []), { codes, marke: fz.marke, modell: fz.modell }).map(caseForAi);
      const payload = { verlauf: list.slice(-SEND_HISTORY).map((m) => ({ rolle: m.rolle, text: m.text || (m.rolle === "nutzer" ? "" : "…") })), anhaenge: sent.map((f) => ({ name: f.name, daten: f.daten })), websuche: web, faelle };
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
    saveHistory([...history(), answer]);
    node.replaceWith(messageView(answer));
    updateSend(); scrollEnd();
  }
}

/* ---------- Plus-Menü ---------- */
function plusMenu() {
  const open = $("cx-menu");
  if (open) { open.remove(); return; }
  const close = () => { menu.remove(); document.removeEventListener("pointerdown", outside, true); };
  const outside = (ev) => { if (!menu.contains(ev.target) && ev.target !== $("cx-plus")) close(); };
  const row = (ic, title, sub, onclick, pressed) => h("button", { class: "cx-mi", type: "button", role: "menuitem", "aria-pressed": pressed == null ? null : String(pressed), onclick: () => { onclick(); close(); } },
    h("span", { class: "cx-mi-ic" }, ic), h("span", {}, h("b", {}, title), h("small", {}, sub)), pressed == null ? null : h("span", { class: `cx-dot${pressed ? " on" : ""}`, "aria-hidden": "true" }));
  const menu = h("div", { class: "cx-menu glass", id: "cx-menu", role: "menu" },
    row(icon("doc"), "Datei oder PDF", "Werkstatthandbuch, Rechnung, Protokoll", () => $("cx-file").click()),
    row(icon("car"), "Bild", "Foto vom Motorraum, Fehlerbild, Typenschild", () => $("cx-image").click()),
    row(icon("rec"), "Foto aufnehmen", "Kamera am Handy oder Tablet", () => $("cx-camera").click()),
    h("div", { class: "cx-sep" }),
    row(icon("search"), "Websuche", "Codes, Rückrufe, bekannte Probleme, mit Quellen", () => { web = !web; storageSet("kfzdiag-websuche", web); renderToggles(); }, web));
  $("cx-composer").append(menu);
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
  menu.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { close(); $("cx-plus").focus(); } });
  menu.querySelector("button").focus();
}
function renderToggles() { $("cx-web").hidden = !web; }

export function initAgent() {
  const input = $("cx-input");
  input.addEventListener("input", () => { grow(); updateSend(); });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); } });
  input.addEventListener("paste", (ev) => { const list = [...(ev.clipboardData.files || [])]; if (list.length) { ev.preventDefault(); addFiles(list); } });
  $("cx-composer").addEventListener("submit", (ev) => { ev.preventDefault(); send(); });
  $("cx-stop").addEventListener("click", () => running && running.abort());
  $("cx-plus").addEventListener("click", plusMenu);
  $("cx-mic").addEventListener("click", dictate);
  $("cx-web").addEventListener("click", () => { web = false; storageSet("kfzdiag-websuche", false); renderToggles(); toast("Websuche aus."); });
  for (const id of ["cx-file", "cx-image", "cx-camera"]) $(id).addEventListener("change", (ev) => { addFiles(ev.target.files); ev.target.value = ""; });
  $("cx-clear").addEventListener("click", () => { if (running) return; saveHistory([]); renderHistory(); });
  const view = $("view-agent");
  view.addEventListener("dragover", (ev) => { if (ev.dataTransfer.types.includes("Files")) { ev.preventDefault(); view.classList.add("drop"); } });
  view.addEventListener("dragleave", (ev) => { if (ev.target === view || !view.contains(ev.relatedTarget)) view.classList.remove("drop"); });
  view.addEventListener("drop", (ev) => { ev.preventDefault(); view.classList.remove("drop"); addFiles(ev.dataTransfer.files); });
  on("tab", (id) => { if (id === "agent") { renderHistory(); renderToggles(); updateSend(); requestAnimationFrame(scrollEnd); } });
  on("fahrzeug-aktiv", () => { if (!$("view-agent").hidden) renderHistory(); });
  on("chat-prefill", (text) => { const el = $("cx-input"); el.value = text; grow(); updateSend(); requestAnimationFrame(() => el.focus()); });
  renderToggles(); updateSend();
}
