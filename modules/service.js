/* Service und Anlernen: links der Katalog nach Arbeit geordnet (Suche mit Alltagswörtern), rechts der Assistent für
   die gewählte Funktion: Was und warum, Vorbereitung, Vorbedingungen live gemessen, Freigabe, Ergebnis.
   Unten das Betriebsbuch: jede Freigabe und jedes Ergebnis als Glied einer SHA-256-Kette (kern/betriebsbuch.js). */
import { $, h, icon, mark, toast, chev, storageGet, storageSet, clockTime } from "./dom.js";
import { state, on, emit, logEvent } from "./state.js";
import { go, currentRoute } from "./shell.js";
import { startAction } from "./approval.js";
import { GRUPPEN, FUNKTIONEN, suche, pruefeVorbedingungen, alleErfuellt, verfuegbarkeit } from "../kern/service-katalog.js";
import { anhaengen, pruefen } from "../kern/betriebsbuch.js";

const BUCH_KEY = "kfzdiag-betriebsbuch";
const STUFE = {
  bereit: { tone: "ok", text: "bereit" },
  gesperrt: { tone: "locked", text: "gesperrt" },
  fehlt: { tone: "pending", text: "nicht hinterlegt" },
  anleitung: { tone: "accent", text: "Anleitung" },
};
const RISIKO = { niedrig: "ok", mittel: "warn", hoch: "crit" };
const einfach = () => document.documentElement.dataset.modus === "einfach";
const schreibenAn = () => Boolean(state.status && state.status.schreiben_an);
const fzName = () => (state.fahrzeug ? [state.fahrzeug.marke, state.fahrzeug.modell].filter(Boolean).join(" ") : (state.status && state.status.fahrzeug) || "");

let suchText = "";
let bestaetigt = new Set();

/* ---------- Betriebsbuch ---------- */
let buch = storageGet(BUCH_KEY, []);
let buchStand = { ok: true, bruch: -1, laenge: buch.length };
let warteschlange = Promise.resolve();
export function eintragen(typ, daten) {
  warteschlange = warteschlange.then(async () => {
    buch = await anhaengen(buch, { typ, daten: { fahrzeug: fzName(), ...daten } });
    storageSet(BUCH_KEY, buch);
    buchStand = await pruefen(buch);
    renderBuch();
  }).catch((e) => toast(`Betriebsbuch nicht geschrieben: ${e.message}`));
  return warteschlange;
}
/* Erledigte Arbeiten heute am gewählten Fahrzeug, für den Ablauf auf der Startseite. */
export function erledigtHeute() {
  const heute = new Date().toDateString(), fz = fzName();
  return buch.filter((g) => ["ausgefuehrt", "anleitung"].includes(g.typ) && new Date(g.zeit).toDateString() === heute && (g.daten || {}).fahrzeug === fz && (g.daten || {}).funktion).length;
}
const TYP_TEXT = {
  angefordert: "Freigabe angefordert", abgelehnt: "Abgelehnt, nichts geschrieben", gestoppt: "Gestoppt vor dem Schreiben",
  gescheitert: "Nicht bestätigt", ausgefuehrt: "Ausgeführt", anleitung: "Handablauf erledigt",
};
const TYP_TON = { angefordert: "pending", abgelehnt: "silent", gestoppt: "warn", gescheitert: "crit", ausgefuehrt: "ok", anleitung: "ok" };
function renderBuch() {
  const box = $("sv-buch");
  if (!box) return;
  const zeilen = buch.slice(-40).reverse();
  box.replaceChildren(
    h("div", { class: "sec-head" }, h("div", {}, h("p", { class: "eyebrow" }, "Was das Programm geschrieben hat"), h("h2", { class: "h3" }, "Betriebsbuch")),
      h("span", { class: `kette ${buchStand.ok ? "ok" : "bruch"}` }, mark(buchStand.ok ? "ok" : "crit"),
        buchStand.ok ? `Kette geprüft, keine Änderung · ${buch.length} ${buch.length === 1 ? "Eintrag" : "Einträge"}` : `Kette gebrochen bei Eintrag ${buchStand.bruch + 1}`)),
    zeilen.length ? h("ol", { class: "chronik" }, ...zeilen.map((g) => {
      const d = g.daten || {};
      const zeit = new Date(g.zeit);
      return h("li", { class: `ch-i t-${TYP_TON[g.typ] || "neutral"}` },
        h("time", { class: "ch-t num", datetime: g.zeit }, `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${clockTime(zeit)}`),
        h("span", { class: "ch-p", "aria-hidden": "true" }),
        h("span", { class: "ch-x" }, h("strong", {}, d.funktion || d.operation || "Aktion"), h("span", {}, ` · ${TYP_TEXT[g.typ] || g.typ}`),
          d.antwort ? h("span", { class: "mono sm" }, ` · Antwort ${d.antwort}`) : null, d.grund || d.meldung ? h("span", { class: "sm" }, ` · ${d.grund || d.meldung}`) : null,
          d.fahrzeug ? h("span", { class: "ch-fz sm" }, d.fahrzeug) : null),
        h("span", { class: "ch-h mono", title: `prev ${g.prev}\nhash ${g.hash}` }, g.hash.slice(0, 8)));
    })) : h("p", { class: "hint" }, "Noch nichts geschrieben. Jede Freigabe und jedes Ergebnis landet hier, verkettet und prüfbar."));
}

/* ---------- Katalog ---------- */
function zeile(fn) {
  const v = verfuegbarkeit(fn, state.functions, schreibenAn());
  const st = STUFE[v.stufe];
  const r = currentRoute();
  return h("button", { class: "sv-row", type: "button", "aria-current": r.sub === fn.id ? "true" : null, onclick: () => go("service", { sub: fn.id }) },
    h("span", { class: "sv-row-t" }, h("span", { class: "t" }, fn.name), h("span", { class: "d" }, fn.zweck)),
    h("span", { class: "sv-row-m" },
      h("span", { class: `sv-pill t-${RISIKO[fn.risiko]}` }, `Risiko ${fn.risiko}`),
      h("span", { class: "sv-pill" }, fn.dauer),
      h("span", { class: `sv-stufe t-${st.tone}` }, mark(st.tone), st.text)),
    chev());
}
function renderKatalog() {
  const { treffer, verboten } = suche(suchText, { einfach: einfach() });
  const gruppen = GRUPPEN.map((g) => ({ g, fns: treffer.filter((f) => f.gruppe === g.id) })).filter((x) => x.fns.length);
  $("sv-liste").replaceChildren(
    ...verboten.map((v) => h("div", { class: "sv-verboten", role: "note" }, mark("locked"), h("span", {}, h("strong", {}, `${v.name}: gibt es in CANdor nicht. `), v.grund))),
    ...gruppen.map(({ g, fns }) => h("section", { class: "sv-gruppe" }, h("h3", { class: "sv-gk" }, g.label, h("span", { class: "sm" }, ` · ${g.text}`)), h("div", { class: "sv-karte" }, ...fns.map(zeile)))),
    weitere(),
    !gruppen.length && !verboten.length ? h("p", { class: "hint" }, "Nichts gefunden. Versuch es mit einem Bauteil, etwa Batterie, Bremse, Reifen.") : null);
}

/* Im Fahrzeugprofil hinterlegte Funktionen ohne Platz im Katalog, etwa Stellgliedtests. Öffnen die Infoseite mit Start. */
function weitere() {
  if (einfach() || suchText.trim()) return null;
  const gemappt = new Set(FUNKTIONEN.flatMap((f) => f.profil));
  const extra = ((state.functions && state.functions.funktionen) || []).filter((p) => !gemappt.has(p.id));
  if (!extra.length) return null;
  return h("section", { class: "sv-gruppe" }, h("h3", { class: "sv-gk" }, "Weitere für dieses Fahrzeug", h("span", { class: "sm" }, " · Stellgliedtests und Routinen aus dem Profil")),
    h("div", { class: "sv-karte" }, ...extra.map((p) => h("button", { class: "sv-row", type: "button", "data-info": `fn:${p.id}` },
      h("span", { class: "sv-row-t" }, h("span", { class: "t" }, p.name), h("span", { class: "d" }, `${p.modul} · ${p.art}`)),
      h("span", { class: "sv-row-m" }, h("span", { class: "sv-pill mono" }, p.anfrage)), chev()))));
}

/* ---------- Assistent ----------
   Einmal bauen je Funktion und Verfügbarkeit, danach nur Messwerte, Zustände und den Knopf im Stand ändern.
   So bleibt der Fokus, ein Druck auf den Knopf geht nicht verloren und Vorleser sagen nicht jede Sekunde alles neu. */
const TON = { ok: "ok", fehlt: "crit", unbekannt: "unknown", offen: "pending" };
let ansicht = null; /* { key, fn, v, zeilen: Map(id → {li, mark, ist, cb}), knopf, hinweis, zahl, ansage, warAlles } */

function vbZeile(z) {
  if (z.art === "bestaetigen") {
    const cb = h("input", { type: "checkbox", id: `vb-${z.id}` });
    cb.addEventListener("change", () => { if (cb.checked) bestaetigt.add(z.id); else bestaetigt.delete(z.id); patch(); });
    const status = h("span", { class: "vb-w sm" });
    const li = h("li", { class: "vb" }, h("label", { class: "vb-l", for: `vb-${z.id}` }, cb, h("span", {}, z.text)), status);
    return { li, cb, status };
  }
  const markBox = h("span", { class: "vb-m" }), ist = h("span", { class: "num vb-ist" });
  const li = h("li", { class: "vb", "data-vb": z.id }, markBox, h("span", { class: "vb-l" }, z.text), h("span", { class: "vb-w" }, ist, h("span", { class: "sm vb-soll" }, `Soll ${z.soll}`)));
  return { li, markBox, ist };
}
const offenText = (zeilen) => {
  const z = zeilen.find((x) => x.zustand !== "ok");
  return z ? (z.zustand === "fehlt" ? `${z.text}: gemessen ${z.ist}, nötig ${z.soll}.` : z.zustand === "unbekannt" ? `${z.text}: kein Messwert.` : `${z.text}: noch nicht bestätigt.`) : null;
};

function profilName(id) {
  const p = ((state.functions && state.functions.funktionen) || []).find((x) => x.id === id);
  return p ? p.name : id;
}
function aktion(fn, v) {
  if (einfach() && !fn.einfach) {
    return { el: h("div", { class: "sv-akt sv-hinweis t-pending" }, mark("pending"), h("p", {}, "Diese Arbeit ist für die Werkstatt gedacht. Im Profi-Modus kannst du sie ausführen."),
      h("div", { class: "row-actions" }, h("button", { class: "btn sec", type: "button", onclick: () => emit("modus-setzen", "profi") }, "Zum Profi-Modus"))), knoepfe: [] };
  }
  if (v.stufe === "anleitung") {
    const k = h("button", { class: "btn pri big-btn", type: "button", onclick: () => {
      k.disabled = true;
      eintragen("anleitung", { funktion: fn.name, vorbedingungen: pruefeVorbedingungen(fn, state.live, bestaetigt).map((z) => `${z.id}:${z.zustand}`) });
      logEvent(`${fn.name}: Handablauf erledigt`);
      bestaetigt = new Set();
      toast("Im Betriebsbuch eingetragen.");
      k.lastChild.textContent = "Eingetragen";
    } }, icon("tick"), "Erledigt, ins Betriebsbuch");
    return { el: h("div", { class: "sv-akt" }, k), knoepfe: [k] };
  }
  if (v.stufe !== "bereit") {
    return { el: h("div", { class: `sv-akt sv-hinweis t-${STUFE[v.stufe].tone}` }, mark(STUFE[v.stufe].tone), h("p", {}, v.grund),
      h("div", { class: "row-actions" },
        h("button", { class: "btn sec", type: "button", onclick: () => go("check", { sub: "rmi" }) }, icon("doc"), "In Herstellerdokumenten suchen"),
        h("button", { class: "btn qt", type: "button", onclick: () => { go("agent"); emit("chat-prefill", `Wie geht „${fn.name}“ bei meinem Fahrzeug?`); } }, icon("chat"), "Assistent fragen"))), knoepfe: [] };
  }
  /* Je hinterlegter Profil-Funktion ein Knopf (etwa Feststellbremse öffnen und wieder schließen). */
  const knoepfe = v.profilIds.map((id, i) => h("button", { class: `btn ${fn.risiko === "hoch" ? "dng" : "pri"} big-btn${i ? " sec-run" : ""}`, type: "button", onclick: () => {
    const jetzt = pruefeVorbedingungen(fn, state.live, bestaetigt);
    const offen = offenText(jetzt);
    if (offen) { toast(offen); patch(); return; }
    startAction({ typ: "funktion", funktion: id }, { vorbedingungen: jetzt, vorpruefung: () => offenText(pruefeVorbedingungen(fn, state.live, bestaetigt)) });
  } }, icon("lock"), v.profilIds.length > 1 ? `${profilName(id)}: freigeben` : "Freigeben und ausführen"));
  return { el: h("div", { class: "sv-akt" }, ...knoepfe), knoepfe };
}

function renderAssistent() {
  const box = $("sv-assistent"), r = currentRoute();
  const fn = FUNKTIONEN.find((f) => f.id === r.sub);
  $("view-service").classList.toggle("hat-auswahl", Boolean(fn));
  if (!fn) {
    ansicht = null;
    box.replaceChildren(h("div", { class: "sv-leer" }, h("span", { class: "sv-leer-ic", "aria-hidden": "true" }, icon("wrench")),
      h("h2", { class: "h3" }, "Funktion wählen"), h("p", { class: "sm" }, "Links eine Arbeit wählen. Hier siehst du dann Schritt für Schritt, was nötig ist, und was gerade gemessen wird.")));
    return;
  }
  const v = verfuegbarkeit(fn, state.functions, schreibenAn());
  const key = JSON.stringify([fn.id, v, einfach()]);
  if (ansicht && ansicht.key === key) { patch(); return; }
  const start = pruefeVorbedingungen(fn, state.live, bestaetigt);
  const zeilen = new Map(start.map((z) => [z.id, vbZeile(z)]));
  const akt = aktion(fn, v);
  const zahl = h("span", { class: "num sv-zahl" });
  const hinweis = h("p", { class: "sm sv-offen" });
  const ansage = h("p", { class: "sr", "aria-live": "polite" });
  box.replaceChildren(
    h("button", { class: "btn qt small sv-zurueck", type: "button", onclick: () => go("service") }, icon("back"), "Alle Funktionen"),
    h("header", { class: "sv-kopf" },
      h("p", { class: "eyebrow" }, GRUPPEN.find((g) => g.id === fn.gruppe).label),
      h("h2", { class: "h2" }, fn.name),
      h("p", { class: "lead" }, fn.zweck),
      h("div", { class: "sv-pills" }, h("span", { class: `sv-pill t-${RISIKO[fn.risiko]}` }, `Risiko ${fn.risiko}`), h("span", { class: "sv-pill" }, fn.dauer),
        h("span", { class: "sv-pill" }, fn.weg === "schreibt" ? "schreibt ins Auto" : "schreibt nichts"), h("span", { class: "sv-pill" }, fn.umkehrbar ? "umkehrbar" : "nicht umkehrbar")),
      fn.hinweis ? h("p", { class: "sv-grenz" }, mark("warn"), fn.hinweis) : null),
    h("ol", { class: "sv-schritte" },
      fn.schritte.length ? h("li", { class: "sv-s" }, h("h3", { class: "sv-sk" }, "Vorbereiten"), h("ul", { class: "sv-prep" }, ...fn.schritte.map((t) => h("li", {}, t)))) : null,
      h("li", { class: "sv-s" }, h("h3", { class: "sv-sk" }, "Vorbedingungen", zahl),
        h("ul", { class: "vb-liste" }, ...[...zeilen.values()].map((z) => z.li)),
        h("p", { class: "sm" }, fn.weg === "schreibt" ? "Messwerte kommen jede Sekunde neu. Was sich nicht messen lässt, bestätigst du." : "Hier bestätigst du selbst, das Programm misst nichts."), ansage),
      h("li", { class: "sv-s" }, h("h3", { class: "sv-sk" }, v.stufe === "anleitung" ? "Abschließen" : "Ausführen"), akt.el, hinweis),
      h("li", { class: "sv-s" }, h("h3", { class: "sv-sk" }, "Danach prüfen"), h("p", { class: "p" }, fn.nachher))));
  ansicht = { key, fn, zeilen, knoepfe: akt.knoepfe, zahl, hinweis, ansage, warAlles: null };
  patch();
}

/* Nur Zustände, Messwerte, Zähler und Knöpfe anpassen. */
function patch() {
  if (!ansicht) return;
  const liste = pruefeVorbedingungen(ansicht.fn, state.live, bestaetigt);
  for (const z of liste) {
    const el = ansicht.zeilen.get(z.id);
    if (!el) continue;
    const ton = TON[z.zustand] || "pending";
    const cls = `vb t-${ton}`;
    if (el.li.className !== cls) el.li.className = cls;
    if (el.cb) { el.cb.checked = z.zustand === "ok"; el.status.textContent = z.zustand === "ok" ? "bestätigt" : "bitte bestätigen"; continue; }
    if (el.ist.textContent !== z.ist) el.ist.textContent = z.ist;
    if (el.markBox.dataset.ton !== ton) { el.markBox.dataset.ton = ton; el.markBox.replaceChildren(mark(ton)); }
  }
  const erfuellt = liste.filter((z) => z.zustand === "ok").length, alles = alleErfuellt(liste);
  ansicht.zahl.textContent = `${erfuellt}/${liste.length}`;
  for (const k of ansicht.knoepfe) if (k.lastChild.textContent !== "Eingetragen") k.disabled = !alles;
  ansicht.hinweis.textContent = ansicht.knoepfe.length ? (alles ? (ansicht.fn.weg === "schreibt" ? "Öffnet die Freigabe. Erst wenn du hältst, wird geschrieben. Kurz davor wird noch einmal gemessen." : "") : offenText(liste)) : "";
  if (ansicht.warAlles !== null && ansicht.warAlles !== alles) ansicht.ansage.textContent = alles ? "Alle Vorbedingungen erfüllt." : `Vorbedingung nicht mehr erfüllt: ${offenText(liste)}`;
  ansicht.warAlles = alles;
}

function aktualisieren() {
  if (!$("view-service").hidden) patch();
}

export function renderService() {
  renderKatalog();
  renderAssistent();
  renderBuch();
}

export function initService() {
  const feld = $("sv-suche");
  feld.addEventListener("input", () => { suchText = feld.value; renderKatalog(); });
  on("tab", (id) => { if (id === "service") renderService(); });
  /* Bestätigungen gelten nur für diesen einen Durchgang: neu bei jeder Auswahl, jedem Fahrzeugwechsel, nach jedem Ergebnis. */
  on("service-sub", () => { bestaetigt = new Set(); ansicht = null; renderService(); });
  on("fahrzeug-aktiv", () => { bestaetigt = new Set(); ansicht = null; });
  on("render", () => { if (!$("view-service").hidden) renderService(); });
  on("status", aktualisieren);
  on("modus", () => { if (!$("view-service").hidden) renderService(); });
  on("aktion-ergebnis", (e) => { if (e.phase !== "angefordert") { bestaetigt = new Set(); patch(); } });
  on("aktion-ergebnis", (e) => eintragen(e.phase, { operation: e.operation, funktion: e.funktion, risiko: e.risiko, antwort: e.antwort, grund: e.grund, meldung: e.meldung, codes: e.codes,
    vorbedingungen: e.vorbedingungen ? e.vorbedingungen.map((z) => `${z.id}:${z.zustand}${z.ist ? `=${z.ist}` : ""}`) : undefined }));
  pruefen(buch).then((r) => { buchStand = r; renderBuch(); });
}
