/* Bausteine der Einstellungs-Unterseiten und der Fall-Seite (aus seiten.js ausgelagert); die älteren Seiten nutzen bausteine.js. */
/* Bausteine der Unterseiten im Apple-Stil (Konzept Abschnitt 8): Kopfkarte, Zeile, Gruppe mit Fußnote, Kennzahlen,
   Speicherbalken, Kachelraster. Reine DOM-Bauer ohne Zustand; genutzt von seiten.js und fall.js. Optik in feinschliff.css
   (li-gruppe, li-row, sk-kopf, sk-block). */
import { h, icon, mark } from "./dom.js";

export const bild = (name) => h("img", { src: `icons/liste/${name}.png`, alt: "", width: 64, height: 64, decoding: "async" });
export const chev = () => h("span", { class: "li-chev", "aria-hidden": "true" }, "›");
export function kopf({ bild: b, icon: ic, farbe, titel, text, mehr, schalter }) {
  return h("section", { class: "li-gruppe sk-kopf" },
    h("span", { class: `sk-ic${b ? " li-bild" : ""}`, style: farbe ? `--c:${farbe}` : null, "aria-hidden": "true" }, b ? bild(b) : icon(ic)),
    h("h2", { class: "sk-titel" }, titel),
    h("p", { class: "sk-text" }, text, mehr ? h("a", { class: "sk-mehr", href: "#", onclick: (ev) => { ev.preventDefault(); mehr.ziel(); } }, ` ${mehr.text || "Weitere Infos …"}`) : null),
    schalter ? h("div", { class: "sk-schalter" }, zeile(schalter)) : null);
}
export function zeile(z) {
  const t = h("span", { class: "li-t" }, z.label, z.unter ? h("span", { class: "li-unter" }, z.unter) : null);
  if (z.typ === "schalter") {
    const id = `sk-${z.label.replace(/\W+/g, "-").toLowerCase()}`;
    const inp = h("input", { type: "checkbox", role: "switch", class: "li-sw", id, checked: z.an || null, disabled: z.fest || null });
    inp.addEventListener("change", () => z.setze(inp.checked));
    return h("label", { class: `li-row sk-row${z.fest ? " fest" : ""}`, for: id }, t, inp);
  }
  if (z.typ === "wahl") {
    return h("button", { class: "li-row sk-row", type: "button", "aria-pressed": String(Boolean(z.an)), onclick: z.setze }, t, h("span", { class: "sk-haken", "aria-hidden": "true" }, z.an ? "✓" : ""));
  }
  if (z.typ === "aktion") return h("button", { class: `li-row sk-row sk-aktion t-${z.ton || "blau"}`, type: "button", onclick: z.tun }, h("span", { class: "li-t" }, z.label));
  const klickbar = Boolean(z.ziel);
  return h(klickbar ? "button" : "div", { class: "li-row sk-row", type: klickbar ? "button" : null, onclick: klickbar ? z.ziel : null },
    z.bild ? h("span", { class: "li-ic li-bild", "aria-hidden": "true" }, h("img", { src: `icons/liste/${z.bild}.png`, alt: "", width: 30, height: 30 })) : z.mark ? h("span", { class: "sk-mark" }, mark(z.mark)) : null,
    t, z.wert != null ? h("span", { class: `li-v${z.ton ? ` t-${z.ton}` : ""}${z.mono ? " mono" : ""}` }, z.wert) : h("span"), klickbar ? chev() : h("span"));
}
export function gruppe({ titel, zeilen, fuss, spinner }) {
  const rows = zeilen.filter(Boolean);
  return h("section", { class: "sk-block" },
    titel ? h("h3", { class: "li-k" }, titel, spinner ? h("span", { class: "sk-spinner", "aria-label": "sucht" }) : null) : null,
    rows.length ? h("div", { class: "li-gruppe" }, ...rows.map(zeile)) : null,
    fuss ? h("p", { class: "li-fuss" }, fuss) : null);
}
export const zahlen = (paare, fuss) => h("section", { class: "sk-block" }, h("div", { class: "li-gruppe sk-zahlen" }, ...paare.map(([l, w]) => h("div", {}, h("span", { class: "sk-zl" }, l), h("span", { class: "sk-zw num" }, w)))), fuss ? h("p", { class: "li-fuss" }, fuss) : null);
export function balken(teile, kopfText, rechts) {
  const summe = teile.reduce((a, t) => a + t.wert, 0) || 1;
  return h("section", { class: "sk-block" }, h("div", { class: "li-gruppe sk-speicher" },
    h("div", { class: "sk-sp-kopf" }, h("span", {}, kopfText), h("span", { class: "li-v" }, rechts)),
    h("div", { class: "sk-sp-balken", role: "img", "aria-label": teile.map((t) => `${t.label} ${t.text}`).join(", ") }, ...teile.map((t) => h("i", { style: `flex:${Math.max(t.wert / summe, .004)};background:${t.farbe}` }))),
    h("div", { class: "sk-sp-legende" }, ...teile.map((t) => h("span", {}, h("i", { style: `background:${t.farbe}` }), `${t.label} ${t.text}`)))));
}
export const raster = (kacheln) => h("section", { class: "sk-block" }, h("div", { class: "li-gruppe sk-raster" }, ...kacheln.map((k) => h("button", { class: "sk-kachel", type: "button", onclick: k.ziel || null },
  h("span", { class: "li-ic li-bild" }, h("img", { src: `icons/liste/${k.bild}.png`, alt: "", width: 34, height: 34 })), h("span", {}, h("span", { class: "sk-kt" }, k.label), h("span", { class: "sk-ku" }, k.unter))))));
