/* Gerüst: Seiten wie am Werkstatt-Tester (Startseite mit Kacheln, jede Aufgabe eine eigene Seite, oben Zurück und Start),
   Statusleiste, Anzeige-Einstellungen. Infos öffnen als eigene Seite; Zurück führt an die alte Stelle zurück. */
import { $, h, icon, mark, glyphId, num, reducedMotion, storageGet, storageSet, cssVar } from "./dom.js";
import { AKZENTE, DEFAULT_AKZENT, normalizeHex, readableAccent, onAccent, nearCrit, accentFill } from "./farbe.js";
import { icon3d } from "./icons3d.js";
import { vehicleLabel } from "./fahrzeuge.js";
import { KAPITEL } from "./handbuch-inhalt.js";
import { state, on, emit, obdList, firstReadiness, totalFaults, pendingFaults } from "./state.js";

export const PAGES = [
  { id: "start", label: "Start", icon: "home" },
  { id: "connect", label: "Verbinden", icon: "gateway" },
  { id: "fahrzeuge", label: "Fahrzeuge", icon: "car" },
  { id: "fahrzeug", label: "Fahrzeug anlegen", icon: "car" },
  { id: "werkstatt", label: "Werkstattdaten", icon: "car" },
  { id: "handbuch", label: "Handbuch", icon: "doc" },
  { id: "einstellungen", label: "Einstellungen", icon: "display" },
  { id: "car", label: "Steuergeräte", icon: "ecu" },
  { id: "faults", label: "Fehlerspeicher", icon: "faults" },
  { id: "live", label: "Live-Werte", icon: "live" },
  { id: "check", label: "Prüfungen", icon: "check" },
  { id: "service", label: "Service und Anlernen", icon: "wrench" },
  { id: "agent", label: "Assistent", icon: "chat" },
  { id: "report", label: "Bericht", icon: "report" },
  { id: "history", label: "Verlauf", icon: "clock" },
  { id: "detail", label: "Details", icon: "info" },
];
/* Bereiche für die Suche (ohne Start, Verbinden und Detailseite) */
export const TABS = PAGES.filter((p) => !["start", "connect", "detail", "fahrzeug"].includes(p.id));
export const CHECK_SUBS = [
  { id: "pfade", label: "Geführte Prüfpfade", icon: "route", text: "Schritt für Schritt bis Pass oder Fail" },
  { id: "soll", label: "Ist gegen Soll", icon: "gauge", text: "Messwerte mit Richtwerten vergleichen" },
  { id: "bereitschaft", label: "AU-Bereitschaft", icon: "exhaust", text: "Readiness-Tests vor der Abgasuntersuchung" },
  { id: "freeze", label: "Freeze-Frame", icon: "freeze", text: "Momentaufnahme beim Auftreten eines Fehlers" },
  { id: "did", label: "Kennung lesen", icon: "tag", text: "Eigene Werte (DID) an einem Steuergerät lesen" },
  { id: "rmi", label: "Herstellerdokumente", icon: "book", text: "Suche in den lokalen RMI-PDFs" },
];

let route = { page: "start", sub: null, spec: null };
export const currentTab = () => route.page;
export const currentRoute = () => ({ ...route });

const hashFor = (r) => (r.page === "detail" ? `#info/${encodeURIComponent(r.spec || "")}` : `#${r.page}${r.sub ? "/" + r.sub : ""}`);
function parseHash() {
  const raw = location.hash.slice(1);
  const [page, ...rest] = raw.split("/");
  const tail = decodeURIComponent(rest.join("/"));
  if (page === "info" && tail) return { page: "detail", sub: null, spec: tail };
  if (!PAGES.some((p) => p.id === page) || page === "detail") return null;
  const sub = page === "check" ? (CHECK_SUBS.some((c) => c.id === tail) ? tail : null) : ["fahrzeug", "handbuch", "service"].includes(page) ? tail || null : null;
  return { page, sub, spec: null };
}
const depth = () => (history.state && history.state.depth) || 0;

function titleFor(r) {
  if (r.page === "detail") return ($("pane-body").querySelector("h2") || {}).textContent || "Details";
  if (r.page === "check" && r.sub) return CHECK_SUBS.find((c) => c.id === r.sub).label;
  if (r.page === "fahrzeug") return r.sub ? "Fahrzeug bearbeiten" : "Fahrzeug anlegen";
  if (r.page === "handbuch" && r.sub) return `Handbuch · ${(KAPITEL.find((k) => k.id === r.sub) || { titel: "Kapitel" }).titel}`;
  return PAGES.find((p) => p.id === r.page).label;
}

/* Seite zeigen: genau eine Ansicht sichtbar, Titel oben, Zurück nur außerhalb der Startseite. */
function render(r, scrollY = 0) {
  const changed = r.page !== route.page || r.sub !== route.sub || r.spec !== route.spec;
  route = r;
  const apply = () => {
    for (const p of PAGES) $(`view-${p.id}`).hidden = p.id !== r.page;
    if (r.page === "check") for (const sec of document.querySelectorAll("#view-check [data-sub]")) sec.hidden = sec.dataset.sub !== r.sub;
    $("check-tiles").hidden = !(r.page === "check" && !r.sub);
    $("nav-back").hidden = r.page === "start";
    document.title = `${titleFor(r)} · CANdor`;
    $("page-title").textContent = titleFor(r);
    const view = $(`view-${r.page}`);
    if (changed) { view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter"); }
    emit("tab", r.page);
    if (r.page === "check") emit("check-sub", r.sub);
    if (r.page === "service") emit("service-sub", r.sub);
    if (r.page === "detail" && r.spec && $("pane-body").dataset.spec !== r.spec) emit("open-info", r.spec);
  };
  if (changed && document.startViewTransition && !reducedMotion()) {
    const transition = document.startViewTransition(apply);
    [transition.ready, transition.finished, transition.updateCallbackDone].forEach((p) => p.catch(() => {}));
    transition.updateCallbackDone.then(() => window.scrollTo({ top: scrollY }), () => window.scrollTo({ top: scrollY }));
  } else { apply(); window.scrollTo({ top: scrollY }); }
}

/* Neue Seite: die Scrollposition der alten merkt sich der Verlauf, damit Zurück genau dorthin führt. */
export function go(page, options = {}) {
  if (!PAGES.some((p) => p.id === page)) page = "start";
  const next = { page, sub: options.sub || null, spec: options.spec || null };
  const same = next.page === route.page && next.sub === route.sub && next.spec === route.spec;
  if (same && !options.force) return;
  history.replaceState({ ...(history.state || {}), route, scrollY: window.scrollY, depth: depth() }, "", hashFor(route));
  if (options.replace) history.replaceState({ route: next, scrollY: 0, depth: depth() }, "", hashFor(next));
  else history.pushState({ route: next, scrollY: 0, depth: depth() + 1 }, "", hashFor(next));
  /* Dieselbe Seite neu aufbauen (force) behält die Scrollposition; nur ein echter Seitenwechsel beginnt oben. */
  render(next, same ? window.scrollY : 0);
}
export const showTab = (id, options = {}) => go(id, options);

/* Zurück: im Verlauf, sonst eine Ebene höher (Unterseite zur Prüfen-Übersicht, alles andere zum Start). */
export function back() {
  if (depth() > 0) { history.back(); return; }
  go(route.sub && ["check", "service"].includes(route.page) ? route.page : "start", { replace: true });
}

/* ---------- Detailseite statt Seitenpanel: Infos, Erklärungen, Einstellungen ---------- */
export function openPane(content, spec) {
  const body = $("pane-body");
  body.dataset.spec = spec || "";
  body.replaceChildren(...content.flat().filter(Boolean),
    h("div", { class: "detail-foot" }, h("button", { class: "btn sec", type: "button", onclick: back }, icon("back"), "Zurück")));
  if (route.page === "detail" && route.spec === spec) { $("page-title").textContent = titleFor(route); return; }
  go("detail", { spec });
}
export const closePane = () => { if (route.page === "detail") back(); };
export const paneOpen = () => route.page === "detail";

/* ---------- Statusleiste: Segmente mit Zeichen, Zahl und Wort; Priorität je Breite über data-prio ---------- */
let lastAnnounce = "";
function statusSegment(c) {
  return h("button", { class: `seg-s schip t-${c.tone || "neutral"}`, type: "button", "data-info": c.go ? null : c.info, "data-prio": c.prio, onclick: c.go ? () => go(c.go) : null },
    c.rec ? h("span", { class: "rec-dot", id: "rec-dot", "aria-hidden": "true" }) : c.tone && glyphId(c.tone) ? mark(c.tone) : null,
    h("span", { class: "l" }, c.k), c.v ? h("span", { class: "v" }, c.v) : null);
}
export function renderStatus() {
  const st = state.status || {}, v = state.vehicle || {};
  $("sim-band").hidden = !st.simuliert;
  const fz = state.fahrzeug;
  $("v-name").textContent = fz ? vehicleLabel(fz) : st.fahrzeug || "Kein Fahrzeug gewählt";
  $("v-brand").textContent = !fz && v.marke && v.marke !== "unbekannt" && !(st.fahrzeug || "").startsWith(v.marke) ? `${v.marke} ` : "";
  const live = state.live || {};
  const volt = live.SPANNUNG && typeof live.SPANNUNG.wert === "number" ? live.SPANNUNG.wert : null;
  const rpm = live.DREHZAHL && typeof live.DREHZAHL.wert === "number" ? live.DREHZAHL.wert : null;
  const r = firstReadiness();
  const stored = totalFaults(), pending = pendingFaults().length;
  const open = r ? r.tests.filter((t) => !t.fertig).length : null;
  const conn = state.connLost ? "Verbindung weg" : !state.status ? "Nicht verbunden" : st.simuliert ? "Simulator" : state.src.mode === "demo" ? "Vorschau" : "Verbunden";
  const connTone = state.connLost || !state.status ? "crit" : st.simuliert || state.src.mode === "demo" ? "warn" : "ok";
  const chips = [
    { k: conn, v: state.connLost ? "neu verbinden" : st.protokoll ? st.protokoll.replace(/ \(simuliert\)/, "").split(",")[0] : "", tone: connTone, go: state.connLost || !state.status ? "connect" : null, info: "begriff:simulator", prio: 1 },
    state.scanning ? { k: "Vollscan", v: `${state.scanPct || 0} %`, tone: "running", go: "car", prio: 1 } : null,
    { k: pending ? "Fehler + vorl." : "Fehler", v: pending ? `${stored}+${pending}` : String(stored), tone: stored ? "crit" : pending ? "warn" : "ok", info: "begriff:gespeichert", prio: 1 },
    { k: "Readiness", v: r ? `${r.tests.length - open}/${r.tests.length}` : "–", tone: r ? (open ? "warn" : "ok") : null, info: "begriff:readiness", prio: 1 },
    { k: "Bordnetz", v: volt == null ? "–" : `${num(volt, 1)} V`, tone: volt == null ? null : volt < 12.2 || volt > 15 ? "crit" : volt < 13.2 && rpm > 100 ? "warn" : "ok", info: "signal:SPANNUNG", prio: 2 },
    { k: rpm == null ? "Motor" : rpm > 100 ? "Motor läuft" : "Zündung an", v: rpm == null ? "–" : rpm > 100 ? `${num(rpm, 0)} 1/min` : "Motor aus", tone: null, info: "signal:DREHZAHL", prio: 3 },
    state.recording ? { k: "Aufnahme", v: "läuft", tone: "running", info: "begriff:aufnahme", rec: true, prio: 1 } : null,
  ].filter(Boolean);
  /* Nur geänderte Chips tauschen: die Reihe behält ihre Scrollstellung und flackert nicht im Sekundentakt. */
  const box = $("status-chips"), keys = chips.map((c) => JSON.stringify(c));
  if (box.childElementCount !== chips.length) box.replaceChildren(...chips.map((c, i) => Object.assign(statusSegment(c), { _key: keys[i] })));
  else [...box.children].forEach((el, i) => { if (el._key !== keys[i]) el.replaceWith(Object.assign(statusSegment(chips[i]), { _key: keys[i] })); });
  const band = $("conn-band");
  band.hidden = !state.connLost;
  if (state.connLost && !band.childElementCount) band.replaceChildren(mark("crit"),
    h("span", {}, h("strong", {}, "Verbindung zum Fahrzeug unterbrochen. "), "Angezeigte Werte sind nicht mehr aktuell. Das Programm versucht es jede Sekunde weiter."),
    h("button", { class: "btn sec small", type: "button", onclick: () => emit("reconnect") }, "Neu verbinden"));
  if (!state.connLost) band.replaceChildren();
  const announce = `${conn}, ${stored} Fehler, Readiness ${r ? `${r.tests.length - open} von ${r.tests.length}` : "offen"}${state.recording ? ", Aufnahme läuft" : ""}`;
  if (announce !== lastAnnounce) { lastAnnounce = announce; announcer().textContent = announce; }
}
function announcer() {
  let el = $("status-announce");
  if (!el) { el = h("span", { class: "sr", id: "status-announce", "aria-live": "polite" }); $("statusbar").append(el); }
  return el;
}

/* ---------- Anzeige: eigene Akzentfarbe, Symbolfarben, Modus, Kontrast, Dichte. Gespeichert nur lokal (localStorage). ---------- */
const DEFAULTS = { akzent: DEFAULT_AKZENT, icons: "eigen", theme: "auto", contrast: "auto", touch: "auto" };
/* Ältere Werte (Farbwelten bis Oktober 2026, dark, light, more, normal) auf die neuen heben. */
const LEGACY = { theme: { dark: "dunkel", light: "hell" }, contrast: { more: "hoch" }, touch: { normal: "comfort" } };
const OLD_WORLDS = { signal: "#0EA5E9", bernstein: "#EAB308", forst: "#14B8A6", mono: "#64748B", nacht: "#F97316" };
function loadPrefs() {
  const stored = storageGet("kfzdiag-anzeige", {});
  const raw = { ...DEFAULTS, ...stored };
  if (!stored.akzent && OLD_WORLDS[stored.accent]) raw.akzent = OLD_WORLDS[stored.accent];
  delete raw.accent;
  const out = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (LEGACY[k] && LEGACY[k][v]) || v]));
  return { ...out, akzent: normalizeHex(out.akzent) || DEFAULT_AKZENT, icons: out.icons === "akzent" ? "akzent" : "eigen" };
}
let prefs = loadPrefs();
const MQ = { dark: window.matchMedia("(prefers-color-scheme: dark)"), more: window.matchMedia("(prefers-contrast: more)"), coarse: window.matchMedia("(pointer: coarse) and (min-width: 600px)") };
export function resolvedDisplay(p = prefs) {
  return {
    theme: p.theme === "auto" ? (MQ.dark.matches ? "dunkel" : "hell") : p.theme,
    contrast: p.contrast === "auto" ? (MQ.more.matches ? "hoch" : "normal") : p.contrast,
    touch: p.touch === "auto" ? (MQ.coarse.matches ? "glove" : "comfort") : p.touch,
  };
}
/* Die gewählte Farbe wird für Modus und Kontrast so weit nachgedunkelt oder aufgehellt, dass Text und Rahmen lesbar bleiben. */
function setAccent(root, hex, contrastMode) {
  const accent = readableAccent(hex, cssVar("--surface-1"), contrastMode === "hoch" ? 7 : 4.5) || hex;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--on-accent", onAccent(accent));
  const f = accentFill(contrastMode === "hoch" ? accent : hex) || { fill: accent, ink: onAccent(accent) };
  root.style.setProperty("--accent-fill", f.fill);
  root.style.setProperty("--on-accent-fill", f.ink);
}
export function applyPrefs() {
  const root = document.documentElement, d = resolvedDisplay();
  root.dataset.accent = "signal";
  root.dataset.theme = d.theme;
  if (d.contrast === "hoch") root.dataset.contrast = "hoch"; else delete root.dataset.contrast;
  root.dataset.touch = d.touch;
  root.dataset.icons = prefs.icons;
  setAccent(root, prefs.akzent, d.contrast);
  emit("theme");
}
function setPref(key, value, { rerender = true } = {}) {
  prefs = { ...prefs, [key]: value };
  storageSet("kfzdiag-anzeige", prefs);
  applyPrefs();
  if (rerender && route.page === "detail" && route.spec === "einstellungen:anzeige") openDisplaySettings();
}
function segmentControl(label, key, options) {
  return h("div", { class: "blk" }, h("p", { class: "eyebrow" }, label),
    h("div", { class: "seg", role: "group", "aria-label": label }, ...options.map(([val, text]) =>
      h("button", { type: "button", "aria-pressed": String(prefs[key] === val), onclick: () => setPref(key, val) }, text))));
}
function swatch([hex, name]) {
  return h("button", { class: "acc-sw", type: "button", "aria-pressed": String(prefs.akzent === hex), "aria-label": name, title: name, onclick: () => setPref("akzent", hex) },
    h("span", { class: "sw-dot", style: `background:${hex}` }), h("span", { class: "sw-n" }, name));
}
/* Eigene Farbe: beim Ziehen sofort anwenden, erst beim Loslassen speichern und die Seite neu aufbauen. */
function customColor() {
  const own = !AKZENTE.some(([hex]) => hex === prefs.akzent);
  const input = h("input", { type: "color", id: "akzent-eigen", value: prefs.akzent.toLowerCase(), class: "sw-input" });
  input.addEventListener("input", () => { prefs = { ...prefs, akzent: normalizeHex(input.value) }; applyPrefs(); });
  input.addEventListener("change", () => setPref("akzent", normalizeHex(input.value)));
  return h("label", { class: `acc-sw own${own ? " on" : ""}`, for: "akzent-eigen" }, input,
    h("span", { class: "sw-n" }, own ? `Eigene: ${prefs.akzent}` : "Eigene Farbe …"));
}
function accentPreview() {
  return h("div", { class: "acc-prev", "aria-hidden": "true" },
    h("span", { class: "btn pri small" }, "Vollscan starten"),
    h("span", { class: "cs t-running" }, "läuft 42 %"),
    h("span", { class: "acc-link" }, "Details öffnen ›"),
    h("span", { class: "acc-ics" }, ...["mil", "scope", "chip", "report"].map((n) => icon3d(n))));
}
export function openDisplaySettings() {
  const d = resolvedDisplay();
  openPane([
    h("p", { class: "eyebrow" }, "Anzeige"), h("h2", { class: "h2" }, "Akzentfarbe, Symbole, Modus, Kontrast"),
    h("p", { class: "lead" }, "Wähle deine eigene Akzentfarbe. Sie färbt Knöpfe, Fortschritt, Auswahl und Diagramme. Die Ampel bleibt immer gleich: Grün für in Ordnung, Bernstein für Hinweis, Rot für Fehler, jeweils mit Zeichen und Wort."),
    h("div", { class: "blk" }, h("p", { class: "eyebrow" }, "Akzentfarbe"),
      h("div", { class: "acc-sws", id: "display-settings", role: "group", "aria-label": "Akzentfarbe" }, ...AKZENTE.map(swatch), customColor()),
      nearCrit(prefs.akzent) ? h("p", { class: "sm hint-warn" }, mark("warn"), "Diese Farbe liegt nah an der Fehlerfarbe. Fehler sind dann schwerer zu erkennen.") : null,
      accentPreview()),
    segmentControl("Farben der Symbole", "icons", [["eigen", "Eigene Farbe je Funktion"], ["akzent", "Alle in der Akzentfarbe"]]),
    segmentControl("Modus", "theme", [["auto", "System"], ["dunkel", "Dunkel"], ["hell", "Hell"]]),
    segmentControl("Kontrast", "contrast", [["auto", "System"], ["normal", "Normal"], ["hoch", "Hoch (7 : 1)"]]),
    segmentControl("Dichte", "touch", [["auto", "Automatisch"], ["compact", "Kompakt"], ["comfort", "Normal"], ["glove", "Werkstatt (60 px)"]]),
    h("p", { class: "sm" }, `Gerade aktiv: Akzent ${cssVar("--accent")}, ${d.theme}, Kontrast ${d.contrast}, Ziele ${d.touch === "glove" ? "60" : "44"} px. Ist eine Farbe zu hell oder zu dunkel, passt das Programm sie für die Lesbarkeit an. Gedruckt wird immer schwarz auf weiß.`),
    h("div", { class: "row-actions" }, h("button", { class: "btn sec", type: "button", onclick: () => go("werkstatt") }, "Werkstattdaten ändern"),
    h("button", { class: "btn qt", type: "button", onclick: () => { prefs = { ...DEFAULTS }; storageSet("kfzdiag-anzeige", prefs); applyPrefs(); openDisplaySettings(); } }, icon("reset"), "Auf Standard zurücksetzen")),
  ], "einstellungen:anzeige");
}

/* Druck: hell, normaler Kontrast, Akzent in Tinte, unabhängig von der Wahl am Bildschirm. */
function setupPrint() {
  window.addEventListener("beforeprint", () => {
    const root = document.documentElement;
    root.dataset.theme = "hell"; delete root.dataset.contrast;
    root.style.setProperty("--accent", "#10161D"); root.style.setProperty("--on-accent", "#FFFFFF");
  });
  window.addEventListener("afterprint", applyPrefs);
}

/* ---------- Start ---------- */
export function initShell() {
  $("nav-back").addEventListener("click", back);
  $("nav-home").addEventListener("click", () => go("start"));
  $("status-tools").replaceChildren(
    h("button", { class: "btn qt search-btn", type: "button", "aria-label": "Suche (Strg+K)", onclick: () => emit("open-search") }, icon("search"), h("span", { class: "lbl" }, "Suche"), h("span", { class: "kbd" }, "Strg K")),
    h("button", { class: "icb", type: "button", "aria-label": "Handbuch", title: "Handbuch: So funktioniert das Programm", onclick: () => go("handbuch") }, icon("doc")),
    h("button", { class: "icb", type: "button", "aria-label": "Einstellungen", title: "Einstellungen: KI und API-Schlüssel, Werkstatt, Anzeige", onclick: () => go("einstellungen") }, icon("display")));
  applyPrefs();
  setupPrint();
  Object.values(MQ).forEach((mq) => mq.addEventListener("change", applyPrefs));
  const bar = $("statusbar");
  const measure = () => document.documentElement.style.setProperty("--status-h", `${bar.offsetHeight}px`);
  new ResizeObserver(measure).observe(bar);
  measure();
  window.addEventListener("popstate", (ev) => {
    const r = (ev.state && ev.state.route) || parseHash() || { page: "start", sub: null, spec: null };
    render(r, (ev.state && ev.state.scrollY) || 0);
  });
  document.addEventListener("keydown", (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if ((ev.key === "k" || ev.key === "K") && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); emit("open-search"); }
    else if (ev.key === "/" && !typing && !document.querySelector("dialog[open]")) { ev.preventDefault(); emit("open-search"); }
    else if (ev.key === "Escape" && route.page === "detail" && !document.querySelector("dialog[open]")) back();
  });
  on("status", renderStatus);
  on("show-tab", (id) => go(id));
  on("open-settings", openDisplaySettings);
}

/* Erste Seite nach dem Laden: Adresse aus dem Link, sonst Start. Detailseiten brauchen Daten, deshalb erst nach dem Verbinden. */
export function initialRoute() {
  const r = parseHash();
  history.replaceState({ route: route, scrollY: 0, depth: 0 }, "", hashFor(route));
  return r;
}
export function openRoute(r) {
  if (!r || r.page === "connect") { go("start", { replace: true, force: true }); return; }
  go(r.page, { ...r, replace: true, force: true });
}
