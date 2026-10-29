/* Navigation mit rotem Faden (Feinschliff 29.10.2026): fünf Bereiche in der Reihenfolge der Arbeit.
   Handy: Tableiste unten aus Glas. Breiter Bildschirm: Seitenleiste links. Bereiche mit zwei Seiten bekommen
   oben einen Umschalter (Diagnose: Fahrzeug | Fehler, Messen: Live | Prüfungen). Im einfachen Modus fällt Messen weg. */
import { $, h, icon } from "./dom.js";
import { state, on } from "./state.js";
import { go, currentRoute } from "./shell.js";

export const BEREICHE = [
  { id: "uebersicht", label: "Übersicht", icon: "home", ziel: "start", seiten: ["start", "connect", "fahrzeuge", "fahrzeug", "werkstatt"] },
  { id: "diagnose", label: "Diagnose", icon: "car", ziel: "car", seiten: ["car", "faults"],
    unter: [{ seite: "car", label: "Fahrzeug" }, { seite: "faults", label: "Fehlerspeicher" }] },
  { id: "messen", label: "Messen", icon: "pulse", ziel: "live", seiten: ["live", "check"], profi: true,
    unter: [{ seite: "live", label: "Live-Werte" }, { seite: "check", label: "Prüfungen" }] },
  { id: "service", label: "Service", icon: "wrench", ziel: "service", seiten: ["service"] },
  { id: "assistent", label: "Assistent", icon: "chat", ziel: "agent", seiten: ["agent"] },
];
/* Ablage: alles, was nicht zum Ablauf gehört, aber schnell erreichbar sein soll. */
export const ABLAGE = [
  { seite: "report", label: "Bericht", icon: "report" },
  { seite: "history", label: "Verlauf", icon: "clock" },
  { seite: "fahrzeuge", label: "Fahrzeuge", icon: "car" },
  { seite: "handbuch", label: "Handbuch", icon: "doc" },
  { seite: "einstellungen", label: "Einstellungen", icon: "display" },
];

export const bereichFuer = (seite) => BEREICHE.find((b) => b.seiten.includes(seite)) || null;
const einfach = () => document.documentElement.dataset.modus === "einfach";
export const sichtbareBereiche = (istEinfach = einfach()) => BEREICHE.filter((b) => !(istEinfach && b.profi));

function tab(b) {
  return h("a", { class: "tb-i", href: `#${b.ziel}`, "data-bereich": b.id, onclick: (ev) => { ev.preventDefault(); go(b.ziel); } },
    h("span", { class: "tb-ic" }, icon(b.icon)), h("span", { class: "tb-l" }, b.label));
}
function ablage(a) {
  return h("a", { class: "tb-i tb-ab", href: `#${a.seite}`, "data-seite": a.seite, onclick: (ev) => { ev.preventDefault(); go(a.seite); } },
    h("span", { class: "tb-ic" }, icon(a.icon)), h("span", { class: "tb-l" }, a.label));
}

let gebautFuer = null;
function bauen() {
  const key = einfach() ? "einfach" : "profi";
  if (gebautFuer === key) return;
  gebautFuer = key;
  $("tabbar").replaceChildren(
    h("div", { class: "tb-haupt" }, ...sichtbareBereiche().map(tab)),
    h("div", { class: "tb-ablage" }, h("p", { class: "tb-k" }, "Ablage"), ...ABLAGE.map(ablage)));
}

/* Aktiven Bereich markieren und den Umschalter oben zeigen. */
export function markieren() {
  bauen();
  const r = currentRoute(), b = bereichFuer(r.page);
  for (const el of $("tabbar").querySelectorAll(".tb-i")) {
    const an = el.dataset.bereich ? Boolean(b && el.dataset.bereich === b.id) : el.dataset.seite === r.page;
    if (an) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  }
  const sub = $("subnav");
  const zeigen = Boolean(b && b.unter && !(einfach() && b.profi));
  sub.hidden = !zeigen;
  if (!zeigen) { sub.replaceChildren(); return; }
  sub.replaceChildren(h("div", { class: "seg seg-glas", role: "group", "aria-label": b.label },
    ...b.unter.map((u) => h("button", { type: "button", "aria-pressed": String(u.seite === r.page), onclick: () => go(u.seite) }, u.label))));
}

export function initNavigation() {
  bauen();
  on("tab", markieren);
  on("render", markieren);
  on("modus", () => { gebautFuer = null; markieren(); });
  /* Fehlerzahl als Plakette am Bereich Diagnose: Form und Zahl, nicht nur Farbe. */
  on("status", () => {
    const el = $("tabbar").querySelector('[data-bereich="diagnose"] .tb-ic');
    if (!el) return;
    const n = (state.obd && state.obd.gespeichert ? state.obd.gespeichert.length : 0);
    let badge = el.querySelector(".tb-badge");
    if (!n) { if (badge) badge.remove(); return; }
    if (!badge) { badge = h("span", { class: "tb-badge" }); el.append(badge); }
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.setAttribute("aria-label", `${n} Fehler`);
  });
}
