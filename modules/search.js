/* Globale Suche (Strg+K oder "/") wie in den iOS-Einstellungen: ohne Eingabe Vorschläge und Zuletzt, mit Eingabe Seiten mit
   Pfad (»Einstellungen → KI und Dienste«), Fehlercodes, Messwerte, Steuergeräte, Begriffe, Tests, Funktionen, Prüfpfade, Verlauf
   und, wenn vorhanden, Herstellerdokumente. Am Handy deckt die Suche die ganze Fläche, das Suchfeld sitzt unten über der
   Tastatur (visualViewport). Treffer öffnen direkt die Seite oder das Infoblatt. */
import { $, h, num, icon, storageGet, storageSet } from "./dom.js";
import { state, WISSEN, DTC_REG, on, emit, signalTitle } from "./state.js";
import { openInfo } from "./info.js";
import { showTab, go, TABS, CHECK_SUBS, currentRoute } from "./shell.js";
import { FUNKTIONEN, VERBOTEN } from "../kern/service-katalog.js";
import { wert } from "./seiten.js";
import { bauteileFuer } from "../kern/bauteilfehler.js";
import { BAUM, ZEILEN, EINSTELLUNGEN, UNTERZEILEN, FARBE, zeilenFuer } from "../kern/einstellungs-baum.js";
import { vorschlaege, zuletztMerken, trefferSchluessel, sucheZiele, zieleFinden, zielFuerRoute, zielSchluessel, pfadText } from "../kern/suche-vorschlaege.js";
import { oeffneZeile } from "./liste.js";
import { kundenfassung } from "./mandant.js";

/* Zuletzt geöffnete Seiten und Treffer, nur auf diesem Gerät */
const ZULETZT_KEY = "kfzdiag-suche-zuletzt";
const zuletzt = () => zuletztMerken(storageGet(ZULETZT_KEY, []), /** @type {any} */ (null));
const merke = (eintrag) => storageSet(ZULETZT_KEY, zuletztMerken(zuletzt(), eintrag));

/* Seiten mit Pfad aus der Übersicht »Einstellungen« und der Startliste, im aktuellen Modus und in der aktuellen Fassung */
const EINSTELLUNGEN_ZIEL = { id: "einstellungen", label: "Einstellungen", icon: "zahnrad", farbe: FARBE.grau, ziel: "seite", sub: "einstellungen", pfad: [] };
const einfachAn = () => document.documentElement.dataset.modus === "einfach";
const ziele = () => [EINSTELLUNGEN_ZIEL, ...sucheZiele({ einstellungen: EINSTELLUNGEN, unterzeilen: UNTERZEILEN, start: BAUM,
  sichtbar: zeilenFuer({ kunde: kundenfassung(), einfach: einfachAn(), bald: true }) })];

/* Kachel je Art, damit jeder Treffer ein Symbol hat wie in der Liste */
const ART = { Fehler: ["faults", FARBE.rot], Messwert: ["pulse", FARBE.tuerkis], Steuergerät: ["ecu", FARBE.gruen], Readiness: ["check", FARBE.lila],
  Begriff: ["info", FARBE.grau], Funktion: ["wrench", FARBE.grau], Service: ["wrench", FARBE.grau], "Nicht in CANdor": ["lock", FARBE.rot], Prüfpfad: ["check", FARBE.lila],
  Diagnosepfad: ["faults", FARBE.orange], Bereich: ["raster", FARBE.blau], Verlauf: ["clock", FARBE.grau], Dokument: ["doc", FARBE.dunkel] };
const zielEintrag = (z, kind = "Seiten") => ({ kind, title: z.label, detail: pfadText(z.pfad), kachel: z, key: zielSchluessel(z), open: () => oeffneZeile(z), words: "" });

/* Diagnosepfade: Index einmal im Hintergrund laden, danach in jeder Suche */
let pfadIndex = [];
let pfadLaedt = null;
function ladePfade() {
  if (pfadLaedt) return;
  pfadLaedt = import("./diagnosepfad-lokal.js").then((m) => m.suchIndex()).then((liste) => { pfadIndex = liste; if (lastQuery) run(lastQuery); }).catch(() => { pfadLaedt = null; });
}

let selected = 0;
let results = [];
let rmiTimer = null;
let lastQuery = "";

function buildIndex() {
  const out = [];
  for (const [key, e] of DTC_REG) out.push({ kind: "Fehler", code: e.dtc.code, title: e.dtc.beschreibung, detail: e.where, spec: `dtc:${key}`, words: `${e.dtc.code} ${e.dtc.beschreibung} ${e.where}` });
  for (const [sig, m] of Object.entries(WISSEN.signale)) { const v = state.live[sig]; out.push({ kind: "Messwert", title: m.titel, detail: v && v.wert != null ? `${num(v.wert, 2)} ${v.einheit}` : m.kurz, spec: `signal:${sig}`, words: `${sig} ${m.titel} ${m.kurz} ${m.pid || ""}` }); }
  const ecus = [...state.ecus, ...((state.status && state.status.module) || []).filter((m) => !state.ecus.some((e) => e.adresse === m.adresse))];
  for (const e of ecus) out.push({ kind: "Steuergerät", title: e.name, detail: `${e.adresse}${e.kennung ? ` · ${e.kennung.teilenummer || ""}` : " · nicht gescannt"}`, spec: `ecu:${e.adresse}`, words: `${e.name} ${e.adresse} ${e.kennung ? Object.values(e.kennung).join(" ") : ""}` });
  for (const [name, text] of Object.entries(WISSEN.readiness)) out.push({ kind: "Readiness", title: name, detail: text.slice(0, 80), spec: `test:${name}`, words: `${name} ${text}` });
  for (const [key, b] of Object.entries(WISSEN.begriffe)) out.push({ kind: "Begriff", title: b.titel, detail: b.text.slice(0, 80), spec: `begriff:${key}`, words: `${key} ${b.titel} ${b.text}` });
  for (const fn of (state.functions && state.functions.funktionen) || []) out.push({ kind: "Funktion", title: fn.name, detail: `${fn.modul} · ${fn.art}`, spec: `fn:${fn.id}`, words: `${fn.id} ${fn.name} ${fn.modul} ${fn.art}` });
  for (const f of FUNKTIONEN.filter((x) => (x.einfach || document.documentElement.dataset.modus !== "einfach") && (x.weg === "anleitung" || document.documentElement.dataset.edition !== "kunde"))) out.push({ kind: "Service", title: f.name, detail: f.zweck, key: `service:${f.id}`, open: () => go("service", { sub: f.id }), words: `${f.name} ${f.zweck} ${f.alltag.join(" ")}` });
  for (const v of VERBOTEN) out.push({ kind: "Nicht in CANdor", title: v.name, detail: v.grund, open: () => go("service"), words: `${v.name} ${v.alltag.join(" ")}` });
  for (const p of WISSEN.pruefpfade || []) out.push({ kind: "Prüfpfad", title: p.titel, detail: p.kurz, open: () => go("check", { sub: "pfade" }), words: `${p.titel} ${p.kurz} ${p.schritte.map((s) => s.titel).join(" ")}` });
  for (const p of pfadIndex) { const teil = bauteileFuer(p.code); out.push({ kind: "Diagnosepfad", code: p.code, title: teil.name, detail: "Geführte Diagnose", spec: `dtc:${p.code}`, words: `${p.worte} ${teil.name}` }); }
  const seiten = new Set(ziele().filter((z) => !z.sub).map((z) => z.ziel));
  for (const t of TABS.filter((x) => !seiten.has(x.id))) out.push({ kind: "Bereich", title: t.label, detail: "Seite öffnen", key: `tab:${t.id}`, open: () => showTab(t.id), words: t.label });
  for (const c of CHECK_SUBS) out.push({ kind: "Bereich", title: c.label, detail: c.text, key: `check:${c.id}`, open: () => go("check", { sub: c.id }), words: `${c.label} ${c.text}` });
  for (const e of state.events.slice(0, 50)) out.push({ kind: "Verlauf", title: e.text, detail: e.at.toLocaleTimeString("de-DE"), open: () => showTab("car"), words: e.text });
  return out;
}

function score(entry, q) {
  const words = entry.words.toLowerCase();
  const title = (entry.title || "").toLowerCase();
  const code = (entry.code || "").toLowerCase();
  if (code && code.startsWith(q)) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (words.includes(q)) return 40;
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => words.includes(p))) return 30;
  return 0;
}

function run(query) {
  ladePfade();
  const q = query.trim().toLowerCase();
  lastQuery = q;
  const index = buildIndex();
  results = q ? [...zieleFinden(ziele(), q, 8).map((z) => zielEintrag(z)),
    ...index.map((e) => ({ e, s: score(e, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.e)]
    : startEintraege();
  selected = 0;
  renderResults();
  clearTimeout(rmiTimer);
  if (q.length >= 3 && state.src && wert("rmi", true)) rmiTimer = setTimeout(async () => {
    try {
      const r = await state.src.rmi(q);
      if (lastQuery !== q || !r.ok) return;
      results = [...results, ...r.treffer.slice(0, 8).map((t) => ({ kind: "Dokument", title: `${t.datei}, Seite ${t.seite}`, detail: t.auszug, spec: `dok:${t.datei}|${t.seite}` }))];
      renderResults();
    } catch (_) { /* keine Dokumente */ }
  }, 350);
}

/* Treffer gruppiert nach Art (stabil: Reihenfolge des ersten Auftretens), Pfeiltasten laufen über alle Gruppen. */
const groupByKind = (list) => { const kinds = [...new Set(list.map((r) => r.kind))]; return kinds.flatMap((k) => list.filter((r) => r.kind === k)); };

function kachel(r) {
  const k = r.kachel || { icon: (ART[r.kind] || ["search"])[0], farbe: (ART[r.kind] || [null, FARBE.grau])[1] };
  if (k.bild) return h("span", { class: "li-ic li-bild", "aria-hidden": "true" }, h("img", { src: `icons/liste/${k.bild}.png`, alt: "", width: 30, height: 30, decoding: "async" }));
  return h("span", { class: "li-ic", style: `--c:${k.farbe}`, "aria-hidden": "true" }, icon(k.icon));
}

function renderResults() {
  const list = $("palette-results");
  if (!list) return;
  results = groupByKind(results);
  if (lastQuery && !results.length) {
    list.replaceChildren(h("div", { class: "empty pal-leer" }, h("p", { class: "sm" }, "Nichts gefunden. Codes wie P0301, Messwerte wie Trim, Steuergeräte, Seiten wie Töne oder KI.")));
    return;
  }
  const groups = [];
  results.forEach((r, i) => {
    if (!groups.length || groups[groups.length - 1].kind !== r.kind) groups.push({ kind: r.kind, rows: [] });
    groups[groups.length - 1].rows.push(h("button", { class: "li-row pal-z", type: "button", role: "option", id: `pal-opt-${i}`, "aria-selected": String(i === selected), tabindex: "-1",
      onclick: () => choose(r), onmousemove: () => { if (selected !== i) { selected = i; markiere(); } } },
      kachel(r),
      h("span", { class: "li-t" }, h("span", { class: "pr-t" }, r.code ? h("span", { class: "code mono" }, `${r.code} `) : null, r.title), r.detail ? h("span", { class: "li-unter" }, r.detail) : null),
      h("span", { class: "li-chev", "aria-hidden": "true" }, "›")));
  });
  const titel = (kind) => (kind === "Seiten" && lastQuery ? "Einstellungen und Seiten" : kind);
  list.replaceChildren(...groups.map((g) => h("section", { class: "pal-g", role: "group", "aria-label": titel(g.kind) }, h("h3", { class: "li-k" }, titel(g.kind)), h("div", { class: "li-gruppe" }, ...g.rows))));
  markiere();
}
/* Auswahl ohne Neuzeichnen umsetzen, damit die Maus nicht flackert */
function markiere() {
  const input = $("palette-body") && $("palette-body").querySelector("input");
  results.forEach((_, i) => { const el = $(`pal-opt-${i}`); if (el) el.setAttribute("aria-selected", String(i === selected)); });
  const sel = $(`pal-opt-${selected}`);
  if (input) input.setAttribute("aria-activedescendant", sel ? sel.id : "");
  if (sel && sel.scrollIntoView && document.activeElement === input && matchMedia("(hover: hover)").matches) sel.scrollIntoView({ block: "nearest" });
}

/* Ohne Eingabe wie in den iOS-Einstellungen: Vorschläge aus der Liste, darunter Zuletzt (höchstens fünf) */
function startEintraege() {
  const sichtbar = ZEILEN.filter(zeilenFuer({ kunde: kundenfassung(), einfach: einfachAn(), bald: true }));
  const vor = vorschlaege(sichtbar.filter((z) => z.ziel)).map((z) => ({ kind: "Vorschläge", title: z.label, kachel: z, open: () => oeffneZeile(z), words: "" }));
  const alle = ziele();
  const zul = zuletzt().map((e) => {
    const z = e.key.startsWith("ziel:") ? alle.find((x) => zielSchluessel(x) === e.key) : null;
    if (e.key.startsWith("ziel:") && !z) return null;
    return { kind: "Zuletzt", title: z ? z.label : e.title, detail: z ? pfadText(z.pfad) : e.detail, kachel: z || null, kindArt: e.kind, key: e.key, open: () => oeffneSchluessel(e), words: "" };
  }).filter(Boolean).map((r) => (r.kachel ? r : { ...r, kachel: { icon: (ART[r.kindArt] || ["clock"])[0], farbe: (ART[r.kindArt] || [null, FARBE.grau])[1] } }));
  return [...vor, ...zul];
}
function oeffneSchluessel(e) {
  const [art, rest] = [e.key.slice(0, e.key.indexOf(":")), e.key.slice(e.key.indexOf(":") + 1)];
  if (art === "ziel") { const z = ziele().find((x) => x.id === rest); if (z) oeffneZeile(z); }
  else if (art === "tab") showTab(rest); else if (art === "check") go("check", { sub: rest }); else if (art === "service") go("service", { sub: rest }); else openInfo(e.key);
}
let gewaehlt = false;
function choose(r) {
  gewaehlt = true;
  $("palette").close();
  /* Seiten merkt sich »Zuletzt« beim Öffnen selbst (on tab); hier nur Treffer ohne eigene Seite */
  const key = trefferSchluessel(r);
  if (key && !key.startsWith("ziel:")) merke({ key, title: r.code ? `${r.code} ${r.title}` : r.title, kind: r.kindArt || r.kind, detail: r.detail });
  if (r.open) r.open(); else if (r.spec) openInfo(r.spec);
}

/* Sichtbare Fläche: am Handy schiebt die Tastatur nur den visualViewport zusammen. Die Suche nimmt genau diese Fläche ein,
   damit das Suchfeld unten direkt über der Tastatur sitzt; ohne Tastatur sitzt es über dem Home-Balken (safe-area). */
const TASTATUR_AB = 120;
function flaecheSetzen() {
  const dlg = $("palette"), vv = window.visualViewport;
  if (!dlg || !vv) return;
  dlg.style.setProperty("--vv-h", `${Math.round(vv.height)}px`);
  dlg.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
  dlg.dataset.tastatur = window.innerHeight - vv.height > TASTATUR_AB ? "an" : "aus";
}

export function openSearch() {
  const dlg = $("palette");
  if (dlg.open) return;
  const vorher = document.activeElement;
  gewaehlt = false;
  const input = h("input", { type: "search", name: "suche", placeholder: "Suchen", "aria-label": "Suche", "aria-controls": "palette-results", autocomplete: "off",
    autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "search", role: "combobox", "aria-expanded": "true", "aria-autocomplete": "list" });
  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); selected = Math.min(results.length - 1, selected + 1); markiere(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); selected = Math.max(0, selected - 1); markiere(); }
    else if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); if (results[selected]) choose(results[selected]); }
    else if (ev.key === "Escape") { ev.preventDefault(); $("palette").close(); }
  });
  /* Diktat, wo der Browser es kann (Chrome, Safari); sonst bleibt der Knopf weg */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mik = SR ? h("button", { class: "pal-mik", type: "button", "aria-label": "Diktieren", onclick: () => {
    const r = new SR(); r.lang = "de-DE"; r.interimResults = false;
    r.onresult = (ev) => { input.value = ev.results[0][0].transcript; run(input.value); };
    r.onerror = () => { mik.classList.remove("aktiv"); }; r.onend = () => mik.classList.remove("aktiv");
    mik.classList.add("aktiv"); r.start();
  } }, icon("mikro")) : null;
  /* Ein eigenes Formular mit genau einem Feld: Enter öffnet den gewählten Treffer, iOS zeigt die Taste »Suchen« */
  const form = h("form", { class: "pal-in", role: "search", action: "#", onsubmit: (ev) => { ev.preventDefault(); if (results[selected]) choose(results[selected]); } }, icon("search"), input, mik);
  $("palette-body").replaceChildren(
    h("div", { class: "results", id: "palette-results", role: "listbox", "aria-label": "Treffer" }),
    h("div", { class: "pal-bar" }, form, h("button", { class: "pal-x", type: "button", "aria-label": "Suche schließen", onclick: () => dlg.close() }, icon("close"))),
    h("div", { class: "pal-f sm" }, h("span", {}, h("span", { class: "kbd" }, "↑↓"), " wählen"), h("span", {}, h("span", { class: "kbd" }, "Enter"), " öffnen"), h("span", {}, h("span", { class: "kbd" }, "Esc"), " schließen")));
  const vv = window.visualViewport;
  if (vv) { vv.addEventListener("resize", flaecheSetzen); vv.addEventListener("scroll", flaecheSetzen); }
  document.documentElement.classList.add("pal-offen");
  dlg.addEventListener("close", () => {
    if (vv) { vv.removeEventListener("resize", flaecheSetzen); vv.removeEventListener("scroll", flaecheSetzen); }
    document.documentElement.classList.remove("pal-offen");
    /* Escape oder X: Fokus zurück, wo er vorher war; nach einem Treffer übernimmt die neue Seite */
    if (!gewaehlt && vorher && vorher.isConnected && vorher.focus) vorher.focus({ preventScroll: true });
  }, { once: true });
  flaecheSetzen();
  dlg.showModal();
  run("");
  input.focus({ preventScroll: true });
  flaecheSetzen();
}

export function initSearch() {
  on("open-search", openSearch);
  $("palette").addEventListener("click", (ev) => { if (ev.target === $("palette")) $("palette").close(); });
  /* Zuletzt geöffnete Seiten: jede Seite, die es als Ziel gibt, beim Öffnen merken */
  on("tab", () => { const z = zielFuerRoute(ziele(), currentRoute()); if (z) merke({ key: zielSchluessel(z), title: z.label, kind: "Seite", detail: pfadText(z.pfad) }); });
  emit("search-ready");
}
