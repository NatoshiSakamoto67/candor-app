/* Rundinstrument als SVG: einmal aufgebaut, danach dreht sich nur die Nadel (CSS-Übergang) und die Zahl wechselt.
   Aufbau nach Instrumenten-Recherche (FAA AC 25-11B, ISA-101): 270°-Bogen, Haupt- und Nebenstriche nach 1-2-5,
   Zahlen innen, Nadel endet vor den Zahlen, Wert unten in der offenen Lücke, Normalbereich als ruhiges Band,
   Warn- und Rotzonen dünn außen, Farbe der Nadel nur bei Abweichung, Min/Max seit Start als kleine Marken. */
import { s, num, numFix } from "./dom.js";

/* Skalen je Signal; andere Signale leiten ihre Skala aus dem Sollbereich ab (instrumentFuer). */
export const SKALEN = {
  DREHZAHL: { min: 0, max: 8000, major: 1000, minor: 250, faktor: 1000, rot: 6500, digits: 0, stufe: 10 },
  KUEHLMITTEL: { min: 40, max: 140, major: 20, minor: 5, rot: 115, digits: 0, stufe: 1 },
  SPANNUNG: { min: 10, max: 16, major: 1, minor: .2, rot: 15.2, tief: 12, digits: 2, stufe: .01 },
  GESCHWINDIGKEIT: { min: 0, max: 240, major: 40, minor: 10, digits: 0, stufe: 1 },
  LAST: { min: 0, max: 100, major: 20, minor: 5, digits: 0, stufe: 1 },
  DROSSELKLAPPE: { min: 0, max: 100, major: 20, minor: 5, digits: 0, stufe: 1 },
  OELTEMPERATUR: { min: 40, max: 160, major: 20, minor: 5, rot: 135, digits: 0, stufe: 1 },
  ANSAUGLUFT: { min: -20, max: 80, major: 20, minor: 5, digits: 0, stufe: 1 },
  SAUGROHRDRUCK: { min: 0, max: 120, major: 20, minor: 5, digits: 0, stufe: 1 },
};
function schritt(span) { const p = 10 ** Math.floor(Math.log10(span)), f = span / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
export function instrumentFuer(sig, soll, wert) {
  if (SKALEN[sig]) return SKALEN[sig];
  const lo0 = Math.min(soll ? soll.soll_min : wert ?? 0, wert ?? Infinity), hi0 = Math.max(soll ? soll.soll_max : wert ?? 1, wert ?? -Infinity);
  const major = schritt(Math.max(hi0 - lo0, 1e-6) / 4);
  const min = Math.floor((lo0 - major) / major) * major, max = Math.ceil((hi0 + major) / major) * major;
  return { min, max, major, minor: major / 5, digits: major < 1 ? 2 : major < 10 ? 1 : 0, stufe: major < 1 ? .01 : major < 10 ? .1 : 1 };
}

const A0 = Math.PI * .75, A1 = Math.PI * 2.25, CX = 100, CY = 96, R = 80;
const pt = (a, r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
const f2 = (n) => n.toFixed(2);
function bogen(a, b, r) {
  if (b - a < 1e-4) return "";
  const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r);
  return `M${f2(x1)} ${f2(y1)} A${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${f2(x2)} ${f2(y2)}`;
}
const gerundet = (x, d) => Math.abs(x - Math.round(x / d) * d) < d * 1e-6;

export function rundinstrument(cfg, { einheit = "", titel = "" } = {}) {
  const { min, max, major, minor, faktor = 1, rot = null, tief = null } = cfg;
  const ang = (v) => A0 + (Math.min(Math.max(v, min), max) - min) / (max - min) * (A1 - A0);
  const teile = [];
  teile.push(s("path", { class: "ri-spur", d: bogen(A0, A1, R) }));
  const band = s("path", { class: "ri-band" });
  teile.push(band);
  if (rot != null) teile.push(s("path", { class: "ri-rot", d: bogen(ang(rot), A1, R + 5) }));
  if (tief != null) teile.push(s("path", { class: "ri-tief", d: bogen(A0, ang(tief), R + 5) }));
  const n = Math.round((max - min) / minor);
  const striche = [];
  for (let i = 0; i <= n; i++) {
    const v = min + i * minor, gross = gerundet(v - min, major), a = ang(v);
    const [x1, y1] = pt(a, R), [x2, y2] = pt(a, R - (gross ? 11 : 5));
    striche.push(`M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`);
    if (gross) {
      const [tx, ty] = pt(a, R - 23);
      teile.push(s("text", { class: "ri-zahl", x: f2(tx), y: f2(ty) }, num(v / faktor, 0)));
    }
  }
  teile.splice(1, 0, s("path", { class: "ri-strich", d: striche.filter((_, i) => !gerundet(min + i * minor - min, major)).join("") }),
    s("path", { class: "ri-strich gross", d: striche.filter((_, i) => gerundet(min + i * minor - min, major)).join("") }));
  /* Grenzen des Sollbands als kurze kräftige Querstriche */
  const grenzen = s("path", { class: "ri-grenze" });
  const extrem = s("path", { class: "ri-extrem" });
  const nadel = s("g", { class: "ri-nadel" },
    s("path", { d: `M${CX} ${CY - (R - 33)} L${CX + 3.6} ${CY} L${CX} ${CY + 12} L${CX - 3.6} ${CY} Z` }),
    s("circle", { cx: CX, cy: CY, r: 7 }), s("circle", { class: "ri-nabe", cx: CX, cy: CY, r: 2.6 }));
  /* Wert deutlich unter den Skalenenden (die liegen bei etwa CY+47), Einheit darunter */
  const wert = s("text", { class: "ri-wert", x: CX, y: CY + 84 }, "–");
  const unter = s("text", { class: "ri-einheit", x: CX, y: CY + 102 }, einheit);
  const fakt = faktor !== 1 ? s("text", { class: "ri-faktor", x: CX, y: CY + 38 }, `× ${faktor}`) : null;
  const svg = s("svg", { class: "ri", viewBox: "0 0 200 206", role: "img", "aria-label": titel }, ...teile, grenzen, extrem, fakt, nadel, wert, unter);

  let bandKey = "", lo = null, hi = null, zuletzt = null;
  return {
    el: svg,
    /** wert: Zahl oder null; soll: {soll_min, soll_max} oder null; anzeige: fertig formatierte Zahl */
    setze(v, soll, anzeige) {
      const key = soll ? `${soll.soll_min}|${soll.soll_max}` : "";
      if (key !== bandKey) {
        bandKey = key;
        band.setAttribute("d", soll ? bogen(ang(soll.soll_min), ang(soll.soll_max), R - 3) : "");
        grenzen.setAttribute("d", soll ? [soll.soll_min, soll.soll_max].map((g) => { const [x1, y1] = pt(ang(g), R + 7), [x2, y2] = pt(ang(g), R - 13); return `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`; }).join("") : "");
      }
      const da = typeof v === "number";
      if (da) {
        lo = lo == null ? v : Math.min(lo, v); hi = hi == null ? v : Math.max(hi, v);
        extrem.setAttribute("d", [lo, hi].map((x) => { const a = ang(x), [px, py] = pt(a, R + 8), [lx, ly] = pt(a - .05, R + 16), [rx, ry] = pt(a + .05, R + 16); return `M${f2(px)} ${f2(py)}L${f2(lx)} ${f2(ly)}L${f2(rx)} ${f2(ry)}Z`; }).join(""));
      }
      const grad = ((da ? ang(v) : A0) + Math.PI / 2) * 180 / Math.PI;
      if (zuletzt !== grad) { nadel.style.transform = `rotate(${grad.toFixed(2)}deg)`; zuletzt = grad; }
      const aus = da && soll && (v < soll.soll_min || v > soll.soll_max);
      const alarm = da && ((rot != null && v >= rot) || (tief != null && v < tief));
      svg.classList.toggle("warn", Boolean(aus) && !alarm);
      svg.classList.toggle("crit", Boolean(alarm));
      const text = da ? anzeige : "–";
      if (wert.textContent !== text) wert.textContent = text;
      const u = da ? einheit : "nicht gemeldet";
      if (unter.textContent !== u) unter.textContent = u;
    },
    zuruecksetzen() { lo = hi = null; extrem.setAttribute("d", ""); },
  };
}
export const formatiere = (v, cfg) => numFix(v, cfg.digits ?? 0);
