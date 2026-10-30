// @ts-check
/* Papiere zum Fahrzeug, nur auf diesem Gerät: Fahrzeugschein, Rechnung, Prüfbericht, Sonstiges.
   Reine Kernlogik mit austauschbarem Speicher: im Browser IndexedDB (indexedDbSpeicher), im Test ein Speicher im
   Arbeitsspeicher (arbeitsspeicher). Nichts hiervon geht je an den Diagnose-Server oder an die KI. */

export const MAX_BYTES = 10 * 1024 * 1024;
export const ARTEN = Object.freeze([
  { id: "fahrzeugschein", label: "Fahrzeugschein" },
  { id: "rechnung", label: "Rechnung" },
  { id: "pruefbericht", label: "Prüfbericht" },
  { id: "sonstiges", label: "Sonstiges" },
]);
const TYPEN = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf)$/;
const ENDUNGEN = /\.(png|jpe?g|webp|heic|heif|pdf)$/i;

/** @typedef {{id: string, art: string, titel: string, datum: string, name: string, typ: string, groesse: number, angelegt: string, daten: Blob|ArrayBuffer|Uint8Array}} Papier */
/** @typedef {{alle: () => Promise<Papier[]>, holen: (id: string) => Promise<Papier|undefined>, legen: (p: Papier) => Promise<void>, loeschen: (id: string) => Promise<void>}} Speicher */

/** Datei prüfen: Art (Bild oder PDF) und Größe. Liefert den Grund als Text oder null. @param {{name?: string, type?: string, size: number}} datei */
export function pruefeDatei(datei) {
  if (!datei || typeof datei.size !== "number") return "Keine Datei gewählt.";
  if (datei.size === 0) return "Die Datei ist leer.";
  if (datei.size > MAX_BYTES) return `Die Datei ist größer als 10 MB (${groesseText(datei.size)}).`;
  if (!TYPEN.test(datei.type || "") && !ENDUNGEN.test(datei.name || "")) return "Nur Bilder (JPG, PNG, WebP, HEIC) oder PDF.";
  return null;
}

/** Eine Nachkommastelle, ganze Zahlen ohne »,0«. @param {number} x */
const komma = (x) => (Number.isInteger(Math.round(x * 10) / 10) ? String(Math.round(x)) : x.toFixed(1).replace(".", ","));
/** @param {number} n */
export const groesseText = (n) => (!(n > 0) ? "0 KB" : n >= 1073741824 ? `${komma(n / 1073741824)} GB` : n >= 1048576 ? `${komma(n / 1048576)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** @param {string} art */
export const artLabel = (art) => (ARTEN.find((a) => a.id === art) || ARTEN[ARTEN.length - 1]).label;

const istBild = (typ) => /^image\//.test(typ || "");

/**
 * Neues Papier aus Formular und Datei. Der Titel fällt auf den Dateinamen zurück, das Datum auf heute.
 * @param {{art: string, titel?: string, datum?: string, datei: {name?: string, type?: string, size: number}, daten: Blob|ArrayBuffer|Uint8Array, now?: Date, id?: string}} e
 * @returns {Papier}
 */
export function neuesPapier(e) {
  const grund = pruefeDatei(e.datei);
  if (grund) throw new Error(grund);
  const art = ARTEN.some((a) => a.id === e.art) ? e.art : "sonstiges";
  const now = e.now || new Date();
  const typ = e.datei.type || (ENDUNGEN.test(e.datei.name || "") && /pdf$/i.test(e.datei.name || "") ? "application/pdf" : "image/jpeg");
  return {
    id: e.id || `p${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    art, titel: (e.titel || "").trim() || (e.datei.name || "").replace(/\.[^.]+$/, "") || artLabel(art),
    datum: e.datum || now.toISOString().slice(0, 10), name: e.datei.name || "", typ, groesse: e.datei.size, angelegt: now.toISOString(), daten: e.daten,
  };
}

/** Sortiert neueste zuerst, dazu Summe und ob je Papier eine Bildvorschau möglich ist. @param {Papier[]} liste */
export function uebersicht(liste) {
  const sortiert = [...liste].sort((a, b) => (b.datum + b.angelegt).localeCompare(a.datum + a.angelegt));
  return { papiere: sortiert.map((p) => ({ ...p, bild: istBild(p.typ) })), summe: liste.reduce((a, p) => a + (p.groesse || 0), 0), anzahl: liste.length };
}

/**
 * Ablage über einem Speicher: anlegen, auflisten, öffnen, löschen.
 * @param {Speicher} speicher
 */
export function ablage(speicher) {
  return {
    /** @param {Parameters<typeof neuesPapier>[0]} e */
    async anlegen(e) { const p = neuesPapier(e); await speicher.legen(p); return p; },
    async liste() { return uebersicht(await speicher.alle()); },
    /** @param {string} id */
    async holen(id) { const p = await speicher.holen(id); if (!p) throw new Error("Dieses Papier gibt es nicht mehr."); return p; },
    /** @param {string} id */
    async loeschen(id) { await speicher.loeschen(id); },
  };
}

/** Speicher im Arbeitsspeicher für Tests und als Ersatz, wenn IndexedDB fehlt. @returns {Speicher} */
export function arbeitsspeicher() {
  /** @type {Map<string, Papier>} */
  const m = new Map();
  return {
    alle: async () => [...m.values()],
    holen: async (id) => m.get(id),
    legen: async (p) => { m.set(p.id, p); },
    loeschen: async (id) => { m.delete(id); },
  };
}

/** IndexedDB-Speicher: eine Datenbank, ein Objektspeicher »papiere«. @param {string} [name] @returns {Speicher} */
export function indexedDbSpeicher(name = "kfzdiag-papiere") {
  /** @type {Promise<IDBDatabase>|null} */
  let db = null;
  const oeffnen = () => {
    if (db) return db;
    db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("papiere")) req.result.createObjectStore("papiere", { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Ablage lässt sich nicht öffnen."));
    });
    return db;
  };
  /** @template T @param {IDBTransactionMode} modus @param {(s: IDBObjectStore) => IDBRequest<T>} tun @returns {Promise<T>} */
  const mit = async (modus, tun) => {
    const d = await oeffnen();
    return new Promise((resolve, reject) => {
      const req = tun(d.transaction("papiere", modus).objectStore("papiere"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Ablage antwortet nicht."));
    });
  };
  return {
    alle: () => mit("readonly", (s) => /** @type {IDBRequest<Papier[]>} */ (s.getAll())),
    holen: (id) => mit("readonly", (s) => /** @type {IDBRequest<Papier|undefined>} */ (s.get(id))),
    legen: async (p) => { await mit("readwrite", (s) => s.put(p)); },
    loeschen: async (id) => { await mit("readwrite", (s) => s.delete(id)); },
  };
}
