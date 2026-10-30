// @ts-check
/* Sichere Formeln für Messwerte wie kfzdiag/formel.py: Ausdruck in A, B, C … (Rohbytes) oder X (Rückrichtung).
   Kein eval und kein Function: ein kleiner Parser übersetzt den Ausdruck einmal in eine Funktion.
   Erlaubt: Zahlen (auch 0x…), + - * / ( ), & | >> << und das Vorzeichen; Rangfolge wie in Python.
   Fehlt ein Byte, ist das Ergebnis NaN (wie früher bei zu kurzen Antworten). */

export class FormelFehler extends Error {}

const MAX_LAENGE = 120;
const TOKEN = /\s*(0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|<<|>>|[-+*/&|()])/y;

/** @param {string} text */
function zerlege(text) {
  /** @type {string[]} */ const teile = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    if (/^\s*$/.test(text.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) throw new FormelFehler("Formel enthält nicht erlaubte Zeichen.");
    teile.push(m[1]);
    pos = TOKEN.lastIndex;
  }
  return teile;
}

const ganz = (a, b) => {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new FormelFehler("Bit-Operationen nur mit ganzen Zahlen.");
};
/** @type {Record<string, (a: number, b: number) => number>} */
const OPS = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b,
  "&": (a, b) => (ganz(a, b), Number(BigInt(a) & BigInt(b))),
  "|": (a, b) => (ganz(a, b), Number(BigInt(a) | BigInt(b))),
  ">>": (a, b) => (ganz(a, b), Math.floor(a / 2 ** b)),
  "<<": (a, b) => { ganz(a, b); if (b < 0 || b > 32) throw new FormelFehler("Bit-Operationen nur mit ganzen Zahlen."); return a * 2 ** b; },
};
/** Rangfolge von schwach nach stark, wie Python. */
const STUFEN = [["|"], ["&"], ["<<", ">>"], ["+", "-"], ["*", "/"]];

/** @typedef {(v: any) => number} Knoten */

/** @param {string} formel @param {RegExp} namen @returns {Knoten} */
function uebersetze(formel, namen) {
  if (typeof formel !== "string" || !formel.trim() || formel.length > MAX_LAENGE) throw new FormelFehler("Formel fehlt oder ist zu lang.");
  const t = zerlege(formel.replace(/×/g, "*").replace(/÷/g, "/"));
  let i = 0;
  /** @param {number} stufe @returns {Knoten} */
  const binaer = (stufe) => {
    if (stufe === STUFEN.length) return vorzeichen();
    let links = binaer(stufe + 1);
    while (i < t.length && STUFEN[stufe].includes(t[i])) {
      const op = OPS[t[i++]], l = links, r = binaer(stufe + 1);
      links = (v) => op(l(v), r(v));
    }
    return links;
  };
  /** @returns {Knoten} */
  const vorzeichen = () => {
    if (t[i] === "-" || t[i] === "+") {
      const minus = t[i++] === "-", innen = vorzeichen();
      return minus ? (v) => -innen(v) : innen;
    }
    return atom();
  };
  /** @returns {Knoten} */
  const atom = () => {
    const x = t[i++];
    if (x === undefined) throw new FormelFehler("Formel nicht lesbar.");
    if (x === "(") {
      const innen = binaer(0);
      if (t[i++] !== ")") throw new FormelFehler("Formel nicht lesbar.");
      return innen;
    }
    if (/^(0[xX][0-9a-fA-F]+|\d+(\.\d*)?|\.\d+)$/.test(x)) { const zahl = Number(x); return () => zahl; }
    if (namen.test(x)) {
      if (x === "X") return (v) => v;
      const index = x.charCodeAt(0) - 65;
      return (roh) => (index < roh.length ? roh[index] : NaN);
    }
    throw new FormelFehler("Formel enthält nicht erlaubte Zeichen.");
  };
  const wurzel = binaer(0);
  if (i !== t.length) throw new FormelFehler("Formel nicht lesbar.");
  return wurzel;
}

/** Nicht endliche Ergebnisse (Teilen durch null) werden NaN. @param {Knoten} f @returns {Knoten} */
const endlich = (f) => (v) => { const w = f(v); return Number.isFinite(w) ? w : NaN; };

/** Formel in A … Z (Rohbytes). @param {string} formel @returns {(roh: Uint8Array | number[]) => number} */
export const kompiliere = (formel) => endlich(uebersetze(formel, /^[A-Z]$/));
/** Rückrichtung in X (Wert zu roher Zahl). @param {string} formel @returns {(wert: number) => number} */
export const kompiliereUmkehr = (formel) => endlich(uebersetze(formel, /^X$/));
