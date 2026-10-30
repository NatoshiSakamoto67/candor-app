// @ts-check
/* Seitenpanel im KI-Assistenten (Aufbau wie in Assistenten-Apps): Titel der Gespräche, Suche, »Zuletzt«, Gruppen je
   Fahrzeug und die Einträge oben. Reine Funktionen, kein DOM und kein Speicher; gezeichnet wird in modules/chatpanel.js,
   gespeichert in modules/chatverlauf.js. Zum Fahrzeug steht im Gespräch nur die Bezeichnung (Marke, Modell), nie FIN
   oder Kennzeichen. */

/** @typedef {{rolle: string, text?: string}} Nachricht */
/** @typedef {{id: string, titel: string, fz?: string|null, fzName?: string, geaendert: number, nachrichten?: Nachricht[]}} Gespraech */

export const NEUER_TITEL = "Neuer Chat";
export const ZULETZT = 8;
export const OHNE_FAHRZEUG = "Ohne Fahrzeug";

/** Titel aus der ersten Frage, am Wortende gekürzt */
export function titelAus(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46).replace(/\s\S*$/, "")} …` : t || NEUER_TITEL;
}

/* FIN: 17 Zeichen ohne I, O, Q mit Ziffern und Buchstaben. Kennzeichen: Kreis, Bindestrich, Buchstaben, Ziffern (B-AB 1234). */
const FIN = /(?=[A-HJ-NPR-Z0-9]*\d)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const KENNZEICHEN = /\b[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[EH]?\b/g;
/** Fahrzeugbezeichnung zum Speichern: FIN und Kennzeichen fallen weg, auch wenn sie im Modellnamen stehen */
export function ohneKennung(name) {
  const rest = String(name || "").replace(FIN, " ").replace(KENNZEICHEN, " ");
  return rest.split("·").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ").slice(0, 60);
}

/** Treffer in Titeln und Nachrichten, mit kurzem Ausschnitt um die Fundstelle
 * @param {Gespraech[]} chats @param {string} q */
export function suche(chats, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const c of chats) {
    if (c.titel.toLowerCase().includes(s)) { out.push({ id: c.id, titel: c.titel, ausschnitt: "" }); continue; }
    const m = (c.nachrichten || []).find((n) => String(n.text || "").toLowerCase().includes(s));
    if (m) {
      const t = String(m.text), i = t.toLowerCase().indexOf(s);
      out.push({ id: c.id, titel: c.titel, ausschnitt: `${i > 30 ? "…" : ""}${t.slice(Math.max(0, i - 30), i + s.length + 40).replace(/\s+/g, " ")}…` });
    }
  }
  return out;
}

/** Die letzten Gespräche, neueste zuerst; leere Gespräche zählen nicht
 * @param {Gespraech[]} chats @param {number} [n] */
export function zuletzt(chats, n = ZULETZT) {
  return [...chats].filter((c) => (c.nachrichten || []).length).sort((a, b) => b.geaendert - a.geaendert).slice(0, n);
}

/** Gespräche je Fahrzeug: Gruppe mit dem jüngsten Gespräch zuerst, ohne Fahrzeug immer am Ende
 * @param {Gespraech[]} chats @returns {{name: string, fz: string|null, chats: Gespraech[]}[]} */
export function nachFahrzeug(chats) {
  const gruppen = new Map();
  for (const c of zuletzt(chats, Infinity)) {
    const name = ohneKennung(c.fzName);
    const schluessel = c.fz || name ? `${c.fz || ""}|${name}` : "";
    const g = gruppen.get(schluessel) || { name: schluessel ? name || "Fahrzeug" : OHNE_FAHRZEUG, fz: c.fz || null, chats: [] };
    gruppen.set(schluessel, { ...g, chats: [...g.chats, c] });
  }
  const ohne = gruppen.get("");
  return [...[...gruppen.entries()].filter(([k]) => k).map(([, g]) => g), ...(ohne ? [ohne] : [])];
}

/** Einträge oben im Panel: nur was es in dieser Fassung gibt. Fotos gibt es nicht, Anhänge bleiben nur als Name im Verlauf.
 * @param {{kunde?: boolean}} [lage] */
export function eintraege({ kunde = false } = {}) {
  return [
    { id: "berichte", label: "Berichte & Nachweise", ziele: [
      { label: "Bericht und Prüfbericht", unter: "Diagnosebericht mit Prüfbericht nach festen Regeln", seite: "report" },
      { label: "Fahrtberichte", unter: "Einschätzungen des Fahrt-Agenten", seite: "beobachter", abschnitt: "Fahrtberichte" },
      { label: "Diagnose-Verlauf", unter: "Frühere Diagnosen auf diesem Gerät", seite: "history" },
    ] },
    { id: "fahrzeuge", label: "Fahrzeuge" },
    { id: "fahrt", label: "Fahrt-Agent & Wartung", ziele: [
      { label: "Fahrt-Agent", unter: "Liest während der Fahrt mit und meldet sich", seite: "beobachter" },
      { label: "Service und Wartung", unter: "Servicekatalog, Anlernen, Betriebsbuch", seite: "service" },
    ] },
    ...(kunde ? [] : [{ id: "erkunden", label: "Fahrzeug erkunden", seite: "werkbank", abschnitt: "Kennungen der Steuergeräte" }]),
  ];
}
