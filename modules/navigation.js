/* Navigation wie die Apple-Einstellungen (29.10.2026): eine Liste für alles (modules/liste.js), links am großen
   Bildschirm, am Handy als Startseite; unten schwebt die Suche. Bereiche mit zwei Seiten behalten oben einen
   Umschalter (Diagnose: Fahrzeug | Fehler, Messen: Live | Prüfungen). */
import { $, h, icon } from "./dom.js";
import { state, on, emit } from "./state.js";
import { go, currentRoute } from "./shell.js";
import { zeichneListe, aktualisiereListen } from "./liste.js";

export const BEREICHE = [
  { id: "uebersicht", label: "Übersicht", icon: "home", ziel: "start", seiten: ["start", "connect", "fahrzeuge", "fahrzeug", "werkstatt"] },
  { id: "diagnose", label: "Diagnose", icon: "car", ziel: "car", seiten: ["car", "faults"],
    unter: [{ seite: "car", label: "Fahrzeug" }, { seite: "faults", label: "Fehlerspeicher" }] },
  { id: "messen", label: "Messen", icon: "pulse", ziel: "live", seiten: ["live", "check"], profi: true,
    unter: [{ seite: "live", label: "Live-Werte" }, { seite: "check", label: "Prüfungen" }] },
  { id: "service", label: "Service", icon: "wrench", ziel: "service", seiten: ["service"] },
  { id: "assistent", label: "KI-Assistent", icon: "chat", ziel: "agent", seiten: ["agent"] },
];
export const bereichFuer = (seite) => BEREICHE.find((b) => b.seiten.includes(seite)) || null;
const einfach = () => document.documentElement.dataset.modus === "einfach";
/* Wie die Apple-Einstellungen: am großen Bildschirm steht links die ganze Liste, am Handy gibt es keine Tableiste,
   nur die schwebende Suche unten aus Glas. Die Liste selbst ist dort die Startseite. */
let gebaut = false;
function bauen() {
  if (gebaut) return;
  gebaut = true;
  $("tabbar").replaceChildren(
    h("div", { class: "tb-liste", id: "tabbar-liste" }),
    h("button", { class: "tb-suche", type: "button", onclick: () => emit("open-search") }, icon("lupe"), h("span", {}, "Suchen"), h("span", { class: "tb-mik", "aria-hidden": "true" })));
}

/* Aktiven Bereich markieren und den Umschalter oben zeigen. */
export function markieren() {
  bauen();
  zeichneListe("tabbar-liste", { kompakt: true });
  zeichneListe("start-liste");
  const r = currentRoute(), b = bereichFuer(r.page);
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
  on("modus", markieren);
  on("fahrzeug-aktiv", markieren);
  on("status", aktualisiereListen);
}
