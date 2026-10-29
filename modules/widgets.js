/* Mein Cockpit: frei anordenbare Widgets auf der Startseite. Gezeichnet als SVG und danach nur beschriftet (kein
   Flackern). Anpassen: Ziehen am Griff (oder Pfeiltasten), Größe S/M, Entfernen, Hinzufügen, Vorlagen. Je Gerät gespeichert. */
import { $, h, s, numFix, icon, mark, storageGet, storageSet } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, on, signalTitle, sollFor, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go } from "./shell.js";
import { buffer } from "./recorder.js";
import { digitsFor, scaleFor, steadyDigit } from "./live.js";

const TYPEN = { zahl: "Messwert", rund: "Rundanzeige", verlauf: "Verlauf", fehler: "Fehler", readiness: "AU-Bereitschaft", auto: "3D-Auto" };
const MIT_SIGNAL = new Set(["zahl", "rund", "verlauf"]);
const VORLAGEN = {
  werkstatt: ["fehler", "readiness", ["rund", "DREHZAHL"], ["zahl", "KUEHLMITTEL"], ["verlauf", "TRIM_LANG_B1", "m"], ["zahl", "SPANNUNG"], "auto"],
  probefahrt: [["rund", "GESCHWINDIGKEIT"], ["rund", "DREHZAHL"], ["zahl", "KUEHLMITTEL"], ["zahl", "LAST"], ["verlauf", "TRIM_KURZ_B1", "m"]],
  au: ["readiness", "fehler", ["zahl", "LAMBDA_SOLL"], ["zahl", "KAT_TEMP_B1"], ["verlauf", "TRIM_LANG_B1", "m"], ["zahl", "KUEHLMITTEL"]],
};
const NAMEN_VORLAGE = { werkstatt: "Werkstatt", probefahrt: "Probefahrt", au: "AU" };
/* Feste Skalen für Rundanzeigen ohne Sollwert (1-2-5-Teilung) */
const SKALA = { DREHZAHL: [0, 8000], GESCHWINDIGKEIT: [0, 200], KUEHLMITTEL: [40, 140], SPANNUNG: [10, 16], LAST: [0, 100] };

let seq = 0;
const neu = (typ, sig = null, groesse = "s") => ({ id: `w${Date.now().toString(36)}${seq++}`, typ, sig, groesse });
const ausVorlage = (name) => VORLAGEN[name].map((e) => (Array.isArray(e) ? neu(e[0], e[1], e[2] || "s") : neu(e, null, "s")));
const gueltig = (l) => Array.isArray(l) && l.every((w) => w && TYPEN[w.typ] && (!MIT_SIGNAL.has(w.typ) || typeof w.sig === "string"));
let liste = (() => { const l = storageGet("kfzdiag-widgets", null); return gueltig(l) ? l : ausVorlage("werkstatt"); })();
let bearbeiten = false;
const speichern = () => storageSet("kfzdiag-widgets", liste);
const wert = (sig) => { const v = state.live[sig]; return v && typeof v.wert === "number" ? v : null; };

/* ---------- Anzeigen ---------- */
function rund(w) {
  const [a0, a1] = [Math.PI * .75, Math.PI * 2.25], R = 40, cx = 50, cy = 52;
  const pt = (a, r) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  const bogen = (from, to, r) => `M${pt(from, r)} A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to, r)}`;
  const nadel = s("line", { class: "wg-nadel", x1: cx, y1: cy, x2: cx, y2: cy - R + 8 });
  const band = s("path", { class: "wg-band" });
  const striche = s("g", { class: "wg-striche" });
  const tmin = s("text", { class: "wg-skala", x: cx - 30, y: 88, "text-anchor": "middle" }), tmax = s("text", { class: "wg-skala", x: cx + 30, y: 88, "text-anchor": "middle" });
  const svg = s("svg", { class: "wg-rund", viewBox: "0 0 100 92", "aria-hidden": "true" }, s("path", { class: "wg-bogen", d: bogen(a0, a1, R) }), band, striche, tmin, tmax, nadel, s("circle", { cx, cy, r: 3.5, class: "wg-nabe" }));
  return { el: svg, update(v) {
    const soll = sollFor(w.sig);
    const [lo, hi] = SKALA[w.sig] || (soll ? [scaleFor(w.sig, soll, v ? v.wert : soll.soll_min).a, scaleFor(w.sig, soll, v ? v.wert : soll.soll_min).b] : [0, 100]);
    const ang = (x) => a0 + (Math.min(Math.max(x, lo), hi) - lo) / (hi - lo) * (a1 - a0);
    if (striche.dataset.k !== `${lo}|${hi}`) {
      striche.dataset.k = `${lo}|${hi}`;
      const kurz = (x) => (Math.abs(x) >= 1000 ? `${x / 1000}k` : String(x));
      tmin.textContent = kurz(lo); tmax.textContent = kurz(hi);
      striche.replaceChildren(...Array.from({ length: 11 }, (_, i) => { const a = a0 + (a1 - a0) * i / 10; return s("path", { d: `M${pt(a, R)} L${pt(a, R - (i % 5 ? 4 : 8))}`, class: i % 5 ? "" : "lang" }); }));
    }
    band.setAttribute("d", soll ? bogen(ang(soll.soll_min), ang(soll.soll_max), R - 3) : "");
    const a = ang(v ? v.wert : lo);
    nadel.setAttribute("transform", `rotate(${((a + Math.PI / 2) * 180 / Math.PI).toFixed(1)} ${cx} ${cy})`);
  } };
}
function verlauf(w) {
  const linie = s("polyline", { class: "wg-linie" }), band = s("rect", { class: "wg-sollband" });
  const svg = s("svg", { class: "wg-verlauf", viewBox: "0 0 200 60", preserveAspectRatio: "none", "aria-hidden": "true" }, band, linie);
  return { el: svg, update() {
    const ys = (buffer.sig[w.sig] || []).slice(-90).filter((x) => x != null);
    const soll = sollFor(w.sig);
    if (!ys.length) { linie.setAttribute("points", ""); return; }
    let lo = Math.min(...ys, soll ? soll.soll_min : Infinity), hi = Math.max(...ys, soll ? soll.soll_max : -Infinity);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * .12; lo -= pad; hi += pad;
    const y = (v) => (60 - ((v - lo) / (hi - lo)) * 60).toFixed(1);
    linie.setAttribute("points", ys.map((v, i) => `${(i / Math.max(1, ys.length - 1) * 200).toFixed(1)},${y(v)}`).join(" "));
    if (soll) { band.setAttribute("y", y(soll.soll_max)); band.setAttribute("height", Math.max(0, y(soll.soll_min) - y(soll.soll_max))); band.setAttribute("x", 0); band.setAttribute("width", 200); }
  } };
}

function widget(w, i) {
  const titel = MIT_SIGNAL.has(w.typ) ? signalTitle(w.sig) : TYPEN[w.typ];
  const zahl = h("b", { class: "wg-zahl num" }), einheit = h("small", {}), unter = h("p", { class: "wg-unter sm" });
  const teile = { zahl, einheit, unter };
  let grafik = null;
  if (w.typ === "rund") grafik = rund(w);
  if (w.typ === "verlauf") grafik = verlauf(w);
  const ziel = { fehler: "faults", readiness: "check", auto: "car" }[w.typ] || "live";
  const body = w.typ === "auto"
    ? h("span", { class: "wg-auto" }, icon3d("car"), h("span", {}, "Fahrzeug in 3D, Fehler am Bauteil"))
    : h("div", { class: "wg-wert" }, grafik ? grafik.el : null, h("span", { class: "wg-zeile" }, zahl, einheit), unter);
  const el = h("article", { class: `wg card ${w.groesse}`, "data-id": w.id, "data-typ": w.typ },
    h("header", { class: "wg-kopf" }, h("span", { class: "eyebrow" }, titel)),
    bearbeiten ? h("div", { class: "wg-tools" },
        h("button", { class: "wg-griff", type: "button", "aria-label": `${titel} verschieben (Pfeiltasten oder ziehen)`, onkeydown: (e) => schieben(e, w), onpointerdown: (e) => ziehen(e, el) }, "⋮⋮"),
        h("button", { class: "wg-btn", type: "button", "aria-label": `Größe ${w.groesse === "s" ? "breit" : "schmal"}`, onclick: () => { w.groesse = w.groesse === "s" ? "m" : "s"; speichern(); zeichne(); } }, w.groesse === "s" ? "S" : "M"),
        h("button", { class: "wg-btn", type: "button", "aria-label": `${titel} entfernen`, onclick: () => { liste = liste.filter((x) => x !== w); speichern(); zeichne(); } }, "×")) : null,
    bearbeiten ? body : h("button", { class: "wg-tap unbtn", type: "button", onclick: () => go(ziel), "aria-label": `${titel} öffnen` }, body));
  el._update = () => aktualisiere(w, teile, grafik);
  return el;
}

function aktualisiere(w, t, grafik) {
  if (MIT_SIGNAL.has(w.typ)) {
    const v = wert(w.sig), soll = sollFor(w.sig);
    const dg = digitsFor(v ? v.einheit : "");
    t.zahl.textContent = v ? numFix(steadyDigit(`w:${w.sig}`, v.wert, 10 ** -dg), dg) : "–";
    t.einheit.textContent = v ? v.einheit || "" : "";
    const aus = v && soll && (v.wert < soll.soll_min || v.wert > soll.soll_max);
    t.zahl.closest(".wg").classList.toggle("warn", Boolean(aus));
    t.unter.textContent = !v ? "nicht gemeldet" : soll ? `Soll ${numFix(soll.soll_min, dg)} bis ${numFix(soll.soll_max, dg)}` : "";
    if (grafik) grafik.update(v);
  } else if (w.typ === "fehler") {
    const n = totalFaults(), p = pendingFaults().length;
    t.zahl.textContent = state.status ? String(n) : "–";
    t.einheit.textContent = p ? `+${p} vorläufig` : "";
    t.unter.replaceChildren(...(state.status ? [mark(n ? "crit" : "ok"), n ? "im Speicher" : "keine gespeicherten Fehler"] : ["nicht verbunden"]));
    t.zahl.closest(".wg").classList.toggle("crit", n > 0);
  } else if (w.typ === "readiness") {
    const r = firstReadiness();
    const offen = r ? r.tests.filter((x) => !x.fertig).length : 0;
    t.zahl.textContent = r ? `${r.tests.length - offen}/${r.tests.length}` : "–";
    t.unter.replaceChildren(...(r ? [mark(offen ? "warn" : "ok"), offen ? `${offen} Test${offen === 1 ? "" : "s"} offen` : "bereit zur AU"] : ["noch nicht gelesen"]));
  }
}

/* ---------- Anpassen: ziehen, Pfeiltasten ---------- */
function ziehen(e, el) {
  e.preventDefault();
  const raster = $("wg-raster");
  el.classList.add("zieht");
  const bewegen = (ev) => {
    const unter = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".wg");
    if (!unter || unter === el || unter.parentNode !== raster) return;
    const r = unter.getBoundingClientRect();
    const ref = ev.clientX > r.left + r.width / 2 || ev.clientY > r.bottom - 8 ? unter.nextSibling : unter;
    /* moveBefore erhält den gedrückten Griff (kein Verlust der Pointer-Erfassung); sonst insertBefore. */
    (raster.moveBefore || raster.insertBefore).call(raster, el, ref);
  };
  const ende = () => {
    window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", ende); window.removeEventListener("pointercancel", ende);
    el.classList.remove("zieht");
    const ordnung = [...raster.children].map((c) => c.dataset.id);
    liste = ordnung.map((id) => liste.find((w) => w.id === id)).filter(Boolean);
    speichern();
  };
  window.addEventListener("pointermove", bewegen); window.addEventListener("pointerup", ende); window.addEventListener("pointercancel", ende);
}
function schieben(e, w) {
  const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!d) return;
  e.preventDefault();
  const i = liste.indexOf(w), j = i + d;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  speichern(); zeichne();
  $("wg-raster").children[j]?.querySelector(".wg-griff")?.focus();
}

function hinzufuegenLeiste() {
  const typ = h("select", { class: "inp", "aria-label": "Art" }, ...Object.entries(TYPEN).map(([k, l]) => h("option", { value: k }, l)));
  const signale = Object.keys(state.live).filter((k) => typeof state.live[k].wert === "number");
  const sig = h("select", { class: "inp", "aria-label": "Messwert" }, ...signale.map((k) => h("option", { value: k }, signalTitle(k))));
  const sync = () => { sig.hidden = !MIT_SIGNAL.has(typ.value) || !signale.length; };
  typ.addEventListener("change", sync); sync();
  return h("div", { class: "wg-leiste" },
    h("div", { class: "wg-add" }, typ, sig, h("button", { class: "btn sec small", type: "button", onclick: () => {
      if (MIT_SIGNAL.has(typ.value) && !sig.value) return;
      liste.push(neu(typ.value, MIT_SIGNAL.has(typ.value) ? sig.value : null, typ.value === "verlauf" ? "m" : "s")); speichern(); zeichne(); } }, icon("plus"), "Hinzufügen")),
    h("div", { class: "wg-vorlagen" }, h("span", { class: "sm" }, "Vorlage:"),
      ...Object.keys(VORLAGEN).map((k) => h("button", { class: "btn qt small", type: "button", onclick: () => { liste = ausVorlage(k); speichern(); zeichne(); } }, NAMEN_VORLAGE[k]))));
}

export function zeichne() {
  const sec = $("widgets");
  if (!sec) return;
  sec.hidden = !state.status;
  if (!state.status) return;
  sec.replaceChildren(...[
    h("div", { class: "sec-head" }, h("div", {}, h("p", { class: "eyebrow" }, "Auf einen Blick"), h("h2", {}, "Mein Cockpit")),
      h("button", { class: `btn ${bearbeiten ? "pri" : "qt"} small`, type: "button", "aria-pressed": String(bearbeiten), onclick: () => { bearbeiten = !bearbeiten; zeichne(); } }, bearbeiten ? "Fertig" : "Anpassen")),
    bearbeiten ? hinzufuegenLeiste() : null,
    h("div", { class: `wg-raster${bearbeiten ? " bearbeiten" : ""}`, id: "wg-raster" }, ...liste.map(widget)),
    !liste.length ? h("p", { class: "sm" }, "Keine Widgets. Über »Anpassen« hinzufügen oder eine Vorlage wählen.") : null].filter(Boolean));
  takt();
}
function takt() { for (const el of $("wg-raster")?.children || []) el._update && el._update(); }

export function initWidgets() {
  const sec = h("section", { class: "widgets", id: "widgets", "aria-label": "Mein Cockpit", hidden: true });
  $("start-mehr").prepend(sec);
  on("live-tick", () => { if (!$("view-start").hidden) takt(); });
  on("status", () => { if (!$("view-start").hidden && Boolean(state.status) === $("widgets").hidden) zeichne(); });
  on("render", zeichne);
}
