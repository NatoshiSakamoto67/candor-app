/* Bereich Fahrzeug: Fahrzeugkopf, Topologie (Bauart-Vorlage oder Bus-Schema) mit Legende und Zoom,
   Vollscan mit Fortschritt im Knopf, Zustandskacheln, Steuergeräteliste nach Domäne, Akte. */
import { $, h, s, icon, mark, glyphId, chev, clockTime, storageGet, storageSet, toast, infoBtn, statusChip, reducedMotion } from "./dom.js";
import { state, on, emit, logEvent, firstReadiness, totalFaults, takeSnapshot, completeSnapshot, faultSet } from "./state.js";
import { UNASSIGNED, ZONE_ORDER, domainOf, domainName, byAddress } from "./topology.js";
import { busy, showFailure, withTimeout, HILFE } from "./vorgang.js";
import { icon3d } from "./icons3d.js";
import { go } from "./shell.js";
import { plate, vehicleFacts } from "./garage.js";
import { vehicleName, BAUARTEN } from "./fahrzeuge.js";
import { erstelle3d, webglMoeglich, GRUPPE_BAUTEILE } from "./auto3d.js";
import { bauteileFuer, kontextFuer, ersatzFuer, bauteilFuerSteuergeraet } from "../kern/bauteilfehler.js";

/* ---------- Fahrzeugkopf: gewähltes Fahrzeug aus dem Bestand, darunter was der Adapter erkannt hat ---------- */
export function renderVehicleCard() {
  const st = state.status, v = state.vehicle || {}, fz = state.fahrzeug;
  const box = $("vehicle-card");
  if (!fz) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  /* Schmaler Streifen: Kennzeichen, Name, Verbindungszustand; alles Weitere hinter einem kleinen Menü. */
  const zustand = state.connLost ? ["crit", "Verbindung weg"] : !st ? ["neutral", "nicht verbunden"] : st.simuliert ? ["warn", "Simulator"] : v.mode === "demo" ? ["warn", "Vorschau"] : ["ok", "verbunden"];
  box.replaceChildren(...[
    h("div", { class: "vstrip" },
      plate(fz, "sm"),
      h("button", { class: "vstrip-name unbtn", type: "button", "data-info": `fahrzeug:${fz.id}`, "aria-label": `${vehicleName(fz)}, Details` },
        h("b", {}, vehicleName(fz)), vehicleFacts(fz) ? h("span", { class: "sm" }, vehicleFacts(fz)) : null),
      h("span", { class: `cs t-${zustand[0]} vstrip-zu`, title: zustand[1] }, zustand[0] !== "neutral" ? mark(zustand[0]) : null, h("span", { class: "vstrip-zu-t" }, zustand[1])),
      h("div", { class: "vstrip-tools" },
        st ? h("button", { class: "icb", type: "button", "aria-label": "Neu verbinden", title: "Neu verbinden", onclick: () => emit("reconnect") }, icon("reset")) : null,
        h("button", { class: "icb", type: "button", "aria-label": "Fahrzeug wechseln", title: "Fahrzeug wechseln", onclick: () => go("fahrzeuge") }, icon("car")))),
    state.finWarnung ? h("div", { class: "fin-warn", role: "alert" }, mark("warn"),
      h("span", {}, `Das verbundene Auto meldet Herstellercode ${(v.vin_maskiert || "").slice(0, 3)}, die hinterlegte FIN beginnt mit ${(fz.fin || "").slice(0, 3)}. Ist das richtige Fahrzeug gewählt?`),
      h("button", { class: "btn sec small", type: "button", onclick: () => go("fahrzeuge") }, "Anderes wählen")) : null].filter(Boolean));
}

/* ---------- Knoten: gescannte Steuergeräte plus Profil-Module, die (noch) nicht geantwortet haben ---------- */
export function topoNodes() {
  const found = state.ecus.map((e) => ({ ...e, zustand: e.fehler.length ? "crit" : "ok" }));
  const missing = ((state.status && state.status.module) || []).filter((m) => !found.some((e) => e.adresse === m.adresse))
    .map((m) => ({ name: m.name, adresse: m.adresse, fehler: [], unknown: true, zustand: state.scanned ? "silent" : "pending" }));
  return [...found, ...missing].sort(byAddress);
}
const ZUSTAND = {
  ok: { text: "ohne Fehler", tone: "ok" }, crit: { text: "mit Fehlern", tone: "crit" },
  silent: { text: "erwartet, aber stumm", tone: "warn" }, pending: { text: "noch nicht gescannt", tone: "neutral" },
};
const stateLabel = (e) => (e.zustand === "crit" ? `${e.fehler.length} Fehler` : ZUSTAND[e.zustand].text);
/* Kurzform für die engen Kästen der Bus-Ansicht; das volle Wort steht im aria-label und in der Liste. */
const SHORT = { ok: "OK", silent: "stumm", pending: "offen" };
const shortState = (e) => (e.zustand === "crit" ? `${e.fehler.length} Fehler` : SHORT[e.zustand]);
/* IBM Plex Mono läuft mit 0,6 em je Zeichen, bei 11,5 px also knapp 7 px. */
const MONO_CH = 6.9;
const fitMono = (text, px) => shortName(text, Math.max(4, Math.floor(px / MONO_CH)));
const nodeLabel = (e) => `${e.name}, ${e.adresse}, ${stateLabel(e)}`;
const shortName = (name, max = 11) => (name.length > max ? name.slice(0, max - 1) + "…" : name);

/* ---------- Bauart-Vorlagen aus topologie/*.svg ---------- */
const SVG_NS = "http://www.w3.org/2000/svg";
const templates = new Map();
let bauart = storageGet("kfzdiag-bauart", "limousine");
/* Einmalig auf 3D umstellen: wer vor der 3D-Ansicht schon eine Ansicht gespeichert hatte, landet sonst in der Draufsicht. */
if (webglMoeglich() && !storageGet("kfzdiag-3d-eingefuehrt-2", false)) { storageSet("kfzdiag-topo-ansicht", "3d"); storageSet("kfzdiag-3d-eingefuehrt-2", true); }
let view = storageGet("kfzdiag-topo-ansicht", webglMoeglich() ? "3d" : "fahrzeug");
if (view === "3d" && !webglMoeglich()) view = "fahrzeug";

/* Jede Vorlage wird genau einmal geladen (gleichzeitige Aufrufe teilen sich das Versprechen). */
function loadTemplate(name) {
  if (!templates.has(name)) templates.set(name, fetchTemplate(name).catch((err) => { templates.delete(name); throw err; }));
  return templates.get(name);
}
async function fetchTemplate(name) {
  const raw = await fetch(`topologie/${name}.svg`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
  /* Inline-<style> fällt vor dem Parsen weg (CSP style-src self); die Regeln stehen in views.css unter #topo. */
  const text = raw.replace(/<style[\s\S]*?<\/style>/g, "");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName !== "svg") throw new Error("keine SVG-Vorlage");
  const zones = {};
  root.querySelectorAll("#domaenen rect[data-domaene]").forEach((r) => {
    zones[r.dataset.domaene] = { x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height") };
  });
  return { name, zones, antrieb: root.getAttribute("data-antrieb-aktiv") || "verbrenner", children: [...root.children].map((c) => document.importNode(c, true)) };
}

/* ---------- Fahrzeugansicht: je Funktionsgruppe eine Markierung, Details stehen ungekürzt in der Liste ---------- */
let freshAddr = null;
let layerTpl = null;
const TONE_ORDER = ["crit", "silent", "pending", "ok"];
const PIN_NAME = { netzwerk: "Netzwerk", rueckhalte: "Airbag", fahrwerk: "Fahrwerk", antrieb: "Antrieb", assistenz: "Assistenz", anzeige: "Anzeige", karosserie: "Komfort", unzugeordnet: "Weitere" };

function glyph(kind, x, y, size, count) {
  const id = kind === "crit" && count > 1 ? "z-crit-n" : glyphId(kind);
  return s("g", { class: `kg t-${ZUSTAND[kind] ? ZUSTAND[kind].tone : kind}` },
    s("use", { href: `icons.svg#${id}`, x: x - size / 2, y: y - size / 2, width: size, height: size }),
    kind === "crit" && count > 1 ? s("text", { x, y: y + size * .17, class: "k-num", "font-size": size * .5 }, count > 9 ? "9+" : count) : null);
}

/* Schlechtester Zustand der Gruppe bestimmt das Zeichen. */
function groupSummary(list) {
  const worst = TONE_ORDER.find((z) => list.some((e) => e.zustand === z)) || "pending";
  const faults = list.reduce((n, e) => n + e.fehler.length, 0);
  const silent = list.filter((e) => e.zustand === "silent").length;
  const text = faults ? `${faults} Fehler` : silent ? `${silent} stumm` : worst === "pending" ? "nicht gescannt" : "in Ordnung";
  return { worst, faults, text };
}

function jumpToGroup(d) {
  const head = $(`ecu-group-${d}`);
  if (!head) return;
  head.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  head.focus({ preventScroll: true });
  const group = head.closest(".ecu-group");
  group.classList.remove("flash"); void group.offsetWidth; group.classList.add("flash");
}

function renderPins(tpl, nodes) {
  const groups = ZONE_ORDER.map((d) => [d, nodes.filter((e) => domainOf(e) === d)]).filter(([, list]) => list.length);
  const inCar = groups.filter(([d]) => d !== UNASSIGNED.id && tpl.zones[d]);
  const rest = groups.filter(([d]) => d === UNASSIGNED.id || !tpl.zones[d]);
  const pin = ([d, list], inside) => {
    const sum = groupSummary(list), z = tpl.zones[d];
    const style = inside ? `left:${((z.x + z.w / 2) / 240) * 100}%;top:${((z.y + z.h / 2) / 520) * 100}%` : null;
    return h("button", { class: `pin t-${ZUSTAND[sum.worst].tone}${inside ? "" : " pin-out"}`, type: "button", style, "data-domain": d,
      "aria-label": `${domainName(d)}: ${list.length} Steuergerät${list.length === 1 ? "" : "e"}, ${sum.text}. Zur Liste`,
      onclick: () => jumpToGroup(d),
      onpointerenter: () => markZone(d, true), onpointerleave: () => markZone(d, false), onfocus: () => markZone(d, true), onblur: () => markZone(d, false) },
      mark(sum.worst === "crit" && sum.faults > 1 ? "crit" : sum.worst), h("span", { class: "pin-n" }, PIN_NAME[d]), h("span", { class: "pin-c num" }, list.length));
  };
  $("topo-pins").replaceChildren(...inCar.map((g) => pin(g, true)));
  $("topo-rest").replaceChildren(...(rest.length ? [h("span", { class: "sm" }, "Ohne Platz im Bild:"), ...rest.map((g) => pin(g, false))] : []));
}
function markZone(d, on) { const r = $(`zone-${d}`); if (r) r.classList.toggle("hot", on); }

async function renderVehicleView() {
  const svg = $("topo");
  let tpl;
  try { tpl = await loadTemplate(bauart === "lkw" ? "transporter" : bauart); } catch (err) { svg.replaceChildren(); toast("Fahrzeugvorlage nicht ladbar."); return; }
  if (view !== "fahrzeug") return;
  if (layerTpl !== tpl) {
    layerTpl = tpl;
    svg.dataset.bauart = tpl.name;
    svg.setAttribute("data-antrieb-aktiv", tpl.antrieb);
    svg.setAttribute("viewBox", "0 0 240 520");
    svg.replaceChildren(...tpl.children.map((c) => c.cloneNode(true)), s("rect", { id: "topo-sweep", class: "sweep", x: 8, y: 0, width: 224, height: 2, rx: 1 }));
  }
  const nodes = topoNodes();
  renderPins(tpl, nodes);
  $("topo-sweep").classList.toggle("on", Boolean(state.scanning) && !reducedMotion());
  svg.setAttribute("aria-label", `${(BAUARTEN.find(([id]) => id === bauart) || [, bauart])[1]} von oben, ${nodes.length} Steuergeräte in ${new Set(nodes.map(domainOf)).size} Gruppen`);
}

/* ---------- Bus-Ansicht: Gateway in der Mitte, Segmente nach Funktionsdomäne (angenommen, nicht ausgelesen) ---------- */
const SEGMENTE = { antrieb: "Antriebs-CAN", fahrwerk: "Fahrwerk-CAN", rueckhalte: "Rückhalte-CAN", assistenz: "Assistenz-CAN", anzeige: "Infotainment-CAN", karosserie: "Komfort-CAN", netzwerk: "Diagnose-CAN", unzugeordnet: "nicht zugeordnet" };
function renderBusView() {
  const svg = $("topo");
  layerTpl = null;
  const W = Math.max(320, Math.round($("topo-stage").clientWidth || 360));
  const two = W >= 640;
  const nodes = topoNodes();
  const gw = nodes.find((e) => /gateway/i.test(e.name));
  const groups = ZONE_ORDER.map((d) => [d, nodes.filter((e) => e !== gw && domainOf(e) === d)]).filter(([, list]) => list.length);
  const BOX = { w: two ? 150 : Math.floor((W - 44) / 2), h: 48 }, GAP = 8;
  const colW = two ? (W - 180) / 2 : W;
  const perRow = Math.max(1, Math.floor((colW - 24 + GAP) / (BOX.w + GAP)));
  const segHeight = (list) => 30 + Math.ceil(list.length / perRow) * (BOX.h + GAP) + 10;
  const sides = two ? [groups.filter((_, i) => i % 2 === 0), groups.filter((_, i) => i % 2 === 1)] : [groups];
  const gwH = 92;
  const parts = [];
  const top = two ? 12 : gwH + 28;
  sides.forEach((side, si) => {
    let y = top;
    const x0 = two ? (si === 0 ? 0 : W - colW) : 0;
    for (const [d, list] of side) {
      const hh = segHeight(list);
      const wy = y + 22;
      const wireFrom = two ? (si === 0 ? x0 + colW : x0) : W / 2;
      const silent = list.some((e) => e.zustand === "silent");
      parts.push(s("text", { class: "seg-name", x: x0 + 12, y: y + 12 }, SEGMENTE[d] || domainName(d)),
        s("text", { class: "seg-sub", x: x0 + colW - 12, y: y + 12, "text-anchor": "end" }, domainName(d)),
        s("line", { class: "wire" + (silent ? " fehler" : ""), x1: x0 + 12, y1: wy, x2: x0 + colW - 12, y2: wy }));
      if (two) parts.push(s("line", { class: "wire", x1: si === 0 ? x0 + colW - 12 : x0 + 12, y1: wy, x2: si === 0 ? W / 2 - 60 : W / 2 + 60, y2: wy }));
      else parts.push(s("line", { class: "wire", x1: W / 2, y1: gwH + 12, x2: W / 2, y2: wy }));
      list.forEach((e, i) => {
        const bx = x0 + 12 + (i % perRow) * (BOX.w + GAP), by = wy + 8 + Math.floor(i / perRow) * (BOX.h + GAP);
        const g = s("g", { class: `bus-node z-${e.zustand}`, tabindex: 0, role: "button", "aria-label": nodeLabel(e), "data-info": `ecu:${e.adresse}` },
          s("line", { class: "stub" + (e.zustand === "silent" ? " stumm" : ""), x1: bx + 18, y1: wy, x2: bx + 18, y2: by }),
          s("rect", { class: "bbox", x: bx, y: by, width: BOX.w, height: BOX.h, rx: 8 }),
          glyph(e.zustand, bx + 18, by + BOX.h / 2, 20, e.fehler.length),
          s("text", { class: "nm", x: bx + 34, y: by + 20 }, shortName(e.name, Math.floor((BOX.w - 40) / 7.5))),
          s("text", { class: "ad", x: bx + 34, y: by + 37 }, fitMono(`${e.adresse} · ${shortState(e)}`, BOX.w - 42)));
        parts.push(g);
      });
      y += hh;
    }
  });
  const H = Math.max(...sides.map((side) => side.reduce((acc, [, list]) => acc + segHeight(list), top)), two ? 220 : gwH + 40) + 30;
  const gx = two ? W / 2 - 60 : 12, gy = two ? 12 : 12, gwW = two ? 120 : W - 24, gwHH = two ? H - 54 : gwH;
  const gwState = gw ? gw.zustand : "pending";
  const gateway = s("g", { class: `bus-gw z-${gwState}`, tabindex: gw ? 0 : null, role: gw ? "button" : null, "aria-label": gw ? nodeLabel(gw) : "Gateway nicht gefunden", "data-info": gw ? `ecu:${gw.adresse}` : null },
    s("rect", { class: "bbox", x: gx, y: gy, width: gwW, height: gwHH, rx: 14 }),
    glyph(gwState, gx + gwW / 2, gy + (two ? gwHH / 2 - 24 : 30), 28, gw ? gw.fehler.length : 0),
    s("text", { class: "gw-name", x: gx + gwW / 2, y: gy + (two ? gwHH / 2 + 14 : 62), "text-anchor": "middle" }, "Gateway"),
    s("text", { class: "ad", x: gx + gwW / 2, y: gy + (two ? gwHH / 2 + 32 : 80), "text-anchor": "middle" }, gw ? fitMono(`${gw.adresse} · ${shortState(gw)}`, gwW - 12) : "nicht gefunden"));
  const note = s("text", { class: "bus-note", x: 12, y: H - 10 }, "Segmente nach Funktionsdomäne angenommen, nicht aus dem Fahrzeug gelesen.");
  svg.removeAttribute("data-bauart");
  $("topo-pins").replaceChildren(); $("topo-rest").replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", `Bus-Ansicht, ${nodes.length} Steuergeräte`);
  svg.replaceChildren(gateway, ...parts, note);
}

/* ---------- 3D-Ansicht: Modell je Bauart, Etiketten je Steuergeräte-Gruppe, Antippen zeigt das Bauteil ---------- */
/* Modelle, die schon gebaut sind; andere Bauarten zeigen vorerst das nächstliegende. */
export const MODELLE = Object.fromEntries(["limousine", "kombi", "kleinwagen", "suv", "van", "pickup", "transporter", "lkw", "motorrad"].map((b) => [b, b]));
const modellFuer = (b) => MODELLE[b] || "limousine";
let v3 = null, v3Modell = null, v3Laedt = null;
const ANSICHTEN_3D = [["fehler", "Fehler"], ["aussen", "Außen"], ["technik", "Technik"], ["unten", "Unten"], ["oben", "Oben"]];
function box3d() {
  let box = $("topo-3d");
  if (box) return box;
  box = h("div", { id: "topo-3d", class: "topo-3d" },
    h("div", { class: "t3-canvas", id: "t3-canvas" }), h("div", { class: "t3-pins", id: "t3-pins" }), h("div", { class: "t3-labels", id: "t3-labels" }),
    h("div", { class: "seg t3-modes", id: "t3-modes", role: "group", "aria-label": "3D-Ansicht" }),
    h("div", { class: "t3-card card", id: "t3-card", hidden: true }));
  $("topo-stage").querySelector(".topo-canvas").after(box);
  box.after(h("div", { class: "t3-fehler", id: "t3-fehler", role: "group", "aria-label": "Fehler im Modell zeigen" }));
  return box;
}
/* Gefundene Probleme: jeder Fehlercode (Fahrzeug-OBD und Steuergeräte) mit den Bauteilen, die er betrifft */
function t3Probleme() {
  const out = new Map();
  const add = (code, ecuName) => {
    const t = bauteileFuer(code);
    const ids = t.genau || !ecuName ? t.ids : bauteilFuerSteuergeraet(ecuName);
    const name = t.genau || !ecuName ? t.name : `${ecuName} (Herstellercode)`;
    if (!out.has(code)) out.set(code, { code, name, ids });
  };
  /* Steuergeräte zuerst: so bleibt bei Herstellercodes bekannt, welches Gerät sie meldet */
  for (const e of state.ecus) for (const f of e.fehler || []) add(f.code, e.name);
  for (const f of faultSet().values()) add(f.code, null);
  return [...out.values()];
}
/* Ids auf Teile abbilden, die das Modell hat (Injektor → Motor beim LKW usw.) */
function t3Aufloesen(ids) {
  const out = [];
  for (const id of ids) { let x = id, n = 0; while (x && !v3.bauteile.has(x) && n++ < 4) x = ersatzFuer(x); if (x && v3.bauteile.has(x)) out.push(x); }
  return [...new Set(out)];
}
let t3Wahl = "alle";
function t3FehlerZeigen(wahl) {
  if (!v3) return;
  const probleme = t3Probleme();
  const gewaehlt = wahl === "alle" ? probleme : probleme.filter((p) => p.code === wahl);
  const ids = t3Aufloesen(gewaehlt.flatMap((p) => p.ids));
  const ctx = t3Aufloesen(ids.flatMap(kontextFuer));
  t3Wahl = wahl;
  if (!v3.fokusFehler(ids, ctx)) return;
  $("t3-card").hidden = true;
  t3Modes(); t3FehlerLeiste(); t3Labels();
}
function t3FehlerLeiste() {
  const box = $("t3-fehler");
  const probleme = t3Probleme();
  box.hidden = !probleme.length;
  if (!probleme.length) { box.replaceChildren(); return; }
  const chip = (id, kopf, text) => h("button", { type: "button", class: "t3-chip", "aria-pressed": String(v3 && v3.modus === "fehler" && t3Wahl === id), onclick: () => t3FehlerZeigen(id) },
    h("b", {}, kopf), text ? h("span", {}, text) : null);
  box.replaceChildren(h("span", { class: "eyebrow" }, "Im Modell zeigen"),
    h("div", { class: "t3-chips" }, chip("alle", `Alle ${probleme.length}`, ""), ...probleme.map((p) => chip(p.code, p.code, p.name))));
}
/* Beschriftung der leuchtenden Teile im Fehlerfokus */
function t3Labels() {
  const box = $("t3-labels");
  const ids = v3 && v3.modus === "fehler" ? (v3.fokusIds || []) : [];
  box.replaceChildren(...ids.slice(0, 8).map((id) => h("span", { class: "t3-label", "data-bt": id }, v3.bauteile.get(id).name)));
  t3PinsSetzen();
}
function t3Modes() {
  const box = $("t3-modes");
  /* Knöpfe nur einmal bauen, danach nur den gedrückten Zustand setzen: der Tastaturfokus bleibt erhalten. */
  const liste = ANSICHTEN_3D.filter(([id]) => id !== "fehler" || t3Probleme().length);
  if (box.childElementCount !== liste.length) {
    box.replaceChildren(...liste.map(([id, label]) => h("button", { type: "button", "data-ansicht": id,
      onclick: () => { if (!v3) return; if (id === "fehler") { t3FehlerZeigen(t3Wahl); return; } v3.ansicht(id); t3Modes(); t3FehlerLeiste(); t3Labels(); $("t3-card").hidden = true; } }, label)));
  }
  for (const b of box.children) b.setAttribute("aria-pressed", String(Boolean(v3) && v3.modus === b.dataset.ansicht));
}
function t3Toene(nodes) {
  const toene = {};
  for (const d of ZONE_ORDER) {
    const list = nodes.filter((e) => domainOf(e) === d);
    if (!list.length || !GRUPPE_BAUTEILE[d]) continue;
    const { worst } = groupSummary(list);
    for (const id of GRUPPE_BAUTEILE[d]) if (worst !== "pending") toene[id] = worst;
  }
  return toene;
}
function t3Pins() {
  if (!v3) return;
  const nodes = topoNodes();
  const pins = ZONE_ORDER.filter((d) => GRUPPE_BAUTEILE[d] && nodes.some((e) => domainOf(e) === d)).map((d) => {
    const list = nodes.filter((e) => domainOf(e) === d), sum = groupSummary(list);
    const id = GRUPPE_BAUTEILE[d].find((x) => v3.bauteile.has(x));
    if (!id) return null;
    return h("button", { class: `pin t3-pin t-${ZUSTAND[sum.worst].tone}`, type: "button", "data-bt": id, hidden: true,
      "aria-label": `${domainName(d)}: ${list.length} Steuergerät${list.length === 1 ? "" : "e"}, ${sum.text}. Bauteil zeigen`,
      onclick: (ev) => { if (!v3) return; v3.fokus(id); t3Modes(); t3Karte(v3.bauteile.get(id), { x: ev.currentTarget.offsetLeft }); } },
      mark(sum.worst === "crit" && sum.faults > 1 ? "crit" : sum.worst), h("span", { class: "pin-n" }, PIN_NAME[d]), h("span", { class: "pin-c num" }, list.length));
  }).filter(Boolean);
  $("t3-pins").replaceChildren(...pins);
  t3PinsSetzen();
}
/* Nach jedem Bild: Etiketten an die Bildschirmlage ihres Bauteils schieben (nur Lage, kein Neubau) */
function t3PinsSetzen() {
  if (!v3) return;
  const fehler = v3.modus === "fehler", gruppen = v3.modus === "technik" || v3.modus === "oben";
  for (const pin of $("t3-pins").children) {
    const at = v3.lage(pin.dataset.bt);
    pin.hidden = !gruppen || !at || !at.sichtbar;
    if (at) { pin.style.left = `${at.x}px`; pin.style.top = `${at.y}px`; }
  }
  /* Beschriftungen: nicht übereinander; wer mit einer schon gezeigten kollidiert, bleibt verborgen */
  const belegt = [];
  for (const l of $("t3-labels").children) {
    const at = v3.lage(l.dataset.bt);
    if (!fehler || !at || !at.sichtbar) { l.hidden = true; continue; }
    l.style.left = `${at.x}px`; l.style.top = `${at.y}px`;
    l.hidden = false;
    const b = l.offsetWidth || 90, r = { x0: at.x - b / 2 - 4, x1: at.x + b / 2 + 4, y0: at.y - 34, y1: at.y - 10 };
    if (belegt.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) l.hidden = true; else belegt.push(r);
  }
}
function t3Karte(bt, at) {
  const card = $("t3-card");
  if (!bt) { card.hidden = true; return; }
  const d = Object.keys(GRUPPE_BAUTEILE).find((k) => GRUPPE_BAUTEILE[k].includes(bt.id)) || bt.gruppe;
  const list = topoNodes().filter((e) => domainOf(e) === d);
  const sum = list.length ? groupSummary(list) : null;
  card.replaceChildren(h("p", { class: "eyebrow" }, domainName(d)), h("h3", { class: "h3" }, bt.name),
    h("p", { class: "sm" }, sum ? `${list.length} Steuergerät${list.length === 1 ? "" : "e"} dieser Gruppe, ${sum.text}` : "Kein Steuergerät dieser Gruppe gemeldet"),
    h("div", { class: "row-actions" }, list.length ? h("button", { class: "btn sec small", type: "button", onclick: () => jumpToGroup(d) }, "Zur Liste") : null,
      h("button", { class: "btn qt small", type: "button", onclick: () => { card.hidden = true; } }, "Schließen")));
  card.hidden = false;
  card.style.setProperty("--x", `${Math.round(at.x || 0)}px`);
  if (v3) { v3.fokus(bt.id); t3Modes(); }
}
async function render3dView() {
  const box = box3d();
  $("topo-stage").classList.add("is-3d");
  const modell = modellFuer(bauart);
  if (!v3 || v3Modell !== modell) {
    if (v3Laedt) return;
    if (v3) { v3.entsorgen(); v3 = null; }
    $("t3-card").hidden = true;
    $("t3-pins").replaceChildren(); $("t3-modes").replaceChildren(); $("t3-labels").replaceChildren();
    $("t3-canvas").replaceChildren(h("p", { class: "sm t3-load" }, "3D-Modell lädt …"));
    v3Laedt = erstelle3d($("t3-canvas"), { bauart: modell, onPick: t3Karte }).catch((err) => { console.error(err); return null; });
    v3 = await v3Laedt; v3Laedt = null; v3Modell = modell;
    if (!v3) { toast("3D-Modell nicht ladbar, zeige die Draufsicht."); setView("fahrzeug"); return; }
    if (modellFuer(bauart) !== modell) { v3.entsorgen(); v3 = null; v3Modell = null; return render3dView(); }
    $("t3-canvas").addEventListener("bild", t3PinsSetzen);
    v3.zustand(t3Toene(topoNodes()));
    if (t3Probleme().length) t3FehlerZeigen("alle");
  }
  v3.zustand(t3Toene(topoNodes()));
  t3Modes(); t3Pins(); t3FehlerLeiste(); t3Labels();
  const nodes = topoNodes();
  $("topo-pins").replaceChildren(); $("topo-rest").replaceChildren();
  $("topo-stage").setAttribute("aria-label", `${(BAUARTEN.find(([id]) => id === bauart) || [, bauart])[1]} in 3D, ${nodes.length} Steuergeräte`);
}

/* ---------- Topologie gesamt ---------- */
export function renderTopo() {
  $("topo-panel").dataset.view = view;
  const nodes = topoNodes();
  const counts = nodes.reduce((acc, e) => ({ ...acc, [e.zustand]: (acc[e.zustand] || 0) + 1 }), {});
  $("topo-legend").replaceChildren(...Object.entries(ZUSTAND).filter(([k]) => counts[k]).map(([k, z]) =>
    h("span", { class: "lg" }, mark(k), h("span", { class: "num" }, counts[k]), z.text)));
  $("topo-view-toggle").replaceChildren(...[...(webglMoeglich() ? [["3d", "3D"]] : []), ["fahrzeug", "Draufsicht"], ["bus", "Bus"]].map(([id, label]) =>
    h("button", { type: "button", "aria-pressed": String(view === id), onclick: () => setView(id) }, label, h("span", { class: "cnt" }, nodes.length))));
  $("topo-bauart").closest(".topo-bauart").hidden = view === "bus";
  if (view !== "3d") $("topo-stage").classList.remove("is-3d");
  if (view === "3d") render3dView(); else if (view === "bus") renderBusView(); else renderVehicleView();
}
function setView(next) {
  if (next !== "3d" && v3) { v3.entsorgen(); v3 = null; v3Modell = null; $("t3-card").hidden = true; }
  view = next; storageSet("kfzdiag-topo-ansicht", next); renderTopo();
}

/* Tastatur: Tab in Adress-Reihenfolge, Pfeile zum Nachbarn (Zone für Zone), Enter oder Leertaste öffnet. */
function setupTopoKeys() {
  $("topo").addEventListener("keydown", (ev) => {
    const g = ev.target.closest && ev.target.closest('[role="button"]');
    if (!g) return;
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (!step) return;
    const all = [...$("topo").querySelectorAll('[role="button"][tabindex="0"]')];
    const next = all[all.indexOf(g) + step];
    if (next) { ev.preventDefault(); next.focus(); }
  });
  /* Tippen hebt den Knoten 220 ms hervor (Infoblatt öffnet über data-info). */
  $("topo").addEventListener("click", (ev) => {
    const g = ev.target.closest && ev.target.closest(".bus-node, .bus-gw");
    if (!g) return;
    g.classList.add("hl"); setTimeout(() => g.classList.remove("hl"), 220);
  });
}

/* ---------- Vollscan ---------- */
function setScanProgress(fraction) {
  const f = Math.min(1, Math.max(0, fraction));
  $("scan-bar").style.transform = `scaleX(${f})`;
  $("scan-rm-bar").style.transform = `scaleX(${f})`;
  const sweep = $("topo-sweep");
  if (sweep && layerTpl) {
    const z = Object.values(layerTpl.zones).filter((r) => r.x < 240);
    const top = Math.min(...z.map((r) => r.y)), bottom = Math.max(...z.map((r) => r.y + r.h));
    sweep.style.transform = `translateY(${top + f * (bottom - top)}px)`;
  }
}
/* Vollscan: Fortschritt an Knopf, Statusleiste und Startseite. Kommt 15 Sekunden kein Lebenszeichen,
   gilt er als gescheitert; dann gibt es eine Meldung mit Vorschlägen und Erneut versuchen statt eines Hängers. */
const SCAN_STILL_MS = 15000;
export async function runScan() {
  if (state.scanning) return;
  state.scanning = true; state.scanPct = 0;
  state.ecus = [];
  const btn = $("scan-btn");
  btn.disabled = true; btn.setAttribute("aria-busy", "true");
  $("scan-label").textContent = "Scanne …";
  setScanProgress(0);
  renderTopo();
  logEvent("Vollscan gestartet", "scan");
  const done = busy("Vollscan");
  emit("status");
  let found = 0, failure = null, watchdog = null;
  let rearm = () => {};
  const watch = new Promise((_, reject) => { const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => reject(new Error("Der Adapter hat 15 Sekunden lang nichts gemeldet.")), SCAN_STILL_MS); }; rearm = arm; arm(); });
  try {
    await Promise.race([watch, state.src.scan((ev) => {
      rearm();
      if (ev.typ === "scan_fortschritt") {
        const fraction = ev.gesamt ? ev.geprueft / ev.gesamt : ev.prozent / 100;
        setScanProgress(fraction);
        const pct = Math.round(fraction * 100);
        if (pct !== state.scanPct) { state.scanPct = pct; emit("status"); }
        $("scan-ticker").textContent = ev.gesamt ? `${ev.geprueft}/${ev.gesamt} Adressen · ${found} gefunden` : `${ev.adresse} · ${ev.prozent} % · ${found} gefunden`;
      } else if (ev.typ === "scan_fund") {
        found++;
        state.ecus = [...state.ecus, ev.steuergeraet];
        freshAddr = ev.steuergeraet.adresse;
        renderTopo(); renderEcuList(); renderStats();
      } else if (ev.typ === "scan_ende") {
        state.scanned = true;
        setScanProgress(1);
        $("scan-ticker").textContent = `${ev.anzahl_steuergeraete} Steuergeräte · ${ev.anzahl_fehler} Fehler`;
        logEvent(`Vollscan: ${ev.anzahl_steuergeraete} Steuergeräte, ${ev.anzahl_fehler} Fehler` + (ev.neu_entdeckt.length ? `, ${ev.neu_entdeckt.length} neu entdeckt` : ""), "scan");
        toast(`Vollscan fertig: ${ev.anzahl_steuergeraete} Steuergeräte, ${ev.anzahl_fehler} Fehler.`);
      } else if (ev.typ === "scan_fehler") {
        failure = new Error(ev.meldung);
      }
    })]);
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(watchdog);
    done();
  }
  state.scanning = false;
  freshAddr = null;
  btn.disabled = false; btn.removeAttribute("aria-busy");
  $("scan-label").textContent = failure ? "Vollscan erneut starten" : "Vollscan wiederholen";
  setTimeout(() => setScanProgress(0), 600);
  if (failure) {
    $("scan-ticker").textContent = `abgebrochen nach ${found} Steuergeräten`;
    logEvent("Vollscan abgebrochen: " + failure.message, "scan");
    showFailure({ titel: "Vollscan abgebrochen", meldung: `${failure.message} Bis dahin gefunden: ${found} Steuergeräte. Am Auto wurde nichts geändert.`, hilfe: HILFE.lesen, retry: runScan });
  }
  takeSnapshot();
  if (!failure) completeSnapshot();
  emit("render");
  emit("status");
  try { state.analysis = await withTimeout(state.src.analysis(), 15000); } catch (_) { /* Vollanalyse bleibt auf altem Stand, Liste ist schon da */ }
  emit("saved-state");
  emit("render");
  return !failure;
}

/* ---------- Kacheln, Liste, Akte ---------- */
export function renderStats() {
  const r = firstReadiness();
  const total = totalFaults();
  const open = r ? r.tests.filter((t) => !t.fertig).length : null;
  const tiles = [
    { k: "Motorlampe", v: r ? (r.mil ? "AN" : "AUS") : "–", s: r ? `${r.anzahl_fehler} Abgasfehler gemeldet` : "", tone: r ? (r.mil ? "crit" : "ok") : null, info: "begriff:mil" },
    { k: "AU-Bereitschaft", v: r ? `${r.tests.length - open}/${r.tests.length}` : "–", s: r ? (open ? `${open} Test offen` : "alle Tests fertig") : "", tone: r ? (open ? "warn" : "ok") : null, info: "begriff:readiness" },
    { k: "Fehler", v: total, s: "OBD und Steuergeräte", tone: total ? "crit" : "ok", info: "begriff:gespeichert" },
    { k: "Steuergeräte", v: state.ecus.length || "–", s: state.ecus.length ? "gefunden" : "Vollscan starten", tone: null, info: "begriff:vollscan" },
  ];
  $("stats").replaceChildren(...tiles.map((t) => h("div", { class: `tile t-${t.tone || "neutral"}` },
    h("span", { class: "state-lbl" }, t.k),
    h("span", { class: "big" }, t.tone ? mark(t.tone) : null, h("span", {}, t.v)),
    h("span", { class: "sm" }, t.s),
    infoBtn(t.info, `${t.k}: Erklärung`))));
}

export function renderEcuList() {
  const nodes = topoNodes().filter((e) => !e.unknown || state.scanned);
  $("ecu-count").textContent = state.ecus.length ? `${state.ecus.length} gefunden` : "noch kein Vollscan";
  if (!nodes.length) { $("ecu-list").replaceChildren(h("div", { class: "empty" }, mark("pending"), h("p", { class: "h3" }, "Noch kein Vollscan"), h("p", { class: "sm" }, "Der Vollscan fragt alle Adressen ab und findet jedes Steuergerät."), h("button", { class: "btn pri", type: "button", onclick: runScan }, "Vollscan starten"))); return; }
  const groups = ZONE_ORDER.map((d) => [d, nodes.filter((e) => domainOf(e) === d)]).filter(([, list]) => list.length);
  $("ecu-list").replaceChildren(...groups.map(([d, list]) => h("div", { class: "ecu-group", role: "group", "aria-labelledby": `ecu-group-${d}` },
    h("h3", { class: "grp-head", id: `ecu-group-${d}`, tabindex: -1 }, h("span", {}, domainName(d)), h("span", { class: "cnt" }, list.length)),
    ...list.map((e) => h("button", { class: "erow", type: "button", "data-info": `ecu:${e.adresse}` },
      mark(e.zustand),
      h("span", { class: "er-main" }, h("span", { class: "er-t" }, e.name), h("span", { class: "sm" }, e.unknown ? `${e.adresse} · im Profil erwartet, keine Antwort` : [e.adresse, e.kennung.teilenummer, e.kennung.software && "SW " + e.kennung.software].filter(Boolean).join(" · "))),
      statusChip(e.unknown ? "warn" : e.fehler.length ? "crit" : "ok", e.unknown ? "stumm" : e.fehler.length ? `${e.fehler.length} Fehler` : "OK"), chev())))));
}

const EVENT_ICON = { write: "lock", scan: "ecu", rec: "rec", check: "check", info: "doc" };
export function renderTimeline() {
  const items = state.events.map((e) => h("div", { class: "erow", role: "listitem" },
    h("span", { class: `ev-ic ev-${e.kind}` }, icon(EVENT_ICON[e.kind] || "doc")), h("span", { class: "er-main" }, h("span", { class: "er-t" }, e.text)), h("span", { class: "sm mono" }, clockTime(e.at))));
  $("timeline").replaceChildren(...(items.length ? items : [h("p", { class: "sm" }, "Die Akte füllt sich mit jeder Sitzung.")]));
}

/* Die Fahrzeugkarte gehört zur Startseite und wird dort gebaut (start.js, nur bei Änderung). */
export function renderVehicle() { renderTopo(); renderStats(); renderEcuList(); renderTimeline(); }

export function initVehicle() {
  $("scan-btn").addEventListener("click", runScan);
  const panel = $("topo-panel"), toggle = $("topo-toggle");
  const setCollapsed = (c) => { panel.dataset.collapsed = String(c); toggle.setAttribute("aria-expanded", String(!c)); toggle.textContent = c ? "Grafik zeigen" : "Grafik ausblenden"; storageSet("kfzdiag-topo", c ? "zu" : "auf"); };
  /* Mit 3D ist die Grafik auch auf dem Handy der Einstieg, also offen; ohne WebGL wie bisher eingeklappt. */
  setCollapsed(storageGet("kfzdiag-topo", window.matchMedia("(max-width: 599px)").matches && !webglMoeglich() ? "zu" : "auf") === "zu");
  toggle.addEventListener("click", () => { setCollapsed(panel.dataset.collapsed !== "true"); if (panel.dataset.collapsed === "false") renderTopo(); });
  const sel = $("topo-bauart");
  if (!BAUARTEN.some(([id]) => id === bauart)) bauart = "limousine";
  sel.replaceChildren(...BAUARTEN.map(([id, label]) => h("option", { value: id, selected: id === bauart }, label)));
  sel.addEventListener("change", () => { bauart = sel.value; storageSet("kfzdiag-bauart", bauart); emit("bauart", bauart); renderTopo(); });
  /* Jedes Fahrzeug bringt seine Bauart mit. */
  const follow = (fz) => { if (!fz || !BAUARTEN.some(([id]) => id === fz.bauart)) return; bauart = fz.bauart; sel.value = bauart; storageSet("kfzdiag-bauart", bauart); };
  follow(state.fahrzeug);
  on("fahrzeug-aktiv", follow);
  setupTopoKeys();
  let lastW = 0;
  new ResizeObserver(() => { const w = $("topo-stage").clientWidth; if (Math.abs(w - lastW) > 8) { lastW = w; if (view === "bus") renderBusView(); } }).observe($("topo-stage"));
  on("events", renderTimeline);
  on("run-scan", runScan);
  on("render", renderVehicle);
}
