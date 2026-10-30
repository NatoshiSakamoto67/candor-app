/* Abschnitt »Prüfbericht« im Bericht: feste Regeln (daten/pruefregeln.json) über Befund, Readiness, Messwerte, Fälle und
   Nachweis. Prüfnummer und Hash belegen den Eingang, gleiche Daten ergeben denselben Bericht. Rechnet der Server
   (/api/pruefbericht), sonst der Kern im Browser (kern/pruefbericht.js). Der Text vom Assistenten ist eine getrennte
   Spur: nur über den Server, dort gegen die Regelnummern geprüft; abgelehnte Texte erscheinen nicht im Bericht. */
import { h, icon, statusChip, clockFull, toast } from "./dom.js";
import { state, faultSet, firstReadiness, obdList, signalTitle } from "./state.js";
import { pruefen, fehlerEingang, readinessEingang, sollwerteEingang, fallEingang, nachweisEingang, wertText } from "../kern/pruefbericht.js";
import { liveWerte } from "../kern/fall.js";

const CODE_RE = /^[PCBU][0-3][0-9A-F]{3}$/;
const SIGNAL_RE = /^[A-Z0-9_]{1,24}$/;
/* Grenzen wie nachweis_pruefen() im Server */
const MAX_CODES = 50, MAX_WERTE = 60, MAX_FAELLE = 8;
const HASH_KURZ = 12;
const REIHENFOLGE = ["mangel", "hinweis", "ok", "offen"];
const ART = {
  mangel: { ton: "crit", text: "Mangel" }, hinweis: { ton: "warn", text: "Hinweis" }, ok: { ton: "ok", text: "in Ordnung" },
  offen: { ton: "neutral", text: "nicht prüfbar" },
};

/* Zustand des Abschnitts: der zuletzt erstellte Bericht, sein Schlüssel (Sitzung, Ein- und Ausgangsbefund), KI-Text. */
let stand = { bericht: null, schluessel: null, laedt: false, fehler: null, ki: null, kiLaeuft: false };
const setze = (patch) => { stand = { ...stand, ...patch }; };
const istServer = () => Boolean(state.src && state.src.mode === "server");
const schluessel = () => [state.src && state.src.mode, state.status && state.status.profil, state.snapshot && state.snapshot.at.getTime(), state.postscan && state.postscan.at.getTime()].join("|");

/* ---------- Eingang ---------- */
const codesVon = (befund) => [...new Set([...befund.faults.values()].map((f) => f.code).filter((c) => CODE_RE.test(c)))].sort().slice(0, MAX_CODES);
const werteVon = (befund) => Object.fromEntries(Object.entries(befund.live || {}).filter(([s, v]) => SIGNAL_RE.test(s) && Number.isFinite(v)).slice(0, MAX_WERTE));
/* Nachweis erst mit Ein- und Ausgangsbefund; ohne Nachher-Scan bleiben die Nachweisregeln »nicht prüfbar«. */
export function nachweisAusBefunden(vorher, nachher) {
  if (!vorher || !nachher) return null;
  return { codes_vorher: codesVon(vorher), codes_nachher: codesVon(nachher), werte_vorher: werteVon(vorher), werte_nachher: werteVon(nachher) };
}

let datenP = null;
const ladeJson = (pfad) => fetch(pfad).then((r) => { if (!r.ok) throw new Error(`${pfad}: ${r.status}`); return r.json(); });
const ladeDaten = () => (datenP ||= Promise.all([ladeJson("daten/pruefregeln.json"), ladeJson("daten/sollwerte-allgemein.json")]).then(([r, s]) => ({ regeln: r.regeln, richtwerte: s.werte })));

/* Vorschau ohne Server: derselbe Eingang wie eingang_bauen() im Server, aus dem Stand im Browser. */
async function imBrowser(nachweis) {
  const { regeln, richtwerte } = await ladeDaten();
  const faults = [...faultSet().values()];
  const codes = [...new Set(faults.map((f) => f.code))].sort().slice(0, MAX_FAELLE);
  const { fallLaden } = await import("./fall.js");
  const faelle = await Promise.all(codes.map((code) => fallLaden(code, {}).catch(() => ({ ok: false, code, grund: "fehler" }))));
  const eingang = { fehler: fehlerEingang(faults, obdList("gespeichert")), readiness: readinessEingang(firstReadiness()), live: liveWerte(state.live),
    sollwerte: sollwerteEingang(state.analysis && state.analysis.sollwerte), fall: fallEingang(faelle), nachweis: nachweisEingang(nachweis, richtwerte) };
  return { ok: true, ...(await pruefen(eingang, regeln)), eingang };
}

async function vomServer(nachweis) {
  const q = nachweis ? `?nachweis=${encodeURIComponent(JSON.stringify(nachweis))}` : "";
  const r = await fetch(`/api/pruefbericht${q}`);
  if (!r.ok) throw new Error(`Server antwortet mit ${r.status}`);
  return r.json();
}

/* Neu prüfen: liest den aktuellen Stand, ein neuer Bericht ersetzt den alten samt KI-Text. */
export async function neuPruefen(neuZeichnen) {
  if (stand.laedt) return;
  setze({ laedt: true, fehler: null, schluessel: schluessel() });
  neuZeichnen();
  try {
    const nachweis = nachweisAusBefunden(state.snapshot, state.postscan);
    const bericht = istServer() ? await vomServer(nachweis) : await imBrowser(nachweis);
    setze({ bericht, ki: stand.bericht && stand.bericht.hash === bericht.hash ? stand.ki : null });
  } catch (error) {
    setze({ fehler: error.message || String(error) });
  } finally {
    setze({ laedt: false });
    neuZeichnen();
  }
}

/* Text vom Assistenten: der Server rechnet den Bericht neu und prüft die Antwort; der Text gehört zu genau diesem Bericht. */
async function assistent(neuZeichnen) {
  if (stand.kiLaeuft || !istServer()) return;
  setze({ kiLaeuft: true, ki: null });
  neuZeichnen();
  try {
    const r = await fetch("/api/pruefbericht/ki", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nachweis: nachweisAusBefunden(state.snapshot, state.postscan) }) });
    if (!r.ok) throw new Error(`Server antwortet mit ${r.status}`);
    const { ki, ...bericht } = await r.json();
    setze({ bericht, ki });
    if (!ki.ok) toast(ki.grund ? "Text vom Assistenten abgelehnt, er widerspricht den Regeln." : ki.meldung || "Kein Text vom Assistenten.");
  } catch (error) {
    setze({ ki: { ok: false, meldung: `Assistent nicht erreicht: ${error.message}` } });
  } finally {
    setze({ kiLaeuft: false });
    neuZeichnen();
  }
}

/* ---------- Darstellung ---------- */
/* Lesbare Namen der Eingangsfelder; Messwerte heißen wie in der Live-Ansicht. */
const FELD = {
  "fehler.gesamt": "Fehler gesamt", "fehler.aktiv": "aktiv", "fehler.aktiv_codes": "aktive Codes", "fehler.vorlaeufig": "vorläufig",
  "fehler.vorlaeufig_codes": "vorläufige Codes", "fehler.unbekannt": "ungedeutet", "fehler.unbekannt_codes": "ungedeutete Codes",
  "readiness.mil": "Motorkontrollleuchte an", "readiness.offen": "offene Tests", "readiness.gesamt": "Tests", "readiness.anzahl_fehler": "Abgasfehler",
  "sollwerte.anzahl": "verglichene Werte", "sollwerte.abweichungen": "Abweichungen",
  "fall.belegt": "belegt", "fall.belegt_text": "belegte Ursachen", "fall.offene_messungen": "offene Messungen", "fall.ohne_pfad": "ohne Pfad",
  "nachweis.weiter": "weiter gespeichert", "nachweis.neu": "neu", "nachweis.behoben": "weg", "nachweis.normalisiert": "im Bereich nach der Maßnahme",
};
const werteLabel = (pfad) => FELD[pfad] || (pfad.startsWith("live.") ? signalTitle(pfad.slice(5)) : pfad.split(".").pop().replace(/_/g, " "));
/* Nur vorhandene Werte; bei »nicht prüfbar« fehlen sie meist ganz, dann entfällt die Zeile. */
const werteText = (werte) => Object.entries(werte || {}).filter(([, w]) => w !== null && w !== undefined).map(([pfad, w]) => `${werteLabel(pfad)} ${wertText(w)}`).join(" · ");

function zeile(e) {
  const art = ART[e.ergebnis];
  const werte = werteText(e.werte);
  return h("li", { class: `pb-zeile t-${art.ton}` },
    h("div", { class: "pb-kopf" }, statusChip(art.ton, art.text), h("b", {}, e.titel), h("span", { class: "pb-id mono" }, e.id)),
    h("p", { class: "pb-text" }, e.text),
    h("p", { class: "pb-meta" }, ...(werte ? [`Werte: ${werte}`, h("br")] : []), `Quelle: ${e.quelle}`));
}

function zusammenfassung(z) {
  return h("div", { class: "diff" },
    h("div", { class: "box ok" }, h("h3", {}, "In Ordnung"), h("span", { class: "n" }, z.ok)),
    h("div", { class: "box warn" }, h("h3", {}, "Hinweise"), h("span", { class: "n" }, z.hinweis)),
    h("div", { class: `box ${z.mangel ? "up" : ""}` }, h("h3", {}, "Mängel"), h("span", { class: "n" }, z.mangel)));
}

function kiBlock(neuZeichnen) {
  const ki = stand.ki;
  /* nicht »btn sec«: .paper .sec gilt für Abschnitte und würde den Knopf zum Raster machen */
  const knopf = h("button", { class: "btn pri no-print", type: "button", disabled: !istServer() || stand.kiLaeuft || null, onclick: () => assistent(neuZeichnen) },
    icon("chat"), stand.kiLaeuft ? "Assistent schreibt …" : "Text vom Assistenten");
  const neu = h("button", { class: "btn qt no-print", type: "button", disabled: stand.laedt || null, onclick: () => neuPruefen(neuZeichnen) }, icon("reset"), "Neu prüfen");
  return [
    ki && ki.ok ? h("div", { class: "pb-ki" }, h("p", { class: "eyebrow" }, `Text vom Assistenten (${ki.modell || ki.anbieter || "KI"}), gegen die Regelnummern geprüft`), h("p", {}, ki.text)) : null,
    ki && !ki.ok ? h("p", { class: "hint no-print", role: "status" }, ki.grund ? `Text vom Assistenten abgelehnt: ${ki.grund}` : ki.meldung || "Kein Text vom Assistenten.") : null,
    h("div", { class: "rt-row no-print" }, knopf, neu),
    istServer() ? null : h("p", { class: "hint no-print" }, "Text vom Assistenten nur mit Diagnose-Server. Der Prüfbericht selbst gilt ohne KI."),
  ];
}

/* Abschnitt für renderReport(); lädt bei neuer Sitzung oder neuem Befund selbst nach und zeichnet dann neu. */
export function pruefberichtAbschnitt(fassung, neuZeichnen) {
  if (!state.status) return null;
  if (stand.schluessel !== schluessel() && !stand.laedt) queueMicrotask(() => neuPruefen(neuZeichnen));
  const b = stand.bericht;
  const titel = h("h3", {}, "Prüfbericht");
  if (!b) return h("section", { class: "sec pb" }, titel, h("p", { class: "hint", role: "status" }, stand.fehler ? `Prüfbericht nicht erstellt: ${stand.fehler}` : "Regeln werden geprüft …"));
  const z = b.zusammenfassung;
  const liste = b.ergebnisse.filter((e) => e.ergebnis !== "offen" || fassung === "werkstatt")
    .filter((e) => e.ergebnis !== "entfaellt")
    .sort((x, y) => REIHENFOLGE.indexOf(x.ergebnis) - REIHENFOLGE.indexOf(y.ergebnis));
  return h("section", { class: "sec pb" }, titel,
    h("div", { class: "pb-nummer" }, h("span", { class: "eyebrow" }, "Prüfnummer"), h("b", { class: "mono" }, b.pruefnummer),
      h("span", { class: "sm" }, "SHA-256 ", h("span", { class: "mono", title: b.hash }, `${b.hash.slice(0, HASH_KURZ)}…`))),
    h("p", { class: "hint" }, `${clockFull(new Date(b.zeit))} · ${b.regeln} feste Regeln, ohne KI. Gleiche Daten ergeben denselben Hash; Zeit, FIN und Kennzeichen gehen nicht ein.`),
    zusammenfassung(z),
    h("ol", { class: "pb-liste" }, ...liste.map(zeile)),
    h("p", { class: "hint" }, `${z.offen} Regeln nicht prüfbar, ${z.entfaellt} nicht zutreffend${fassung === "werkstatt" ? "" : " (Einzelheiten in der Werkstattfassung)"}.`),
    ...kiBlock(neuZeichnen).filter(Boolean),
    stand.fehler ? h("p", { class: "hint no-print", role: "status" }, `Neu prüfen gescheitert: ${stand.fehler}`) : null);
}
