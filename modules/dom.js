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
  wrench: "M11.82 9.99L5.53 16.28A1.55 1.55 0 0 0 7.72 18.47L14.01 12.18A4.3 4.3 0 0 0 19.76 6.71L17.2 9.28A1.75 1.75 0 0 1 14.72 6.8L17.29 4.24A4.3 4.3 0 0 0 11.82 9.99ZM7.47 16.53h.01",
  pulse: "M3 12h4l2.5-6 5 12L17 12h4",
  stack: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  /* Zeichen für die Einstellungen-Liste (Apple-Stil, eigene Formen) */
  wlan: "M4 9.5a12 12 0 0 1 16 0M7 12.8a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0M12 19h.01",
  bt: "M7 7.5l10 9-5 4V3.5l5 4-10 9",
  schild: "M12 3l7 3v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z",
  globus: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9s1.2-6.4 3.8-9",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
  speicher: "M4 7h16v10H4zM4 12h16M8 9.5h.01M8 14.5h.01",
  regler: "M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M8 15v4",
  hand: "M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v6M14 10.5V7a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-12 3.4L4 15a1.5 1.5 0 0 1 2.4-1.8L8 15",
  blitz: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  sonne: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  stern: "M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z",
  bild: "M4 5h16v14H4zM4 15l4.5-4 4 3.5 3-2.5L20 15.5M15.5 8.5h.01",
  raster: "M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z",
  kamera: "M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  schalter: "M7 6h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6M7 13h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6M8 9h.01M16 16h.01",
  uhr: "M4 7.5h16v9H4zM8 12h3M14 12h2",
  lupe: "M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12M15 15l5 5",
  glocke: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  ton: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  mond: "M18.5 14.5A7.5 7.5 0 0 1 9.5 5.5a7.5 7.5 0 1 0 9 9",
  buch: "M5 4.5h11a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11",
  gesicht: "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0",
  sos: "M4 7h16v10H4zM7.5 10a1.3 1.3 0 0 0-1.3 1 1.3 1.3 0 0 0 1.3 1 1.3 1.3 0 0 1 1.3 1 1.3 1.3 0 0 1-1.3 1M12 10a1.3 2 0 1 0 0 4a1.3 2 0 1 0 0-4M16.5 10a1.3 1.3 0 0 0-1.3 1 1.3 1.3 0 0 0 1.3 1 1.3 1.3 0 0 1 1.3 1 1.3 1.3 0 0 1-1.3 1",
  pokal: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A2.5 2.5 0 0 0 7.5 10H8M16 6h3v1.5a2.5 2.5 0 0 1-2.5 2.5H16M12 13v4M8.5 20h7M10 17h4v3h-4z",
  wolke: "M7 18h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 10.5 3.8 3.8 0 0 0 7 18",
  karte: "M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h4",
  werkstatt: "M4 20V9l8-5 8 5v11M8 20v-6h8v6M8 17h8",
  adapter: "M8 4h8v6a4 4 0 0 1-8 0zM10 4V2.5M14 4V2.5M12 14v6",
  schloss: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13zM12 14.5v2",
  auto: "M3.5 15.5v-3l2-4.5A2 2 0 0 1 7.3 7h9.4a2 2 0 0 1 1.8 1l2 4.5v3M3.5 15.5h17v2.5h-17zM6.5 18v2M17.5 18v2M7 12.5h.01M17 12.5h.01M5.5 12h13",
  fuhrpark: "M2.5 17v-2.5l1.5-3.5h8l1.5 3.5V17zM5 17v1.5M11 17v1.5M9.5 9l1-2.5h7l1.5 3.5V14h-3",
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
