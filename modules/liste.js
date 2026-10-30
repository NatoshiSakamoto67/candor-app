/* Einstellungen-Liste wie bei Apple: Profilkarte (das Fahrzeug), darunter Gruppen mit farbigen Icon-Kacheln, Wert rechts,
   Pfeil oder Schalter. Dieselbe Liste ist am Handy die Startseite und am großen Bildschirm die linke Spalte.
   Gebaut wird einmal je Modus; danach werden nur Werte, Töne und die Markierung getauscht (kein Flackern, Fokus bleibt). */
import { $, h, icon, mark, storageGet, storageSet, toast } from "./dom.js";
import { state, on, emit, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go, currentRoute, openDisplaySettings } from "./shell.js";
import { BAUM, werte, zeilenFuer } from "../kern/einstellungs-baum.js";
import { kundenfassung, MANDANT, zumPortal } from "./mandant.js";
import { FUNKTIONEN } from "../kern/service-katalog.js";
import { ablauf, weiterText } from "../kern/ablauf.js";
import { erledigtHeute, buchLaenge } from "./service.js";
import { vehicleName } from "./fahrzeuge.js";
import { plate, vehicles } from "./garage.js";
import { setzeModus, modus } from "./einfach.js";

/* Schreibschutz wie der Flugmodus: an heißt, CANdor schreibt nichts ins Auto. Gilt in approval.js vor jeder Freigabe. */
export const schreibschutzAn = () => storageGet("kfzdiag-schreibschutz", false) === true;
const SCHALTER = {
  schreibschutz: { an: schreibschutzAn, setzen: (an) => { storageSet("kfzdiag-schreibschutz", an); toast(an ? "Schreibschutz an. CANdor schreibt nichts ins Auto." : "Schreibschutz aus. Schreiben nur mit Halte-Freigabe."); emit("render"); } },
  fernzugriff: { an: () => false, setzen: () => toast("Fernzugriff kommt später.") },
};
const AKTION = {
  vollscan: () => { if (!state.status) { go("connect"); return; } go("car"); if (!state.scanning) emit("run-scan"); },
  anzeige: () => openDisplaySettings(),
  cockpit: () => { go("start"); requestAnimationFrame(() => { const w = $("widgets"); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" }); }); },
  suche: () => emit("open-search"),
  modus: () => { setzeModus(modus() === "einfach" ? "profi" : "einfach"); toast(modus() === "einfach" ? "Einfacher Modus: nur das Wichtigste." : "Profi-Modus: alle Werkzeuge."); },
  panne: () => go("start"),
  portal: () => zumPortal(),
};
const einfach = () => document.documentElement.dataset.modus === "einfach";

function stand() {
  const live = state.live || {}, r = firstReadiness();
  const rpm = live.DREHZAHL && live.DREHZAHL.wert, volt = live.SPANNUNG && live.SPANNUNG.wert;
  const st = state.status || {};
  return {
    verbunden: Boolean(state.status), quelle: state.src ? (state.src.mode === "direkt" ? "bluetooth" : state.src.mode) : null,
    protokoll: (st.protokoll || (state.vehicle && state.vehicle.protokoll)) ? (st.protokoll || state.vehicle.protokoll).replace(/ \(simuliert\)/, "").replace(/^.*CAN.*?(\d+) kbit\/s.*$/, "CAN $1 kbit/s").split(",")[0] : null,
    steuergeraete: state.ecus.length, scanned: state.scanned, scanning: state.scanning, scanPct: state.scanPct,
    spannung: typeof volt === "number" ? volt : null, motorLaeuft: typeof rpm === "number" && rpm > 100,
    gespeichert: state.status ? totalFaults() : 0, vorlaeufig: state.status ? pendingFaults().length : 0,
    readinessOffen: r ? r.tests.filter((t) => !t.fertig).length : null, readinessGesamt: r ? r.tests.length : null,
    service: FUNKTIONEN.filter((f) => !einfach() || f.einfach).length, ki: st.ki || null, modus: modus(),
    betriebsbuch: buchLaenge(), nachher: Boolean(state.postscan),
  };
}

/* Eigene Glas-Icons (icons/liste/*.png) wo vorhanden, sonst Linienzeichen auf einer Kachel mit gleichem Glanz. */
const bildIcon = (name) => h("img", { src: `icons/liste/${name}.png`, alt: "", width: 30, height: 30, decoding: "async", draggable: "false" });
function kachel(z) {
  if (z.bild) return h("span", { class: "li-ic li-bild", "aria-hidden": "true" }, bildIcon(z.bild));
  return h("span", { class: "li-ic", style: `--c:${z.farbe}`, "aria-hidden": "true" }, icon(z.icon));
}

function zeile(z, refs) {
  const wert = h("span", { class: "li-v" });
  refs.set(z.id, { wert, el: null, z });
  if (z.schalter) {
    const sw = SCHALTER[z.schalter];
    const inp = h("input", { type: "checkbox", role: "switch", class: "li-sw", id: `sw-${z.id}`, disabled: z.bald || null });
    inp.addEventListener("change", () => sw.setzen(inp.checked));
    const el = h("label", { class: `li-row${z.bald ? " bald" : ""}`, for: `sw-${z.id}`, "data-id": z.id }, kachel(z), h("span", { class: "li-t" }, z.label), z.bald ? wert : null, inp);
    refs.get(z.id).el = el; refs.get(z.id).inp = inp;
    return el;
  }
  const href = z.ziel ? `#${z.ziel}${z.sub ? `/${z.sub}` : ""}` : "#";
  const el = h("a", { class: `li-row${z.bald ? " bald" : ""}`, href, "data-id": z.id, "aria-disabled": z.bald ? "true" : null, onclick: (ev) => {
    ev.preventDefault();
    if (z.bald) { toast(`${z.label} kommt später.`); return; }
    if (z.aktion) AKTION[z.aktion](); else go(z.ziel, z.sub ? { sub: z.sub } : {});
  } }, kachel(z), h("span", { class: "li-t" }, z.label), wert, h("span", { class: "li-chev", "aria-hidden": "true" }, "›"));
  refs.get(z.id).el = el;
  return el;
}

function profilkarte(refs) {
  const fz = state.fahrzeug;
  const name = fz ? vehicleName(fz) : "Kein Fahrzeug";
  const kuerzel = fz ? (String(fz.marke || "?")[0] + String(fz.modell || "")[0]).toUpperCase() : "+";
  const karte = h("div", { class: "li-gruppe li-profil" },
    h("a", { class: "li-row li-row-profil", href: "#seite/profil", "data-id": "profil", onclick: (ev) => { ev.preventDefault(); if (fz) go("seite", { sub: "profil" }); else go("fahrzeug"); } },
      h("span", { class: `li-avatar${fz ? " li-avatar-bild" : ""}`, "aria-hidden": "true" }, fz ? bildIcon("auto") : kuerzel),
      h("span", { class: "li-t" }, h("span", { class: "li-name" }, name), h("span", { class: "li-unter" }, fz ? "Fahrzeugakte, Wartung, Fehler und mehr" : "Fahrzeug anlegen oder wählen")),
      fz && (fz.kennzeichen || "").trim() ? h("span", { class: "li-plate" }, plate(fz, true)) : null,
      h("span", { class: "li-chev", "aria-hidden": "true" }, "›")),
    h("a", { class: "li-row", href: "#seite/fuhrpark", "data-id": "fuhrpark", onclick: (ev) => { ev.preventDefault(); go("seite", { sub: "fuhrpark" }); } },
      h("span", { class: "li-ic li-bild", "aria-hidden": "true" }, bildIcon("auto")), h("span", { class: "li-t" }, "Fuhrpark"),
      h("span", { class: "li-v" }, String(vehicles().length)), h("span", { class: "li-chev", "aria-hidden": "true" }, "›")));
  refs.set("profil", { el: karte.firstChild }); refs.set("fuhrpark", { el: karte.lastChild });
  return karte;
}

/* Hinweis unter dem Profil wie Apples »Einrichtung abschließen«: der nächste Schritt des roten Fadens. */
function naechster(refs) {
  const box = h("a", { class: "li-gruppe li-naechster", href: "#", onclick: (ev) => { ev.preventDefault(); const n = box._ziel; if (n) n(); } },
    h("span", { class: "li-t" }, h("span", { class: "li-name" }), h("span", { class: "li-unter" })), h("span", { class: "li-zahl" }), h("span", { class: "li-chev", "aria-hidden": "true" }, "›"));
  refs.set("naechster", { el: box });
  return box;
}

const listen = new Map(); /* container-id → { key, refs } */
export function zeichneListe(containerId, { kompakt = false } = {}) {
  const box = $(containerId);
  if (!box) return;
  const key = JSON.stringify([einfach(), state.fahrzeug && [state.fahrzeug.id, state.fahrzeug.marke, state.fahrzeug.modell, state.fahrzeug.kennzeichen], vehicles().length]);
  let l = listen.get(containerId);
  if (!l || l.key !== key) {
    const refs = new Map();
    box.replaceChildren(...[
      kompakt ? null : h("h1", { class: "li-titel" }, kundenfassung() && MANDANT() ? MANDANT().titel : "CANdor"),
      profilkarte(refs),
      naechster(refs),
      ...BAUM.map((g) => {
        const zeilen = g.zeilen.filter(zeilenFuer({ kunde: kundenfassung(), einfach: einfach() }));
        if (!zeilen.length) return null;
        return h("section", { class: "li-block", "aria-label": g.titel || null }, g.titel ? h("h2", { class: "li-k" }, g.titel) : null, h("div", { class: "li-gruppe" }, ...zeilen.map((z) => zeile(z, refs))));
      })].filter(Boolean));
    l = { key, refs };
    listen.set(containerId, l);
  }
  aktualisiere(l.refs);
}

function aktualisiere(refs) {
  const s = stand(), w = werte(s);
  for (const [id, r] of refs) {
    if (r.wert && w[id]) {
      const t = w[id].text;
      if (r.wert.textContent !== t) r.wert.textContent = t;
      const cls = `li-v${w[id].ton ? ` t-${w[id].ton}` : ""}`;
      if (r.wert.className !== cls) r.wert.className = cls;
    }
    if (r.inp && SCHALTER[r.z.schalter]) r.inp.checked = SCHALTER[r.z.schalter].an();
  }
  /* Markierung: nur die erste Zeile, die zur offenen Seite führt */
  const seite = currentRoute().page;
  const sub = currentRoute().sub;
  const erste = seite === "seite" ? (sub === "profil" ? "profil" : sub === "fuhrpark" ? "fuhrpark" : ([...refs.values()].find((r) => r.z && r.z.ziel === "seite" && r.z.sub === sub) || {}).z?.id)
    : seite === "fahrzeug" ? "profil" : seite === "fahrzeuge" ? "fuhrpark" : ([...refs.values()].find((r) => r.z && r.z.ziel === seite) || {}).z?.id;
  for (const [id, r] of refs) {
    if (!r.el || id === "naechster") continue;
    if (id === erste) r.el.setAttribute("aria-current", "page"); else r.el.removeAttribute("aria-current");
  }
  /* Nächster Schritt */
  const n = refs.get("naechster");
  if (n) {
    const ab = ablauf({ fahrzeug: Boolean(state.fahrzeug), verbunden: s.verbunden, scanning: s.scanning, scanPct: s.scanPct, scanned: s.scanned, steuergeraete: s.steuergeraete,
      mitFehler: state.ecus.filter((e) => e.fehler.length).length, gespeichert: s.gespeichert, vorlaeufig: s.vorlaeufig, motorLaeuft: s.motorLaeuft, spannung: s.spannung,
      readinessOffen: s.readinessOffen, serviceErledigt: erledigtHeute(), eingang: Boolean(state.snapshot), nachher: s.nachher });
    const j = ab.schritte.find((x) => x.jetzt), nr = ab.schritte.indexOf(j) + 1;
    const fertig = j.id === "abschluss" && s.nachher;
    n.el.querySelector(".li-name").textContent = fertig ? "Diagnose abgeschlossen" : weiterText(ab.jetzt, s);
    n.el.querySelector(".li-unter").textContent = fertig ? "Bericht ist bereit" : `Schritt ${nr} von 7 · ${j.text}`;
    n.el.querySelector(".li-zahl").textContent = `${ab.schritte.filter((x) => x.zustand === "fertig").length}/7`;
    n.el._ziel = () => (j.id === "scan" ? AKTION.vollscan() : j.id === "fahrzeug" && !vehicles().length ? go("fahrzeug") : go(j.ziel));
  }
}

export function aktualisiereListen() {
  for (const id of listen.keys()) zeichneListe(id, { kompakt: id === "tabbar-liste" });
}
