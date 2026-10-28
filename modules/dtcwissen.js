/* Fehlercode-Wissen aus OBDex (Daten CC0-1.0, https://github.com/foerbsnavi/obdex), umgebaut durch tools/obdex_import.py.
   Nur genormte Codes (SAE J2012). Je Gruppe (etwa P03) ein Paket in daten/dtc/, geladen erst bei Bedarf und dann gemerkt. */
const CODE_RE = /^[PCBU][0-3][0-9A-F]{3}$/;
const cache = new Map();

export const normCode = (code) => String(code || "").trim().toUpperCase();
export const packageOf = (code) => (CODE_RE.test(normCode(code)) ? normCode(code).slice(0, 3) : null);
/* Zweite Stelle 0 oder 2 (bei P auch 3 ab P3400) ist genormt; sonst legt der Hersteller die Bedeutung fest. */
export const isGeneric = (code) => { const c = normCode(code); return CODE_RE.test(c) && (c[1] === "0" || c[1] === "2" || (c[0] === "P" && c[1] === "3" && c[2] >= "4")); };

const defaultFetch = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

export async function lookup(code, fetchJson = defaultFetch) {
  const pack = packageOf(code);
  if (!pack) return null;
  if (!cache.has(pack)) cache.set(pack, fetchJson(`daten/dtc/${pack}.json`).catch((err) => { cache.delete(pack); throw err; }));
  const data = await cache.get(pack);
  return data[normCode(code)] || null;
}
export const clearCache = () => cache.clear();

/* Kurzform für die KI: Titel, Anfang der Beschreibung, wichtigste Ursachen. */
export const forAi = (code, e) => (e ? { code: normCode(code), titel: e.t, beschreibung: (e.d || "").slice(0, 400), ursachen: (e.u || []).slice(0, 4).map(([w, t]) => `${t} (${w || "?"})`) } : null);
