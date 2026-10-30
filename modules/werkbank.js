/* CAN-Werkbank (Phase 3): Mitschnitt des eigenen Diagnoseverkehrs, eigene DBC-Datei, Kennungs-Erkunder und
   »Bedeutung abgleichen«, im Stil der Apple-Einstellungen. Nur im Profi-Modus, nie in der Kundenfassung.
   Alles nur lesend und nur am eigenen Fahrzeug (Zustimmung je Fahrzeug, im Server zusätzlich geprüft). */
import { $, h, mark, toast, download, storageGet, storageSet, numFix } from "./dom.js";
import { state, on, logEvent, vehicleKey } from "./state.js";
import { kundenfassung } from "./mandant.js";
import { letzteWerte, nachSteuergeraet, dbcDateiPruefen, zustimmungAn, mitZustimmung, beobachtenEingabe } from "../kern/werkbank-sicht.js";

const KEY = "kfzdiag-werkbank-eigen";
const LEER = { mitschnitt: null, dbc: null, dekodiert: null, wissen: null, abgleich: null, laeuft: "", eingabe: { adresse: "7E0", did: "F18C", byte: "0", anzahl: "60" } };
let daten = LEER;
/* Jede Antwort gehört zu dem Fahrzeug, bei dem sie angefragt wurde; nach einem Wechsel wird sie verworfen. */
let generation = 0;

const api = () => state.src && state.src.werkbank;
const eigen = () => zustimmungAn(storageGet(KEY, {}), vehicleKey());
const setzeDaten = (teil, g = generation) => { if (g !== generation) return; daten = { ...daten, ...teil }; zeichnen(); };

/* ---------- Bausteine wie in seiten.js ---------- */
const kopf = (titel, text) => h("section", { class: "li-gruppe sk-kopf" }, h("h2", { class: "sk-titel" }, titel), h("p", { class: "sk-text" }, text));
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
    zustimmungZeile(),
    zeile("Status", m.aktiv ? "läuft" : n ? `${n} Einträge` : "aus"),
    m.aktiv ? aktion("Mitschnitt beenden", stoppen, "rot") : aktion("Mitschnitt starten", starten, "blau", !eigen() || Boolean(daten.laeuft)),
    n && !m.aktiv ? aktion("Als CSV sichern", exportieren) : null,
    ...letzte.map((e) => zeile(`${numFix(e.t, 3)} s · ${e.richtung === "aus" ? "→" : "←"} ${e.adresse}`, e.hex, true)),
  ], "Zeichnet die Anfragen und Antworten auf, die CANdor mit dem Auto austauscht, mit Zeit und Adresse. Die FIN wird nie aufgezeichnet. Rohes Mithören des ganzen Busses ist das nicht.");
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
  if (kundenfassung()) { $("werkbank").replaceChildren(kopf("CAN-Werkbank", "Die Werkbank gibt es in dieser Fassung nicht.")); return; }
  if (!api()) { $("werkbank").replaceChildren(kopf("CAN-Werkbank", "Erst ein Fahrzeug verbinden oder den Simulator im Server starten.")); return; }
  $("werkbank").replaceChildren(...[
    kopf("CAN-Werkbank", "Werkzeuge für das eigene Fahrzeug: mitschneiden, mit einer eigenen DBC-Datei lesen, Kennungen der Steuergeräte sammeln und die Bedeutung unbekannter Werte abgleichen. Alles nur lesend."),
    daten.laeuft ? h("p", { class: "sm wb-laeuft", role: "status" }, mark("pending"), ` ${daten.laeuft} läuft …`) : null,
    mitschnittBlock(), dbcBlock(), erkunderBlock(), abgleichBlock()].filter(Boolean));
}

export function initWerkbank() {
  on("tab", (id) => { if (id === "werkbank") { zeichnen(); if (api()) { lesen(); wissen(); } } });
  on("fahrzeug-aktiv", () => { generation += 1; daten = LEER; zeichnen(); });
}
