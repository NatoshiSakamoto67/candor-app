/* Kleine DOM-Helfer: Elemente bauen, Zahlen formatieren, Toast, Icons. */
export const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (key === "class") el.className = value;
    else if (key === "style") el.style.cssText = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) if (value != null && value !== false) el.setAttribute(key, value);
  children.flat().forEach((c) => c != null && c !== false && el.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return el;
}

const FMT = new Map();
/* Feste Nachkommastellen für Messwerte: 14,20 bleibt 14,20 und springt nicht auf 14,2 und damit nicht in der Breite. */
const FIX = new Map();
export const numFix = (value, digits = 1) => {
  if (value == null || Number.isNaN(value)) return "–";
  if (!FIX.has(digits)) FIX.set(digits, new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  return FIX.get(digits).format(value);
};
export const num = (value, digits = 1) => {
  if (value == null || Number.isNaN(value)) return "–";
  if (!FMT.has(digits)) FMT.set(digits, new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
  return FMT.get(digits).format(value);
};
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/* Farben für Canvas und uPlot aus Hex-Tokens mischen (color-mix versteht nicht jeder Canvas). */
const rgbOf = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export function mixColor(a, b, t = .5, alpha = 1) {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x) return a;
  const c = y ? x.map((v, i) => Math.round(v * (1 - t) + y[i] * t)) : x;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
export const chev = () => h("span", { class: "chev", "aria-hidden": "true" }, "›");
export const clockTime = (date) => date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
export const clockFull = (date) => date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Icons: zuerst aus dem Sprite icons.svg (Designsystem 1.0), für Pfeile und Haken ohne Sprite-Zeichen als Pfad. */
const SPRITE = {
  car: "i-fahrzeug", faults: "i-fehler", warn: "i-warnung", live: "i-live", check: "i-pruefen", chat: "i-agent", report: "i-bericht",
  search: "i-suche", display: "i-anzeige", sun: "i-sonne", moon: "i-mond", contrast: "i-kontrast", hand: "i-hand", info: "i-info",
  close: "i-schliessen", back: "i-zurueck", next: "i-weiter", share: "i-teilen", print: "i-drucken", download: "i-herunterladen",
  doc: "i-dokument", source: "i-quelle", delete: "i-loeschen", rec: "i-aufnahme", stop: "i-stopp", play: "i-abspielen",
  marker: "i-markierung", bolt: "i-trigger", lock: "i-schloss", ecu: "i-steuergeraet", bus: "i-bus", gateway: "i-gateway",
  gauge: "i-drehzahl", exhaust: "i-abgas", battery: "i-batterie",
};
const PATHS = {
  tick: "M5 12l4 4L19 6",
  cross: "M6 6l12 12M18 6L6 18",
  minus: "M6 12h12",
  plus: "M12 5v14M5 12h14",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2",
  wrench: "M14.6 3.6a5 5 0 0 0-6 6.6L3.6 15.2a2 2 0 0 0 0 2.8l2.4 2.4a2 2 0 0 0 2.8 0l5-5a5 5 0 0 0 6.6-6l-3.2 3.2-2.9-.7-.7-2.9z",
  pulse: "M3 12h4l2.5-6 5 12L17 12h4",
  stack: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  more: "M6 12h.01M12 12h.01M18 12h.01",
};
export const ICONS = { ...SPRITE, ...PATHS };
export const spriteUse = (id, attrs = {}) => s("svg", { class: "ic", viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": "true", ...attrs }, s("use", { href: `icons.svg#${id}` }));
export function icon(name, cls) {
  if (SPRITE[name]) return spriteUse(SPRITE[name], cls ? { class: `ic ${cls}` } : {});
  return s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: `ic ${cls || ""}`.trim() }, s("path", { d: PATHS[name] || PATHS.minus }));
}

/* Zustandszeichen: Form plus Farbe (WCAG 1.4.1). Farbe kommt aus der Klasse, die Form aus dem Sprite (z-*). */
const GLYPH = { ok: "z-ok", warn: "z-warn", crit: "z-crit", silent: "z-stumm", pending: "z-ausstehend", unknown: "z-unbekannt", locked: "z-gesperrt", running: "z-laeuft", accent: "z-laeuft" };
export const glyphId = (kind) => GLYPH[kind] || null;
export function mark(kind) {
  const id = glyphId(kind);
  return h("span", { class: `mark ${kind}` }, id ? spriteUse(id, { class: "gl" }) : icon("minus"));
}

/* InfoButton: genau ein Info-Zeichen, Größe aus der Dichte (Komponente .ib). */
export function infoBtn(spec, label) {
  return h("button", { class: "ib", type: "button", "data-info": spec, "aria-label": label || "Erklärung" },
    h("span", { class: "dot" }, spriteUse("z-info-i", { class: "i-mark" })));
}
/* Sprungchip: Pille mit Pfeil, öffnet ein Infoblatt oder springt (Komponente .cj). */
export function jump(attrs, ...children) {
  return h("button", { type: "button", ...attrs, class: `cj ${attrs.class || ""}`.trim() }, ...children, h("span", { class: "go", "aria-hidden": "true" }, "›"));
}
/* Statuschip: eckig, nicht klickbar, Ton ok, warn, crit, info, neutral, running (Komponente .cs). */
export const statusChip = (tone, text) => h("span", { class: `cs t-${tone || "neutral"}` }, text);

let toastTimer = null;
export function toast(text) {
  const el = $("toast");
  el.replaceChildren(h("span", {}, text));
  el.hidden = false;
  requestAnimationFrame(() => { el.dataset.show = ""; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { delete el.dataset.show; setTimeout(() => { if (!("show" in el.dataset)) el.hidden = true; }, 220); }, 4000);
}

export function download(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function storageGet(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (_) { return fallback; }
}
export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* privater Modus oder voll: dann eben nicht gemerkt */ }
}
