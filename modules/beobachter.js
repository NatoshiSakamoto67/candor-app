/* Fahrt-Agent und Warnungen: Der Stecker bleibt im Auto, der Diagnose-Server liest im Takt mit (kfzdiag/beobachter.py).
   Diese Seite schaltet ihn ein und aus, wählt Takt und Einschätzung durch den Assistenten und zeigt Ereignisse und
   Fahrtberichte. Neue Ereignisse melden sich mit Ton, Vibration und Mitteilung, auch wenn eine andere Seite offen ist.
   Regeln in kern/beobachter.js; Einstellungen der Seite lokal in kfzdiag-beobachter, ohne FIN und Kennzeichen. */
import { $, h, toast, storageGet, storageSet, clockTime } from "./dom.js";
import { state, on } from "./state.js";
import { go } from "./shell.js";
import { tonSpielen, tonVorbereiten } from "./toene.js";
import { kopf, gruppe } from "./bausteine-seiten.js";
import { render as markdown } from "./md.js";
import { FARBE } from "../kern/einstellungs-baum.js";
import { einstellungen, ereignisText, ereignisTon, neueEreignisse, berichtTitel, INTERVALLE } from "../kern/beobachter.js";

const KEY = "kfzdiag-beobachter";
const TAKT_MIN_MS = 2000;
const TAKT_TEXT = { 2: "Alle 2 Sekunden", 5: "Alle 5 Sekunden", 10: "Alle 10 Sekunden", 30: "Alle 30 Sekunden" };
const LEER = { stand: null, fehler: "", laeuft: false, bericht: null };
let daten = LEER;
/* Ereignisse der letzten Abfrage; null heißt: noch kein Stand, dann nicht warnen (sonst klingelt alles Alte) */
let bekannt = null;
let timer = null;

const api = () => state.src && state.src.beobachter;
const eig = () => einstellungen(storageGet(KEY, {}));
const setzeEig = (k, v) => { storageSet(KEY, { ...eig(), [k]: v }); zeichnen(); };
const setzeDaten = (teil) => { daten = { ...daten, ...teil }; zeichnen(); };
const handbuch = () => go("handbuch", { sub: "agent" });

/* ---------- Warnungen: Ton und Vibration über »Töne & Haptik« (Lautstärke, Ereignis »Neuer Fehler«), Mitteilung ---------- */
export function warnen(ereignisse) {
  if (!ereignisse.length) return;
  const e = eig();
  if (e.ton || e.vibration) tonSpielen("warnung", { ton: e.ton, vibration: e.vibration });
  if (e.toast) toast(ereignisse.length > 1 ? `Fahrt-Agent: ${ereignisse.length} Ereignisse, zuletzt ${ereignisText(ereignisse[ereignisse.length - 1])}` : `Fahrt-Agent: ${ereignisText(ereignisse[0])}`);
}

/* ---------- Abfrage: nur solange der Server mitliest, im Takt des Beobachters ---------- */
function planen() {
  clearTimeout(timer);
  const s = daten.stand;
  if (!s || !s.aktiv) return;
  timer = setTimeout(abfragen, Math.max(TAKT_MIN_MS, (s.intervall || 5) * 1000));
}
async function abfragen() {
  if (!api()) return;
  try {
    const s = await api().status();
    if (s.ok === false) { bekannt = null; setzeDaten({ stand: null, fehler: s.meldung || "" }); return; }
    const liste = s.ereignisse || [];
    if (bekannt) warnen(neueEreignisse(bekannt, liste));
    bekannt = liste;
    setzeDaten({ stand: s, fehler: "" });
  } catch (err) {
    console.error("Fahrt-Agent: Stand nicht lesbar", err);
    setzeDaten({ fehler: "Diagnose-Server nicht erreichbar." });
  }
  planen();
}

async function mit(tun) {
  if (daten.laeuft || !api()) return;
  setzeDaten({ laeuft: true });
  try {
    const r = await tun();
    if (r && r.ok === false) toast(r.meldung || "Hat nicht geklappt.");
    else if (r && "aktiv" in r) { bekannt ||= r.ereignisse || []; daten = { ...daten, stand: r }; }
  } catch (err) {
    console.error("Fahrt-Agent", err);
    toast(`Fahrt-Agent: ${err.message}`);
  } finally {
    setzeDaten({ laeuft: false });
    planen();
  }
}
const starten = () => { tonVorbereiten(); const e = eig(); return mit(() => api().start({ intervall: e.intervall, mit_ki: e.mitKi })); };
const stoppen = () => mit(() => api().stopp());
const aktiv = () => Boolean(daten.stand && daten.stand.aktiv);
/* Läuft der Beobachter schon, übernimmt ein erneuter Start Takt und Einschätzung sofort */
const nachziehen = () => { if (aktiv()) starten(); };
async function testausloesen() {
  const r = await api().test().catch((err) => ({ ok: false, meldung: err.message }));
  toast(r.ok ? `Der nächste Takt meldet ${r.code} als neu.` : r.meldung || "Testauslöser nicht möglich.");
}
async function berichtOeffnen(name) {
  try { setzeDaten({ bericht: { name, text: await api().bericht(name) } }); window.scrollTo({ top: 0 }); }
  catch (err) { toast(`Bericht nicht ladbar: ${err.message}`); }
}

/* ---------- Seite ---------- */
const zeit = (sek) => (sek ? clockTime(new Date(sek * 1000)) : "noch nie");
function zustand(s) {
  const b = s.budget || {};
  return gruppe({ titel: "Zustand", zeilen: [
    { label: s.aktiv ? "Liest mit" : "Aus", unter: s.aktiv ? `${TAKT_TEXT[s.intervall] || `alle ${s.intervall} s`}${s.mit_ki ? ", mit Einschätzung" : ""}` : "Der Server liest nicht mit.", mark: s.aktiv ? "ok" : "pending" },
    { label: "Letzter Takt", wert: zeit(s.letzter_lauf), mono: true },
    s.letzter_fehler ? { label: "Letzter Fehler", unter: s.letzter_fehler, mark: "warn" } : null,
    { label: "Ereignisse", wert: String(s.anzahl_ereignisse || 0) },
    s.ki_moeglich ? { label: "Einschätzungen heute", wert: `${s.agent_aufrufe || 0}`, unter: b.grenze ? `Budget ${(b.verbraucht || 0).toLocaleString("de-DE")} von ${b.grenze.toLocaleString("de-DE")} Token` : null } : null,
  ], fuss: "Der Fahrt-Agent liest nur: Fehler, Live-Werte und Bereitschaftstests. Er schreibt nichts ins Auto." });
}
function einstellungsGruppen(s) {
  const e = eig();
  const takt = (n) => ({ typ: "wahl", label: TAKT_TEXT[n], an: e.intervall === n, setze: () => { setzeEig("intervall", n); nachziehen(); } });
  return [
    gruppe({ titel: "Abfrage-Takt", zeilen: INTERVALLE.map(takt), fuss: "Standard sind 5 Sekunden. Kürzere Takte melden schneller, halten aber den Bus und billige Stecker beschäftigter." }),
    gruppe({ titel: "Einschätzung", zeilen: [{ typ: "schalter", label: "Assistent schätzt ein", an: e.mitKi && s.ki_moeglich, fest: !s.ki_moeglich, setze: (x) => { setzeEig("mitKi", x); nachziehen(); } }],
      fuss: s.ki_moeglich ? "Bei einem Ereignis liest der Assistent nach und schreibt drei Sätze: was stützt, was widerspricht, was fehlt. Höchstens einmal in 10 Minuten und nur im Tagesbudget. Der Bericht steht unten." : "Dafür muss unter »KI und Dienste« ein Anbieter eingerichtet sein." }),
    gruppe({ titel: "Warnungen", zeilen: [
      { typ: "schalter", label: "Ton", an: e.ton, setze: (x) => setzeEig("ton", x) },
      { typ: "schalter", label: "Vibration", unter: "nur auf Geräten, die es können", an: e.vibration, setze: (x) => setzeEig("vibration", x) },
      { typ: "schalter", label: "Mitteilung", an: e.toast, setze: (x) => setzeEig("toast", x) },
      { typ: "aktion", label: "Warnung ausprobieren", tun: () => { tonVorbereiten(); warnen([{ art: "spannung_einbruch", wert: 11.2, grenze: 11.5, motor_laeuft: true, zeit: 0 }]); } },
    ], fuss: "Dasselbe Ereignis meldet sich höchstens alle 10 Minuten. Ein Messwert gilt erst nach drei Messungen in Folge außerhalb als Ereignis." }),
  ];
}
function ereignisListe(s) {
  const liste = [...(s.ereignisse || [])].reverse().slice(0, 20);
  return gruppe({ titel: "Letzte Ereignisse",
    zeilen: liste.length ? liste.map((e) => ({ label: e.text || ereignisText(e), unter: e.zeit_iso ? e.zeit_iso.slice(11, 19) : "", mark: ereignisTon(e), ziel: e.bericht ? () => berichtOeffnen(e.bericht) : null }))
      : [{ label: "Noch keine Ereignisse", unter: s.aktiv ? "Alles im Rahmen." : "Einschalten, dann liest der Server mit." }],
    fuss: "Das Fahrtprotokoll liegt auf dem Server unter var/fahrten, ohne FIN und Kennzeichen." });
}
function berichte(s) {
  const namen = s.berichte || [];
  if (!namen.length) return null;
  return gruppe({ titel: "Fahrtberichte", zeilen: namen.map((n) => { const t = berichtTitel(n); return { label: t.titel, unter: t.unter, ziel: () => berichtOeffnen(n) }; }) });
}
function berichtAnsicht() {
  const b = daten.bericht;
  return [
    h("section", { class: "sk-block" }, h("div", { class: "li-gruppe md bo-bericht" }, ...markdown(b.text, h))),
    gruppe({ zeilen: [{ typ: "aktion", label: "Bericht schließen", tun: () => setzeDaten({ bericht: null }) }], fuss: "Eine Einschätzung ist eine Vermutung, keine Diagnose." }),
  ];
}

function inhalt() {
  const s = daten.stand;
  const schalter = s ? { typ: "schalter", label: "Fahrt-Agent", an: s.aktiv, fest: daten.laeuft, setze: (x) => (x ? starten() : stoppen()) } : null;
  const kopfkarte = kopf({ icon: "glocke", farbe: FARBE.rot, titel: "Fahrt-Agent", mehr: { ziel: handbuch },
    text: "Der Stecker bleibt im Auto, der Diagnose-Server liest während der Fahrt mit. Bei einem neuen Fehler, einem Wert außerhalb des Rahmens, einem Spannungseinbruch oder fertigen Bereitschaftstests meldet sich CANdor.", schalter });
  if (!s) {
    const vorschau = !state.src || state.src.mode !== "server";
    return [kopfkarte, gruppe({ zeilen: [{ label: vorschau ? "Nur mit dem Diagnose-Server" : "Stand wird gelesen …", unter: daten.fehler || (vorschau ? "In der Vorschau gibt es kein Fahrzeug." : "") }] })];
  }
  if (daten.bericht) return [kopfkarte, ...berichtAnsicht()];
  return [kopfkarte, zustand(s), ...einstellungsGruppen(s), ereignisListe(s), berichte(s),
    s.aktiv && state.status && state.status.simuliert ? gruppe({ zeilen: [{ typ: "aktion", label: "Testauslöser (Simulator)", tun: testausloesen }], fuss: "Nur am Simulator: Der nächste Takt meldet einen vorhandenen Fehler als neu." }) : null];
}

export function zeichnen() {
  if ($("view-beobachter").hidden) return;
  const fokus = document.activeElement && document.activeElement.id;
  $("beobachter").replaceChildren(...inhalt().filter(Boolean));
  if (fokus && $(fokus)) $(fokus).focus();
}

export function initBeobachter() {
  on("tab", (id) => { if (id === "beobachter") { daten = { ...daten, bericht: null }; zeichnen(); abfragen(); } });
  /* Nach dem Verbinden einmal nachsehen: läuft der Beobachter schon (etwa nach einem Neuladen), warnt die Seite weiter */
  on("connected", () => abfragen());
}
