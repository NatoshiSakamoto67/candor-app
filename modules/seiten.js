/* Unterseiten im Stil der Apple-Einstellungen (Konzept Abschnitt 8): Kopfkarte, Gruppen mit Fußnoten, Werte, Schalter,
   Auswahl mit Haken, Kennzahlen, Speicherbalken, Kacheln, blaue und rote Aktions-Zeilen. Jede Seite ist eine Funktion,
   die Bausteine liefert; Schalter wirken wirklich (Anzeige, Takt, Verbinden, Statusleiste, Export). */
import { $, h, icon, mark, numFix, storageGet, storageSet, toast, download, clockFull } from "./dom.js";
import { state, on, emit, firstReadiness, totalFaults, pendingFaults } from "./state.js";
import { go, back, currentRoute, anzeige, setzeAnzeige, resolvedDisplay, openDisplaySettings } from "./shell.js";
import { SEITEN_TITEL, ladezustand, bordnetzTon } from "../kern/einstellungs-baum.js";
import { vehicles, plate } from "./garage.js";
import { vehicleName } from "./fahrzeuge.js";
import { historyOf } from "./recorder.js";
import { buchLaenge } from "./service.js";
import { schreibschutzAn } from "./liste.js";
import { setzeModus, modus } from "./einfach.js";
import { bild, kopf, zeile, gruppe, zahlen, balken, raster } from "./bausteine-seiten.js";
import { seitenMehr, initSeitenMehr } from "./seiten-mehr.js";

/* ---------- Einstellungen der Unterseiten ---------- */
const KEY = "kfzdiag-seiten";
export const wert = (k, standard) => { const v = storageGet(KEY, {})[k]; return v === undefined ? standard : v; };
function setze(k, v) { storageSet(KEY, { ...storageGet(KEY, {}), [k]: v }); wendeAn(); emit("status"); }
function wendeAn() {
  const root = document.documentElement;
  if (wert("fett", false)) root.dataset.fett = "an"; else delete root.dataset.fett;
  if (wert("bewegung", false)) root.dataset.bewegung = "reduziert"; else delete root.dataset.bewegung;
}

/* ---------- Hilfen ---------- */
const v = (sig) => { const x = (state.live || {})[sig]; return x && typeof x.wert === "number" ? x.wert : null; };
const motorLaeuft = () => (v("DREHZAHL") || 0) > 100;
const verbunden = () => Boolean(state.status);
const zuSeite = (id) => () => go("seite", { sub: id });
const handbuch = (kap) => () => go("handbuch", { sub: kap });
const bytes = (n) => (n > 1048576 ? `${numFix(n / 1048576, 1)} MB` : `${numFix(n / 1024, 0)} KB`);
function speicherTeile() {
  const gr = (k) => (localStorage.getItem(k) || "").length * 2;
  const alle = Object.keys(localStorage).filter((k) => k.startsWith("kfzdiag-"));
  const gruppe = (pr) => alle.filter((k) => pr.some((p) => k.startsWith(p))).reduce((a, k) => a + gr(k), 0);
  const fz = gruppe(["kfzdiag-fahrzeug"]), vl = gruppe(["kfzdiag-verlauf", "kfzdiag-faelle", "kfzdiag-bericht"]), bb = gruppe(["kfzdiag-betriebsbuch"]),
    ch = gruppe(["kfzdiag-chat"]), au = gruppe(["kfzdiag-aufnahmen"]);
  const rest = alle.reduce((a, k) => a + gr(k), 0) - fz - vl - bb - ch - au;
  return [{ label: "Fahrzeuge", wert: fz, farbe: "#0A84FF" }, { label: "Verlauf", wert: vl, farbe: "#30D158" }, { label: "Betriebsbuch", wert: bb, farbe: "#BF5AF2" },
    { label: "Chats", wert: ch, farbe: "#FF9F0A" }, { label: "Aufnahmen", wert: au, farbe: "#FF453A" }, { label: "Einstellungen", wert: Math.max(rest, 0), farbe: "#8E8E93" }].map((t) => ({ ...t, text: bytes(t.wert) }));
}
function exportieren() {
  const daten = Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("kfzdiag-")).map((k) => [k, localStorage.getItem(k)]));
  download(`CANdor-Fahrzeugakte_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ quelle: "CANdor", erstellt: new Date().toISOString(), daten }, null, 1), "application/json");
  toast("Fahrzeugakte exportiert. Die Datei enthält Kennzeichen und FIN, bitte sicher aufbewahren.");
}

/* ---------- Seiten (Pannenhilfe, Töne, Papiere, Fernzugriff in seiten-mehr.js) ---------- */
const SEITEN = {
  ...seitenMehr((neu) => render(neu)),
  profil() {
    const fz = state.fahrzeug;
    if (!fz) return [kopf({ bild: "auto", titel: "Kein Fahrzeug", text: "Lege ein Fahrzeug an oder wähle eines aus dem Fuhrpark." }), gruppe({ zeilen: [{ label: "Fahrzeug anlegen", ziel: () => go("fahrzeug") }, { label: "Fuhrpark", ziel: () => go("fahrzeuge") }] })];
    return [
      h("section", { class: "sk-profil" }, h("span", { class: "sk-avatar" }, bild("auto")), h("h2", { class: "sk-name" }, vehicleName(fz)), h("p", { class: "sk-fin mono" }, fz.fin || "FIN noch nicht eingetragen"),
        (fz.kennzeichen || "").trim() ? h("span", { class: "sk-plate" }, plate(fz, true)) : null),
      gruppe({ zeilen: [{ label: "Fahrzeugdaten", unter: "Marke, Modell, Motor, Kennung", ziel: () => go("fahrzeug", { sub: fz.id }) }, { label: "Info", ziel: zuSeite("info") },
        { label: "Fehlerspeicher", wert: verbunden() ? String(totalFaults()) : "–", ton: totalFaults() ? "crit" : null, ziel: () => go("faults") }] }),
      gruppe({ zeilen: [{ label: "Fahrzeugakte (Verlauf)", ziel: () => go("history") }, { label: "Fuhrpark", wert: String(vehicles().length), ziel: () => go("fahrzeuge") }, { label: "Sicherung", ziel: zuSeite("sicherung") }] }),
      gruppe({ titel: "Adapter", zeilen: [{ label: verbunden() ? "Verbundener Adapter" : "Kein Adapter verbunden", unter: verbunden() ? (state.status.protokoll || "") : "Bluetooth oder WLAN", bild: "stecker", ziel: zuSeite("bluetooth") }] }),
    ];
  },
  bluetooth() {
    const an = wert("bt", true);
    return [
      kopf({ bild: "stecker", titel: "Bluetooth-Adapter", text: "Verbinde CANdor mit dem Stecker in der OBD-Buchse, meist unter dem Lenkrad. Am iPhone braucht es die App, unter Android geht es in Chrome direkt.", mehr: { ziel: handbuch("bluetooth") },
        schalter: { typ: "schalter", label: "Bluetooth-Adapter", an, setze: (x) => { setze("bt", x); render(true); } } }),
      an ? gruppe({ titel: "Mein Adapter", zeilen: [verbunden() && state.src && state.src.mode === "direkt" ? { label: "Verbunden", unter: state.status.protokoll || "", mark: "ok", wert: "✓" } : { label: "Kein Adapter gekoppelt", unter: "Unten nach Adaptern suchen" }] }) : null,
      an ? gruppe({ titel: "Gefunden", spinner: false, zeilen: [{ label: "Nach Adaptern suchen …", ziel: () => go("connect") }] }) : null,
      gruppe({ zeilen: [{ typ: "schalter", label: "Automatisch verbinden", an: wert("autoverbinden", true), setze: (x) => setze("autoverbinden", x) }],
        fuss: "Beim Start verbindet CANdor das zuletzt gewählte Fahrzeug selbst. Aus: erst nach Tippen auf Verbinden." }),
      gruppe({ zeilen: [{ label: "Abfrage-Takt", wert: `${wert("takt", 1000) / 1000} s`, ziel: zuSeite("takt") }] }),
    ];
  },
  wlan() {
    const server = state.src && state.src.mode === "server";
    return [
      kopf({ bild: "stecker", titel: "WLAN-Adapter", text: "WLAN-Stecker verbinden sich mit dem Diagnose-Server in der Werkstatt. Adresse und Port stehen in der Server-Einrichtung.", mehr: { ziel: handbuch("hardware") } }),
      gruppe({ titel: "Verbindung", zeilen: [{ label: server ? "Über den Diagnose-Server" : "Kein Server", unter: server && verbunden() ? (state.status.simuliert ? "Simulator" : state.status.protokoll || "") : "Server nicht erreichbar", mark: server && verbunden() ? "ok" : "pending" }] }),
      gruppe({ zeilen: [{ typ: "schalter", label: "Automatisch verbinden", an: wert("autoverbinden", true), setze: (x) => setze("autoverbinden", x) }] }),
    ];
  },
  bus() {
    const ecus = state.ecus || [], an = wert("live", true);
    return [
      kopf({ bild: "steuergeraete", titel: "Fahrzeugbus", text: "Wie CANdor mit dem Auto spricht: Protokoll, Geschwindigkeit und welche Steuergeräte antworten.", mehr: { ziel: handbuch("datenfluss") } }),
      gruppe({ zeilen: [{ typ: "schalter", label: "Live-Werte abfragen", an, setze: (x) => setze("live", x) }, { label: "Abfrage-Takt", wert: `${wert("takt", 1000) / 1000} s`, ziel: zuSeite("takt") }],
        fuss: "Aus: keine laufenden Messwerte, weniger Last auf dem Bus und dem Adapter. Fehler lesen und Vollscan gehen weiter." }),
      gruppe({ titel: "Protokoll", zeilen: [{ label: "Protokoll", wert: verbunden() ? (state.status.protokoll || "automatisch").replace(/ \(simuliert\)/, "") : "–" }, { label: "Quelle", wert: state.src ? ({ server: "Diagnose-Server", direkt: "Bluetooth direkt", demo: "Vorschau" }[state.src.mode] || state.src.mode) : "–" }] }),
      gruppe({ titel: "Steuergeräte", zeilen: ecus.length ? ecus.map((e) => ({ label: e.name, unter: e.adresse, wert: e.fehler.length ? `${e.fehler.length} Fehler` : "ohne Fehler", ton: e.fehler.length ? "crit" : null, ziel: () => go("car") }))
        : [{ label: "Noch kein Vollscan", ziel: () => { go("car"); emit("run-scan"); } }] }),
    ];
  },
  takt() {
    const t = wert("takt", 1000), w = (ms, label) => ({ typ: "wahl", label, an: t === ms, setze: () => { setze("takt", ms); render(true); } });
    return [gruppe({ zeilen: [w(1000, "Jede Sekunde"), w(2000, "Alle 2 Sekunden"), w(5000, "Alle 5 Sekunden")],
      fuss: "»Jede Sekunde« zeigt Änderungen sofort, braucht aber mehr Akku und Bus. »Alle 5 Sekunden« schont billige Stecker, die bei vielen Anfragen hängen." })];
  },
  batteriezustand() {
    const r = historyOf("SPANNUNG"), jetzt = v("SPANNUNG"), laeuft = motorLaeuft();
    const ruhe = !laeuft ? jetzt : null, soc = ladezustand(ruhe), min = r.length ? Math.min(...r) : null;
    const zustand = ruhe == null ? "Motor aus nötig" : ruhe >= 12.4 ? "Normal" : ruhe >= 12.2 ? "Schwach" : "Leer";
    return [
      kopf({ bild: "messgeraet", titel: "Batteriezustand", text: "Wie fit die Starterbatterie ist: Ruhespannung, geschätzter Ladezustand und der tiefste Einbruch beim Anlassen." }),
      gruppe({ zeilen: [{ label: "Batteriezustand", wert: zustand, ton: ruhe == null ? null : bordnetzTon(ruhe, false) }], fuss: "Bewertet wird die Ruhespannung bei abgestelltem Motor. Für einen echten Kapazitätstest braucht es ein Batterietestgerät." }),
      gruppe({ zeilen: [{ label: "Ruhespannung", wert: ruhe == null ? "–" : `${numFix(ruhe, 2)} V` }], fuss: "Ab 12,4 V gut, unter 12,2 V schwach, unter 11,8 V leer. Erst nach zwei Stunden Ruhe aussagekräftig." }),
      gruppe({ zeilen: [{ label: "Ladezustand geschätzt", wert: soc == null ? "–" : `${soc} %` }] }),
      gruppe({ zeilen: [{ label: "Niedrigster Wert dieser Sitzung", wert: min == null ? "–" : `${numFix(min, 2)} V`, ton: min != null && min < 9.6 ? "crit" : null }],
        fuss: "Beim Anlassen sollte die Spannung nicht unter 9,6 V fallen. Fällt sie tiefer, ist die Batterie oft am Ende." }),
      gruppe({ zeilen: [{ label: "Neue Batterie anmelden", ziel: () => go("service", { sub: "batterie" }) }] }),
    ];
  },
  allgemein() {
    return [
      kopf({ bild: "kennung", titel: "Allgemein", text: "Daten des Fahrzeugs, Software der Steuergeräte, Fehlerspeicher, Bericht und Einheiten." }),
      gruppe({ zeilen: [{ label: "Info", bild: "kennung", ziel: zuSeite("info") }, { label: "Steuergeräte-Software", bild: "steuergeraete", ziel: () => go("car") }, { label: "Fehlerspeicher", bild: "fehler", ziel: () => go("faults") }] }),
      gruppe({ zeilen: [{ label: "Bericht teilen", bild: "bericht", ziel: () => go("report") }, { label: "Bordnetz & Batterie", bild: "messgeraet", ziel: () => go("bordnetz") }, { label: "Batteriezustand", bild: "messgeraet", ziel: zuSeite("batteriezustand") }] }),
      gruppe({ zeilen: [{ label: "Sprache & Einheiten", ziel: zuSeite("einheiten") }, { label: "Sicherung", ziel: zuSeite("sicherung") }] }),
    ];
  },
  info() {
    const fz = state.fahrzeug || {}, st = state.status || {}, r = firstReadiness();
    const w = (label, x, mono) => ({ label, wert: x == null || x === "" ? "–" : String(x), mono });
    return [
      kopf({ icon: "info", farbe: "#8E8E93", titel: "Info", text: "Fahrzeug, Kennungen und Verbindung auf einen Blick. Alles bleibt auf diesem Gerät." }),
      gruppe({ zeilen: [w("Name", fz.marke ? vehicleName(fz) : st.fahrzeug), w("Marke", fz.marke), w("Modell", fz.modell), w("Baujahr", fz.baujahr), w("Motor", fz.motor), w("Kraftstoff", fz.kraftstoff)] }),
      gruppe({ zeilen: [w("FIN", fz.fin, true), w("Kennzeichen", fz.kennzeichen), w("Kilometerstand", fz.km != null && fz.km !== "" ? `${Number(fz.km).toLocaleString("de-DE")} km` : null)] }),
      gruppe({ zeilen: [w("Protokoll", (st.protokoll || "").replace(/ \(simuliert\)/, "")), w("Steuergeräte", state.ecus.length || null), w("Fehler", verbunden() ? `${totalFaults()} + ${pendingFaults().length} vorläufig` : null),
        w("AU-Bereitschaft", r ? `${r.tests.filter((t) => t.fertig).length} von ${r.tests.length}` : null)] }),
      gruppe({ zeilen: [w("Programm", "CANdor"), w("Quelle", st.simuliert ? "Simulator, synthetische Werte" : state.src ? state.src.mode : null)] }),
    ];
  },
  einheiten() {
    const w = (label, x) => ({ label, wert: x });
    return [
      kopf({ icon: "globus", farbe: "#0A84FF", titel: "Sprache & Einheiten", text: "Programmsprache, Region und die Einheiten der Messwerte." }),
      gruppe({ titel: "Sprache", zeilen: [w("Deutsch", "Programmsprache")], fuss: "Weitere Sprachen folgen." }),
      gruppe({ zeilen: [w("Region", "Deutschland"), w("Temperatur", "°C"), w("Einheitensystem", "Metrisch"), w("Druck", "kPa"), w("Datumsformat", new Date(2026, 7, 19).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })), w("Zahlenformat", (1234567.89).toLocaleString("de-DE"))],
        fuss: "Messwerte erscheinen immer mit fester Zahl Nachkommastellen je Einheit, damit Ziffern beim Wechsel nicht springen." }),
    ];
  },
  anzeige() {
    const p = anzeige(), d = resolvedDisplay(), auto = p.theme === "auto";
    const karte = (id, label) => h("button", { class: `sk-erschein${d.theme === id ? " an" : ""}`, type: "button", "aria-pressed": String(d.theme === id), onclick: () => { setzeAnzeige("theme", id); render(true); } },
      h("span", { class: `sk-vorschau ${id}`, "aria-hidden": "true" }, h("b", {}, "14,2 V"), h("i"), h("i")), h("span", {}, label), h("span", { class: "sk-radio", "aria-hidden": "true" }, d.theme === id ? "✓" : ""));
    return [
      h("h3", { class: "li-k" }, "Erscheinungsbild"),
      h("section", { class: "li-gruppe sk-erscheinung" }, h("div", { class: "sk-karten" }, karte("hell", "Hell"), karte("dunkel", "Dunkel")),
        zeile({ typ: "schalter", label: "Automatisch", an: auto, setze: (x) => { setzeAnzeige("theme", x ? "auto" : d.theme); render(true); } })),
      gruppe({ zeilen: [{ label: "Akzentfarbe", wert: p.akzent, mono: true, ziel: openDisplaySettings }], fuss: "Färbt Knöpfe, Auswahl und Diagramme. Die Ampel bleibt immer gleich." }),
      gruppe({ zeilen: [{ label: "Dichte", wert: { auto: "Automatisch", compact: "Kompakt", comfort: "Normal", glove: "Werkstatt" }[p.touch] || p.touch, ziel: openDisplaySettings },
        { typ: "schalter", label: "Fetter Text", an: wert("fett", false), setze: (x) => setze("fett", x) }] }),
    ];
  },
  bedienung() {
    const p = anzeige();
    return [
      kopf({ icon: "hand", farbe: "#0A84FF", titel: "Bedienungshilfen", text: "Passe CANdor an die Arbeit an: große Ziele mit Handschuhen, mehr Kontrast in der Halle, weniger Bewegung, einfacher Modus.", mehr: { ziel: handbuch("ueberblick") } }),
      gruppe({ titel: "Sehen", zeilen: [{ label: "Anzeige & Textgröße", ziel: zuSeite("anzeige") }, { typ: "schalter", label: "Kontrast erhöhen", an: p.contrast === "hoch", setze: (x) => setzeAnzeige("contrast", x ? "hoch" : "auto") },
        { typ: "schalter", label: "Bewegung reduzieren", an: wert("bewegung", false), setze: (x) => setze("bewegung", x) }] }),
      gruppe({ titel: "Körperlich und motorisch", zeilen: [{ typ: "schalter", label: "Werkstatt-Handschuhmodus", unter: "60 px große Ziele", an: p.touch === "glove", setze: (x) => setzeAnzeige("touch", x ? "glove" : "auto") }] }),
      document.documentElement.dataset.edition === "kunde" ? null : gruppe({ titel: "Allgemein", zeilen: [{ typ: "schalter", label: "Einfacher Modus", unter: "Ampel, Klartext, weniger Werkzeuge", an: modus() === "einfach", setze: (x) => setzeModus(x ? "einfach" : "profi") }] }),
    ];
  },
  suche() {
    return [
      kopf({ icon: "lupe", farbe: "#8E8E93", titel: "Suche", text: "Was die Suche durchsucht und ob die Herstellerdokumente mitlaufen. Öffnen mit dem Suchfeld unten oder Strg K." }),
      gruppe({ titel: "Suchen und Nachschlagen", zeilen: [{ typ: "schalter", label: "Herstellerdokumente mitsuchen", an: wert("rmi", true), setze: (x) => setze("rmi", x) }],
        fuss: "Durchsucht auch die lokalen Herstellerdokumente (RMI) auf dem Diagnose-Server. Nichts geht ins Internet." }),
      gruppe({ titel: "Was durchsucht wird", zeilen: ["Fehlercodes", "Messwerte", "Steuergeräte", "Service & Anlernen", "Prüfpfade", "Diagnosepfade", "Begriffe", "Verlauf"].map((x) => ({ label: x, wert: "✓" })) }),
      gruppe({ zeilen: [{ label: "Suche öffnen", ziel: () => emit("open-search") }] }),
    ];
  },
  sicherung() {
    const teile = speicherTeile(), summe = teile.reduce((a, t) => a + t.wert, 0);
    return [
      h("section", { class: "sk-profil links" }, h("h2", { class: "sk-name gross" }, "Sicherung"), h("p", { class: "sk-fin" }, "Alles liegt auf diesem Gerät")),
      balken(teile, "Gerät", `${bytes(summe)} von etwa 5 MB`),
      raster([{ bild: "auto", label: "Fahrzeuge", unter: String(vehicles().length), ziel: () => go("fahrzeuge") }, { bild: "verlauf", label: "Betriebsbuch", unter: `${buchLaenge()} Einträge`, ziel: () => go("service") },
        { bild: "bericht", label: "Verlauf", unter: `${(storageGet("kfzdiag-verlauf", []) || []).length} Diagnosen`, ziel: () => go("history") }, { bild: "ki", label: "Chats", unter: `${(storageGet("kfzdiag-chats", []) || []).length}`, ziel: () => go("agent") }]),
      gruppe({ zeilen: [{ typ: "aktion", label: "Fahrzeugakte exportieren", tun: exportieren }], fuss: "Speichert Fahrzeuge, Verlauf, Betriebsbuch, Chats und Einstellungen als Datei. API-Schlüssel sind nicht dabei, die liegen nur auf dem Server." }),
    ];
  },
  statusleiste() {
    const chips = wert("chips", {}), an = (id) => chips[id] !== false;
    const s = (id, label) => ({ typ: "schalter", label, an: an(id), setze: (x) => setze("chips", { ...wert("chips", {}), [id]: x }) });
    return [
      kopf({ icon: "schalter", farbe: "#8E8E93", titel: "Statusleiste anpassen", text: "Die Leiste oben zeigt den Zustand auf einen Blick. Verbindung und Fehler stehen immer dort, die übrigen Werte wählst du hier." }),
      gruppe({ zeilen: [s("readiness", "AU-Bereitschaft"), s("bordnetz", "Bordnetz"), s("motor", "Motor und Drehzahl")] }),
      gruppe({ zeilen: [{ typ: "aktion", label: "Statusleiste zurücksetzen", tun: () => { setze("chips", {}); render(true); toast("Statusleiste zurückgesetzt."); } }], fuss: "Zeigt wieder alle Werte." }),
    ];
  },
  freigabe() {
    return [
      kopf({ icon: "gesicht", farbe: "#30D158", titel: "Freigabe", text: "Jeder Schreibvorgang ins Auto braucht deine Freigabe durch Halten. Vorbedingungen werden direkt davor neu gemessen." }),
      gruppe({ zeilen: [{ typ: "schalter", label: "Halten zum Schreiben", an: true, fest: true, setze: () => {} }], fuss: "Jedes Schreiben ins Auto braucht 2 Sekunden Halten. Das lässt sich nicht abschalten." }),
      gruppe({ zeilen: [{ typ: "schalter", label: "Vorbedingungen direkt davor neu messen", an: true, fest: true, setze: () => {} }], fuss: "Kippt eine Bedingung zwischen Freigabe und Schreiben, wird nichts gesendet." }),
      gruppe({ zeilen: [{ typ: "schalter", label: "Schreibschutz", an: schreibschutzAn(), setze: (x) => { storageSet("kfzdiag-schreibschutz", x); emit("render"); toast(x ? "Schreibschutz an." : "Schreibschutz aus."); } }],
        fuss: "An: CANdor schreibt nichts ins Auto, wie im Flugmodus." }),
      gruppe({ zeilen: [{ label: "Betriebsbuch", wert: String(buchLaenge()), ziel: () => go("service") }, { label: "Wie die Freigabe funktioniert", ziel: handbuch("schreibschutz") }] }),
    ];
  },
};

/* ---------- Zeichnen ---------- */
let gezeigt = "";
export function render(neu = false) {
  if ($("view-seite").hidden) return;
  const id = currentRoute().sub, bau = SEITEN[id];
  const stand = JSON.stringify([id, verbunden(), state.ecus.length, totalFaults(), Math.round((v("SPANNUNG") || 0) * 10), motorLaeuft(), state.fahrzeug && state.fahrzeug.id]);
  if (!neu && stand === gezeigt) return;
  gezeigt = stand;
  const fokus = document.activeElement && document.activeElement.id;
  /* Runder Zurück-Knopf oben wie in den iOS-Einstellungen, damit man von jeder Unterseite sicher zurückfindet */
  const nav = h("div", { class: "sk-nav" }, h("button", { class: "sk-zurueck", type: "button", "aria-label": "Zurück", onclick: back }, icon("back")));
  $("seite").replaceChildren(nav, ...(bau ? bau() : [gruppe({ zeilen: [{ label: "Diese Seite gibt es nicht." }] })]).filter(Boolean));
  if (fokus && $(fokus)) $(fokus).focus();
}

export function initSeiten() {
  wendeAn();
  initSeitenMehr();
  on("seite", () => render(true));
  on("status", () => render(false));
  on("render", () => render(false));
}
export const SEITEN_IDS = Object.keys(SEITEN);
export { SEITEN_TITEL };
