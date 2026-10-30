/* Töne & Haptik: kurze Töne über WebAudio und Vibration, wenn am Auto etwas passiert. Einstellungen in localStorage
   (kfzdiag-toene), Regeln in kern/toene.js. Hängt sich an vorhandene Ereignisse (saved-state, run-scan, aktion-ergebnis,
   live-tick), ohne fremde Module zu ändern. Andere Module (etwa der Fahrt-Agent) rufen tonSpielen(art) direkt. */
import { storageGet, storageSet } from "./dom.js";
import { state, on, faultSet } from "./state.js";
import { dashboardTon } from "../kern/dashboard-ton.js";
import { TONARTEN, normalisieren, plan } from "../kern/toene.js";

export { TONARTEN };
const KEY = "kfzdiag-toene";
export const toneinstellung = () => normalisieren(storageGet(KEY, {}));
export function setzeToneinstellung(k, v) { storageSet(KEY, { ...toneinstellung(), [k]: v }); }
export function setzeEreignis(art, an) { const e = toneinstellung(); storageSet(KEY, { ...e, ereignisse: { ...e.ereignisse, [art]: an } }); }

let ctx = null;
function kontext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => { /* ohne Nutzergeste bleibt der Kontext stumm, der nächste Tipp weckt ihn */ });
  return ctx;
}
function pieps(c, muster, pegel) {
  let t = c.currentTime;
  for (const [f, d, p] of muster) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pegel, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .02);
    t += d + p;
  }
}

/**
 * Ton und Vibration einer Art abspielen, so wie es eingestellt ist (warnung, grenze, fertig, klick).
 * Mit { vorschau: true } auch dann, wenn das Ereignis abgeschaltet ist. { ton: false } oder { vibration: false } schalten
 * für einen Aufruf etwas ab (eigene Schalter des Fahrt-Agenten). Liefert, was wirklich passiert ist.
 */
export function tonSpielen(art, opt = {}) {
  const p = plan(toneinstellung(), art, opt), ergebnis = { ton: false, vibration: false };
  if (p.ton && opt.ton !== false) { const c = kontext(); if (c) { pieps(c, p.toene, p.pegel); ergebnis.ton = true; } }
  if (p.vibration && opt.vibration !== false && typeof navigator.vibrate === "function") ergebnis.vibration = Boolean(navigator.vibrate(p.muster));
  return ergebnis;
}
/* Browser spielen Ton erst nach einer Berührung: beim Tippen aufrufen, dann klingt die spätere Warnung */
export function tonVorbereiten() { kontext(); }

/* ---------- Anbindung an das Geschehen ---------- */
let bekannt = null, scanLaeuft = false, grenzen = {};
const wert = (sig) => { const x = (state.live || {})[sig]; return x && typeof x.wert === "number" ? x.wert : null; };
export function initToene() {
  /* Neuer Fehler: erst ab dem zweiten Stand, damit das erste Lesen nicht alle Fehler auf einmal meldet. */
  on("saved-state", () => {
    const jetzt = new Set(faultSet().keys());
    if (bekannt && [...jetzt].some((k) => !bekannt.has(k))) tonSpielen("warnung");
    bekannt = jetzt;
    if (scanLaeuft && state.scanned && !state.scanning) { scanLaeuft = false; tonSpielen("fertig"); }
  });
  on("status", () => { if (!state.status) { bekannt = null; grenzen = {}; } });
  on("run-scan", () => { scanLaeuft = true; });
  on("aktion-ergebnis", (d) => { if (d && d.phase === "ausgefuehrt") tonSpielen("klick"); });
  /* Wertgrenze: nur beim Wechsel nach Rot, nicht bei jedem Takt, solange der Wert rot bleibt. */
  on("live-tick", () => {
    const laeuft = (wert("DREHZAHL") || 0) > 100;
    for (const sig of ["KUEHLMITTEL", "SPANNUNG"]) {
      const t = dashboardTon(sig, wert(sig), laeuft);
      if (t === "crit" && grenzen[sig] !== "crit") tonSpielen("grenze");
      grenzen = { ...grenzen, [sig]: t };
    }
  });
}
