/* Blatt »Kontext hinzufügen« im KI-Assistenten, von unten wie in Assistenten-Apps: oben Kacheln Kamera, Fotos, Dateien,
   darunter Schalter und Werte. Was erscheint, entscheidet kern/kontext.js. Schließt mit X, Escape, Tippen auf den
   Hintergrund oder Wischen nach unten; der Fokus bleibt im Blatt und geht danach zurück auf den Auslöser. */
import { h, s, reducedMotion } from "./dom.js";
import { kacheln, zeilen } from "../kern/kontext.js";

const SYMBOL = {
  kamera: "M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.5-2h4.8l1.5 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM12 9.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4",
  fotos: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15 8.5h.01",
  dateien: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5",
  websuche: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9s1.2-6.4 3.8-9",
  agent: "M3 12h4l2.5-6 5 12L17 12h4",
  modell: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  budget: "M4 17a8 8 0 1 1 16 0M12 17l3.5-5M7 17h.01M17 17h.01",
  zu: "M6 6l12 12M18 6L6 18",
};
const svg = (name) => s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "kb-sym" }, s("path", { d: SYMBOL[name] }));
const WISCH_ZU = 90;
let offen = null;

export const blattOffen = () => Boolean(offen);
export function schliesseBlatt() { if (offen) offen(); }

/**
 * @param {object} lage siehe kern/kontext.js
 * @param {{waehle: (k: object) => void, schalte: (id: string, an: boolean) => void, ziel: (id: string) => void}} aktion
 * @param {HTMLElement} ausloeser bekommt beim Schließen den Fokus zurück
 */
export function oeffneBlatt(lage, aktion, ausloeser) {
  if (offen) return;
  const schleier = h("div", { class: "kb-schleier", "aria-hidden": "true" });
  const titel = h("h2", { class: "kb-titel", id: "kb-titel" }, "Kontext hinzufügen");
  const zuKnopf = h("button", { class: "kb-zu", type: "button", "aria-label": "Schließen" }, svg("zu"));
  const ks = kacheln(lage);
  const tun = (fn) => () => { zu(); fn(); };
  const blatt = h("div", { class: "kb-blatt", role: "dialog", "aria-modal": "true", "aria-labelledby": "kb-titel" },
    h("div", { class: "kb-griff", "aria-hidden": "true" }),
    h("div", { class: "kb-kopf" }, zuKnopf, titel, h("span")),
    ks.length ? h("div", { class: "kb-kacheln" }, ...ks.map((k) => h("button", { class: "kb-kachel", type: "button", onclick: tun(() => aktion.waehle(k)) }, svg(k.id), h("span", {}, k.label)))) : null,
    h("div", { class: "kb-zeilen" }, ...zeilen(lage).map((z) => zeile(z, aktion, tun))),
    ks.length ? h("p", { class: "kb-hinweis" }, "Kennzeichen und FIN auf Fotos erkennt CANdor nicht. Bitte nicht mit fotografieren.") : null);
  const ebene = h("div", { class: "kb-ebene" }, schleier, blatt);
  document.body.append(ebene);
  const vorher = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => ebene.classList.add("auf"));

  function zu() {
    if (!offen) return;
    offen = null;
    document.removeEventListener("keydown", taste, true);
    document.body.style.overflow = vorher;
    ebene.classList.remove("auf");
    const weg = () => ebene.remove();
    if (reducedMotion()) weg(); else { blatt.addEventListener("transitionend", weg, { once: true }); setTimeout(weg, 400); }
    if (ausloeser && ausloeser.isConnected) ausloeser.focus();
  }
  offen = zu;
  /* Escape schließt, Tab bleibt im Blatt */
  function taste(ev) {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); zu(); return; }
    if (ev.key !== "Tab") return;
    const fokusbar = [...blatt.querySelectorAll("button, input, [href]")].filter((el) => !el.disabled && el.offsetParent !== null);
    const erstes = fokusbar[0], letztes = fokusbar[fokusbar.length - 1];
    if (ev.shiftKey && document.activeElement === erstes) { ev.preventDefault(); letztes.focus(); }
    else if (!ev.shiftKey && document.activeElement === letztes) { ev.preventDefault(); erstes.focus(); }
  }
  document.addEventListener("keydown", taste, true);
  schleier.addEventListener("click", zu);
  zuKnopf.addEventListener("click", zu);
  wischen(blatt, zu);
  requestAnimationFrame(() => (blatt.querySelector(".kb-kachel") || zuKnopf).focus());
}

function zeile(z, aktion, tun) {
  const sym = h("span", { class: "kb-z-sym" }, svg(z.id));
  const text = h("span", { class: "kb-z-t" }, z.label, z.unter ? h("small", {}, z.unter) : null);
  if (z.typ === "schalter") {
    const id = `kb-${z.id}`;
    const inp = h("input", { type: "checkbox", role: "switch", class: "li-sw", id, checked: z.an || null });
    inp.addEventListener("change", () => aktion.schalte(z.id, inp.checked));
    return h("label", { class: "kb-zeile", for: id }, sym, text, inp);
  }
  return h("button", { class: "kb-zeile", type: "button", onclick: tun(() => aktion.ziel(z.id)) }, sym, text,
    h("span", { class: "kb-z-v" }, z.wert || ""), h("span", { class: "li-chev", "aria-hidden": "true" }, "›"));
}

/* Nach unten ziehen am Griff oder Kopf: folgt dem Finger, ab WISCH_ZU Pixeln schließt es, sonst springt es zurück. */
function wischen(blatt, zu) {
  let start = null, dy = 0;
  const griff = (ev) => ev.target.closest(".kb-griff, .kb-kopf") && !ev.target.closest("button");
  blatt.addEventListener("pointerdown", (ev) => { if (!griff(ev)) return; start = ev.clientY; dy = 0; blatt.setPointerCapture(ev.pointerId); blatt.classList.add("zieht"); });
  blatt.addEventListener("pointermove", (ev) => { if (start == null) return; dy = Math.max(0, ev.clientY - start); blatt.style.transform = `translateY(${dy}px)`; });
  const ende = () => { if (start == null) return; start = null; blatt.classList.remove("zieht"); blatt.style.transform = ""; if (dy > WISCH_ZU) zu(); };
  blatt.addEventListener("pointerup", ende);
  blatt.addEventListener("pointercancel", ende);
}
