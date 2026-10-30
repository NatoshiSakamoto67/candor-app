// @ts-check
/* Der rote Faden der Werkstatt-Diagnose (Recherche RECHERCHE_ABLAUF_PROFI.md und RECHERCHE_3D_UND_ABLAUF_55.md):
   Fahrzeug → Verbinden → Vollscan → Befund → Messen → Service → Abschluss. Reine Funktion: aus dem Stand wird je
   Schritt ein Zustand (fertig, jetzt, offen, problem, gesperrt) und eine Zeile Text, dazu der nächste Schritt. */

/** @typedef {{fahrzeug: boolean, verbunden: boolean, scanning?: boolean, scanPct?: number, scanned: boolean, steuergeraete: number,
 *   mitFehler: number, gespeichert: number, vorlaeufig: number, motorLaeuft?: boolean, spannung?: number|null, readinessOffen?: number|null,
 *   serviceErledigt?: number, eingang: boolean, nachher: boolean}} Stand */

export const SCHRITTE = [
  { id: "fahrzeug", label: "Fahrzeug", ziel: "fahrzeuge" },
  { id: "verbinden", label: "Verbinden", ziel: "connect" },
  { id: "scan", label: "Vollscan", ziel: "car" },
  { id: "befund", label: "Befund", ziel: "faults" },
  { id: "messen", label: "Messen", ziel: "live" },
  { id: "service", label: "Service", ziel: "service" },
  { id: "abschluss", label: "Abschluss", ziel: "report" },
];

/** @param {number} n @param {string} eins @param {string} viele */
const zahl = (n, eins, viele) => `${n.toLocaleString("de-DE")} ${n === 1 ? eins : viele}`;

/** @param {Stand} s */
export function ablauf(s) {
  const fehler = s.gespeichert + s.vorlaeufig;
  /** @type {Record<string, {zustand: string, text: string}>} */
  const z = {
    fahrzeug: s.fahrzeug ? { zustand: "fertig", text: "gewählt" } : { zustand: "offen", text: "anlegen oder wählen" },
    verbinden: !s.fahrzeug ? { zustand: "gesperrt", text: "erst Fahrzeug" } : s.verbunden ? { zustand: "fertig", text: "verbunden" } : { zustand: "offen", text: "Adapter, Zündung an" },
    scan: !s.verbunden ? { zustand: "gesperrt", text: "erst verbinden" }
      : s.scanning ? { zustand: "laeuft", text: `läuft, ${s.scanPct || 0} %` }
      : s.scanned ? { zustand: s.mitFehler ? "problem" : "fertig", text: `${zahl(s.steuergeraete, "Steuergerät", "Steuergeräte")}${s.mitFehler ? `, ${s.mitFehler} mit Fehler` : ""}` }
      : { zustand: "offen", text: "alle Steuergeräte lesen" },
    befund: !s.verbunden ? { zustand: "gesperrt", text: "erst verbinden" }
      : fehler ? { zustand: "problem", text: [s.gespeichert ? `${s.gespeichert} gespeichert` : "", s.vorlaeufig ? `${s.vorlaeufig} vorläufig` : ""].filter(Boolean).join(", ") }
      : { zustand: "fertig", text: "keine Fehler" },
    messen: !s.verbunden ? { zustand: "gesperrt", text: "erst verbinden" }
      : { zustand: "offen", text: s.motorLaeuft ? "Motor läuft" : typeof s.spannung === "number" ? `Zündung an, ${s.spannung.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} V` : "Live-Werte, Prüfungen" },
    service: !s.verbunden ? { zustand: "offen", text: "Anleitungen ohne Auto" }
      : s.serviceErledigt ? { zustand: "fertig", text: zahl(s.serviceErledigt, "Arbeit", "Arbeiten") + " im Betriebsbuch" } : { zustand: "offen", text: "Resets und Anlernen" },
    abschluss: !s.verbunden ? { zustand: "gesperrt", text: "erst verbinden" }
      : s.nachher ? { zustand: "fertig", text: "vorher und nachher erfasst" } : { zustand: "offen", text: s.eingang ? "Nachher-Scan, Bericht" : "Bericht" },
  };
  if (s.readinessOffen && z.messen.zustand === "offen" && s.verbunden) z.messen.text = `AU: ${zahl(s.readinessOffen, "Test", "Tests")} offen`;
  /* Nächster Schritt: das Erste, was fehlt; nach dem Scan je nach Befund weiter zu Fehlern oder zum Abschluss. */
  let jetzt = !s.fahrzeug ? "fahrzeug" : !s.verbunden ? "verbinden" : s.scanning || !s.scanned ? "scan" : fehler && !s.nachher ? "befund" : "abschluss";
  if (s.nachher) jetzt = "abschluss";
  return {
    schritte: SCHRITTE.map((st) => ({ ...st, ...z[st.id], jetzt: st.id === jetzt })),
    jetzt,
  };
}

/** Text für den großen Weiter-Knopf. @param {string} jetzt @param {Stand} s */
export function weiterText(jetzt, s) {
  return {
    fahrzeug: "Fahrzeug anlegen",
    verbinden: "Verbinden",
    scan: s.scanning ? "Vollscan ansehen" : "Vollscan starten",
    befund: "Fehler ansehen",
    abschluss: s.nachher ? "Bericht öffnen" : "Abschließen",
  }[jetzt] || "Weiter";
}
