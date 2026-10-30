/* Eigene Akzentfarbe: aus einer frei gewählten Farbe eine lesbare machen. Für Text und Rahmen braucht der Akzent
   gegen die Fläche mindestens 4,5 : 1 (bei hohem Kontrast 7 : 1); die Schrift auf dem Akzent wird schwarz oder weiß. */

export const AKZENTE = [
  ["#0A84FF", "Systemblau"], ["#0EA5E9", "Signalblau"], ["#2563EB", "Kobalt"], ["#6366F1", "Indigo"], ["#8B5CF6", "Violett"], ["#D946EF", "Magenta"],
  ["#14B8A6", "Petrol"], ["#16A34A", "Grün"], ["#EAB308", "Gelb"], ["#F97316", "Orange"], ["#64748B", "Graphit"],
];
export const DEFAULT_AKZENT = AKZENTE[0][0];

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(full, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
export const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const normalizeHex = (hex) => { const rgb = parseHex(hex); return rgb ? toHex(rgb) : null; };

const lin = (c) => { const v = c / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
export function contrast(a, b) {
  const la = luminance(parseHex(a)), lb = luminance(parseHex(b));
  return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
}
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

/* So wenig wie nötig Richtung Schwarz (helle Fläche) oder Weiß (dunkle Fläche) schieben, bis der Kontrast reicht. */
export function readableAccent(hex, surface, min = 4.5) {
  const base = parseHex(hex), bg = parseHex(surface);
  if (!base || !bg) return null;
  const target = luminance(bg) > .5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += .02) {
    const c = toHex(mix(base, target, t));
    if (contrast(c, surface) >= min) return c;
  }
  return toHex(target);
}
export const onAccent = (hex) => (contrast(hex, "#000000") >= contrast(hex, "#FFFFFF") ? "#000000" : "#FFFFFF");

/* Farbton in Grad, damit wir warnen können, wenn der Akzent der Fehlerfarbe zu nah kommt. */
export function hue(hex) {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)) };
}
export function nearCrit(hex) {
  if (!parseHex(hex)) return false;
  const { h, s } = hue(hex);
  return s > .45 && (h >= 340 || h <= 14);
}

/* Füllung für Hauptknöpfe wie bei Apple: Blau, Violett und Magenta tragen weiße Schrift. Reicht der Kontrast nicht,
   wird die Fläche nur so weit abgedunkelt, bis Weiß 4,5 : 1 erreicht. Gelb, Grün und Orange behalten ihre Farbe mit
   der lesbareren Schrift (meist Schwarz). */
export function accentFill(hex) {
  const base = normalizeHex(hex);
  if (!base) return null;
  if (onAccent(base) === "#FFFFFF") return { fill: base, ink: "#FFFFFF" };
  const { h, s } = hue(base);
  if (s > .3 && h >= 190 && h <= 330) return { fill: readableAccent(base, "#FFFFFF", 4.5), ink: "#FFFFFF" };
  return { fill: base, ink: onAccent(base) };
}
