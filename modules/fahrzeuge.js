/* Fahrzeugbestand ohne DOM: prüfen, anlegen, ändern, sortieren, suchen. Alle Funktionen geben neue Listen zurück,
   gespeichert wird in garage.js. Pflicht sind Marke und Modell, dazu Kennzeichen oder FIN, damit man das Auto wiederfindet. */

export const KRAFTSTOFFE = [["benzin", "Benzin"], ["diesel", "Diesel"], ["hybrid", "Hybrid"], ["plugin", "Plug-in-Hybrid"], ["elektro", "Elektro"], ["gas", "Gas (LPG/CNG)"]];
export const BAUARTEN = [["limousine", "Limousine"], ["kombi", "Kombi"], ["kleinwagen", "Kleinwagen"], ["suv", "SUV"], ["van", "Van"], ["pickup", "Pick-up"], ["transporter", "Transporter"], ["lkw", "LKW"], ["motorrad", "Motorrad"]];
export const SORTIERUNG = [["benutzt", "Zuletzt benutzt"], ["angelegt", "Zuletzt angelegt"], ["name", "A bis Z"]];

const MAX_KM = 2_000_000;
const FIRST_YEAR = 1980;
const FIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const HSN_RE = /^\d{4}$/;
const TSN_RE = /^[A-Z0-9]{3}$/;
const PLATE_RE = /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]{0,11}$/;

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const upper = (v) => clean(v).toUpperCase();
const digits = (v) => clean(v).replace(/[.\s]/g, "");

/* Rohwerte aus dem Formular in einen Datensatz übersetzen. Ergebnis: { werte, fehler } mit Fehlertext je Feld. */
export function checkVehicle(input, now = new Date()) {
  const raw = {
    kennzeichen: upper(input.kennzeichen),
    marke: clean(input.marke),
    modell: clean(input.modell),
    baujahr: digits(input.baujahr),
    kraftstoff: KRAFTSTOFFE.some(([id]) => id === input.kraftstoff) ? input.kraftstoff : "",
    motor: clean(input.motor),
    km: digits(input.km),
    fin: upper(input.fin).replace(/\s/g, ""),
    hsn: digits(input.hsn),
    tsn: upper(input.tsn).replace(/\s/g, ""),
    bauart: BAUARTEN.some(([id]) => id === input.bauart) ? input.bauart : "limousine",
    notiz: clean(input.notiz).slice(0, 500),
  };
  const fehler = {};
  if (!raw.marke) fehler.marke = "Bitte die Marke eintragen.";
  if (!raw.modell) fehler.modell = "Bitte das Modell eintragen.";
  if (!raw.kennzeichen && !raw.fin) fehler.kennzeichen = "Kennzeichen oder FIN eintragen, damit du das Fahrzeug wiederfindest.";
  if (raw.kennzeichen && !PLATE_RE.test(raw.kennzeichen)) fehler.kennzeichen = "Nur Buchstaben, Ziffern, Leerzeichen und Bindestrich, höchstens 12 Zeichen.";
  if (raw.fin && !FIN_RE.test(raw.fin)) fehler.fin = raw.fin.length !== 17 ? `Die FIN hat 17 Zeichen, hier sind es ${raw.fin.length}.` : "Die Buchstaben I, O und Q kommen in einer FIN nicht vor.";
  const year = Number(raw.baujahr);
  if (raw.baujahr && (!/^\d{4}$/.test(raw.baujahr) || year < FIRST_YEAR || year > now.getFullYear() + 1)) fehler.baujahr = `Baujahr zwischen ${FIRST_YEAR} und ${now.getFullYear() + 1}.`;
  if (raw.km && (!/^\d+$/.test(raw.km) || Number(raw.km) > MAX_KM)) fehler.km = "Kilometerstand als ganze Zahl, ohne Einheit.";
  if (raw.hsn && !HSN_RE.test(raw.hsn)) fehler.hsn = "HSN: 4 Ziffern, Feld 2.1 im Fahrzeugschein.";
  if (raw.tsn && !TSN_RE.test(raw.tsn)) fehler.tsn = "TSN: 3 Zeichen, Feld 2.2 im Fahrzeugschein.";
  return { werte: { ...raw, baujahr: raw.baujahr ? year : null, km: raw.km ? Number(raw.km) : null }, fehler };
}

const newId = (now) => `fz-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* Neues Fahrzeug vorn einfügen oder ein vorhandenes ersetzen (gleiche id). */
export function upsertVehicle(list, werte, now = new Date(), id = null) {
  const iso = now.toISOString();
  const old = id ? list.find((v) => v.id === id) : null;
  const entry = old ? { ...old, ...werte, geaendert: iso } : { ...werte, id: newId(now), angelegt: iso, geaendert: iso, benutzt: iso };
  return [entry, ...list.filter((v) => v.id !== entry.id)];
}
export const removeVehicle = (list, id) => list.filter((v) => v.id !== id);
export const touchVehicle = (list, id, now = new Date()) => list.map((v) => (v.id === id ? { ...v, benutzt: now.toISOString() } : v));
export const findVehicle = (list, id) => list.find((v) => v.id === id) || null;

export const vehicleName = (v) => [v.marke, v.modell].filter(Boolean).join(" ") || "Fahrzeug";
export const vehicleLabel = (v) => [v.kennzeichen, vehicleName(v)].filter(Boolean).join(" · ");

export function sortVehicles(list, mode = "benutzt") {
  const by = {
    benutzt: (a, b) => (b.benutzt || "").localeCompare(a.benutzt || ""),
    angelegt: (a, b) => (b.angelegt || "").localeCompare(a.angelegt || ""),
    name: (a, b) => vehicleName(a).localeCompare(vehicleName(b), "de") || (a.kennzeichen || "").localeCompare(b.kennzeichen || "", "de"),
  }[mode] || (() => 0);
  return [...list].sort(by);
}

/* Suche über Kennzeichen, Marke, Modell, FIN, Motor und Notiz; Leerzeichen und Bindestriche im Kennzeichen zählen nicht. */
export function searchVehicles(list, query) {
  const words = upper(query).replace(/-/g, " ").split(" ").filter(Boolean);
  if (!words.length) return list;
  return list.filter((v) => {
    const hay = upper([v.kennzeichen, (v.kennzeichen || "").replace(/[\s-]/g, ""), v.marke, v.modell, v.fin, v.motor, v.notiz].join(" ")).replace(/-/g, " ");
    return words.every((w) => hay.includes(w));
  });
}

/* Passt das verbundene Auto zum gewählten? Der Adapter liefert nur die ersten drei Zeichen (WMI), mehr vergleichen wir nicht.
   Ergebnis: true, false oder null (nicht vergleichbar). */
export function finMatches(fin, maskedVin) {
  const a = (fin || "").slice(0, 3).toUpperCase(), b = (maskedVin || "").slice(0, 3).toUpperCase();
  if (a.length < 3 || b.length < 3 || b.includes("*")) return null;
  return a === b;
}
