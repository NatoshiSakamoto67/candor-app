/* CAN-Werkbank (Phase 3): Mitschnitt des eigenen Diagnoseverkehrs, eigene DBC-Datei, Kennungs-Erkunder und
   »Bedeutung abgleichen«, im Stil der Apple-Einstellungen. Nur im Profi-Modus, nie in der Kundenfassung.
   Alles nur lesend und nur am eigenen Fahrzeug (Zustimmung je Fahrzeug, im Server zusätzlich geprüft). */
import { $, h, mark, toast, download, storageGet, storageSet, numFix } from "./dom.js";
import { state, on, logEvent, vehicleKey } from "./state.js";
import { kundenfassung } from "./mandant.js";
import { letzteWerte, nachSteuergeraet, dbcDateiPruefen, zustimmungAn, mitZustimmung, beobachtenEingabe, erkundungZeile, erkundungLaeuft,
  didFunde, statusAbzeichen, rechercheLaeuft, rechercheKopf, rechercheJeFund, eigeneFunde, statusKnoepfe } from "../kern/werkbank-sicht.js";
import { FARBE } from "../kern/einstellungs-baum.js";
import { zurueckZeile, kopfkarte } from "./bausteine.js";

const KEY = "kfzdiag-werkbank-eigen";
const LEER = { mitschnitt: null, dbc: null, dekodiert: null, wissen: null, abgleich: null, erkundung: null, recherche: null, validierung: null, statusForm: null, erweitert: false, laeuft: "", eingabe: { adresse: "7E0", did: "F18C", byte: "0", anzahl: "60" } };
let daten = LEER;
/* Jede Antwort gehört zu dem Fahrzeug, bei dem sie angefragt wurde; nach einem Wechsel wird sie verworfen. */
let generation = 0;

const api = () => state.src && state.src.werkbank;
const eigen = () => zustimmungAn(storageGet(KEY, {}), vehicleKey());
const setzeDaten = (teil, g = generation) => { if (g !== generation) return; daten = { ...daten, ...teil }; zeichnen(); };

/* ---------- Bausteine: Kopf aus bausteine.js, Gruppen wie in seiten.js ---------- */
const kopf = (text) => [zurueckZeile(), kopfkarte({ icon: "bus", farbe: FARBE.dunkel, titel: "CAN-Werkbank", text })];
const block = (titel, inhalt, fuss) => h("section", { class: "sk-block" }, h("h3", { class: "li-k" }, titel), h("div", { class: "li-gruppe" }, ...inhalt.filter(Boolean)), fuss ? h("p", { class: "li-fuss" }, fuss) : null);
const zeile = (label, wert, mono) => h("div", { class: "li-row sk-row" }, h("span", { class: "li-t" }, label), h("span", { class: `li-v${mono ? " mono" : ""}` }, wert));
/* Langer Wert unter der Beschriftung, damit am Handy nichts gequetscht wird */
const zeileUnter = (label, text) => h("div", { class: "li-row sk-row" }, h("span", { class: "li-t" }, label, h("span", { class: "li-unter" }, text)));
const aktion = (label, tun, ton = "blau", aus = false) => h("button", { class: `li-row sk-row sk-aktion t-${ton}`, type: "button", disabled: aus || null, onclick: tun }, h("span", { class: "li-t" }, label));

async function mit(name, tun) {
  if (daten.laeuft) return null;
  const g = generation;
  setzeDaten({ laeuft: name });
  try { const r = await tun(); return g === generation ? r : null; } catch (err) { if (g === generation) toast(`${name}: ${err.message}`); return null; } finally { setzeDaten({ laeuft: "" }, g); }
}
const meldeFehler = (r) => { if (r && !r.ok) toast(r.meldung || "Nicht möglich."); return r && r.ok; };

/* ---------- Mitschnitt ---------- */
function zustimmungZeile() {
  const id = "wb-eigen";
  const inp = h("input", { type: "checkbox", role: "switch", class: "li-sw", id, checked: eigen() || null });
  inp.addEventListener("change", async () => {
    storageSet(KEY, mitZustimmung(storageGet(KEY, {}), vehicleKey(), inp.checked));
    if (!inp.checked && api()) { await api().widerrufen(); logEvent("Zustimmung »eigenes Fahrzeug« widerrufen", "info"); await lesen(); }
    zeichnen();
  });
  return h("label", { class: "li-row sk-row", for: id }, h("span", { class: "li-t" }, "Das ist mein eigenes Fahrzeug", h("span", { class: "li-unter" }, "Mitschneiden und Erkunden nur am eigenen Auto")), inp);
}
async function starten() {
  const r = await mit("Mitschnitt", () => api().start({ eigenes_fahrzeug: eigen() }));
  if (meldeFehler(r)) { logEvent("Mitschnitt gestartet", "info"); await lesen(); }
}
async function stoppen() {
  const r = await mit("Mitschnitt", () => api().stop());
  if (meldeFehler(r)) { logEvent(`Mitschnitt beendet, ${r.anzahl} Einträge`, "info"); await lesen(); }
}
async function lesen() {
  const g = generation, r = await api().lesen();
  if (r && r.ok) setzeDaten({ mitschnitt: r }, g);
}
async function exportieren() {
  const text = await api().csv();
  download(`candor-mitschnitt-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`, text, "text/csv");
}
function mitschnittBlock() {
  const m = daten.mitschnitt || { aktiv: false, eintraege: [] }, n = m.eintraege.length;
  const letzte = m.eintraege.slice(-6).reverse();
  return block("Mitschnitt", [
    zeile("Status", m.aktiv ? "läuft" : n ? `${n} Einträge` : "aus"),
    m.aktiv ? aktion("Mitschnitt beenden", stoppen, "rot") : aktion("Mitschnitt starten", starten, "blau", !eigen() || Boolean(daten.laeuft)),
    n && !m.aktiv ? aktion("Als CSV sichern", exportieren) : null,
    ...letzte.map((e) => zeile(`${numFix(e.t, 3)} s · ${e.richtung === "aus" ? "→" : "←"} ${e.adresse}`, e.hex, true)),
  ], "Zeichnet die Anfragen und Antworten auf, die CANdor mit dem Auto austauscht, mit Zeit und Adresse. Die FIN wird nie aufgezeichnet. Rohes Mithören des ganzen Busses ist das nicht.");
}

/* ---------- Fahrzeug erkunden (E1, nur lesend) ---------- */
const STAND_TAKT_MS = 1000;
let standUhr = 0;
function standAbfragen() {
  clearTimeout(standUhr);
  const g = generation;
  standUhr = setTimeout(async () => {
    if (g !== generation || !api()) return;
    try {
      const r = await api().erkundung();
      if (g !== generation || !r || !r.ok) return;
      setzeDaten({ erkundung: r }, g);
      if (erkundungLaeuft(r)) standAbfragen();
      else { logEvent(`Erkundung: ${r.meldung}`, r.phase === "fertig" ? "info" : "warn"); await wissen(); }
    } catch (err) { toast(`Erkundung: ${err.message}`); }
  }, STAND_TAKT_MS);
}
async function erkundungStarten() {
  if (erkundungLaeuft(daten.erkundung)) return;
  const r = await mit("Erkundung", () => api().erkundungStart({ eigenes_fahrzeug: eigen(), erweitert: daten.erweitert }));
  if (!meldeFehler(r)) return;
  setzeDaten({ erkundung: r });
  logEvent(`Erkundung gestartet${daten.erweitert ? " (mit erweiterter Sitzung)" : ""}`, "info");
  standAbfragen();
}
async function erkundungAbbrechen() {
  const r = await api().erkundungAbbrechen();
  if (meldeFehler(r)) toast("Erkundung wird abgebrochen …");
}
function erweitertZeile(aus) {
  const id = "wb-erweitert";
  const inp = h("input", { type: "checkbox", role: "switch", class: "li-sw", id, checked: daten.erweitert || null, disabled: aus || null });
  inp.addEventListener("change", () => { daten = { ...daten, erweitert: inp.checked }; });
  return h("label", { class: "li-row sk-row", for: id }, h("span", { class: "li-t" }, "Auch erweiterte Sitzung abfragen", h("span", { class: "li-unter" }, "Sitzung 03, nur lesen; danach zurück in die Standardsitzung")), inp);
}
function sgZeile(sg) {
  const z = erkundungZeile(sg);
  return h("div", { class: `li-row sk-row wb-sg${z.ton ? ` t-${z.ton}` : ""}` },
    h("span", { class: "li-t" }, z.titel, h("span", { class: "li-unter mono" }, z.unter), h("span", { class: "li-unter wb-zahlen" }, z.wert),
      z.hinweis ? h("span", { class: "li-unter wb-hinweis" }, z.hinweis) : null));
}
/* ---------- Recherche-Agent (E2): Deutung mit Quelle, hebt nichts über »vermutet« ---------- */
const MAX_FUNDE_ANZEIGE = 12;
let rechercheUhr = 0;
function rechercheAbfragen() {
  clearTimeout(rechercheUhr);
  const g = generation;
  rechercheUhr = setTimeout(async () => {
    if (g !== generation || !api()) return;
    try {
      const r = await api().recherche();
      if (g !== generation || !r || !r.ok) return;
      setzeDaten({ recherche: r }, g);
      if (rechercheLaeuft(r)) { rechercheAbfragen(); return; }
      logEvent(`Recherche: ${r.meldung}`, r.phase === "fertig" ? "info" : "warn");
      await wissen();
    } catch (err) { toast(`Recherche: ${err.message}`); }
  }, STAND_TAKT_MS);
}
async function rechercheStarten(auswahl) {
  if (rechercheLaeuft(daten.recherche)) return;
  const r = await mit("Recherche", () => api().rechercheStart(auswahl));
  if (!meldeFehler(r)) return;
  setzeDaten({ recherche: r });
  logEvent(`Recherche gestartet: ${r.funde.length} Fund${r.funde.length === 1 ? "" : "e"}`, "info");
  rechercheAbfragen();
}
async function rechercheAbbrechen() {
  const r = await api().rechercheAbbrechen();
  if (meldeFehler(r)) toast("Recherche wird nach dem laufenden Fund angehalten …");
}
function rechercheKopfZeile() {
  const st = daten.recherche;
  if (!st || st.phase === "bereit") return null;
  const k = rechercheKopf(st);
  return [h("div", { class: `li-row sk-row wb-recherche-kopf${k.ton ? ` t-${k.ton}` : ""}`, role: "status" },
    h("span", { class: "li-t" }, k.titel, h("span", { class: "li-unter" }, k.unter))),
  rechercheLaeuft(st) ? aktion("Recherche abbrechen", rechercheAbbrechen, "rot") : null];
}
function ergebnisTeil(e) {
  return h("div", { class: `wb-ergebnis${e.ton ? " t-warn" : ""}` },
    h("p", { class: "wb-deutung" }, e.deutung, h("span", { class: `lvl ${e.sicherheit === "hoch" ? "belegt" : e.sicherheit === "mittel" ? "plausibel" : "vermutung"}` }, e.sicherheit)),
    e.formel ? h("p", { class: "wb-formel mono" }, `Formel ${e.formel}`) : null,
    e.pruefung ? h("p", { class: "wb-pruefung" }, e.pruefung) : null,
    e.quellen.length ? h("ul", { class: "wb-quellen" }, ...e.quellen.map((q) => h("li", null, h("a", { href: q.url, target: "_blank", rel: "noopener noreferrer" }, q.titel)))) : null,
    h("p", { class: "wb-herkunft" }, `${e.herkunft}${e.verworfen ? `, ${e.verworfen} Quelle${e.verworfen === 1 ? "" : "n"} verworfen` : ""}. ${e.notiz}`));
}
function fundZeile(f, lauf) {
  const abz = statusAbzeichen(f.status), imLauf = lauf.get(f.kennung);
  const beschaeftigt = rechercheLaeuft(daten.recherche) || Boolean(daten.laeuft);
  const knopf = f.status === "unbekannt"
    ? h("button", { class: "btn sec small", type: "button", disabled: beschaeftigt || null, onclick: () => rechercheStarten({ funde: [f.kennung] }) },
      imLauf && imLauf.status === "laeuft" ? "Sucht …" : imLauf && imLauf.status === "wartet" ? "Wartet" : "Recherchieren")
    : null;
  return h("div", { class: "li-row sk-row wb-fund" },
    h("div", { class: "wb-fund-kopf" },
      h("span", { class: "li-t" }, f.did, h("span", { class: "li-unter" }, f.sitzung), h("span", { class: "li-unter mono" }, f.roh)),
      h("span", { class: abz.klasse }, abz.text), knopf),
    imLauf && imLauf.status === "fehler" ? h("p", { class: "wb-pruefung t-warn" }, imLauf.meldung) : null,
    f.ergebnis ? ergebnisTeil(f.ergebnis) : null);
}
function fundeZeilen(sg) {
  const eintraege = (daten.wissen && daten.wissen.eintraege) || [];
  const funde = didFunde(eintraege, sg.adresse);
  if (!funde.length) return [];
  const lauf = rechercheJeFund(daten.recherche);
  const unbekannt = funde.filter((f) => f.status === "unbekannt").length;
  const sichtbar = funde.slice(0, MAX_FUNDE_ANZEIGE);
  return [
    unbekannt ? aktion(`${unbekannt === 1 ? "Den unbekannten Fund" : `Unbekannte Funde (${Math.min(unbekannt, 10)})`} recherchieren`,
      () => rechercheStarten({ steuergeraet: sg.adresse }), "blau", rechercheLaeuft(daten.recherche) || Boolean(daten.laeuft)) : null,
    ...sichtbar.map((f) => fundZeile(f, lauf)),
    funde.length > sichtbar.length ? zeileUnter("Weitere", `${funde.length - sichtbar.length} Funde, im Fahrzeugwissen gespeichert`) : null,
  ];
}

function erkundungBlock() {
  const st = daten.erkundung, laeuft = erkundungLaeuft(st);
  const sgs = (st && st.steuergeraete) || [];
  return block("Fahrzeug erkunden", [
    laeuft ? null : erweitertZeile(!eigen()),
    laeuft ? null : aktion("Erkundung starten", erkundungStarten, "blau", !eigen() || Boolean(daten.laeuft)),
    st && st.phase !== "bereit" ? h("div", { class: "li-row sk-row wb-fortschritt", role: "status" },
      h("span", { class: "li-t" }, laeuft ? "Läuft" : st.phase === "fertig" ? "Fertig" : "Abgebrochen", h("span", { class: "li-unter" }, st.meldung || "")),
      h("progress", { max: "100", value: String(st.prozent || 0), "aria-label": "Fortschritt der Erkundung" })) : null,
    laeuft ? aktion("Abbrechen", erkundungAbbrechen, "rot") : null,
    ...(rechercheKopfZeile() || []),
    ...sgs.flatMap((sg) => [sgZeile(sg), ...(laeuft ? [] : fundeZeilen(sg))]),
  ], "Fragt alle Steuergeräte ab (11 und 29 Bit): Kennungen, Fehlerspeicher und lesbare DIDs in den Bereichen 0100 bis 01FF, F400 bis F4FF und FD00 bis FDFF. Nur lesend, nur am eigenen Fahrzeug, nur im Stand, gedrosselt. Airbag-Steuergeräte nur Kennungen und Fehler. Funde landen mit Status »unbekannt« im Fahrzeugwissen. »Recherchieren« fragt die KI nach Bedeutung, Formel und Quelle; das Ergebnis ist ein Vorschlag (höchstens »vermutet«), nichts wird ans Auto gesendet.");
}

/* ---------- Status-Leiter (E3): Validierung und Knöpfe von Hand ---------- */
const MAX_VERLAUF_ANZEIGE = 4;
async function validieren() {
  const r = await mit("Validierung", () => api().validieren({}));
  if (!meldeFehler(r)) return;
  setzeDaten({ validierung: r });
  const geaendert = r.funde.filter((f) => f.status !== f.status_vorher).length;
  toast(r.funde.length ? `${r.funde.length} Fund${r.funde.length === 1 ? "" : "e"} geprüft, ${geaendert} mit neuem Status.` : "Keine Funde ab »vermutet« mit Formel.");
  logEvent(`Validierung: ${r.funde.length} Funde, ${geaendert} geändert`, "info");
  await wissen();
}
async function statusBestaetigen(form, f, knopf) {
  const eingabe = new FormData(form);
  const r = await mit("Status", () => api().statusSetzen({ kennung: f.kennung, ziel: knopf.ziel, beleg: String(eingabe.get("beleg") || ""), bestaetigt: eingabe.get("gefahr") === "ja" }));
  if (!meldeFehler(r)) return;
  logEvent(`Fund ${f.titel}: ${knopf.text} (${r.status})`, "info");
  setzeDaten({ statusForm: null });
  await wissen();
}
function statusFormular(f, knopf) {
  const form = h("form", { class: "wb-statusform", onsubmit: (e) => { e.preventDefault(); statusBestaetigen(form, f, knopf); } },
    h("label", { class: "wb-feld" }, h("span", { class: "sm" }, knopf.ziel === "herabstufen" ? "Notiz: welcher Widerspruch?" : "Beleg: womit abgeglichen, was gesehen?"),
      h("textarea", { class: "inp", name: "beleg", rows: "2", maxlength: "1000", required: true, placeholder: knopf.ziel === "herabstufen" ? "etwa: springt bei Kälte, Kombi zeigt anderes" : "etwa: Kombiinstrument zeigt 82 °C, CANdor 82 °C" })),
    h("label", { class: "wb-gefahr" }, h("input", { type: "checkbox", name: "gefahr", value: "ja", required: true }),
      h("span", null, "Auf eigene Gefahr, nur intern. Ein Mensch steht für diese Deutung ein.")),
    h("div", { class: "wb-statusform-knoepfe" },
      h("button", { class: `btn ${knopf.ziel === "herabstufen" ? "sec" : "pri"} small`, type: "submit", disabled: Boolean(daten.laeuft) || null }, `${knopf.text} bestätigen`),
      h("button", { class: "btn sec small", type: "button", onclick: () => setzeDaten({ statusForm: null }) }, "Abbrechen")));
  return form;
}
function statusFundZeile(f) {
  const abz = statusAbzeichen(f.status);
  const offen = daten.statusForm && daten.statusForm.kennung === f.kennung ? statusKnoepfe(f.status).find((k) => k.ziel === daten.statusForm.ziel) : null;
  return h("div", { class: "li-row sk-row wb-fund wb-leiter" },
    h("div", { class: "wb-fund-kopf" },
      h("span", { class: "li-t" }, f.titel, h("span", { class: "li-unter" }, f.deutung), f.formel ? h("span", { class: "li-unter mono" }, f.formel) : null),
      h("span", { class: abz.klasse }, abz.text)),
    f.widerspruch ? h("p", { class: "wb-pruefung t-warn" }, "Widerspruch in einer Fahrt. Bitte von Hand prüfen.") : null,
    f.verlauf.length ? h("ol", { class: "wb-verlauf", "aria-label": "Status-Verlauf" }, ...f.verlauf.slice(0, MAX_VERLAUF_ANZEIGE).map((v) =>
      h("li", null, h("b", null, v.titel), h("span", { class: "sm" }, v.unter), v.grund ? h("span", { class: "sm" }, v.grund) : null, v.beleg ? h("span", { class: "sm wb-beleg" }, `Beleg: ${v.beleg}`) : null))) : null,
    offen ? statusFormular(f, offen) : h("div", { class: "wb-statusknoepfe" }, ...statusKnoepfe(f.status).map((k) =>
      h("button", { class: `btn ${k.ziel === "herabstufen" ? "sec" : "pri"} small`, type: "button", disabled: Boolean(daten.laeuft) || null,
        onclick: () => setzeDaten({ statusForm: { kennung: f.kennung, ziel: k.ziel } }) }, k.text))));
}
function leiterBlock() {
  const funde = eigeneFunde((daten.wissen && daten.wissen.eintraege) || []);
  return block("Eigene Signale prüfen", [
    aktion("Diese Fahrt prüfen (Validierung)", validieren, "blau", Boolean(daten.laeuft)),
    funde.length ? null : zeileUnter("Noch keine", "Funde ab »vermutet« mit Formel erscheinen hier und in den Live-Werten."),
    ...funde.slice(0, MAX_FUNDE_ANZEIGE).map(statusFundZeile),
  ], "Funde ab »vermutet« mit Formel liest CANdor live per 0x22 mit (nur lesend, Standardsitzung, gedrosselt). Die Validierung prüft die Messreihen dieser Fahrt: Bereich, Sprünge, Ruhezustand, Bezug zu einem genormten Signal. Automatisch geht es höchstens bis »plausibel« (eine Fahrt passt) und »bestätigt« (zweite Fahrt, zweites Fahrzeug gleicher Teilenummer oder zweite Quelle). »Geprüft« und »Freigegeben« setzt nur ein Mensch mit Beleg, auf eigene Gefahr und nur intern.");
}

/* ---------- Eigene DBC ---------- */
async function dbcLaden(text, name) {
  const r = await mit("DBC", () => api().dbc(text, name));
  if (!meldeFehler(r)) return;
  setzeDaten({ dbc: r });
  logEvent(`DBC geladen: ${r.name}`, "info");
  await dekodieren();
}
function dbcWaehlen() {
  const inp = h("input", { type: "file", accept: ".dbc,text/plain" });
  inp.addEventListener("change", async () => {
    const datei = inp.files && inp.files[0];
    if (!datei) return;
    const fehler = dbcDateiPruefen(datei);
    if (fehler) { toast(fehler); return; }
    await dbcLaden(await datei.text(), datei.name);
  });
  inp.click();
}
async function beispielDbc() {
  const text = await fetch("daten/eigen-obd.dbc").then((r) => r.text());
  await dbcLaden(text, "eigen-obd.dbc (Beispiel)");
}
async function dekodieren() {
  const r = await mit("Dekodieren", () => api().dekodiert());
  if (meldeFehler(r)) setzeDaten({ dekodiert: r });
}
function dbcBlock() {
  const d = daten.dbc, werte = daten.dekodiert ? letzteWerte(daten.dekodiert.zeilen) : [];
  return block("Eigene DBC-Datei", [
    zeileUnter("Geladen", d ? `${d.name}, ${d.botschaften.length} Botschaft${d.botschaften.length === 1 ? "" : "en"}` : "keine"),
    aktion("DBC-Datei wählen …", dbcWaehlen, "blau", Boolean(daten.laeuft)),
    d ? null : aktion("Beispiel für OBD-Antworten laden", beispielDbc, "blau", Boolean(daten.laeuft)),
    d ? aktion("Mitschnitt dekodieren", dekodieren, "blau", Boolean(daten.laeuft)) : null,
    ...werte.map((w) => zeile(w.signal, `${numFix(w.wert, 2)} · ${w.anzahl}×`, true)),
    daten.dekodiert && daten.dekodiert.nicht_dekodiert ? zeile("Nicht dekodierbar", String(daten.dekodiert.nicht_dekodiert)) : null,
  ], "Nur eigene DBC-Dateien, keine Herstellerdaten. Die Datei bleibt im Speicher des Servers und wird nicht abgelegt. Dekodiert werden Antworten bis sieben Bytes.");
}

/* ---------- Erkunder und Bedeutung ---------- */
async function erkunden() {
  const r = await mit("Erkunder", () => api().erkunden({ eigenes_fahrzeug: eigen() }));
  if (meldeFehler(r)) { logEvent(`Kennungen gelesen: ${r.funde.length}`, "info"); await wissen(); }
}
async function wissen() {
  const g = generation, r = await api().wissen();
  if (r && r.ok) setzeDaten({ wissen: r }, g);
}
function erkunderBlock() {
  const funde = ((daten.wissen && daten.wissen.eintraege) || []).filter((e) => e.art === "kennung").map((e) => e.wert);
  const gruppen = nachSteuergeraet(funde);
  return block("Kennungen der Steuergeräte", [
    aktion("Genormte Kennungen lesen", erkunden, "blau", !eigen() || Boolean(daten.laeuft)),
    ...gruppen.flatMap((g) => [h("div", { class: "li-row sk-row wb-gruppe" }, h("span", { class: "li-t" }, g.adresse)),
      ...g.funde.map((f) => zeile(`${f.did}${f.name ? ` · ${f.name}` : ""}`, f.text || f.hex, true))]),
  ], "Liest nur genormte Kennungen F180 bis F19F (Software, Hardware, Seriennummer). Die FIN wird übersprungen. Funde bleiben für dieses Fahrzeug gespeichert.");
}
async function abgleichen(form) {
  const eingabe = /** @type {any} */ (Object.fromEntries(new FormData(form)));
  daten = { ...daten, eingabe };
  const e = beobachtenEingabe(eingabe);
  if (!e.ok) { toast(e.meldung); return; }
  const r = await mit("Abgleich", () => api().beobachten({ ...e.wert, eigenes_fahrzeug: eigen() }));
  if (meldeFehler(r)) setzeDaten({ abgleich: r });
}
function abgleichBlock() {
  const feld = (name, label, wert, breite) => h("label", { class: "wb-feld" }, h("span", { class: "sm" }, label), h("input", { class: "inp mono", name, value: wert, size: breite, autocomplete: "off", spellcheck: "false" }));
  const form = h("form", { class: "li-row sk-row wb-form", onsubmit: (ev) => { ev.preventDefault(); abgleichen(form); } },
    feld("adresse", "Adresse", daten.eingabe.adresse, 4), feld("did", "Kennung", daten.eingabe.did, 5), feld("byte", "Byte", daten.eingabe.byte, 3), feld("anzahl", "Punkte", daten.eingabe.anzahl, 4),
    h("button", { class: "btn sec small", type: "submit", disabled: !eigen() || Boolean(daten.laeuft) || null }, "Abgleichen"));
  const a = daten.abgleich;
  return block("Bedeutung abgleichen", [form,
    ...(a ? (a.vorschlaege.length ? a.vorschlaege.slice(0, 5).map((v) => h("div", { class: "li-row sk-row" }, h("span", { class: "li-t" }, v.signal),
      h("span", { class: "li-v" }, h("span", { class: `lvl ${v.sicherheit === "unsicher" ? "vermutung" : v.sicherheit}` }, v.sicherheit), ` r = ${numFix(v.r, 2)}`))) : [zeileUnter("Ergebnis", "kein Zusammenhang erkennbar")]) : [])],
    a ? a.hinweis : "Liest ein Byte einer Kennung mehrfach und vergleicht den Verlauf mit bekannten Messwerten. Ergebnis ist ein Vorschlag, kein Beleg.");
}

/* ---------- Zeichnen ---------- */
export function zeichnen() {
  if ($("view-werkbank").hidden) return;
  if (kundenfassung()) { $("werkbank").replaceChildren(...kopf("Die Werkbank gibt es in dieser Fassung nicht.")); return; }
  if (!api()) { $("werkbank").replaceChildren(...kopf("Erst ein Fahrzeug verbinden oder den Simulator im Server starten.")); return; }
  $("werkbank").replaceChildren(...[
    ...kopf(`Werkzeuge für das eigene Fahrzeug: erkunden, mitschneiden, mit einer eigenen DBC-Datei lesen, Kennungen der Steuergeräte sammeln und die Bedeutung unbekannter Werte abgleichen. Alles nur lesend.${
      state.src && state.src.mode === "demo" ? " In der Vorschau gibt es kein Fahrzeug: Erkunden und Mitschneiden gehen nur mit dem Simulator im Diagnose-Server oder am echten Auto." : ""}`),
    daten.laeuft ? h("p", { class: "sm wb-laeuft", role: "status" }, mark("pending"), ` ${daten.laeuft} läuft …`) : null,
    block("Eigenes Fahrzeug", [zustimmungZeile()]),
    erkundungBlock(), leiterBlock(), mitschnittBlock(), dbcBlock(), erkunderBlock(), abgleichBlock()].filter(Boolean));
}

async function erkundungLesen() {
  if (!api().erkundung) return;
  const g = generation, r = await api().erkundung();
  if (r && r.ok) { setzeDaten({ erkundung: r }, g); if (erkundungLaeuft(r)) standAbfragen(); }
}
async function rechercheLesen() {
  if (!api().recherche) return;
  const g = generation, r = await api().recherche();
  if (r && r.ok) { setzeDaten({ recherche: r }, g); if (rechercheLaeuft(r)) rechercheAbfragen(); }
}

export function initWerkbank() {
  on("tab", (id) => { if (id === "werkbank") { zeichnen(); if (api()) { lesen(); wissen(); erkundungLesen(); rechercheLesen(); } } });
  on("fahrzeug-aktiv", () => { generation += 1; clearTimeout(standUhr); clearTimeout(rechercheUhr); daten = LEER; zeichnen(); });
}
