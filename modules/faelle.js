/* Belegte Fälle: nach dem Nachher-Scan wird festgehalten, was gemacht wurde. Der Vergleich von Eingangs- und
   Ausgangsbefund belegt das Ergebnis. Ohne FIN und Kennzeichen, damit Fälle später geteilt werden können.
   Reine Logik ohne DOM; gespeichert wird in chat.js, report.js und info.js über storage. */
export const MAX_FAELLE = 500;
const clean = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const codesOf = (faults) => [...faults.values()].map((f) => f.code);

export function buildCase({ fahrzeug = {}, vorher, nachher, massnahme, teile = "", km = null, now = new Date(), id = null }) {
  const m = clean(massnahme, 600);
  if (!m) return { fehler: "Bitte kurz beschreiben, was gemacht wurde." };
  if (!vorher || !nachher) return { fehler: "Für einen belegten Fall braucht es Eingangs- und Ausgangsbefund." };
  const before = new Set(codesOf(vorher.faults)), after = new Set(codesOf(nachher.faults));
  const behoben = [...before].filter((c) => !after.has(c)).sort();
  const bleibt = [...before].filter((c) => after.has(c)).sort();
  const neu = [...after].filter((c) => !before.has(c)).sort();
  const ergebnis = behoben.length && !bleibt.length && !neu.length ? "behoben" : behoben.length ? "teilweise" : "offen";
  return {
    fall: {
      id: id || `fall-${now.getTime().toString(36)}`, at: now.toISOString(),
      fz: { marke: clean(fahrzeug.marke, 40), modell: clean(fahrzeug.modell, 60), baujahr: fahrzeug.baujahr || null, kraftstoff: fahrzeug.kraftstoff || "", motor: clean(fahrzeug.motor, 60) },
      vorher: [...before].sort(), behoben, bleibt, neu, ergebnis,
      massnahme: m, teile: clean(teile, 300), km: Number.isFinite(km) ? km : null,
      belegt: { vorher: vorher.at instanceof Date ? vorher.at.toISOString() : vorher.at, nachher: nachher.at instanceof Date ? nachher.at.toISOString() : nachher.at },
    },
  };
}

export const addCase = (list, fall) => [fall, ...list.filter((f) => f.id !== fall.id)].slice(0, MAX_FAELLE);

/* Ähnlichkeit: gemeinsame Codes zählen am meisten, dann gleiches Modell, dann gleiche Marke. Ohne gemeinsamen Code kein Treffer. */
export function similar(list, { codes = [], marke = "", modell = "" }, limit = 5) {
  const want = new Set(codes.map((c) => String(c).toUpperCase()));
  const lower = (s) => String(s || "").toLowerCase();
  return list.map((f) => {
    const shared = f.vorher.filter((c) => want.has(c));
    const sameMake = marke && lower(f.fz.marke) === lower(marke);
    const score = shared.length * 3 + (sameMake ? 1 : 0) + (sameMake && modell && lower(f.fz.modell) === lower(modell) ? 2 : 0) + (f.ergebnis === "behoben" ? 1 : 0);
    return { f, shared, score };
  }).filter((x) => x.shared.length).sort((a, b) => b.score - a.score || b.shared.length - a.shared.length || b.f.at.localeCompare(a.f.at)).slice(0, limit).map((x) => ({ ...x.f, gemeinsam: x.shared }));
}

/* Für die KI: nur das Nötige, gekürzt. */
export const forAi = (f) => ({ fahrzeug: [f.fz.marke, f.fz.modell, f.fz.baujahr].filter(Boolean).join(" "), vorher: f.vorher, behoben: f.behoben, bleibt: f.bleibt, neu: f.neu, ergebnis: f.ergebnis, massnahme: f.massnahme, teile: f.teile });
