/* Dashboard-Modus wie Apples StandBy: große Zahlen fürs Armaturenbrett, Ampelfarben an den Grenzen, Uhr und
   Fehlerzähler. Tippen wechselt die Kachelgruppe (Motor, Gemisch, Bordnetz) und zeigt kurz die Leiste mit Zurück.
   Der Bildschirm bleibt über Wake Lock an, solange die Seite offen ist. */
import { $, h, icon, numFix, clockTime } from "./dom.js";
import { state, on, WISSEN, totalFaults, pendingFaults } from "./state.js";
import { back } from "./shell.js";
import { SKALEN } from "./rundinstrument.js";
import { dashboardTon, KACHELGRUPPEN, KURZ, naechsteGruppe } from "../kern/dashboard-ton.js";

const LEISTE_MS = 4000;
let gruppe = KACHELGRUPPEN[0].id, leisteBis = 0, uhr = 0, lock = null, gebaut = false, wachText = "";
const aktiv = () => !$("view-dashboard").hidden;
const live = (sig) => { const x = (state.live || {})[sig]; return x && typeof x.wert === "number" ? x : null; };
const motorLaeuft = () => ((live("DREHZAHL") || {}).wert || 0) > 100;
const titel = (sig) => KURZ[sig] || (WISSEN.signale[sig] || {}).titel || sig;
const einheit = (sig) => (live(sig) || {}).einheit || (WISSEN.signale[sig] || {}).einheit || "";
function zahl(sig) {
  const e = live(sig);
  if (!e) return "–";
  const cfg = SKALEN[sig];
  return numFix(e.wert, cfg ? cfg.digits : Math.abs(e.wert) >= 100 ? 0 : 1);
}

/* ---------- Wake Lock ---------- */
/* Ergebnis steht in der Leiste, damit man weiß, ob man die Displaysperre selbst ausschalten muss. */
async function wachHalten() {
  if (lock) return;
  if (!("wakeLock" in navigator)) { wachText = "Bildschirm geht nach der Sperrzeit aus"; return; }
  try {
    lock = await navigator.wakeLock.request("screen");
    wachText = "Bildschirm bleibt an";
    lock.addEventListener("release", () => { lock = null; wachText = "Bildschirm geht nach der Sperrzeit aus"; });
  } catch (err) { wachText = `Bildschirm bleibt nicht an (${err.message})`; }
  zeichnen();
}
function freigeben() { if (lock) { lock.release().catch(() => { /* schon freigegeben */ }); lock = null; } }

/* ---------- Aufbau ---------- */
function bauen() {
  const box = $("dashboard");
  box.replaceChildren(
    h("div", { class: "db-leiste", id: "db-leiste", hidden: true },
      h("button", { class: "sk-zurueck", type: "button", "aria-label": "Zurück", onclick: (ev) => { ev.stopPropagation(); back(); } }, icon("back")),
      h("span", { class: "db-leiste-t" }, "Dashboard", h("span", { class: "db-wach", id: "db-wach" })), h("span", { class: "db-punkte", id: "db-punkte", "aria-hidden": "true" })),
    h("div", { class: "db-kopf" }, h("span", { class: "db-uhr num", id: "db-uhr" }), h("span", { class: "db-fehler", id: "db-fehler" }), h("span", { class: "db-gruppe", id: "db-gruppe" })),
    h("div", { class: "db-kacheln", id: "db-kacheln", role: "list" }),
    h("p", { class: "db-hinweis", id: "db-hinweis" }, "Tippen: nächste Gruppe und Zurück"));
  box.addEventListener("click", (ev) => { if (ev.target.closest(".db-leiste")) return; gruppe = naechsteGruppe(gruppe); leisteBis = Date.now() + LEISTE_MS; zeichnen(); });
  gebaut = true;
}
function kachel(sig) {
  const ton = dashboardTon(sig, (live(sig) || {}).wert, motorLaeuft());
  return h("div", { class: `db-kachel${ton ? ` t-${ton}` : ""}`, role: "listitem", "data-sig": sig },
    h("span", { class: "db-l" }, titel(sig)), h("b", { class: "db-w num" }, zahl(sig)), h("span", { class: "db-e" }, einheit(sig)));
}
function zeichnen() {
  if (!aktiv()) return;
  if (!gebaut) bauen();
  const g = KACHELGRUPPEN.find((x) => x.id === gruppe) || KACHELGRUPPEN[0];
  $("db-uhr").textContent = clockTime(new Date());
  const f = state.status ? totalFaults() + pendingFaults().length : null;
  $("db-fehler").textContent = f == null ? "nicht verbunden" : f ? `${f} Fehler` : "keine Fehler";
  $("db-fehler").className = `db-fehler${f ? " t-crit" : f === 0 ? " t-ok" : ""}`;
  $("db-gruppe").textContent = g.titel;
  $("db-kacheln").replaceChildren(...g.signale.map(kachel));
  $("db-punkte").replaceChildren(...KACHELGRUPPEN.map((x) => h("i", { class: x.id === gruppe ? "an" : "" })));
  const leiste = Date.now() <= leisteBis;
  $("db-leiste").hidden = !leiste;
  $("dashboard").classList.toggle("mit-leiste", leiste);
  $("db-wach").textContent = wachText;
  /* Motor aus und keine Werte: Hinweis statt leerer Zahlen */
  const hatWerte = Object.keys(state.live || {}).length > 0;
  $("db-hinweis").textContent = !state.status ? "Kein Fahrzeug verbunden. Zurück und verbinden." : hatWerte ? "Tippen: nächste Gruppe und Zurück" : "Warte auf Messwerte vom Auto …";
}

function betreten() {
  leisteBis = Date.now() + LEISTE_MS;
  zeichnen();
  wachHalten();
  clearInterval(uhr);
  uhr = setInterval(zeichnen, 1000);
  requestAnimationFrame(() => { const b = $("db-leiste") && $("db-leiste").querySelector("button"); if (b) b.focus(); });
}
function verlassen() { clearInterval(uhr); uhr = 0; freigeben(); }

export function initDashboard() {
  on("tab", (id) => { if (id === "dashboard") betreten(); else if (uhr) verlassen(); });
  on("live-tick", zeichnen);
  on("render", zeichnen);
  /* Escape verlässt das Dashboard auch, wenn die Leiste mit dem fokussierten Zurück-Knopf wieder verschwunden ist. */
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && aktiv() && !document.querySelector("dialog[open]")) back(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && aktiv()) wachHalten(); });
}
