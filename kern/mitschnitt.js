// @ts-check
/* Mitschnitt im Direktmodus (CAN-Werkbank): Anfragen und Antworten mit Zeit, Richtung, Adresse, wie kfzdiag/mitschnitt.py.
   Ringpuffer mit fester Größe; die FIN wird nie aufgezeichnet (Antworten 49 02 und 62 F1 90, dazu jedes FIN-Muster). */

export const MAX_EINTRAEGE = 5000;
export const FIN_ENTFERNT = "FIN entfernt";
const FIN_MUSTER = /(?=[A-HJ-NPR-Z0-9]*\d)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{17}/i;
const hex = (/** @type {Uint8Array} */ d) => [...d].map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");

/** @param {Uint8Array} d */
export function enthaeltFin(d) {
  if ((d[0] === 0x49 && d[1] === 0x02) || (d[0] === 0x62 && d[1] === 0xf1 && d[2] === 0x90)) return true;
  return FIN_MUSTER.test([...d].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : " ")).join(""));
}

/** Adresse aus dem Kopf, den der Adapter vor der Anfrage setzt (ATSH…); ohne Kopf funktional an 0x7DF.
 * @param {string[] | undefined} kopf */
export function adresseAusKopf(kopf) {
  const sh = (kopf || []).find((k) => k.startsWith("ATSH"));
  return sh ? parseInt(sh.slice(4), 16) : 0x7df;
}

/** @param {{ max?: number, uhr?: () => number }} [optionen] */
export function createMitschnitt({ max = MAX_EINTRAEGE, uhr = () => performance.now() / 1000 } = {}) {
  /** @type {{ t: number, richtung: string, adresse: string, laenge: number, hex: string }[]} */
  let puffer = [];
  let beginn = 0, aktiv = false;
  return {
    get aktiv() { return aktiv; },
    start() { puffer = []; beginn = uhr(); aktiv = true; },
    stop() { aktiv = false; },
    /** @param {"aus" | "ein"} richtung @param {number} adresse @param {Uint8Array} daten */
    aufzeichnen(richtung, adresse, daten) {
      if (!aktiv || !daten || !daten.length) return;
      const eintrag = { t: Math.round((uhr() - beginn) * 1000) / 1000, richtung, adresse: `0x${adresse.toString(16).toUpperCase().padStart(3, "0")}`,
        laenge: daten.length, hex: enthaeltFin(daten) ? FIN_ENTFERNT : hex(daten) };
      puffer = [...puffer.slice(puffer.length >= max ? puffer.length - max + 1 : 0), eintrag];
    },
    eintraege: () => puffer.map((e) => ({ ...e })),
    csv: () => ["t;richtung;adresse;hex", ...puffer.map((e) => `${e.t.toFixed(3)};${e.richtung};${e.adresse};${e.hex}`)].join("\n") + "\n",
  };
}
