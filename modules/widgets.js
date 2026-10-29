/* Mein Cockpit: frei anordenbare Widgets auf der Startseite. Gezeichnet als SVG und danach nur beschriftet (kein
   Flackern). Anpassen: Ziehen am Griff (oder Pfeiltasten), Größe S/M, Entfernen, Hinzufügen, Vorlagen. Je Gerät gespeichert. */
import { $, h, s, num, numFix, icon, mark, storageGet, storageSet } from "./dom.js";
import { icon3d } from "./icons3d.js";
import { state, on, signalTitle, sollFor, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go } from "./shell.js";
import { buffer } from "./recorder.js";
import { digitsFor, scaleFor, steadyDigit, signed } from "./live.js";
import { rundinstrument, instrumentFuer } from "./rundinstrument.js";

const TYPEN = { zahl: "Messwert", rund: "Rundanzeige", verlauf: "Verlauf", fehler: "Fehler", readiness: "AU-Bereitschaft", auto: "3D-Auto" };
const MIT_SIGNAL = new Set(["zahl", "rund", "verlauf"]);
const VORLAGEN = {
  werkstatt: ["fehler", "readiness", ["rund", "DREHZAHL"], ["zahl", "KUEHLMITTEL"], ["verlauf", "TRIM_LANG_B1", "m"], ["zahl", "SPANNUNG"], "auto"],
  probefahrt: [["rund", "GESCHWINDIGKEIT"], ["rund", "DREHZAHL"], ["zahl", "KUEHLMITTEL"], ["zahl", "LAST"], ["verlauf", "TRIM_KURZ_B1", "m"]],
  au: ["readiness", "fehler", ["zahl", "LAMBDA_SOLL"], ["zahl", "KAT_TEMP_B1"], ["verlauf", "TRIM_LANG_B1", "m"], ["zahl", "KUEHLMITTEL"]],
};
const NAMEN_VORLAGE = { werkstatt: "Werkstatt", probefahrt: "Probefahrt", au: "AU" };

let seq = 0;
const neu = (typ, sig = null, groesse = "s") => ({ id: `w${Date.now().toString(36)}${seq++}`, typ, sig, groesse });
const ausVorlage = (name) => VORLAGEN[name].map((e) => (Array.isArray(e) ? neu(e[0], e[1], e[2] || "s") : neu(e, null, "s")));
const gueltig = (l) => Array.isArray(l) && l.every((w) => w && TYPEN[w.typ] && (!MIT_SIGNAL.has(w.typ) || typeof w.sig === "string"));
let liste = (() => { const l = storageGet("kfzdiag-widgets", null); return gueltig(l) ? l : ausVorlage("werkstatt"); })();
let bearbeiten = false;
const speichern = () => storageSet("kfzdiag-widgets", liste);
const wert = (sig) => { const v = state.live[sig]; return v && typeof v.wert === "number" ? v : null; };

/* ---------- Anzeigen ---------- */
const isTrim = (sig) => /^TRIM_/.test(sig);
/* Rundanzeige: dasselbe SVG-Instrument wie auf der Live-Seite. Skala wird einmal festgelegt (beim ersten Wert). */
function rund(w) {
  const box = h("div", { class: "wg-ri" });
  let ri = null, cfg = null;
  return { el: box, update(v) {
    if (!ri) {
      cfg = instrumentFuer(w.sig, sollFor(w.sig), v ? v.wert : null);
      ri = rundinstrument(cfg, { einheit: v ? v.einheit || "" : "", titel: signalTitle(w.sig) });
      box.replaceChildren(ri.el);
    }
    ri.setze(v ? v.wert : null, sollFor(w.sig), v ? numFix(steadyDigit(`w:${w.sig}`, v.wert, cfg.stufe ?? 10 ** -(cfg.digits ?? 0)), cfg.digits ?? 0) : "");
  }, ohneZahl: true };
}
/* Verlauf der letzten Minuten auf fester Skala: Sollband, Nulllinie (bei Abweichungswerten), Linie, Skalenenden. */
function verlauf(w) {
  const band = s("rect", { class: "wg-sollband", x: 0, width: 200 }), null_ = s("line", { class: "wg-null", x1: 0, x2: 200 }), linie = s("polyline", { class: "wg-linie" });
  const punkt = h("span", { class: "wg-punkt" });
  const oben = h("span", { class: "wg-achse oben" }), unten = h("span", { class: "wg-achse unten" });
  const svg = s("svg", { class: "wg-verlauf", viewBox: "0 0 200 60", preserveAspectRatio: "none", "aria-hidden": "true" }, band, null_, linie);
  return { el: h("div", { class: "wg-spark" }, svg, punkt, oben, unten), update(v) {
    const ys = (buffer.sig[w.sig] || []).slice(-120).filter((x) => x != null);
    const soll = sollFor(w.sig);
    let lo, hi;
    if (isTrim(w.sig)) { lo = -25; hi = 25; }
    else if (soll && v) { const sc = scaleFor(w.sig, soll, v.wert); lo = sc.a; hi = sc.b; }
    else if (ys.length) { lo = Math.min(...ys); hi = Math.max(...ys); const p = (hi - lo) * .2 || 1; lo -= p; hi += p; }
    else { linie.setAttribute("points", ""); return; }
    const y = (x) => (60 - ((Math.min(Math.max(x, lo), hi) - lo) / (hi - lo)) * 56 - 2).toFixed(1);
    const dg = digitsFor(v ? v.einheit : "");
    oben.textContent = isTrim(w.sig) ? signed(hi, 0) : num(hi, dg); unten.textContent = isTrim(w.sig) ? signed(lo, 0) : num(lo, dg);
    if (soll) { band.setAttribute("y", y(soll.soll_max)); band.setAttribute("height", Math.max(0, y(soll.soll_min) - y(soll.soll_max))); } else band.setAttribute("height", 0);
    const zeigeNull = lo < 0 && hi > 0;
    null_.setAttribute("y1", zeigeNull ? y(0) : -10); null_.setAttribute("y2", zeigeNull ? y(0) : -10);
    if (!ys.length) return;
    const pts = ys.map((x, i) => [(i / Math.max(1, ys.length - 1)) * 200, +y(x)]);
    linie.setAttribute("points", pts.map(([a, b]) => `${a.toFixed(1)},${b}`).join(" "));
    const [lx, ly] = pts[pts.length - 1];
    punkt.style.left = `${(lx / 200) * 100}%`; punkt.style.top = `${(ly / 60) * 100}%`;
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
    : h("div", { class: "wg-wert" }, grafik ? grafik.el : null, grafik && grafik.ohneZahl ? null : h("span", { class: "wg-zeile" }, zahl, einheit), unter);
  const el = h("article", { class: `wg card ${w.groesse}`, "data-id": w.id, "data-typ": w.typ },
    h("header", { class: "wg-kopf" }, h("span", { class: "eyebrow" }, titel)),
    bearbeiten ? h("div", { class: "wg-tools" },
        h("button", { class: "wg-griff", type: "button", "aria-label": `${titel} verschieben (Pfeiltasten oder ziehen)`, onkeydown: (e) => schieben(e, w), onpointerdown: (e) => ziehen(e, el) }, "⋮⋮"),
        h("button", { class: "wg-btn", type: "button", "aria-label": `Größe ${w.groesse === "s" ? "breit" : "schmal"}`, onclick: () => { w.groesse = w.groesse === "s" ? "m" : "s"; speichern(); zeichne(); } }, w.groesse === "s" ? "S" : "M"),
        h("button", { class: "wg-btn", type: "button", "aria-label": `${titel} entfernen`, onclick: () => { liste = liste.filter((x) => x !== w); speichern(); zeichne(); } }, "×")) : null,
    bearbeiten ? body : h("button", { class: "wg-tap unbtn", type: "button", onclick: () => go(ziel), "aria-label": `${titel} öffnen` }, body));
  teile.el = el;
  el._update = () => aktualisiere(w, teile, grafik);
  return el;
}

function aktualisiere(w, t, grafik) {
  if (MIT_SIGNAL.has(w.typ)) {
    const v = wert(w.sig), soll = sollFor(w.sig);
    const dg = digitsFor(v ? v.einheit : "");
    const wv = v ? steadyDigit(`w:${w.sig}`, v.wert, 10 ** -dg) : null;
    t.zahl.textContent = v ? (isTrim(w.sig) ? signed(wv, dg) : numFix(wv, dg)) : "–";
    t.einheit.textContent = v ? v.einheit || "" : "";
    const aus = v && soll && (v.wert < soll.soll_min || v.wert > soll.soll_max);
    t.el.classList.toggle("warn", Boolean(aus));
    t.unter.textContent = !v ? "nicht gemeldet" : soll ? `Soll ${isTrim(w.sig) ? signed(soll.soll_min, dg) : numFix(soll.soll_min, dg)} bis ${isTrim(w.sig) ? signed(soll.soll_max, dg) : numFix(soll.soll_max, dg)}` : "";
    if (grafik) grafik.update(v);
  } else if (w.typ === "fehler") {
    const n = totalFaults(), p = pendingFaults().length;
    t.zahl.textContent = state.status ? String(n) : "–";
    t.einheit.textContent = p ? `+${p} vorläufig` : "";
    t.unter.replaceChildren(...(state.status ? [mark(n ? "crit" : "ok"), n ? "im Speicher" : "keine gespeicherten Fehler"] : ["nicht verbunden"]));
    t.el.classList.toggle("crit", n > 0);
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
  $("start-handbuch").after(sec);
  on("live-tick", () => { if (!$("view-start").hidden) takt(); });
  on("status", () => { if (!$("view-start").hidden && Boolean(state.status) === $("widgets").hidden) zeichne(); });
  on("render", zeichne);
}
