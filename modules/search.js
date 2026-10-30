/* Globale Suche (Strg+K oder "/"): Fehlercodes, Messwerte, Steuergeräte, Begriffe, Tests, Funktionen,
   Prüfpfade, Verlauf und, wenn vorhanden, Herstellerdokumente. Treffer öffnen direkt das Infoblatt. */
import { $, h, num, icon, storageGet, storageSet } from "./dom.js";
import { state, WISSEN, DTC_REG, on, emit, signalTitle } from "./state.js";
import { openInfo } from "./info.js";
import { showTab, go, TABS, CHECK_SUBS } from "./shell.js";
import { FUNKTIONEN, VERBOTEN } from "../kern/service-katalog.js";
import { wert } from "./seiten.js";
import { bauteileFuer } from "../kern/bauteilfehler.js";
import { ZEILEN, zeilenFuer } from "../kern/einstellungs-baum.js";
import { vorschlaege, zuletztMerken, trefferSchluessel } from "../kern/suche-vorschlaege.js";
import { kundenfassung } from "./mandant.js";

/* Zuletzt geöffnete Treffer, nur auf diesem Gerät */
const ZULETZT_KEY = "kfzdiag-suche-zuletzt";
const zuletzt = () => storageGet(ZULETZT_KEY, []) || [];

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
  for (const t of TABS) out.push({ kind: "Bereich", title: t.label, detail: "Seite öffnen", key: `tab:${t.id}`, open: () => showTab(t.id), words: t.label });
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
  results = q ? index.map((e) => ({ e, s: score(e, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.e)
    : [];
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
function renderResults() {
  const list = $("palette-results");
  if (!list) return;
  results = groupByKind(results);
  if (!lastQuery) { list.replaceChildren(...startseite()); return; }
  if (!results.length) {
    list.replaceChildren(h("div", { class: "empty" }, h("p", { class: "sm" }, "Nichts gefunden. Codes wie P0301, Messwerte wie Trim, Steuergeräte, Begriffe.")));
    return;
  }
  const groups = [];
  results.forEach((r, i) => {
    if (!groups.length || groups[groups.length - 1].kind !== r.kind) groups.push({ kind: r.kind, rows: [] });
    groups[groups.length - 1].rows.push(h("button", { class: "pal-r", type: "button", role: "option", id: `pal-opt-${i}`, "aria-selected": String(i === selected), onclick: () => choose(r), onmousemove: () => { if (selected !== i) { selected = i; renderResults(); } } },
      r.code ? h("span", { class: "code mono" }, r.code) : null, h("span", { class: "pr-main" }, h("span", { class: "pr-t" }, r.title), r.detail ? h("span", { class: "sm" }, r.detail) : null), h("span", { class: "chev", "aria-hidden": "true" }, "›")));
  });
  list.replaceChildren(...groups.map((g) => h("div", { class: "pal-g", role: "group", "aria-label": g.kind }, h("p", { class: "eyebrow" }, g.kind), ...g.rows)));
  const sel = $(`pal-opt-${selected}`);
  const input = $("palette-body").querySelector("input");
  if (input) input.setAttribute("aria-activedescendant", sel ? sel.id : "");
  if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
}

/* Ohne Eingabe wie in den iOS-Einstellungen: Vorschläge aus der Liste, darunter Zuletzt */
function startseite() {
  const sichtbar = ZEILEN.filter(zeilenFuer({ kunde: kundenfassung(), einfach: document.documentElement.dataset.modus === "einfach" }));
  const vor = vorschlaege(sichtbar.filter((z) => z.ziel)).map((z) => h("button", { class: "pal-r", type: "button", onclick: () => { $("palette").close(); go(z.ziel, z.sub ? { sub: z.sub } : {}); } },
    h("span", { class: `li-ic${z.bild ? " li-bild" : ""}`, style: z.bild ? null : `--c:${z.farbe}`, "aria-hidden": "true" }, z.bild ? h("img", { src: `icons/liste/${z.bild}.png`, alt: "", width: 30, height: 30 }) : icon(z.icon)),
    h("span", { class: "pr-main" }, h("span", { class: "pr-t" }, z.label)), h("span", { class: "chev", "aria-hidden": "true" }, "›")));
  const zul = zuletzt().map((e) => h("button", { class: "pal-r", type: "button", onclick: () => oeffneSchluessel(e) },
    h("span", { class: "pr-main" }, h("span", { class: "pr-t" }, e.title), e.detail ? h("span", { class: "sm" }, e.detail) : null), h("span", { class: "chev", "aria-hidden": "true" }, "›")));
  return [h("div", { class: "pal-g pal-vor", role: "group", "aria-label": "Vorschläge" }, h("p", { class: "eyebrow" }, "Vorschläge"), ...vor),
    zul.length ? h("div", { class: "pal-g", role: "group", "aria-label": "Zuletzt" }, h("p", { class: "eyebrow" }, "Zuletzt"), ...zul) : null].filter(Boolean);
}
function oeffneSchluessel(e) {
  $("palette").close();
  const [art, rest] = [e.key.slice(0, e.key.indexOf(":")), e.key.slice(e.key.indexOf(":") + 1)];
  if (art === "tab") showTab(rest); else if (art === "check") go("check", { sub: rest }); else if (art === "service") go("service", { sub: rest }); else openInfo(e.key);
}
function choose(r) {
  $("palette").close();
  const key = trefferSchluessel(r);
  if (key) storageSet(ZULETZT_KEY, zuletztMerken(zuletzt(), { key, title: r.code ? `${r.code} ${r.title}` : r.title, kind: r.kind, detail: r.detail }));
  if (r.open) r.open(); else if (r.spec) openInfo(r.spec);
}

export function openSearch() {
  const dlg = $("palette");
  if (dlg.open) return;
  const input = h("input", { type: "search", placeholder: "Suchen", "aria-label": "Suche", "aria-controls": "palette-results", autocomplete: "off", spellcheck: "false" });
  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); selected = Math.min(results.length - 1, selected + 1); renderResults(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); selected = Math.max(0, selected - 1); renderResults(); }
    else if (ev.key === "Enter") { ev.preventDefault(); if (results[selected]) choose(results[selected]); }
  });
  /* Diktat, wo der Browser es kann (Chrome, Safari); sonst bleibt der Knopf weg */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mik = h("button", { class: "pal-mik", type: "button", "aria-label": "Diktieren", hidden: !SR, onclick: () => {
    const r = new SR(); r.lang = "de-DE"; r.interimResults = false;
    r.onresult = (ev) => { input.value = ev.results[0][0].transcript; run(input.value); };
    r.onerror = () => { mik.classList.remove("aktiv"); }; r.onend = () => mik.classList.remove("aktiv");
    mik.classList.add("aktiv"); r.start();
  } }, icon("mikro"));
  $("palette-body").replaceChildren(
    h("div", { class: "pal-bar" }, h("div", { class: "pal-in" }, icon("search"), input, mik), h("button", { class: "pal-x", type: "button", "aria-label": "Suche schließen", onclick: () => dlg.close() }, icon("close"))),
    h("div", { class: "results", id: "palette-results", role: "listbox", "aria-label": "Treffer" }),
    h("div", { class: "pal-f sm" }, h("span", {}, h("span", { class: "kbd" }, "↑↓"), " wählen"), h("span", {}, h("span", { class: "kbd" }, "Enter"), " öffnen"), h("span", {}, h("span", { class: "kbd" }, "Esc"), " schließen")));
  dlg.showModal();
  run("");
  input.focus();
}

export function initSearch() {
  on("open-search", openSearch);
  $("palette").addEventListener("click", (ev) => { if (ev.target === $("palette")) $("palette").close(); });
  emit("search-ready");
}
