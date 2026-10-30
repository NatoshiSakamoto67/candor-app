// @ts-check
/* Service und Anlernen (Feinschliff 29.10.2026): Katalog nach Arbeit geordnet, nicht nach Steuergerät.
   Quelle der Auswahl: docs/RECHERCHE_ANLERNEN_SERVICE.md (Launch, Autel, Bosch, Topdon, Foxwell, Carly, OBDeleven).
   Regeln: Jede schreibende Funktion braucht eine im Fahrzeugprofil hinterlegte Anfrage mit Quelle und läuft nur über
   die Halte-Freigabe. Vorbedingungen werden live gemessen; was sich nicht messen lässt, bestätigt der Mensch.
   Verbotenes wird bei der Suche mit Grund genannt, damit niemand weitersucht. Ohne KI, ohne fremde Datenbanken. */

/** @typedef {{signal: string, min?: number, max?: number, einheit: string, stellen?: number}} Messung */
/** @typedef {{id: string, text: string, messung?: Messung, bestaetigen?: boolean}} Vorbedingung */
/** @typedef {{id: string, name: string, gruppe: string, zweck: string, alltag: string[], weg: "schreibt"|"anleitung",
 *   risiko: "niedrig"|"mittel"|"hoch", dauer: string, stufe: "erlaubt"|"grenzwertig", einfach: boolean,
 *   vorbedingungen: Vorbedingung[], schritte: string[], nachher: string, profil: string[], umkehrbar: boolean, hinweis?: string}} Funktion */

export const GRUPPEN = [
  { id: "service", label: "Nach dem Service", text: "Ölwechsel, Inspektion, Bremsflüssigkeit" },
  { id: "bremse", label: "Bremse", text: "Feststellbremse, ABS entlüften" },
  { id: "fahrwerk", label: "Räder und Fahrwerk", text: "Lenkwinkel, Reifendruck, Niveau" },
  { id: "batterie", label: "Batterie und Strom", text: "Neue Batterie anmelden, Neustart" },
  { id: "motor", label: "Motor", text: "Drosselklappe, Leerlauf, Geberrad" },
  { id: "getriebe", label: "Getriebe", text: "Grundeinstellung, Lernwerte" },
  { id: "kuehlung", label: "Kühlung und Klima", text: "Entlüften, Klima initialisieren" },
  { id: "komfort", label: "Licht, Sicht, Komfort", text: "Fenster, Wischer, Leuchtweite" },
  { id: "abgas", label: "Abgasanlage (Service)", text: "Nur Wartung, nie Abschalten" },
];

/* Wiederkehrende Vorbedingungen. Messung über genormte OBD-Werte (Modus 01); Grenzen aus der Recherche. */
const V = {
  zuendung: { id: "zuendung", text: "Zündung an (Steuergeräte antworten)", messung: { signal: "SPANNUNG", min: 9, einheit: "V", stellen: 2 } },
  motorAus: { id: "motor_aus", text: "Motor aus", messung: { signal: "DREHZAHL", max: 50, einheit: "1/min", stellen: 0 } },
  motorLaeuft: { id: "motor_laeuft", text: "Motor läuft im Leerlauf", messung: { signal: "DREHZAHL", min: 500, max: 1200, einheit: "1/min", stellen: 0 } },
  steht: { id: "steht", text: "Fahrzeug steht", messung: { signal: "GESCHWINDIGKEIT", max: 0, einheit: "km/h", stellen: 0 } },
  spannung: { id: "spannung", text: "Bordnetz mindestens 12,5 V (sonst Ladegerät anschließen)", messung: { signal: "SPANNUNG", min: 12.5, einheit: "V", stellen: 2 } },
  spannungLaden: { id: "spannung_laden", text: "Ladegerät angeschlossen, 13,2 bis 14,5 V", messung: { signal: "SPANNUNG", min: 13.2, max: 14.5, einheit: "V", stellen: 2 } },
  warm: { id: "warm", text: "Motor betriebswarm, Kühlmittel 80 bis 105 °C", messung: { signal: "KUEHLMITTEL", min: 80, max: 105, einheit: "°C", stellen: 0 } },
  keineFehler: { id: "keine_fehler", text: "Keine Fehler im Motorsteuergerät gespeichert", bestaetigen: true },
  gesichert: { id: "gesichert", text: "Fahrzeug gegen Wegrollen gesichert (Keile)", bestaetigen: true },
  pedal: { id: "pedal", text: "Gaspedal nicht berühren", bestaetigen: true },
  geradeaus: { id: "geradeaus", text: "Räder gerade, Lenkrad mittig", bestaetigen: true },
  verbraucher: { id: "verbraucher", text: "Licht, Klima, Gebläse und Heckscheibe aus", bestaetigen: true },
  freien: { id: "freien", text: "Im Freien, nichts Brennbares unter dem Auto, Abgas kann abziehen", bestaetigen: true },
};

/** @type {Funktion[]} */
export const FUNKTIONEN = [
  { id: "oelservice", name: "Ölservice zurücksetzen", gruppe: "service", zweck: "Setzt die Serviceanzeige nach dem Ölwechsel auf null.", alltag: ["öl", "ölwechsel", "service", "inspektion", "wartung", "serviceanzeige", "service symbol im display"],
    weg: "schreibt", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [V.zuendung, V.motorAus, V.steht], schritte: ["Ölwechsel ist gemacht und eingetragen."],
    nachher: "Serviceanzeige im Kombiinstrument zeigt das neue Intervall.", profil: ["oelservice_reset"], umkehrbar: false },
  { id: "inspektion", name: "Inspektion zurücksetzen", gruppe: "service", zweck: "Setzt das Inspektions-Intervall (Zeit und Strecke) zurück.", alltag: ["inspektion", "service", "wartung", "intervall"],
    weg: "schreibt", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [V.zuendung, V.motorAus, V.steht], schritte: ["Inspektion ist gemacht und im Serviceheft eingetragen."],
    nachher: "Kombiinstrument zeigt das neue Intervall.", profil: ["inspektion_reset"], umkehrbar: false },
  { id: "bremsfluessigkeit", name: "Bremsflüssigkeit: Termin zurücksetzen", gruppe: "service", zweck: "Setzt den Wechseltermin der Bremsflüssigkeit neu.", alltag: ["bremsflüssigkeit", "bremse service"],
    weg: "schreibt", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [V.zuendung, V.motorAus], schritte: ["Bremsflüssigkeit ist gewechselt."],
    nachher: "Neuer Termin in zwei Jahren.", profil: ["bremsfluessigkeit_reset"], umkehrbar: false },
  { id: "epb_wartung", name: "Feststellbremse: Wartungsmodus", gruppe: "bremse", zweck: "Fährt die Kolben der elektrischen Feststellbremse zurück, damit Beläge getauscht werden können, und danach wieder an.", alltag: ["bremsbeläge", "beläge hinten", "handbremse", "epb", "parkbremse", "bremse hinten"],
    weg: "schreibt", risiko: "hoch", dauer: "2 bis 5 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorAus, V.steht, V.spannung, V.gesichert], schritte: ["Keile unter die Vorderräder.", "Feststellbremse gelöst.", "Nach dem Tausch: Wartungsmodus wieder beenden und Bremse anlernen."],
    nachher: "Bremse mehrmals schließen und öffnen, Probefahrt mit Bremsprobe.", profil: ["epb_oeffnen", "epb_schliessen"], umkehrbar: true },
  { id: "abs_entlueften", name: "ABS-Hydraulik entlüften", gruppe: "bremse", zweck: "Steuert Pumpe und Ventile, damit Luft aus dem ABS-Block kommt.", alltag: ["entlüften", "bremse weich", "abs", "bremspedal"],
    weg: "schreibt", risiko: "hoch", dauer: "5 bis 15 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorAus, V.steht, V.spannungLaden, { id: "behaelter", text: "Bremsflüssigkeitsbehälter voll, Helfer oder Druckentlüfter da", bestaetigen: true }], schritte: ["Pumpe braucht Pausen (typisch 1 min Takt, 3 min Pause)."],
    nachher: "Pedalweg prüfen, Bremsprobe.", profil: ["abs_entlueften"], umkehrbar: false },
  { id: "lenkwinkel", name: "Lenkwinkelsensor kalibrieren", gruppe: "fahrwerk", zweck: "Setzt die Nullstellung des Lenkwinkelsensors, etwa nach Achsvermessung.", alltag: ["lenkwinkel", "spur", "achsvermessung", "esp leuchte", "lenkrad schief"],
    weg: "schreibt", risiko: "hoch", dauer: "unter 2 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.steht, V.geradeaus], schritte: ["Räder exakt geradeaus stellen."],
    nachher: "Istwert Lenkwinkel bei Geradeausstellung etwa 0°.", profil: ["lenkwinkel_kalibrieren"], umkehrbar: false },
  { id: "tpms", name: "Reifendruck-Kontrolle anlernen", gruppe: "fahrwerk", zweck: "Lernt Reifendruck oder Sensoren neu, etwa nach Radwechsel.", alltag: ["reifen", "reifendruck", "rdks", "tpms", "radwechsel", "winterreifen"],
    weg: "anleitung", risiko: "niedrig", dauer: "5 bis 20 min", stufe: "erlaubt", einfach: true, vorbedingungen: [{ id: "steht_zuendung", text: "Fahrzeug steht, Zündung an", bestaetigen: true }, { id: "druck", text: "Alle Räder auf Solldruck (Tankdeckel oder B-Säule)", bestaetigen: true }], schritte: ["Solldruck einstellen.", "Im Bordmenü »Reifendruck speichern« wählen.", "Bei Sensoren: jeden Sensor mit dem Auslösegerät wecken, Reihenfolge VL, VR, HR, HL.", "Einige Modelle lernen erst nach 10 bis 20 min Fahrt."],
    nachher: "Warnleuchte aus.", profil: [], umkehrbar: true },
  { id: "niveau", name: "Niveau und Luftfederung kalibrieren", gruppe: "fahrwerk", zweck: "Gibt der Niveauregelung die gemessenen Radhöhen als Bezug.", alltag: ["niveau", "luftfederung", "höhe", "fahrwerk"],
    weg: "schreibt", risiko: "hoch", dauer: "10 bis 20 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.steht, { id: "eben", text: "Ebene Fläche, Fahrzeug leer, Solldruck", bestaetigen: true }], schritte: ["Radhöhen an allen vier Rädern messen und eingeben."],
    nachher: "Nachmessen.", profil: ["niveau_kalibrieren"], umkehrbar: false },
  { id: "batterie", name: "Neue Batterie anmelden", gruppe: "batterie", zweck: "Meldet eine neue Batterie am Batteriesensor an, damit richtig geladen wird.", alltag: ["batterie", "neue batterie", "akku", "bms", "start stopp geht nicht"],
    weg: "schreibt", risiko: "mittel", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [V.zuendung, V.motorAus, { id: "etikett", text: "Daten vom Batterie-Etikett liegen vor (Ah, Typ AGM/EFB)", bestaetigen: true }], schritte: ["Nur sinnvoll bei Fahrzeugen mit Batteriesensor am Minuspol."],
    nachher: "Start-Stopp arbeitet nach einigen Fahrten wieder.", profil: ["batterie_anmelden"], umkehrbar: true },
  { id: "neustart", name: "Steuergerät neu starten", gruppe: "batterie", zweck: "Startet ein Steuergerät neu (wie Zündung aus und an).", alltag: ["neustart", "reset steuergerät", "hängt"],
    weg: "schreibt", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorAus, V.steht], schritte: [],
    nachher: "Steuergerät meldet sich wieder.", profil: ["steuergeraet_neustart"], umkehrbar: true },
  { id: "drosselklappe", name: "Drosselklappe anlernen", gruppe: "motor", zweck: "Lernt die Endanschläge der Drosselklappe neu, etwa nach Reinigung.", alltag: ["drosselklappe", "leerlauf unruhig", "gereinigt"],
    weg: "schreibt", risiko: "mittel", dauer: "unter 1 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorAus, V.spannung, V.pedal, V.keineFehler], schritte: [],
    nachher: "Motor starten, Leerlauf ruhig.", profil: ["drosselklappe_anlernen"], umkehrbar: false },
  { id: "leerlauf", name: "Leerlauf anlernen", gruppe: "motor", zweck: "Lernt die Leerlaufdrehzahl neu.", alltag: ["leerlauf", "drehzahl schwankt", "ruckelt im stand"],
    weg: "schreibt", risiko: "mittel", dauer: "2 bis 10 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorLaeuft, V.warm, { ...V.spannung, text: "Bordnetz über 12,9 V", messung: { signal: "SPANNUNG", min: 12.9, einheit: "V", stellen: 2 } }, V.verbraucher, V.geradeaus], schritte: ["Bricht ab, wenn sich eine Bedingung kurz ändert."],
    nachher: "Leerlauf stabil.", profil: ["leerlauf_anlernen"], umkehrbar: false },
  { id: "gemisch", name: "Gemisch-Lernwerte zurücksetzen", gruppe: "motor", zweck: "Löscht die Anpassung der Gemischregelung, etwa nach Tausch von Lambdasonde oder Injektor.", alltag: ["lernwerte", "gemisch", "trimm", "lambdasonde getauscht"],
    weg: "schreibt", risiko: "mittel", dauer: "unter 1 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorAus], schritte: ["Danach lernt der Motor im Fahrbetrieb neu."],
    nachher: "Kurze und lange Gemischanpassung nahe 0 %.", profil: ["gemisch_reset"], umkehrbar: false },
  { id: "geberrad", name: "Kurbelwellen-Geberrad anlernen", gruppe: "motor", zweck: "Lernt Fertigungstoleranzen des Geberrads, nötig für die Aussetzererkennung.", alltag: ["geberrad", "kurbelwelle", "p0315", "aussetzer erkennung"],
    weg: "schreibt", risiko: "hoch", dauer: "2 bis 5 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.motorLaeuft, V.warm, V.steht, V.gesichert, { id: "pn", text: "Wählhebel in P oder N, Haube zu", bestaetigen: true }], schritte: ["Motor nach Anweisung kurz bis etwa 4.000/min hochdrehen."],
    nachher: "Fehler P0315 erscheint nicht mehr.", profil: ["geberrad_anlernen"], umkehrbar: false },
  { id: "injektor", name: "Injektor-Code eintragen", gruppe: "motor", zweck: "Trägt den Mengenabgleich-Code (IMA/IQA) eines neu eingebauten Injektors ein.", alltag: ["injektor", "einspritzdüse", "ima", "iqa", "düse getauscht"],
    weg: "schreibt", risiko: "hoch", dauer: "unter 2 min", stufe: "grenzwertig", einfach: false, vorbedingungen: [V.zuendung, V.motorAus, V.spannung, { id: "code", text: "Code vom eingebauten Injektor abgelesen (Foto im Protokoll)", bestaetigen: true }], schritte: ["Alten Wert vorher lesen und sichern."],
    nachher: "Motor starten, Laufruhe prüfen.", profil: ["injektor_code"], umkehrbar: true, hinweis: "Nur der Code vom tatsächlich eingebauten Injektor. Stellt den Werkszustand her, ändert keine Abgaswerte." },
  { id: "getriebe", name: "Getriebe-Grundeinstellung", gruppe: "getriebe", zweck: "Lernt Schaltpunkte und Kupplungen neu, etwa nach Ölwechsel oder Reparatur.", alltag: ["getriebe", "schaltet hart", "automatik", "dsg", "getriebeöl"],
    weg: "schreibt", risiko: "mittel", dauer: "5 bis 15 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.steht, { id: "getriebeoel", text: "Getriebeöl 30 bis 60 °C, Wählhebel P, Bremse getreten", bestaetigen: true }, V.keineFehler], schritte: ["Danach Lernfahrt nach Anweisung."],
    nachher: "Schaltet weich.", profil: ["getriebe_grundeinstellung"], umkehrbar: false },
  { id: "kuehlmittel", name: "Kühlmittel entlüften", gruppe: "kuehlung", zweck: "Steuert Pumpe und Ventile, damit das Kühlsystem luftfrei wird.", alltag: ["kühlmittel", "entlüften", "heizung kalt", "wasserpumpe"],
    weg: "schreibt", risiko: "mittel", dauer: "bis 45 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.steht, V.spannungLaden, { id: "fuellung", text: "Kühlmittel bis Markierung gefüllt", bestaetigen: true }], schritte: ["Heiß: Deckel nicht öffnen."],
    nachher: "Heizung warm, Stand nachfüllen.", profil: ["kuehlmittel_entlueften"], umkehrbar: false },
  { id: "klima", name: "Klimaanlage initialisieren", gruppe: "kuehlung", zweck: "Lernt Klappenmotoren und Kompressor neu.", alltag: ["klima", "klappen", "gebläse"],
    weg: "schreibt", risiko: "niedrig", dauer: "unter 2 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung], schritte: [],
    nachher: "Klappen laufen ohne Klicken.", profil: ["klima_init"], umkehrbar: false },
  { id: "fenster", name: "Fensterheber anlernen", gruppe: "komfort", zweck: "Lernt Auf- und Zu-Automatik und Einklemmschutz neu, etwa nach Batterietausch.", alltag: ["fenster", "fensterheber", "automatik geht nicht", "batterie getauscht"],
    weg: "anleitung", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [{ id: "zuendung_tueren", text: "Zündung an, alle Türen zu", bestaetigen: true }], schritte: ["Fenster ganz öffnen, Schalter noch 2 s halten.", "Fenster ganz schließen, Schalter noch 2 s halten.", "Für jedes Fenster wiederholen."],
    nachher: "Ein Antippen fährt das Fenster ganz.", profil: [], umkehrbar: true },
  { id: "wischer", name: "Wischer in Serviceposition", gruppe: "komfort", zweck: "Stellt die Wischer hoch, damit Blätter getauscht werden können.", alltag: ["wischer", "scheibenwischer", "wischblätter"],
    weg: "anleitung", risiko: "niedrig", dauer: "unter 1 min", stufe: "erlaubt", einfach: true, vorbedingungen: [{ id: "frei", text: "Motorhaube zu, nichts auf der Scheibe", bestaetigen: true }], schritte: ["Zündung aus, innerhalb von 10 s den Wischerhebel kurz nach unten.", "Bei manchen Modellen im Bordmenü unter Wischer."],
    nachher: "Wischer stehen senkrecht.", profil: [], umkehrbar: true },
  { id: "leuchtweite", name: "Leuchtweite Grundeinstellung", gruppe: "komfort", zweck: "Setzt die Nulllage der automatischen Leuchtweitenregelung.", alltag: ["scheinwerfer", "leuchtweite", "licht einstellen", "blendet"],
    weg: "schreibt", risiko: "mittel", dauer: "5 bis 10 min", stufe: "erlaubt", einfach: false, vorbedingungen: [V.zuendung, V.steht, { id: "eben", text: "Ebene Fläche, Solldruck, leer, Federung eingeschwungen", bestaetigen: true }], schritte: ["Danach Scheinwerfer mechanisch am Prüfgerät einstellen."],
    nachher: "Hell-Dunkel-Grenze passt.", profil: ["leuchtweite_grund"], umkehrbar: false },
  { id: "adas", name: "Kamera und Radar kalibrieren", gruppe: "komfort", zweck: "Richtet Frontkamera oder Radar nach Scheibentausch oder Unfall aus.", alltag: ["kamera", "radar", "frontscheibe", "spurhalte", "abstandstempomat", "adas"],
    weg: "schreibt", risiko: "hoch", dauer: "20 bis 60 min", stufe: "grenzwertig", einfach: false, vorbedingungen: [V.zuendung, V.steht, { id: "tafeln", text: "Zieltafeln nach Herstellerangabe aufgebaut, Boden eben, Fahrzeug ausgerichtet", bestaetigen: true }], schritte: ["Ohne Zieltafeln nicht möglich."],
    nachher: "Assistenten ohne Fehlermeldung, Probefahrt.", profil: ["adas_kalibrieren"], umkehrbar: false, hinweis: "Sicherheitsrelevant. Nur mit Zieltafeln und Vorgaben des Herstellers; Nachweis (Foto des Aufbaus, Prüfprotokoll) ins Betriebsbuch." },
  { id: "dpf_regeneration", name: "Partikelfilter: Service-Regeneration", gruppe: "abgas", zweck: "Brennt den Partikelfilter im Stand frei, wenn die Fahrt dafür nicht reicht.", alltag: ["dpf", "partikelfilter", "regeneration", "rußfilter", "freibrennen"],
    weg: "schreibt", risiko: "hoch", dauer: "20 bis 40 min", stufe: "grenzwertig", einfach: false, vorbedingungen: [V.zuendung, V.motorLaeuft, V.warm, V.steht, V.freien, { id: "tank", text: "Tank mindestens ein Viertel voll", bestaetigen: true }, V.keineFehler], schritte: ["Neben dem Auto bleiben, Stopp jederzeit möglich."],
    nachher: "Differenzdruck gesunken, Rußmasse niedrig.", profil: ["dpf_regeneration"], umkehrbar: false, hinweis: "Nur Wartung. Ändert nichts an der Abgasreinigung. Abschalten oder Entfernen gibt es in CANdor nicht." },
];

/* Verboten: wird bei der Suche angezeigt, mit Grund. */
export const VERBOTEN = [
  { name: "Schlüssel anlernen, Wegfahrsperre", alltag: ["schlüssel", "wegfahrsperre", "immobilizer", "all keys lost", "transponder", "sermi"], grund: "Diebstahlschutz. Nur über zertifizierte Wege (SERMI) beim Hersteller, nicht in CANdor." },
  { name: "Geschwindigkeitsbegrenzer aufheben", alltag: ["vmax", "begrenzer", "abregelung", "höchstgeschwindigkeit", "speed limiter", "250 offen"], grund: "Strafbar nach § 22b StVG (Geschwindigkeitsbegrenzer). Gibt es in CANdor nicht." },
  { name: "Kilometerstand ändern", alltag: ["tacho", "kilometer", "km stand", "odometer", "laufleistung"], grund: "Strafbar nach § 22b StVG. Lesen zum Abgleich geht, Ändern nie." },
  { name: "Abgasreinigung abschalten", alltag: ["dpf off", "agr off", "egr off", "adblue off", "abschalten", "lambda off", "kat off"], grund: "Verboten (Zulassung, Umwelt). CANdor bietet nur Wartung wie die Service-Regeneration." },
  { name: "Airbag-Crashdaten löschen", alltag: ["crashdaten", "airbag reset", "crash"], grund: "Nach Auslösung ist der Tausch der Teile Pflicht; Crashdaten löschen gibt es nicht." },
  { name: "Software flashen, Tuning", alltag: ["flashen", "tuning", "chiptuning", "leistung steigern", "software update"], grund: "Ändert Zulassung und Abgas. Nicht in CANdor." },
  { name: "Zugangssperren umgehen", alltag: ["seed key", "security access", "gateway umgehen", "sfd"], grund: "Herstellerschutz. CANdor knackt keine Sperren." },
];

/** @param {string} t */
const norm = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** @param {number} x @param {number} d */
const fix = (x, d) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Suche mit Alltagswörtern. Im einfachen Modus nur Funktionen für Laien.
 * @param {string} q @param {{einfach?: boolean, nurAnleitung?: boolean}} [opt]
 */
export function suche(q, opt = {}) {
  const basis = FUNKTIONEN.filter((f) => (!opt.einfach || f.einfach) && (!opt.nurAnleitung || f.weg === "anleitung"));
  const w = norm(q || "");
  if (!w) return { treffer: basis, verboten: [] };
  const passt = (/** @type {string[]} */ texte) => texte.some((t) => norm(t).includes(w) || w.split(" ").every((teil) => norm(t).includes(teil)));
  return {
    treffer: basis.filter((f) => passt([f.name, f.zweck, ...f.alltag])),
    verboten: VERBOTEN.filter((v) => passt([v.name, ...v.alltag])),
  };
}

/**
 * Vorbedingungen gegen Live-Werte prüfen. Ergebnis je Zeile: ok, fehlt (gemessen, außerhalb), offen (bestätigen), unbekannt (kein Messwert).
 * @param {Funktion} fn @param {Record<string, {wert?: number}>} live @param {Set<string>|string[]} [bestaetigt]
 */
export function pruefeVorbedingungen(fn, live = {}, bestaetigt = []) {
  const ok = new Set(bestaetigt);
  return fn.vorbedingungen.map((v) => {
    if (v.bestaetigen) return { id: v.id, text: v.text, art: "bestaetigen", zustand: ok.has(v.id) ? "ok" : "offen" };
    const m = /** @type {Messung} */ (v.messung);
    const wert = live[m.signal] && live[m.signal].wert;
    const soll = m.min != null && m.max != null ? `${fix(m.min, m.stellen ?? 1)} bis ${fix(m.max, m.stellen ?? 1)} ${m.einheit}` : m.min != null ? `ab ${fix(m.min, m.stellen ?? 1)} ${m.einheit}` : `bis ${fix(/** @type {number} */ (m.max), m.stellen ?? 1)} ${m.einheit}`;
    if (typeof wert !== "number" || Number.isNaN(wert)) return { id: v.id, text: v.text, art: "messung", zustand: "unbekannt", soll, ist: "–" };
    const drin = (m.min == null || wert >= m.min) && (m.max == null || wert <= m.max);
    return { id: v.id, text: v.text, art: "messung", zustand: drin ? "ok" : "fehlt", soll, ist: `${fix(wert, m.stellen ?? 1)} ${m.einheit}`, wert };
  });
}
/** @param {{zustand: string}[]} zeilen */
export const alleErfuellt = (zeilen) => zeilen.length > 0 && zeilen.every((z) => z.zustand === "ok");

/**
 * Was geht für dieses Fahrzeug? anleitung: geführter Handablauf; bereit: im Profil hinterlegt und Schreiben erlaubt;
 * gesperrt: hinterlegt, aber Version/Schalter erlauben kein Schreiben; fehlt: für dieses Fahrzeug keine belegte Anfrage.
 * @param {Funktion} fn @param {{verfuegbar?: boolean, funktionen?: {id: string}[]}|null} profil @param {boolean} schreibenAn
 */
export function verfuegbarkeit(fn, profil, schreibenAn) {
  if (fn.weg === "anleitung") return { stufe: "anleitung", grund: "Geführter Handablauf, schreibt nichts ins Auto." };
  const vorhanden = new Set(((profil && profil.funktionen) || []).map((p) => p.id));
  const profilIds = fn.profil.filter((id) => vorhanden.has(id));
  if (!profilIds.length) return { stufe: "fehlt", grund: "Für dieses Fahrzeug ist noch keine belegte Anfrage hinterlegt. Ohne Herstellerquelle schreibt CANdor nichts." };
  if (!(profil && profil.verfuegbar) || !schreibenAn) return { stufe: "gesperrt", grund: "Hinterlegt, aber Schreiben ist in dieser Version oder per Schalter aus.", profilIds };
  return { stufe: "bereit", grund: "Hinterlegt mit Quelle. Läuft nur nach deiner Freigabe.", profilIds };
}
