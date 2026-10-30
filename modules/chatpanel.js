/* Seitenpanel im KI-Assistenten wie in Assistenten-Apps: oben Titel »Assistent« und runder Such-Knopf, darunter
   Einträge mit Liniensymbol (Berichte & Nachweise, Fahrzeuge, Fahrt-Agent & Wartung, Fahrzeug erkunden), Trennlinie,
   »Zuletzt« mit den letzten Gesprächen und »Alle anzeigen …«, unten »Neues Gespräch« und das Zahnrad.
   Am Handy schiebt es von links herein (Dialog, Fokus bleibt drin), Tippen auf den Chat-Rest, Wischen nach links oder
   Escape schließt. Am großen Bildschirm steht es fest links. Logik in kern/gespraeche.js. */
import { h, s, clockTime, reducedMotion } from "./dom.js";
import { go } from "./shell.js";
import { on } from "./state.js";
import { kundenfassung } from "./mandant.js";
import { GRUPPEN, gruppe as zeitGruppe } from "./chatverlauf.js";
import { suche, zuletzt, nachFahrzeug, eintraege } from "../kern/gespraeche.js";
import { SEITEN_TITEL } from "../kern/einstellungs-baum.js";

const SYMBOL = {
  suche: "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M15.4 15.4 20 20",
  berichte: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14.5l2 2 4-4",
  fahrzeuge: "M5.5 17.5h-1a1 1 0 0 1-1-1V13l2-5a2 2 0 0 1 1.9-1.3h9.2A2 2 0 0 1 18.5 8l2 5v3.5a1 1 0 0 1-1 1h-1M3.5 13h17M8.5 17.5h7M7 17.5a1.5 1.5 0 1 0 0 .01M17 17.5a1.5 1.5 0 1 0 0 .01",
  fahrt: "M4 17a8 8 0 1 1 16 0M12 17l3.5-5M12 17h.01M7 17h.01M17 17h.01",
  erkunden: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5z",
  stift: "M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
  zahnrad: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M10.3 3h3.4l.5 2.4 1.7 1 2.3-.8 1.7 2.9-1.8 1.6v2l1.8 1.6-1.7 2.9-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-2.9 1.8-1.6v-2L3.9 8.5l1.7-2.9 2.3.8 1.7-1z",
  zurueck: "M15 5l-7 7 7 7",
  stift2: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  muell: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
};
const svg = (name, cls = "cxp-sym") => s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: cls }, s("path", { d: SYMBOL[name] }));
const SCHMAL = window.matchMedia("(max-width: 899px)");
const WISCH_ZU = 70;
const TITEL = { suche: "Suchen", alle: "Alle Gespräche", fahrzeuge: "Fahrzeuge", berichte: "Berichte & Nachweise", fahrt: "Fahrt-Agent & Wartung" };

let api = null, ansicht = "haupt", sucheText = "", umbenennen = null, loeschFrage = null;
const el = (id) => document.getElementById(id);
const side = () => el("cx-side");
export const panelAuf = () => el("view-agent").classList.contains("side-auf");

/* ---------- Öffnen und Schließen ---------- */
export function oeffnePanel() {
  if (!SCHMAL.matches || panelAuf()) return;
  ansicht = "haupt"; sucheText = "";
  zeichnePanel();
  const a = side();
  Object.entries({ role: "dialog", "aria-modal": "true", "aria-label": "Assistent: Bereiche und Gespräche" }).forEach(([k, v]) => a.setAttribute(k, v));
  el("cx-schleier").hidden = false;
  el("cx-verlauf").setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => { el("view-agent").classList.add("side-auf"); a.classList.add("auf"); (a.querySelector(".cxp-titel-h") || a).focus({ preventScroll: true }); });
}
export function schliessePanel({ fokus = true } = {}) {
  if (!panelAuf()) return;
  el("view-agent").classList.remove("side-auf");
  side().classList.remove("auf");
  el("cx-schleier").hidden = true;
  el("cx-verlauf").setAttribute("aria-expanded", "false");
  const a = side();
  ["role", "aria-modal"].forEach((k) => a.removeAttribute(k));
  a.setAttribute("aria-label", "Assistent: Bereiche und Gespräche");
  a.style.transform = "";
  if (fokus) el("cx-verlauf").focus({ preventScroll: true });
}
/* Am Handy hängt das Panel direkt am body: .app ist ein Container (container-type), darin wäre position: fixed nicht
   am Bildschirm ausgerichtet. Am großen Bildschirm steht es wieder als Spalte im Assistenten. */
function einhaengen() {
  const a = side(), schleier = el("cx-schleier"), view = el("view-agent"), main = view.querySelector(".cx-main");
  if (SCHMAL.matches) { if (a.parentElement !== document.body) document.body.append(schleier, a); }
  else if (a.parentElement !== view) { view.insertBefore(a, main); view.insertBefore(schleier, main); }
}
function breiteGewechselt() { if (!SCHMAL.matches) schliessePanel({ fokus: false }); einhaengen(); }

/* ---------- Ziele ---------- */
/* Nach dem Seitenwechsel zum Abschnitt rollen, sobald er gezeichnet ist (Seiten laden teils nach). */
function zumAbschnitt(titel, versuche = 12) {
  const kopf = [...document.querySelectorAll(".view:not([hidden]) .li-k")].find((x) => x.textContent.trim() === titel);
  if (kopf) { kopf.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }); return; }
  if (versuche > 0) setTimeout(() => zumAbschnitt(titel, versuche - 1), 120);
}
function geheZu(ziel) {
  schliessePanel({ fokus: false });
  go(ziel.seite);
  if (ziel.abschnitt) requestAnimationFrame(() => zumAbschnitt(ziel.abschnitt));
}
/* Dieselbe Route wie das Zahnrad oben: die Übersicht »Einstellungen«, solange es sie noch nicht gibt »KI und Dienste«. */
const einstellungen = () => { schliessePanel({ fokus: false }); if (SEITEN_TITEL.einstellungen) go("seite", { sub: "einstellungen" }); else go("einstellungen"); };
function wechsle(neu) {
  ansicht = neu; umbenennen = loeschFrage = null;
  if (neu !== "suche") sucheText = "";
  zeichnePanel();
  requestAnimationFrame(() => { const ziel = side().querySelector(neu === "suche" ? ".cxp-feld" : neu === "haupt" ? ".cxp-titel-h" : ".cxp-zurueck"); if (ziel) ziel.focus({ preventScroll: true }); });
}

/* ---------- Bausteine ---------- */
const rund = (sym, label, tun, cls = "") => h("button", { class: `cxp-rund ${cls}`.trim(), type: "button", "aria-label": label, title: label, onclick: tun }, svg(sym));
function kopf() {
  if (ansicht === "haupt") return h("div", { class: "cxp-kopf" }, h("h2", { class: "cxp-titel-h", tabindex: "-1" }, "Assistent"), rund("suche", "Gespräche durchsuchen", () => wechsle("suche")));
  return h("div", { class: "cxp-kopf unter" }, rund("zurueck", "Zurück", () => wechsle("haupt"), "cxp-zurueck"), h("h2", { class: "cxp-titel-h klein", tabindex: "-1" }, TITEL[ansicht]));
}
const gespraechKnopf = (c, unter) => {
  const aktiv = c.id === api.aktivId();
  return h("button", { class: `cxp-gespraech${aktiv ? " aktiv" : ""}`, type: "button", "aria-current": aktiv ? "true" : null, onclick: () => api.oeffne(c.id) },
    h("span", { class: "cxp-g-t" }, c.titel), unter ? h("span", { class: "cxp-g-u" }, unter) : null);
};
const zielZeile = (z) => h("li", {}, h("button", { class: "cxp-ziel", type: "button", onclick: () => geheZu(z) },
  h("span", { class: "cxp-ziel-t" }, z.label, z.unter ? h("small", {}, z.unter) : null), h("span", { class: "li-chev", "aria-hidden": "true" }, "›")));
const leer = (text) => h("p", { class: "cxp-leer" }, text);

function haupt() {
  const alle = api.chats.alle(), letzte = zuletzt(alle);
  const eintrag = (e) => h("li", {}, h("button", { class: "cxp-eintrag", type: "button", onclick: () => (e.seite ? geheZu(e) : wechsle(e.id)) }, svg(e.id), h("span", {}, e.label)));
  return [
    h("nav", { class: "cxp-nav", "aria-label": "Bereiche" }, h("ul", { class: "cxp-liste" }, ...eintraege({ kunde: kundenfassung() }).map(eintrag))),
    h("hr", { class: "cxp-linie" }),
    h("section", { class: "cxp-zuletzt", "aria-labelledby": "cxp-zuletzt-t" }, h("h3", { class: "cxp-k", id: "cxp-zuletzt-t" }, "Zuletzt"),
      letzte.length ? h("ul", { class: "cxp-liste" }, ...letzte.map((c) => h("li", {}, gespraechKnopf(c)))) : leer("Noch keine Gespräche. Frag einfach los."),
      alle.length > 0 ? h("button", { class: "cxp-alle", type: "button", onclick: () => wechsle("alle") }, "Alle anzeigen …") : null),
  ];
}

function sucheAnsicht() {
  const feld = h("input", { class: "cxp-feld", type: "search", value: sucheText, placeholder: "Titel und Texte durchsuchen", "aria-label": "Gespräche durchsuchen", autocomplete: "off", enterkeyhint: "search" });
  feld.addEventListener("input", () => { sucheText = feld.value; const neu = treffer(); side().querySelector(".cxp-treffer").replaceWith(neu); });
  const treffer = () => {
    if (!sucheText.trim()) return h("div", { class: "cxp-treffer" }, leer("Sucht in den Titeln und Texten deiner Gespräche auf diesem Gerät."));
    const t = suche(api.chats.alle(), sucheText);
    return h("div", { class: "cxp-treffer", role: "status" }, t.length
      ? h("ul", { class: "cxp-liste" }, ...t.map((x) => h("li", {}, gespraechKnopf(x, x.ausschnitt))))
      : leer("Nichts gefunden."));
  };
  return [h("label", { class: "cxp-suchfeld" }, svg("suche"), feld), treffer()];
}

/* Volle Liste nach Zeit, mit Umbenennen und Löschen (wie bisher, mit Rückfrage) */
function zeile(c) {
  if (umbenennen === c.id) {
    const eingabe = h("input", { class: "inp", value: c.titel, maxlength: 120, "aria-label": "Neuer Titel" });
    const fertig = (speichern) => { if (umbenennen !== c.id) return; if (speichern) api.chats.umbenennen(c.id, eingabe.value); umbenennen = null; api.geaendert(); };
    eingabe.addEventListener("keydown", (ev) => { if (ev.key === "Enter") fertig(true); if (ev.key === "Escape") { ev.stopPropagation(); fertig(false); } });
    eingabe.addEventListener("blur", () => fertig(true));
    requestAnimationFrame(() => { eingabe.focus(); eingabe.select(); });
    return h("li", { class: "cx-chat bearbeiten" }, eingabe);
  }
  if (loeschFrage === c.id) return h("li", { class: "cx-chat frage" }, h("span", {}, `»${c.titel}« löschen?`),
    h("button", { class: "btn dng small", type: "button", onclick: () => { api.chats.loeschen(c.id); loeschFrage = null; api.geaendert(); } }, "Löschen"),
    h("button", { class: "btn qt small", type: "button", onclick: () => { loeschFrage = null; zeichnePanel(); } }, "Behalten"));
  const aktiv = c.id === api.aktivId();
  return h("li", { class: `cx-chat${aktiv ? " aktiv" : ""}` },
    h("button", { class: "cx-chat-auf", type: "button", "aria-current": aktiv ? "true" : null, onclick: () => api.oeffne(c.id) },
      h("span", { class: "cx-chat-t" }, c.titel), h("span", { class: "cx-chat-m" }, [c.fzName, clockTime(new Date(c.geaendert))].filter(Boolean).join(" · "))),
    h("button", { class: "cx-chat-x", type: "button", "aria-label": `»${c.titel}« umbenennen`, onclick: () => { umbenennen = c.id; zeichnePanel(); } }, svg("stift2", "")),
    h("button", { class: "cx-chat-x", type: "button", "aria-label": `»${c.titel}« löschen`, onclick: () => { loeschFrage = c.id; zeichnePanel(); } }, svg("muell", "")));
}
function alleAnsicht() {
  const alle = api.chats.alle();
  const gruppen = GRUPPEN.map((g) => [g, alle.filter((c) => zeitGruppe(c.geaendert) === g)]).filter(([, l]) => l.length);
  return gruppen.length ? gruppen.map(([g, l]) => h("section", { class: "cx-gruppe" }, h("h3", { class: "cxp-k" }, g), h("ul", { class: "cx-liste" }, ...l.map(zeile))))
    : [leer("Noch keine Gespräche.")];
}

function fahrzeugAnsicht() {
  const gruppen = nachFahrzeug(api.chats.alle());
  if (!gruppen.length) return [leer("Noch keine Gespräche. Jedes Gespräch merkt sich das Fahrzeug, mit dem es begonnen hat.")];
  return [...gruppen.map((g) => h("section", { class: "cxp-fz" }, h("h3", { class: "cxp-k" }, g.name, h("span", { class: "cxp-zahl" }, String(g.chats.length))),
    h("ul", { class: "cxp-liste" }, ...g.chats.map((c) => h("li", {}, gespraechKnopf(c)))))),
  h("p", { class: "cxp-fuss-hinweis" }, "Gespeichert wird nur Marke und Modell, nie FIN oder Kennzeichen.")];
}
const zielAnsicht = (id) => { const e = eintraege({ kunde: kundenfassung() }).find((x) => x.id === id); return [h("ul", { class: "cxp-liste cxp-ziele" }, ...(e ? e.ziele : []).map(zielZeile))]; };

/* ---------- Zeichnen ---------- */
export function zeichnePanel() {
  if (!api) return;
  const a = side();
  const feld = a.querySelector(".cxp-feld"), hatteFokus = feld && document.activeElement === feld;
  const inhalt = ansicht === "suche" ? sucheAnsicht() : ansicht === "alle" ? alleAnsicht() : ansicht === "fahrzeuge" ? fahrzeugAnsicht()
    : ansicht === "berichte" || ansicht === "fahrt" ? zielAnsicht(ansicht) : haupt();
  a.replaceChildren(kopf(), h("div", { class: "cxp-rumpf" }, ...inhalt),
    h("div", { class: "cxp-fuss" },
      h("button", { class: "cxp-neu", type: "button", onclick: () => api.neu() }, svg("stift"), h("span", {}, "Neues Gespräch")),
      rund("zahnrad", "Einstellungen", einstellungen)));
  const neuFeld = hatteFokus && a.querySelector(".cxp-feld");
  if (neuFeld) { neuFeld.focus(); neuFeld.setSelectionRange(neuFeld.value.length, neuFeld.value.length); }
}

/* Wischen nach links schließt: folgt dem Finger erst, wenn die Bewegung klar waagerecht ist; senkrecht bleibt Rollen. */
function wischen(a) {
  let start = null, dx = 0, waagerecht = false;
  a.addEventListener("pointerdown", (ev) => { if (!panelAuf() || ev.pointerType === "mouse") return; start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; dx = 0; waagerecht = false; });
  a.addEventListener("pointermove", (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    const x = ev.clientX - start.x, y = ev.clientY - start.y;
    if (!waagerecht) { if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { start = null; return; } if (x < -10 && Math.abs(x) > Math.abs(y)) { waagerecht = true; a.setPointerCapture(ev.pointerId); a.classList.add("zieht"); } else return; }
    dx = Math.min(0, x); a.style.transform = `translateX(${dx}px)`;
  });
  const ende = () => { if (!start) return; start = null; a.classList.remove("zieht"); a.style.transform = ""; if (waagerecht && dx < -WISCH_ZU) schliessePanel(); };
  a.addEventListener("pointerup", ende);
  a.addEventListener("pointercancel", ende);
}
/* Escape schließt; am Handy bleibt Tab im Panel */
function taste(ev) {
  if (!panelAuf()) return;
  if (ev.key === "Escape") { ev.preventDefault(); schliessePanel(); return; }
  if (ev.key !== "Tab") return;
  const fokusbar = [...side().querySelectorAll("button, input, [href], [tabindex='0']")].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!fokusbar.length) return;
  const erstes = fokusbar[0], letztes = fokusbar[fokusbar.length - 1];
  if (ev.shiftKey && (document.activeElement === erstes || !side().contains(document.activeElement))) { ev.preventDefault(); letztes.focus(); }
  else if (!ev.shiftKey && (document.activeElement === letztes || !side().contains(document.activeElement))) { ev.preventDefault(); erstes.focus(); }
}

/**
 * @param {{chats: object, aktivId: () => string|null, oeffne: (id: string) => void, neu: () => void, geaendert: () => void}} schnittstelle
 */
export function initPanel(schnittstelle) {
  api = schnittstelle;
  el("cx-verlauf").addEventListener("click", () => (panelAuf() ? schliessePanel() : oeffnePanel()));
  el("cx-schleier").addEventListener("click", () => schliessePanel());
  document.addEventListener("keydown", taste);
  SCHMAL.addEventListener("change", breiteGewechselt);
  wischen(side());
  einhaengen();
  on("tab", (id) => { if (id !== "agent") schliessePanel({ fokus: false }); });
  zeichnePanel();
}
