/* Handbuch im Programm: Übersicht der Kapitel, je Kapitel eine Seite (#handbuch/<id>) mit Inhaltsverzeichnis,
   Systembildern und Vor/Zurück. Inhalt in handbuch-inhalt.js, Bilder in handbuch-bilder.js. */
import { $, h, icon, chev } from "./dom.js";
import { on } from "./state.js";
import { go, currentRoute } from "./shell.js";
import { icon3d } from "./icons3d.js";
import { KAPITEL } from "./handbuch-inhalt.js";
import { bild } from "./handbuch-bilder.js";
import { lockup } from "./marke.js";

export const kapitelIds = () => KAPITEL.map((k) => k.id);
const TONE_MARK = { info: "Hinweis", warn: "Achtung", crit: "Grenze", ok: "Gut zu wissen" };

function block([art, a, b]) {
  switch (art) {
    case "p": return h("p", { class: "hb-p" }, a);
    case "liste": return h("ul", { class: "hb-list" }, ...a.map((t) => h("li", {}, t)));
    case "schritte": return h("ol", { class: "hb-steps" }, ...a.map((t) => h("li", {}, t)));
    case "tabelle": return h("div", { class: "hb-table" }, h("table", {}, h("thead", {}, h("tr", {}, ...a.map((x) => h("th", {}, x)))),
      h("tbody", {}, ...b.map((r) => h("tr", {}, ...r.map((c, i) => h("td", { class: i === 0 ? "k" : null }, c)))))));
    case "code": return h("pre", { class: "hb-code" }, h("code", {}, a));
    case "bild": { const svg = bild(a); return svg ? h("figure", { class: "hb-fig" }, svg, h("figcaption", {}, svg.getAttribute("aria-label"))) : null; }
    case "hinweis": return h("aside", { class: `hb-note t-${a}` }, h("strong", {}, TONE_MARK[a] || "Hinweis", " "), b);
    case "funktion": return h("section", { class: "hb-fn" },
      h("div", { class: "hb-fn-head" }, h("span", { class: "hb-fn-ic", "aria-hidden": "true" }, icon3d(a.icon)), h("h3", {}, a.titel)),
      h("dl", {}, h("dt", {}, "Was"), h("dd", {}, a.was), h("dt", {}, "Wie gelöst"), h("dd", {}, a.wie), a.dateien ? [h("dt", {}, "Dateien"), h("dd", { class: "mono" }, a.dateien)] : null));
    default: return null;
  }
}

function toc(activeId) {
  return h("nav", { class: "hb-toc", "aria-label": "Inhalt des Handbuchs" }, h("p", { class: "eyebrow" }, "Inhalt"),
    h("ol", {}, ...KAPITEL.map((k, i) => h("li", {}, h("a", { href: `#handbuch/${k.id}`, "aria-current": k.id === activeId ? "page" : null,
      onclick: (ev) => { ev.preventDefault(); go("handbuch", { sub: k.id }); } }, h("span", { class: "n" }, String(i + 1).padStart(2, "0")), k.titel)))));
}

function overview() {
  return [
    h("div", { class: "card hb-hero" }, lockup(64),
      h("div", {}, h("p", { class: "eyebrow" }, "Handbuch"), h("h2", { class: "h2" }, "So funktioniert CANdor"),
        h("p", { class: "p" }, "Jede Funktion erklärt, auch technisch: welche Hardware du brauchst, wie du installierst, wie die Verbindung über Bluetooth läuft, wie die Daten fließen, wie das Schreiben abgesichert ist und wie du Herstellerdaten über RMI einbindest."))),
    h("div", { class: "hb-grid" }, ...KAPITEL.map((k, i) => h("button", { class: "hb-card", type: "button", onclick: () => go("handbuch", { sub: k.id }) },
      h("span", { class: "hb-card-ic", "aria-hidden": "true" }, icon3d(k.icon)),
      h("span", { class: "n" }, `Kapitel ${i + 1}`), h("span", { class: "t" }, k.titel), h("span", { class: "d" }, k.kurz)))),
  ];
}

function chapter(k) {
  const i = KAPITEL.indexOf(k), prev = KAPITEL[i - 1], next = KAPITEL[i + 1];
  const nav = (x, dir) => x ? h("button", { class: `btn ${dir === "next" ? "pri" : "sec"}`, type: "button", onclick: () => go("handbuch", { sub: x.id }) },
    dir === "prev" ? icon("back") : null, dir === "prev" ? `Zurück: ${x.titel}` : `Weiter: ${x.titel}`, dir === "next" ? icon("next") : null) : h("span");
  return h("div", { class: "hb-layout" }, toc(k.id),
    h("article", { class: "card hb-article", "aria-labelledby": `hb-${k.id}` },
      h("p", { class: "eyebrow" }, `Kapitel ${i + 1} von ${KAPITEL.length}`), h("h2", { class: "h2", id: `hb-${k.id}` }, k.titel), h("p", { class: "lead" }, k.kurz),
      ...k.bloecke.map(block).filter(Boolean),
      h("div", { class: "hb-pager" }, nav(prev, "prev"), nav(next, "next"))));
}

function render() {
  const sub = currentRoute().sub;
  const k = KAPITEL.find((x) => x.id === sub);
  $("handbuch").replaceChildren(...(k ? [chapter(k)] : overview()));
}

export function initHandbuch() {
  on("tab", (id) => { if (id === "handbuch") render(); });
}
