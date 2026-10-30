// @ts-check
/* Karte »Assistent« auf der Startseite (30.10.2026): bis zu drei Vorschläge aus dem Fehlerstand und eine Statuszeile wie
   der Modell-Chip im Chat. Reine Funktionen, kein DOM; gezeichnet wird in modules/assistent-karte.js. */
import { modellChip } from "./kontext.js";
import { ZEILEN, zeilenFuer } from "./einstellungs-baum.js";

export const MAX_VORSCHLAEGE = 3;
const CODE = /^[PCBU][0-9A-F]{4}$/;

/** @typedef {{kurz: string, frage: string}} Vorschlag */
/** Kurzer Text auf dem Chip, ganze Frage beim Senden (wie die Vorschläge im Chat). @type {Record<string, Vorschlag>} */
const FEST = Object.freeze({
  anfang: { kurz: "Wo fange ich an?", frage: "Wo fange ich bei der Fehlersuche an?" },
  au: { kurz: "Schafft es die AU?", frage: "Besteht das Auto die AU?" },
  koennen: { kurz: "Was kannst du?", frage: "Was kannst du für mich am Auto tun?" },
  typisch: { kurz: "Typische Probleme", frage: "Such im Internet nach bekannten Problemen zu diesem Modell." },
  ok: { kurz: "Alles in Ordnung?", frage: "Der Scan zeigt keine Fehler. Gibt es trotzdem etwas, worauf ich achten sollte?" },
  wartung: { kurz: "Was steht an Wartung an?", frage: "Welche Wartung steht bei diesem Fahrzeug bald an?" },
});

/** Nur echte Fehlercodes, groß geschrieben, ohne Doppelte, Reihenfolge bleibt. @param {unknown[]} codes @returns {string[]} */
const sauber = (codes) => [...new Set(codes.map((c) => String(c || "").trim().toUpperCase()).filter((c) => CODE.test(c)))];

/**
 * Vorschläge für die Chips: mit Fehlern zuerst der erste Code, ohne Fehler nach dem Scan Entwarnung und Wartung,
 * sonst allgemein. AU nur, wenn die Readiness gelesen ist.
 * @param {{verbunden?: boolean, scanned?: boolean, codes?: unknown[], readinessGesamt?: number|null}} s
 * @returns {Vorschlag[]}
 */
export function startVorschlaege({ verbunden = false, scanned = false, codes = [], readinessGesamt = null } = {}) {
  const liste = sauber(codes), au = readinessGesamt ? FEST.au : null;
  /** @type {(Vorschlag|null)[]} */
  let kandidaten;
  if (verbunden && liste.length) {
    kandidaten = [{ kurz: `Was bedeutet ${liste[0]}?`, frage: `Was bedeutet ${liste[0]} bei diesem Fahrzeug?` },
      liste.length > 1 ? { kurz: "Hängt das zusammen?", frage: `Hängen ${liste.slice(0, 4).join(", ")} zusammen, und was ist die Ursache?` } : FEST.anfang,
      au, FEST.koennen];
  } else if (verbunden && scanned) kandidaten = [FEST.ok, au, FEST.wartung, FEST.koennen];
  else if (verbunden) kandidaten = [FEST.anfang, FEST.koennen, FEST.typisch];
  else kandidaten = [FEST.koennen, FEST.typisch, FEST.anfang];
  return /** @type {Vorschlag[]} */ (kandidaten.filter(Boolean)).slice(0, MAX_VORSCHLAEGE);
}

/**
 * Statuszeile unter den Chips, aus dem Modell-Chip des Chats. ziel: Seite beim Antippen (KI und Dienste) oder null.
 * @param {import("./kontext.js").Lage} lage
 * @returns {{text: string, stufe: string|null, ziel: string|null, ton: "bereit"|"einrichten"|"vorschau"}}
 */
export function startStatus(lage) {
  const chip = modellChip(lage);
  if (!lage.server) return { text: chip.text, stufe: null, ziel: null, ton: "vorschau" };
  return { text: chip.text, stufe: chip.stufe, ziel: "einstellungen", ton: chip.einrichten ? "einrichten" : "bereit" };
}

const KI = ZEILEN.find((z) => z.id === "ki");
/** Karte nur, wo die Listenzeile »KI-Assistent« sichtbar wäre (also nicht in der Kundenfassung). @param {{kunde?: boolean, einfach?: boolean}} f */
export const karteSichtbar = (f) => Boolean(KI && zeilenFuer(f)(KI));
