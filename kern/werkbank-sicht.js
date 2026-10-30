// @ts-check
/* CAN-Werkbank: reine Funktionen für die Oberfläche (modules/werkbank.js), ohne DOM und ohne Speicher. */

export const MAX_DBC_BYTES = 2 * 1024 * 1024;

/** Letzter Wert je Signal aus den dekodierten Zeilen. @param {{ t: number, signale: Record<string, number> }[]} zeilen */
export function letzteWerte(zeilen) {
  /** @type {Map<string, { signal: string, wert: number, t: number, anzahl: number }>} */
  const je = new Map();
  for (const z of zeilen) for (const [signal, wert] of Object.entries(z.signale || {})) {
    const alt = je.get(signal);
    const anzahl = (alt ? alt.anzahl : 0) + 1;
    je.set(signal, !alt || z.t >= alt.t ? { signal, wert, t: z.t, anzahl } : { ...alt, anzahl });
  }
  return [...je.values()].sort((a, b) => a.signal.localeCompare(b.signal));
}

/** Funde des Erkunders nach Steuergerät, beides sortiert. @param {{ adresse: string, did: string }[]} funde */
export function nachSteuergeraet(funde) {
  /** @type {Map<string, any[]>} */
  const je = new Map();
  for (const f of funde) je.set(f.adresse, [...(je.get(f.adresse) || []), f]);
  return [...je.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([adresse, liste]) => ({ adresse, funde: [...liste].sort((x, y) => x.did.localeCompare(y.did)) }));
}

/** Fehlermeldung oder null. @param {{ name: string, size: number }} datei */
export function dbcDateiPruefen(datei) {
  if (!/\.dbc$/i.test(datei.name)) return "Bitte eine Datei mit der Endung .dbc wählen.";
  if (!datei.size) return "Die Datei ist leer.";
  if (datei.size > MAX_DBC_BYTES) return "Die Datei ist größer als 2 MB.";
  return null;
}

/** @param {Record<string, boolean>} liste @param {string} schluessel */
export const zustimmungAn = (liste, schluessel) => Boolean(liste && liste[schluessel]);
/** Neue Liste mit gesetzter oder entfernter Zustimmung. @param {Record<string, boolean>} liste @param {string} schluessel @param {boolean} an */
export function mitZustimmung(liste, schluessel, an) {
  const { [schluessel]: _weg, ...rest } = liste || {};
  return an ? { ...rest, [schluessel]: true } : rest;
}

/** Eingaben für »Bedeutung abgleichen«. @param {{ adresse: string, did: string, byte: string, anzahl: string }} e */
export function beobachtenEingabe(e) {
  const adresse = String(e.adresse || "").trim().toUpperCase(), did = String(e.did || "").trim().toUpperCase();
  const byte = Number(e.byte), anzahl = Number(e.anzahl);
  if (!/^7[0-9A-F]{2}$/.test(adresse) || parseInt(adresse, 16) > 0x7f7) return { ok: false, meldung: "Adresse 700 bis 7F7 eingeben." };
  if (!/^[0-9A-F]{4}$/.test(did)) return { ok: false, meldung: "Kennung vierstellig hexadezimal, etwa F18C." };
  if (did === "F190") return { ok: false, meldung: "Die FIN wird nicht beobachtet." };
  if (!Number.isInteger(byte) || byte < 0 || byte > 63) return { ok: false, meldung: "Byte 0 bis 63." };
  if (!Number.isInteger(anzahl) || anzahl < 60 || anzahl > 300) return { ok: false, meldung: "60 bis 300 Messpunkte, weniger ergibt keine Aussage." };
  return { ok: true, wert: { adresse, did, byte, anzahl } };
}
