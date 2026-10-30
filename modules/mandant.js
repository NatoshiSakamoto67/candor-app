/* Kundenfassung unter dem Namen einer Werkstatt (29.10.2026, zuerst KFZ Gorski). Der Kunde prüft sein Auto selbst mit
   eigenem Stecker: nur lesen, Einfach-Modus, ohne KI und ohne Schreiben. Erkennung über <html data-edition="kunde">,
   Marke aus marke/mandant.json (vom Bau-Werkzeug geschrieben). CANdor arbeitet dabei als Dienstleister im Hintergrund. */
import { $, h, storageSet } from "./dom.js";

export const kundenfassung = () => document.documentElement.dataset.edition === "kunde";
let mandant = null;
export const MANDANT = () => mandant;

export async function ladeMandant() {
  if (!kundenfassung()) return null;
  mandant = await fetch("marke/mandant.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  /* Kundenfassung: immer einfach, Schreiben immer aus (zusätzlich zur harten Sperre in approval.js). */
  storageSet("kfzdiag-modus", "einfach");
  storageSet("kfzdiag-schreibschutz", true);
  document.documentElement.dataset.modus = "einfach";
  return mandant;
}

/* Kopf: Logo der Werkstatt statt CANdor. */
export function wendeMarkeAn() {
  if (!kundenfassung() || !mandant) return;
  const home = $("nav-home");
  if (home) {
    home.setAttribute("aria-label", `${mandant.name}, ${mandant.titel}`);
    home.replaceChildren(h("img", { class: "mandant-logo", src: "marke/mandant-logo.svg", alt: mandant.name, height: 26 }));
  }
}

export const zumPortal = () => { location.href = (mandant && mandant.portal) || "../"; };
