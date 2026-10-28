/* Werkstatt, Sitzung und Befund ohne DOM: Werkstattdaten prüfen, Kilometerstand der Sitzung prüfen,
   Eingangs- und Ausgangsbefund vergleichen. Reine Funktionen, getestet in tests/frontend/befund.test.mjs. */

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const MAX_KM = 2_000_000;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ()/-]{5,25}$/;
const PLZ_RE = /^\d{5}$/;

/* Werkstattdaten: Name ist Pflicht, der Rest freiwillig, aber wenn eingetragen, dann sinnvoll. */
export function checkWorkshop(input) {
  const werte = {
    name: clean(input.name).slice(0, 80),
    strasse: clean(input.strasse).slice(0, 80),
    plz: clean(input.plz),
    ort: clean(input.ort).slice(0, 60),
    telefon: clean(input.telefon),
    email: clean(input.email).toLowerCase(),
    mechaniker: clean(input.mechaniker).slice(0, 60),
  };
  const fehler = {};
  if (!werte.name) fehler.name = "Bitte den Namen der Werkstatt eintragen.";
  if (werte.plz && !PLZ_RE.test(werte.plz)) fehler.plz = "Postleitzahl mit 5 Ziffern.";
  if (werte.telefon && !PHONE_RE.test(werte.telefon)) fehler.telefon = "Nur Ziffern, Leerzeichen, +, /, - und Klammern.";
  if (werte.email && !MAIL_RE.test(werte.email)) fehler.email = "Die E-Mail-Adresse sieht unvollständig aus.";
  return { werte, fehler };
}
export const workshopLines = (w) => (w ? [w.name, w.strasse, [w.plz, w.ort].filter(Boolean).join(" "), [w.telefon, w.email].filter(Boolean).join(" · ")].filter(Boolean) : []);

/* Kilometerstand heute. Kleiner als zuletzt ist möglich (Tacho getauscht, Tippfehler beim letzten Mal),
   muss aber ausdrücklich bestätigt werden: dann kommt eine Warnung statt eines Fehlers. */
export function checkSessionKm(input, lastKm) {
  const raw = clean(input).replace(/[.\s]/g, "").replace(/km$/i, "");
  if (!raw) return { km: null, fehler: "Bitte den Kilometerstand vom Tacho eintragen." };
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_KM) return { km: null, fehler: "Kilometerstand als ganze Zahl, ohne Einheit." };
  const km = Number(raw);
  const warnung = Number.isFinite(lastKm) && lastKm != null && km < lastKm ? `Weniger als beim letzten Mal (${lastKm.toLocaleString("de-DE")} km). Tacho getauscht oder vertippt?` : null;
  return { km, fehler: null, warnung };
}

/* Zwei Fehlerstände vergleichen (Map Schlüssel -> Fehler, wie faultSet in state.js). notScanned: Steuergeräte, die im
   Vorher-Stand nicht abgefragt wurden; ihre Fehler sind nicht »neu«, sondern »vorher nicht geprüft«. */
export function compareFaults(before, after, notScanned = new Set()) {
  const gone = [...before.entries()].filter(([k]) => !after.has(k)).map(([, v]) => v);
  const added = [...after.entries()].filter(([k]) => !before.has(k)).map(([, v]) => v);
  const stay = [...after.entries()].filter(([k]) => before.has(k)).map(([, v]) => v);
  return { gone, fresh: added.filter((f) => !notScanned.has(f.wo)), unchecked: added.filter((f) => notScanned.has(f.wo)), stay };
}
/* Steuergeräte, die erst nachher gescannt wurden. Motor und Getriebe kommen schon über OBD, die zählen nicht. */
export function unscannedBefore(before, after) {
  if (!before || before.ecus || !after || !after.ecuList) return new Set();
  return new Set(after.ecuList.filter((e) => !/^0x7E[01]$/i.test(e.adresse)).map((e) => e.name));
}

/* Kurzform eines Befunds für Verlauf und Bericht. */
export function befundSummary(b) {
  if (!b) return null;
  const faults = [...b.faults.values()];
  return {
    at: b.at instanceof Date ? b.at.toISOString() : b.at,
    km: b.km ?? null,
    fehler: faults.length,
    codes: faults.map((f) => f.code),
    steuergeraete: b.ecuList ? b.ecuList.length : null,
  };
}
