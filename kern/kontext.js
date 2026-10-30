// @ts-check
/* Blatt »Kontext hinzufügen« und Modell-Chip im KI-Assistenten: was es wirklich gibt, hängt vom Anbieter ab.
   Claude liest Bilder, PDF und Textdateien und kann im Internet suchen; OpenAI-kompatible Anbieter lesen Bilder und
   Textdateien; Ollama nur Textdateien (kfzdiag/chat.py). Ohne Server antwortet die Vorschau mit Beispielen und nimmt
   keine Anhänge. Reine Funktionen, kein DOM; gezeichnet wird in modules/kontextblatt.js. */

/** @typedef {{id: string, name: string}} Modell */
/** @typedef {{grenze?: number, verbraucht?: number}} Budget */
/**
 * @typedef {{server: boolean, anbieter?: string|null, modell?: string|null, modelle?: Modell[], budget?: Budget|null,
 *   agentMoeglich?: boolean, agentAn?: boolean, websuche?: boolean}} Lage
 */
/** @typedef {{id: string, label: string, eingabe: string, accept: string, capture?: string}} Kachel */
/** @typedef {{id: string, label: string, typ: "schalter"|"wert", an?: boolean, wert?: string, unter?: string}} Zeile */

/* Denkstufe steht fest im Server (output_config effort »medium« in chat.py und agent.py), nur bei Claude. */
const STUFE = Object.freeze({ anthropic: "Mittel" });
const BILDER = "image/*";
const TEXTE = ".txt,.csv,.log,.json,.md,.xml,text/plain";
const PDF = ".pdf,application/pdf";
const tausender = (/** @type {number} */ n) => Number(n || 0).toLocaleString("de-DE");

/** Welche Dateiarten der eingerichtete Anbieter verarbeitet. @param {Lage} lage */
export function faehigkeiten(lage) {
  const a = lage.server ? lage.anbieter || "aus" : "aus";
  return { bilder: a === "anthropic" || a === "openai_kompatibel", pdf: a === "anthropic", text: a !== "aus" && Boolean(a), websuche: a === "anthropic" };
}

/**
 * Chip neben dem Plus: Modell und Stufe, sonst »KI einrichten« (führt zu den Einstellungen).
 * @param {Lage} lage @returns {{text: string, stufe: string|null, einrichten: boolean}}
 */
export function modellChip(lage) {
  if (!lage.server) return { text: "Beispielantworten", stufe: null, einrichten: true };
  const a = lage.anbieter;
  if (!a || a === "aus") return { text: "KI einrichten", stufe: null, einrichten: true };
  const name = (lage.modelle || []).find((m) => m.id === lage.modell)?.name || lage.modell || "KI";
  return { text: name.replace(/^Claude\s+/, ""), stufe: STUFE[/** @type {keyof typeof STUFE} */ (a)] || null, einrichten: false };
}

/** Große Kacheln im Blatt; nur was der Anbieter wirklich liest. @param {Lage} lage @returns {Kachel[]} */
export function kacheln(lage) {
  const f = faehigkeiten(lage);
  /** @type {Kachel[]} */
  const liste = [];
  if (f.bilder) liste.push({ id: "kamera", label: "Kamera", eingabe: "cx-camera", accept: BILDER, capture: "environment" }, { id: "fotos", label: "Fotos", eingabe: "cx-image", accept: BILDER });
  if (f.text || f.pdf) liste.push({ id: "dateien", label: "Dateien", eingabe: "cx-file", accept: [f.pdf ? PDF : null, f.text ? TEXTE : null].filter(Boolean).join(",") });
  return liste;
}

/** Zeilen unter den Kacheln: Schalter und Werte, die es gibt. @param {Lage} lage @returns {Zeile[]} */
export function zeilen(lage) {
  const f = faehigkeiten(lage), chip = modellChip(lage);
  /** @type {Zeile[]} */
  const liste = [];
  if (f.websuche) liste.push({ id: "websuche", label: "Websuche", typ: "schalter", an: Boolean(lage.websuche), unter: "Codes, Rückrufe, bekannte Probleme, mit Quellen" });
  if (lage.server && lage.agentMoeglich) liste.push({ id: "agent", label: "Selbst am Auto lesen", typ: "schalter", an: Boolean(lage.agentAn), unter: "Die KI liest Fehler und Messwerte selbst, nur lesend" });
  liste.push(chip.einrichten ? { id: "modell", label: "KI einrichten", typ: "wert", wert: lage.server ? "Aus" : "Vorschau" }
    : { id: "modell", label: "Modell", typ: "wert", wert: [chip.text, chip.stufe].filter(Boolean).join(" · ") });
  const b = lage.budget;
  /* Das Tagesbudget gilt nur für den Agenten (einstellungen.py), deshalb nur, wenn er möglich ist. */
  if (lage.server && lage.agentMoeglich && b && b.grenze) {
    const prozent = Math.min(100, Math.round(((b.verbraucht || 0) / b.grenze) * 100));
    liste.push({ id: "budget", label: "Tagesbudget", typ: "wert", wert: `${prozent} %`, unter: `${tausender(b.verbraucht || 0)} von ${tausender(b.grenze)} Token` });
  }
  return liste;
}

/** Mikrofon nur, wenn der Browser Sprache erkennt. @param {any} fenster */
export const kannDiktieren = (fenster) => Boolean(fenster && (fenster.SpeechRecognition || fenster.webkitSpeechRecognition));
