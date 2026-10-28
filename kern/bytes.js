// @ts-check
/* Bytes und Hex ohne Node-Buffer, damit derselbe Code im Browser, in der App und in Node-Tests läuft. */

/** @param {string} hex @returns {Uint8Array} */
export function fromHex(hex) {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error(`Keine Hex-Zeichenfolge: ${hex}`);
  return Uint8Array.from(clean.match(/../g) || [], (b) => parseInt(b, 16));
}

/** @param {ArrayLike<number>} bytes @returns {string} */
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join("");

/** @param {ArrayLike<number>} bytes @returns {string} */
export const toAscii = (bytes) => Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0 ? "\0" : "�")).join("");

/** @param {...ArrayLike<number>} parts @returns {Uint8Array} */
export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Absender wie im Server: 0x7E8 bei CAN, 0x10 bei K-Line. @param {number} address */
export const senderName = (address) => `0x${address.toString(16).toUpperCase().padStart(address > 0xff ? 3 : 2, "0")}`;
