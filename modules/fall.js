/* Fall-Seite: ein Fehlercode, ein Bildschirm (docs/FALLSEITE_KONZEPT.md). Kopf, Ursachen mit stützt/widerspricht/fehlt,
   die eine nächste Messung, Bauteile im 3D, Maßnahme mit Betriebsbuch, Nachweis vorher/nachher je Signal, Agent.
   Rechenregeln in kern/fall.js (Vorschau) und /api/fall (Server). Manuelle Ergebnisse und Maßnahme je Code liegen
   lokal in kfzdiag-faelle-offen, ohne FIN und Kennzeichen. */
import { $, h, icon, mark, num, storageGet, storageSet, toast, clockTime } from "./dom.js";
import { state, on, emit, signalTitle, DTC_REG, faultSet, logEvent } from "./state.js";
import { go, back, currentRoute } from "./shell.js";
import { gruppe } from "./bausteine-seiten.js";
import { hypothesen, naechsteMessung, nachweis, knopfText, fallStatus, liveWerte, bewerteSignal, messwertText } from "../kern/fall.js";
import { bauteileFuer } from "../kern/bauteilfehler.js";
import { FUNKTIONEN } from "../kern/service-katalog.js";
import { eintragen } from "./service.js";
import { runPostScan } from "./report.js";
import { buildCase, addCase } from "./faelle.js";
import { suchIndex } from "./diagnosepfad-lokal.js";

const KEY = "kfzdiag-faelle-offen";
const TON = { belegt: "ok", plausibel: "accent", vermutung: "warn" };
const STUFE_TEXT = { belegt: "belegt", plausibel: "plausibel", vermutung: "Vermutung" };

/* ---------- Offene Fälle je Code: manuelle Ergebnisse, Maßnahme, Vorher-Werte; immer neue Objekte ---------- */
const alleOffen = () => storageGet(KEY, {});
export const fallVon = (code) => ({ manuell: {}, massnahme: "", vorher: null, ...(alleOffen()[code] || {}) });
function setzeFall(code, patch) {
  storageSet(KEY, { ...alleOffen(), [code]: { ...fallVon(code), ...patch, geaendert: new Date().toISOString() } });
}
const mitManuell = (code, id, antwort) => {
  const { [id]: alt, ...rest } = fallVon(code).manuell;
  setzeFall(code, { manuell: antwort === alt ? rest : { ...rest, [id]: antwort } });
};

/* ---------- Codes mit Pfad (für »Fall öffnen« im Fehlerspeicher und Infoblatt) ---------- */
const PFAD_CODES = new Set();
export const hatPfad = (code) => PFAD_CODES.has(String(code || "").toUpperCase());

/* ---------- Laden: Server rechnet mit manuellen Ergebnissen, sonst der Kern im Browser ---------- */
let katalogP = null;
const ladeKatalog = () => (katalogP ||= fetch("daten/diagnose/hypothesen.json").then((r) => { if (!r.ok) throw new Error(`hypothesen.json: ${r.status}`); return r.json(); }));
const pfadAus = (k) => ({ signale: k.messwerte, messungen: k.messungen });
/* Auch für den Prüfbericht ohne Server (pruefbericht.js). */
export async function fallLaden(code, manuell) {
  if (state.src && state.src.mode === "server") {
    const q = Object.entries(manuell).map(([k, v]) => `${k}=${v}`).join(",");
    const r = await fetch(`/api/fall?code=${encodeURIComponent(code)}${q ? `&manuell=${encodeURIComponent(q)}` : ""}`);
    if (!r.ok) throw new Error(`Fall: ${r.status}`);
    return r.json();
  }
  const { ketteImBrowser } = await import("./diagnosepfad-lokal.js");
  const k = await ketteImBrowser(code, state);
  if (!k.ok) return k;
  const [katalog, werte] = [await ladeKatalog(), liveWerte(state.live)];
  return { ...k, hypothesen: hypothesen(pfadAus(k), werte, manuell, katalog), naechste: naechsteMessung(pfadAus(k), werte, manuell), manuell };
}

/* ---------- Hilfen ---------- */
const imSpeicher = (code) => [...faultSet().values()].some((f) => f.code === code);
const eintragVon = (code) => DTC_REG.get(code) || [...DTC_REG.values()].find((e) => e.dtc.code === code) || null;
const kurz = (titel) => titel.replace(/\s*\([^)]*\)/g, "").trim();
/* null ohne Nachher-Scan, sonst ob der Code im Ausgangsbefund fehlt */
const codeWeg = (code) => (state.postscan ? ![...state.postscan.faults.values()].some((x) => x.code === code) : null);
const messungVon = (k, id) => k.messungen.find((m) => m.id === id);
function eintragText(k, e) {
  const m = messungVon(k, e.messung);
  return m && m.art === "auto" ? `${signalTitle(m.signal)}: ${e.text}` : e.text.replace(/\s*\([^)]*\)/, "");
}
const nav = () => h("div", { class: "sk-nav" }, h("button", { class: "sk-zurueck", type: "button", "aria-label": "Zurück", onclick: back }, icon("back")));
const block = (titel, ...inhalt) => h("section", { class: "sk-block" }, titel ? h("h3", { class: "li-k" }, titel) : null, h("div", { class: "li-gruppe" }, ...inhalt.filter(Boolean)));
const zeileFrei = (...inhalt) => h("div", { class: "li-row sk-row fall-row" }, ...inhalt.filter(Boolean));

/* ---------- 1 Kopf ---------- */
function kopf(code, k, f) {
  const e = eintragVon(code), d = e && e.dtc;
  const dtcStatus = !d ? (imSpeicher(code) ? "gespeichert" : "nicht im Speicher") : d.aktiv ? "aktiv" : d.bestaetigt === false ? "vorläufig" : "gespeichert";
  const seit = state.snapshot ? state.snapshot.at : new Date();
  const stand = fallStatus({ manuell: f.manuell, massnahme: f.massnahme, nachher: Boolean(state.postscan), codeWeg: codeWeg(code) === true });
  const ff = state.freeze && Object.values(state.freeze.steuergeraete || {}).find((x) => x.ausloeser === code);
  return h("section", { class: "li-gruppe sk-kopf fall-kopf" },
    h("p", { class: "eyebrow" }, "Fall"),
    h("h2", { class: "sk-titel" }, h("span", { class: "mono" }, code), k.titel ? ` · ${k.titel}` : ""),
    h("p", { class: "sk-text" }, `${k.steuergeraet || "Steuergerät unbekannt"} · ${dtcStatus} · ${seit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${clockTime(seit)}`, " ",
      h("span", { class: `cs t-${stand === "nachgeprüft" ? "ok" : stand === "offen" ? "neutral" : "warn"}` }, stand)),
    ff && ff.werte && ff.werte.length ? h("p", { class: "sm" }, "Freeze-Frame: ", ff.werte.slice(0, 4).map((v) => `${num(v.wert, 0)} ${v.einheit || ""}`.trim()).join(" · ")) : null);
}

/* ---------- 2 Ursachen ---------- */
function hypotheseBlock(k, hyp) {
  const liste = (name, eintraege) => (eintraege.length ? h("li", { class: `fall-${name}` }, h("b", {}, `${name}: `), eintraege.map((e) => eintragText(k, e)).join("; ")) : null);
  return h("div", { class: "fall-hyp" },
    h("div", { class: "fall-hyp-kopf" }, mark(TON[hyp.stufe] || "warn"), h("span", { class: "fall-hyp-name" }, hyp.klartext), h("span", { class: `lvl ${hyp.stufe}` }, STUFE_TEXT[hyp.stufe])),
    h("ul", { class: "fall-listen" }, liste("stützt", hyp.stuetzt), liste("widerspricht", hyp.widerspricht), liste("fehlt", hyp.fehlt)),
    hyp.quellen.length ? h("p", { class: "sm fall-quelle" }, `Quelle: ${hyp.quellen[0]}`) : null);
}
const ursachen = (k) => block("Ursachen", ...(k.hypothesen.length ? k.hypothesen.map((hyp) => hypotheseBlock(k, hyp)) : [zeileFrei(h("span", { class: "li-t" }, "Noch keine Hypothese: zuerst messen."))]));

/* ---------- 3 Jetzt messen ---------- */
function autoZeile(k, m, hervor) {
  const mw = k.messwerte.find((x) => x.signal === m.signal);
  const ton = !mw || mw.status === "fehlt" || mw.status === "zustand" ? "pending" : mw.status === "im_bereich" ? "ok" : "crit";
  return h("div", { class: `li-row sk-row fall-row${hervor ? " fall-naechste" : ""}` }, h("span", { class: "sk-mark" }, mark(ton)),
    h("span", { class: "li-t" }, signalTitle(m.signal), h("span", { class: "li-unter" }, `${m.titel} · automatisch, Bewertung live`)),
    h("span", { class: "li-v mono", "data-live": m.signal }, mw ? messwertText(mw) : "kein Wert"), h("span"));
}
function manuellZeile(code, m, antwort, hervor) {
  const knopf = (d) => h("button", { class: "btn sec small", type: "button", "aria-pressed": String(antwort === d.wenn), onclick: () => { mitManuell(code, m.id, d.wenn); logEvent(`Fall ${code}: ${kurz(m.titel)} ${knopfText(d)}`); render(true); } }, knopfText(d));
  return h("div", { class: `fall-manuell${hervor ? " fall-naechste" : ""}` },
    h("div", { class: "li-row sk-row fall-row" }, h("span", { class: "li-t" }, kurz(m.titel), h("span", { class: "li-unter" }, `${m.werkzeug || "ohne Werkzeug"} · etwa ${m.minuten} min · manuell`)),
      antwort ? h("span", { class: "li-v t-ok" }, "Ergebnis da") : h("span", { class: "li-v" }, "offen")),
    h("div", { class: "fall-knoepfe", role: "group", "aria-label": kurz(m.titel) }, ...m.deutung.map(knopf)));
}
function messen(code, k, f) {
  const n = k.naechste, manuelle = k.messungen.filter((m) => m.art === "manuell");
  return block("Jetzt messen",
    n && n.art === "auto" ? autoZeile(k, n, true) : null,
    ...manuelle.map((m) => manuellZeile(code, m, f.manuell[m.id], n && n.id === m.id)),
    !n && !manuelle.length ? zeileFrei(h("span", { class: "li-t" }, "Keine weitere Messung im Pfad.")) : null,
    !n && manuelle.length ? h("p", { class: "li-fuss fall-fuss" }, "Alle Messungen des Pfads liegen vor. Ein Ergebnis lässt sich durch erneutes Antippen zurücknehmen.") : null);
}

/* ---------- 4 Bauteile im 3D ---------- */
function bauteile(code, k) {
  const t = bauteileFuer(code);
  const namen = t.genau ? t.name : (k.bauteile || []).join(", ");
  const da = imSpeicher(code);
  return block("Bauteile im Zwilling",
    zeileFrei(h("span", { class: "li-t" }, namen || "kein Bauteil zugeordnet", h("span", { class: "li-unter" }, `Kabelweg ${k.steuergeraet || "Steuergerät"} zu den Sensoren, schematisch`)),
      h("button", { class: "btn sec small", type: "button", disabled: da ? null : true, title: da ? null : "Der Code steht gerade nicht im Fehlerspeicher", onclick: () => emit("zeige-3d", code) }, "Im 3D zeigen")));
}

/* ---------- 5 Maßnahme ---------- */
function massnahme(code, k, f) {
  const top = k.hypothesen[0] || null, fn = top && top.service ? FUNKTIONEN.find((x) => x.id === top.service) : null;
  const feld = h("textarea", { class: "inp txt fall-text", id: "fall-massnahme", rows: 2, maxlength: 600, placeholder: top ? top.massnahme : "Was wurde gemacht?" }, f.massnahme || "");
  feld.addEventListener("change", () => setzeFall(code, { massnahme: feld.value.trim() }));
  const insBuch = () => {
    const text = feld.value.trim();
    if (!text) { toast("Bitte zuerst die Maßnahme eintragen."); feld.focus(); return; }
    setzeFall(code, { massnahme: text });
    eintragen("massnahme", { operation: `Fall ${code}`, code, massnahme: text, hypothese: top ? top.id : null }).then(() => { toast("Maßnahme im Betriebsbuch eingetragen."); logEvent(`Fall ${code}: Maßnahme eingetragen`); render(true); });
  };
  return block("Maßnahme",
    h("div", { class: "fall-feld" }, h("label", { class: "sr", for: "fall-massnahme" }, "Maßnahme"), feld),
    h("div", { class: "fall-knoepfe" },
      top ? h("button", { class: "btn qt small", type: "button", onclick: () => { feld.value = top.massnahme; setzeFall(code, { massnahme: top.massnahme }); } }, `Vorschlag: ${top.klartext}`) : null,
      fn ? h("button", { class: "btn qt small", type: "button", onclick: () => go("service", { sub: fn.gruppe }) }, icon("wrench"), fn.name) : null,
      h("button", { class: "btn pri small", type: "button", onclick: insBuch }, icon("tick"), "Ins Betriebsbuch")));
}

/* ---------- 6 Nachweis ---------- */
function nachweisBlock(code, k, f) {
  const vorher = (state.snapshot && state.snapshot.live && Object.keys(state.snapshot.live).length ? state.snapshot.live : f.vorher) || {};
  const nachher = state.postscan ? state.postscan.live || {} : null;
  const zeilen = nachweis(pfadAus(k), vorher, nachher).map((z) => h("div", { class: "li-row sk-row fall-row" }, h("span", { class: "sk-mark" }, mark(z.ok ? "ok" : z.nachher ? "crit" : "pending")),
    h("span", { class: "li-t" }, signalTitle(z.signal), h("span", { class: "li-unter" }, `${z.vorher ? z.vorher.text : "kein Wert"} → ${z.nachher ? z.nachher.text : "noch kein Nachher-Scan"}`)), h("span"), h("span")));
  const weg = codeWeg(code);
  const codeZeile = h("div", { class: "li-row sk-row fall-row" }, h("span", { class: "sk-mark" }, mark(weg == null ? "pending" : weg ? "ok" : "crit")),
    h("span", { class: "li-t" }, h("span", { class: "mono" }, code), h("span", { class: "li-unter" }, weg == null ? "gespeichert → noch kein Nachher-Scan" : weg ? `gespeichert → gelöscht, kein Wiederauftreten bis ${clockTime(state.postscan.at)}` : "gespeichert → weiter gespeichert")), h("span"), h("span"));
  const ablegen = () => {
    const r = buildCase({ fahrzeug: state.fahrzeug || {}, vorher: state.snapshot, nachher: state.postscan, massnahme: f.massnahme, km: state.sitzung.km });
    if (r.fehler) { toast(r.fehler); return; }
    const fall = { ...r.fall, code, nachweis: nachweis(pfadAus(k), vorher, nachher).map((z) => ({ signal: z.signal, vorher: z.vorher && z.vorher.wert, nachher: z.nachher && z.nachher.wert, ok: z.ok })) };
    storageSet("kfzdiag-faelle", addCase(storageGet("kfzdiag-faelle", []), fall));
    state.sitzung = { ...state.sitzung, fall };
    logEvent(`Fall ${code} abgelegt: ${fall.ergebnis}`);
    toast("Fall abgelegt, mit vorher und nachher je Signal.");
  };
  return block("Nachweis", ...zeilen, codeZeile,
    h("div", { class: "fall-knoepfe" },
      h("button", { class: "btn sec small", type: "button", disabled: !state.status || state.postscanLaeuft ? true : null, onclick: () => runPostScan().then(() => render(true)) }, icon("reset"), state.postscanLaeuft ? "Nachher-Scan läuft …" : "Nachher-Scan"),
      h("button", { class: "btn sec small", type: "button", disabled: state.snapshot && state.postscan ? null : true, title: state.snapshot && state.postscan ? null : "Erst Nachher-Scan", onclick: ablegen }, icon("tick"), "Fall ablegen"),
      h("button", { class: "btn qt small", type: "button", onclick: () => go("report") }, icon("report"), "Bericht")));
}

/* ---------- 7 Agent ---------- */
function agentKnopf(code, k, f) {
  const frage = [`Fall ${code} durchgehen`, ...Object.entries(f.manuell).map(([id, antwort]) => { const m = messungVon(k, id), d = m && m.deutung.find((x) => x.wenn === antwort); return m && d ? `Manuelles Ergebnis ${kurz(m.titel)}: ${knopfText(d)}.` : null; }).filter(Boolean)].join(". ");
  return h("section", { class: "sk-block fall-agent" }, h("div", { class: "li-gruppe" },
    h("button", { class: "li-row sk-row sk-aktion t-blau", type: "button", onclick: () => { go("agent"); emit("chat-prefill", frage); } }, h("span", { class: "li-t" }, "Fall mit Claude durchgehen"))),
    h("p", { class: "li-fuss" }, "Der Assistent liest diesen Fall und antwortet in derselben Form: stützt, widerspricht, fehlt. Ohne FIN und Kennzeichen."));
}

/* ---------- Seite ---------- */
function ohnePfad(code, k) {
  return [nav(), h("section", { class: "li-gruppe sk-kopf" }, h("p", { class: "eyebrow" }, "Fall"), h("h2", { class: "sk-titel mono" }, code),
    h("p", { class: "sk-text" }, k.grund === "kein_pfad" ? `${k.titel || "Dieser Code"}: für ${code} gibt es noch keinen geführten Pfad, darum keine Hypothesen.` : "Zu diesem Code ist nichts hinterlegt.")),
    gruppe({ zeilen: [{ label: "Infoblatt öffnen", ziel: () => emit("open-info", `dtc:${code}`) }, { label: "Fehlerspeicher", ziel: () => go("faults") }] })];
}
function merkeVorher(code, k, f) {
  if (f.vorher) return f;
  const werte = liveWerte(state.live), signale = [...k.messwerte.map((m) => m.signal), "DREHZAHL"];
  const vorher = Object.fromEntries(signale.filter((s) => typeof werte[s] === "number").map((s) => [s, werte[s]]));
  if (!Object.keys(vorher).length) return f;
  setzeFall(code, { vorher });
  return fallVon(code);
}

let laufend = 0, gezeigt = "", letzteKette = null;
export async function render(neu = false) {
  if ($("view-fall").hidden) return;
  const code = String(currentRoute().sub || "").toUpperCase();
  if (!code) { $("fall").replaceChildren(nav(), gruppe({ zeilen: [{ label: "Kein Fehlercode angegeben.", ziel: () => go("faults") }] })); return; }
  const f0 = fallVon(code);
  const stand = JSON.stringify([code, f0.manuell, Boolean(state.postscan), state.postscan && state.postscan.at, imSpeicher(code), state.status && state.status.simuliert]);
  if (!neu && stand === gezeigt) return;
  gezeigt = stand;
  const lauf = ++laufend;
  if (!$("fall").childElementCount) $("fall").replaceChildren(nav(), h("p", { class: "sm", role: "status" }, "Fall wird geladen …"));
  try {
    const k = await fallLaden(code, f0.manuell);
    if (lauf !== laufend || $("view-fall").hidden) return;
    if (!k.ok) { $("fall").replaceChildren(...ohnePfad(code, k)); return; }
    letzteKette = k;
    const f = merkeVorher(code, k, f0);
    const fokus = document.activeElement && document.activeElement.id;
    $("fall").replaceChildren(nav(),
      h("div", { class: "fall-spalten" },
        h("div", { class: "fall-spalte" }, kopf(code, k, f), ursachen(k), messen(code, k, f)),
        h("div", { class: "fall-spalte" }, bauteile(code, k), massnahme(code, k, f), nachweisBlock(code, k, f))),
      agentKnopf(code, k, f),
      h("p", { class: "li-fuss" }, k.hinweis || ""));
    if (fokus && $(fokus)) $(fokus).focus();
  } catch (err) {
    console.error(err);
    if (lauf === laufend) $("fall").replaceChildren(nav(), gruppe({ zeilen: [{ label: "Fall nicht ladbar", unter: err.message, ziel: () => render(true) }], fuss: "Antippen lädt neu." }));
  }
}

/* Live-Werte laufend in die Messzeile schreiben, ohne die Seite neu zu bauen (Eingaben bleiben erhalten). */
function liveNachziehen() {
  if ($("view-fall").hidden || !letzteKette) return;
  const werte = liveWerte(state.live);
  for (const el of document.querySelectorAll("#fall [data-live]")) {
    const soll = letzteKette.messwerte.find((m) => m.signal === el.dataset.live);
    if (soll) el.textContent = messwertText(bewerteSignal(soll, werte));
  }
}

export function initFall() {
  on("fall", () => render(true));
  on("render", () => render(false));
  on("status", () => { liveNachziehen(); render(false); });
  /* Pfadliste für »Fall öffnen«; neu zeichnen nur, wenn schon ein Fahrzeug verbunden ist (sonst kommt render mit connected) */
  suchIndex().then((index) => { for (const e of index) PFAD_CODES.add(e.code); if (state.status) emit("render"); }).catch((err) => console.error("Pfadliste nicht ladbar", err));
}
