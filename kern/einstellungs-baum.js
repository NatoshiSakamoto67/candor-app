// @ts-check
/* CANdor im Stil der Apple-Einstellungen (Konzept docs/APPLE_EINSTELLUNGEN_KONZEPT.md): jede Zeile der iOS-Einstellungen
   hat eine Auto- oder Tester-Funktion. Reine Daten und reine Funktionen; gezeichnet wird in modules/liste.js. */
import { nutzungText } from "./erststart.js";

/* Farben der Icon-Kacheln wie bei Apple (Systemfarben, dunkle Variante), nur mit Bedeutung. */
export const FARBE = { orange: "#FF9F0A", blau: "#0A84FF", gruen: "#30D158", grau: "#8E8E93", rot: "#FF453A", lila: "#5E5CE6", indigo: "#BF5AF2", tuerkis: "#40C8E0", pink: "#FF375F", gelb: "#FFD60A", dunkel: "#3A3A3C" };

/** @typedef {{id: string, label: string, icon: string, farbe: string, ziel?: string, sub?: string, aktion?: string, schalter?: string, bald?: boolean, profi?: boolean, kunde?: boolean, nurKunde?: boolean, bild?: string, karte?: boolean, apple: string}} Zeile */
/** @type {{id: string, titel?: string, zeilen: Zeile[]}[]} */
export const BAUM = [
  { id: "verbindung", zeilen: [
    { id: "schreibschutz", label: "Schreibschutz", icon: "schloss", farbe: FARBE.orange, schalter: "schreibschutz", apple: "Flugmodus" },
    { id: "wlan", label: "WLAN-Adapter", icon: "wlan", bild: "stecker", farbe: FARBE.blau, ziel: "seite", sub: "wlan", apple: "WLAN" },
    { id: "bluetooth", label: "Bluetooth-Adapter", icon: "bt", bild: "stecker", farbe: FARBE.blau, ziel: "seite", sub: "bluetooth", kunde: true, apple: "Bluetooth" },
    { id: "bus", label: "Fahrzeugbus", icon: "bus", farbe: FARBE.gruen, ziel: "seite", sub: "bus", profi: true, apple: "Mobilfunk" },
    { id: "steuergeraete", label: "Steuergeräte", icon: "ecu", bild: "steuergeraete", farbe: FARBE.gruen, ziel: "car", apple: "Persönlicher Hotspot" },
    { id: "bordnetz", label: "Bordnetz & Batterie", icon: "battery", bild: "messgeraet", farbe: FARBE.gruen, ziel: "bordnetz", kunde: true, apple: "Batterie" },
    { id: "fernzugriff", label: "Fernzugriff", icon: "globus", farbe: FARBE.blau, ziel: "seite", sub: "fernzugriff", profi: true, apple: "VPN" },
  ] },
  { id: "diagnose", titel: "Diagnose", zeilen: [
    { id: "vollscan", label: "Vollscan", icon: "scan", bild: "pruefcheck", farbe: FARBE.blau, aktion: "vollscan", kunde: true, apple: "Softwareupdate" },
    { id: "fehler", label: "Fehlerspeicher", icon: "speicher", bild: "fehler", farbe: FARBE.rot, ziel: "faults", kunde: true, apple: "iPhone-Speicher" },
    { id: "live", label: "Live-Werte", icon: "pulse", bild: "live", farbe: FARBE.tuerkis, ziel: "live", profi: true, apple: "Batterie (Diagramm)" },
    { id: "pruefungen", label: "Prüfungen", icon: "check", bild: "route", farbe: FARBE.lila, ziel: "check", profi: true, apple: "Allgemein" },
    { id: "service", label: "Service & Anlernen", icon: "wrench", bild: "service", farbe: FARBE.grau, ziel: "service", kunde: true, apple: "Apps" },
    { id: "bericht", label: "Bericht", icon: "report", bild: "bericht", farbe: FARBE.blau, ziel: "report", apple: "Teilen" },
    { id: "werkbank", label: "CAN-Werkbank", icon: "bus", farbe: FARBE.dunkel, ziel: "werkbank", profi: true, apple: "Entwickler" },
  ] },
  { id: "geraet", zeilen: [
    { id: "allgemein", label: "Allgemein", icon: "regler", bild: "kennung", farbe: FARBE.grau, ziel: "seite", sub: "allgemein", apple: "Allgemein" },
    { id: "bedienung", label: "Bedienungshilfen", icon: "hand", farbe: FARBE.blau, ziel: "seite", sub: "bedienung", kunde: true, apple: "Bedienungshilfen" },
    { id: "anzeige", label: "Anzeige", icon: "sonne", bild: "anzeige", farbe: FARBE.blau, ziel: "seite", sub: "anzeige", kunde: true, apple: "Anzeige & Helligkeit" },
    { id: "ki", label: "KI-Assistent", icon: "stern", bild: "ki", farbe: FARBE.indigo, ziel: "agent", karte: true, apple: "Apple Intelligence & Siri" },
    { id: "cockpit", label: "Startseite & Cockpit", icon: "raster", farbe: FARBE.blau, aktion: "cockpit", apple: "Home-Bildschirm & App-Mediathek" },
    { id: "kamera", label: "Foto an den Assistenten", icon: "kamera", bild: "freeze", farbe: FARBE.grau, ziel: "agent", sub: "kamera", apple: "Kamera" },
    { id: "statusleiste", label: "Statusleiste", icon: "schalter", farbe: FARBE.grau, ziel: "seite", sub: "statusleiste", apple: "Kontrollzentrum" },
    { id: "dashboard", label: "Dashboard-Modus", icon: "uhr", farbe: FARBE.dunkel, ziel: "dashboard", kunde: true, apple: "Standby" },
    { id: "suche", label: "Suche", icon: "lupe", farbe: FARBE.grau, ziel: "seite", sub: "suche", kunde: true, apple: "Suchen" },
  ] },
  { id: "hinweise", zeilen: [
    { id: "warnungen", label: "Fahrt-Agent & Warnungen", icon: "glocke", farbe: FARBE.rot, ziel: "beobachter", profi: true, apple: "Mitteilungen" },
    { id: "toene", label: "Töne & Haptik", icon: "ton", farbe: FARBE.pink, ziel: "seite", sub: "toene", kunde: true, apple: "Töne & Haptik" },
    { id: "modus", label: "Modus", icon: "mond", farbe: FARBE.lila, aktion: "modus", apple: "Fokus" },
    { id: "betriebsbuch", label: "Betriebsbuch", icon: "buch", bild: "verlauf", farbe: FARBE.lila, aktion: "betriebsbuch", apple: "Bildschirmzeit" },
  ] },
  { id: "schutz", zeilen: [
    { id: "freigabe", label: "Freigabe", icon: "gesicht", farbe: FARBE.gruen, ziel: "seite", sub: "freigabe", apple: "Face ID & Code" },
    { id: "panne", label: "Pannenhilfe", icon: "sos", farbe: FARBE.rot, ziel: "seite", sub: "panne", kunde: true, apple: "Notruf SOS" },
    { id: "datenschutz", label: "Datenschutz & Sicherheit", icon: "schild", farbe: FARBE.blau, ziel: "handbuch", sub: "datenschutz", kunde: true, apple: "Datenschutz & Sicherheit" },
  ] },
  { id: "ablage", zeilen: [
    { id: "faelle", label: "Belegte Fälle", icon: "pokal", farbe: FARBE.gelb, ziel: "history", apple: "Game Center" },
    { id: "sicherung", label: "Sicherung", icon: "wolke", farbe: FARBE.blau, ziel: "seite", sub: "sicherung", apple: "iCloud" },
    { id: "papiere", label: "Papiere", icon: "karte", farbe: FARBE.dunkel, ziel: "seite", sub: "papiere", kunde: true, apple: "Wallet" },
  ] },
  { id: "werkstatt", zeilen: [
    { id: "meinewerkstatt", label: "Meine Werkstatt", icon: "werkstatt", farbe: FARBE.blau, aktion: "portal", kunde: true, nurKunde: true, apple: "Apps (Werkstatt-Portal)" },
    { id: "werkhof", label: "Werkhof und KI", icon: "werkstatt", farbe: FARBE.orange, aktion: "werkhof", apple: "Apps (verbundene Dienste)" },
    { id: "werkstattdaten", label: "Werkstattangaben", icon: "werkstatt", farbe: FARBE.blau, ziel: "werkstatt", apple: "Apps" },
    { id: "nutzung", label: "Nutzung", icon: "car", farbe: FARBE.gruen, ziel: "werkstatt", sub: "wahl", apple: "Apps (Profil)" },
    { id: "handbuch", label: "Handbuch", icon: "buch", bild: "handbuch", farbe: FARBE.lila, ziel: "handbuch", apple: "Tipps" },
  ] },
];

/** Alle Zeilen flach. */
export const ZEILEN = BAUM.flatMap((g) => g.zeilen);

/* Übersicht »Einstellungen« hinter dem Zahnrad oben rechts (#seite/einstellungen): alles, was das Programm selbst einstellt,
   ohne die Diagnose-Werkzeuge. Zeilen aus BAUM per id, damit Icon und Fassung gleich bleiben; dazu eigene Zeilen. */
const ausBaum = (id, aenderung = {}) => {
  const z = ZEILEN.find((x) => x.id === id);
  if (!z) throw new Error(`Zeile ${id} fehlt im Einstellungsbaum`);
  return { ...z, ...aenderung };
};
/** @type {{id: string, titel?: string, zeilen: Zeile[]}[]} */
export const EINSTELLUNGEN = [
  { id: "dienste", titel: "KI und Dienste", zeilen: [
    { id: "dienste", label: "KI und Dienste", icon: "stern", bild: "ki", farbe: FARBE.indigo, ziel: "einstellungen", kunde: true, apple: "Apps (verbundene Dienste)" },
    ausBaum("werkhof", { label: "Werkhof", aktion: "werkhof" }),
    ausBaum("fernzugriff"),
  ] },
  { id: "geraet", titel: "Gerät", zeilen: [
    ausBaum("allgemein"),
    { id: "einheiten", label: "Sprache & Einheiten", icon: "globus", farbe: FARBE.blau, ziel: "seite", sub: "einheiten", kunde: true, apple: "Sprache & Region" },
    ausBaum("anzeige"), ausBaum("bedienung"), ausBaum("toene"), ausBaum("statusleiste"), ausBaum("suche"),
  ] },
  { id: "schutz", titel: "Schutz und Daten", zeilen: [ausBaum("freigabe"), ausBaum("sicherung"), ausBaum("datenschutz")] },
  { id: "hilfe", titel: "Hilfe", zeilen: [
    { id: "handbuch", label: "Handbuch", icon: "buch", bild: "handbuch", farbe: FARBE.lila, ziel: "handbuch", kunde: true, apple: "Tipps" },
    { id: "werkstattdaten", label: "Werkstattdaten", icon: "werkstatt", farbe: FARBE.blau, ziel: "werkstatt", apple: "Name und Adresse" },
  ] },
];

/* Unterseiten zweiter Ebene, damit die Suche auch »Einstellungen → Allgemein → Info« findet. Schlüssel: id der Elternzeile. */
/** @type {Record<string, Zeile[]>} */
export const UNTERZEILEN = {
  allgemein: [
    { id: "info", label: "Info", icon: "regler", bild: "kennung", farbe: FARBE.grau, ziel: "seite", sub: "info", kunde: true, apple: "Info" },
    { id: "batteriezustand", label: "Batteriezustand", icon: "battery", bild: "messgeraet", farbe: FARBE.gruen, ziel: "seite", sub: "batteriezustand", kunde: true, apple: "Batteriezustand" },
  ],
};

/** Ladezustand aus der Ruhespannung (Motor aus, mindestens 2 h Ruhe, Bleibatterie 12 V). Nur Schätzung. @param {number|null|undefined} v */
export function ladezustand(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  const P = [[11.8, 0], [12.0, 25], [12.2, 50], [12.4, 75], [12.7, 100]];
  if (v <= P[0][0]) return 0;
  if (v >= P[P.length - 1][0]) return 100;
  for (let i = 1; i < P.length; i++) if (v <= P[i][0]) { const [a, pa] = P[i - 1], [b, pb] = P[i]; return Math.round(pa + ((v - a) / (b - a)) * (pb - pa)); }
  return 100;
}

/** Bewertung der Bordspannung wie die Ampel: Ruhe und Laden getrennt. @param {number|null|undefined} v @param {boolean} motorLaeuft */
export function bordnetzTon(v, motorLaeuft) {
  if (typeof v !== "number") return null;
  if (motorLaeuft) return v < 13.2 || v > 15 ? "crit" : v < 13.6 ? "warn" : "ok";
  return v < 11.8 ? "crit" : v < 12.2 ? "warn" : "ok";
}

/**
 * Werte rechts in der Liste, wie »Nicht verbunden«, »Ein«, »12,6 V«.
 * @param {{verbunden: boolean, quelle?: string, protokoll?: string, steuergeraete: number, scanned: boolean, scanning?: boolean, scanPct?: number,
 *   spannung?: number|null, motorLaeuft?: boolean, gespeichert: number, vorlaeufig: number, readinessOffen?: number|null, readinessGesamt?: number|null,
 *   service: number, ki?: string|null, modus: string, betriebsbuch: number, nachher: boolean, nutzung?: string|null}} s
 * @returns {Record<string, {text: string, ton?: string|null}>}
 */
export function werte(s) {
  const f = (x, d) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const bt = s.verbunden && s.quelle === "bluetooth", wlan = s.verbunden && s.quelle === "wlan";
  const fehler = s.gespeichert + s.vorlaeufig;
  return {
    wlan: { text: wlan ? "Verbunden" : s.verbunden && s.quelle === "server" ? "über Server" : "Nicht verbunden" },
    bluetooth: { text: bt ? "Verbunden" : s.verbunden ? "Ein" : "Aus" },
    bus: { text: s.verbunden && s.protokoll ? s.protokoll : "–" },
    steuergeraete: { text: s.scanning ? `${s.scanPct || 0} %` : s.scanned ? `${s.steuergeraete} gefunden` : "–" },
    bordnetz: { text: typeof s.spannung === "number" ? `${f(s.spannung, 1)} V` : "–", ton: bordnetzTon(s.spannung, Boolean(s.motorLaeuft)) },
    vollscan: { text: s.scanning ? `läuft, ${s.scanPct || 0} %` : s.scanned ? "erledigt" : s.verbunden ? "starten" : "–", ton: s.scanning ? "running" : null },
    fehler: { text: !s.verbunden ? "–" : fehler ? (s.vorlaeufig ? `${s.gespeichert} + ${s.vorlaeufig}` : String(s.gespeichert)) : "keine", ton: s.gespeichert ? "crit" : s.vorlaeufig ? "warn" : s.verbunden ? "ok" : null },
    live: { text: !s.verbunden ? "–" : s.motorLaeuft ? "Motor läuft" : "Zündung an" },
    pruefungen: { text: s.readinessGesamt ? `AU ${s.readinessGesamt - (s.readinessOffen || 0)}/${s.readinessGesamt}` : "–", ton: s.readinessGesamt ? (s.readinessOffen ? "warn" : "ok") : null },
    service: { text: String(s.service) },
    bericht: { text: s.nachher ? "fertig" : s.verbunden ? "Vorher erfasst" : "–" },
    ki: { text: s.ki ? (s.ki === "beispiel" ? "Beispiel" : "bereit") : "aus" },
    modus: { text: s.modus === "einfach" ? "Einfach" : "Profi" },
    betriebsbuch: { text: s.betriebsbuch ? String(s.betriebsbuch) : "leer" },
    nutzung: { text: nutzungText(s.nutzung) },
  };
}

/**
 * Zeilen für die Fassung: Kundenfassung nur Zeilen mit kunde, sonst alle außer nurKunde; einfach ohne profi.
 * Zeilen mit bald (»kommt später«, derzeit keine) nur mit bald: true, und das auch nur im Profi-Modus und nicht in der Kundenfassung.
 * @param {{kunde?: boolean, einfach?: boolean, bald?: boolean}} f
 */
export const zeilenFuer = (f) => (z) => (f.kunde ? Boolean(z.kunde) : !z.nurKunde) && !(f.einfach && z.profi) && (!z.bald || (Boolean(f.bald) && !f.kunde && !f.einfach));

/** Titel der Unterseiten (#seite/<id>), Reihenfolge wie im Konzept Abschnitt 8. */
export const SEITEN_TITEL = Object.freeze({
  profil: "Fahrzeug", bluetooth: "Bluetooth-Adapter", wlan: "WLAN-Adapter", bus: "Fahrzeugbus", takt: "Abfrage-Takt",
  batteriezustand: "Batteriezustand", allgemein: "Allgemein", info: "Info", einheiten: "Sprache & Einheiten", anzeige: "Anzeige",
  bedienung: "Bedienungshilfen", suche: "Suche", sicherung: "Sicherung", statusleiste: "Statusleiste", freigabe: "Freigabe",
  panne: "Pannenhilfe", toene: "Töne & Haptik", papiere: "Papiere", fernzugriff: "Fernzugriff", einstellungen: "Einstellungen",
});
