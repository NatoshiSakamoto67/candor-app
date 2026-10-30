/* Bordnetz & Batterie, aufgebaut wie die Batterie-Seite bei Apple: große Zahl mit Einheit und Balken, Säulen mit
   Durchschnittslinie, darunter Kennzahlen und der Weg zum Anmelden einer neuen Batterie. Ehrlich: der Ladezustand ist
   eine Schätzung aus der Ruhespannung und gilt nur bei Motor aus. */
import { $, h, mark, numFix } from "./dom.js";
import { state, on } from "./state.js";
import { go } from "./shell.js";
import { historyOf } from "./recorder.js";
import { ladezustand, bordnetzTon } from "../kern/einstellungs-baum.js";

const SAEULEN = 24, MIN_V = 11, MAX_V = 15;
let teile = null;

function bauen() {
  const zahl = h("span", { class: "bn-zahl num" }), einheit = h("span", { class: "bn-einheit" }, "V");
  const zeile = h("p", { class: "bn-zeile" }), balken = h("span", { class: "bn-balken-f" }), ladung = h("p", { class: "sm bn-ladung" });
  const saeulen = h("div", { class: "bn-saeulen", role: "img" }), schnittTxt = h("span", { class: "bn-schnitt-t sm" }), schnitt = h("span", { class: "bn-schnitt" }, schnittTxt);
  const kz = { min: h("span", { class: "li-v num" }), max: h("span", { class: "li-v num" }), mittel: h("span", { class: "li-v num" }), werte: h("span", { class: "li-v num" }) };
  const kzZeile = (t, el) => h("div", { class: "li-row" }, h("span", { class: "li-t" }, t), el);
  $("bordnetz").replaceChildren(
    h("section", { class: "li-gruppe bn-kopf" }, h("div", { class: "bn-gross" }, zahl, einheit), zeile, h("span", { class: "bn-balken" }, balken), ladung),
    h("h2", { class: "li-k" }, "Spannung in dieser Sitzung"),
    h("section", { class: "li-gruppe bn-diagramm" }, h("div", { class: "bn-feld" }, saeulen, schnitt),
      h("div", { class: "bn-achse sm" }, h("span", {}, "Start"), h("span", {}, "jetzt"))),
    h("h2", { class: "li-k" }, "Kennzahlen"),
    h("section", { class: "li-gruppe" }, kzZeile("Niedrigster Wert", kz.min), kzZeile("Höchster Wert", kz.max), kzZeile("Durchschnitt", kz.mittel), kzZeile("Messwerte", kz.werte)),
    h("p", { class: "li-fuss" }, "Der Ladezustand wird aus der Ruhespannung geschätzt und stimmt nur bei abgestelltem Motor nach mindestens zwei Stunden Ruhe. Bei laufendem Motor zeigt die Zahl die Ladespannung; gut sind 13,6 bis 14,8 V."),
    h("section", { class: "li-gruppe" },
      h("a", { class: "li-row", href: "#service/batterie", onclick: (ev) => { ev.preventDefault(); go("service", { sub: "batterie" }); } }, h("span", { class: "li-t" }, "Neue Batterie anmelden"), h("span", { class: "li-chev", "aria-hidden": "true" }, "›")),
      h("a", { class: "li-row", href: "#live", onclick: (ev) => { ev.preventDefault(); go("live"); } }, h("span", { class: "li-t" }, "Im Diagramm verfolgen"), h("span", { class: "li-chev", "aria-hidden": "true" }, "›"))));
  teile = { zahl, zeile, balken, ladung, saeulen, schnitt, schnittTxt, kz };
}

export function renderBordnetz() {
  if ($("view-bordnetz").hidden) return;
  if (!teile) bauen();
  const live = state.live || {};
  const v = live.SPANNUNG && typeof live.SPANNUNG.wert === "number" ? live.SPANNUNG.wert : null;
  const rpm = live.DREHZAHL && typeof live.DREHZAHL.wert === "number" ? live.DREHZAHL.wert : null;
  const laeuft = rpm != null && rpm > 100, ton = bordnetzTon(v, laeuft);
  teile.zahl.textContent = v == null ? "–" : numFix(v, 2);
  teile.zahl.className = `bn-zahl num${ton ? ` t-${ton}` : ""}`;
  teile.zeile.replaceChildren(...(v == null ? [document.createTextNode("Noch kein Messwert. Fahrzeug verbinden.")]
    : [mark(ton || "pending"), document.createTextNode(laeuft ? ` Motor läuft · ${ton === "ok" ? "lädt richtig" : ton === "warn" ? "Ladespannung knapp" : "Ladespannung außerhalb"}` : ` Motor aus · ${ton === "ok" ? "Batterie gut" : ton === "warn" ? "Batterie schwach" : "Batterie leer"}`)]));
  const soc = laeuft ? null : ladezustand(v);
  teile.balken.style.transform = `scaleX(${soc == null ? 0 : soc / 100})`;
  teile.balken.className = `bn-balken-f${ton ? ` t-${ton}` : ""}`;
  teile.ladung.textContent = soc == null ? (laeuft ? "Ladezustand nur bei Motor aus." : "") : `Ladezustand etwa ${soc} %, geschätzt`;
  const reihe = historyOf("SPANNUNG");
  const n = reihe.length;
  if (!n) { teile.saeulen.replaceChildren(); teile.schnitt.hidden = true; teile.schnittTxt.textContent = ""; ["min", "max", "mittel", "werte"].forEach((k) => (teile.kz[k].textContent = "–")); return; }
  const je = Math.max(1, Math.ceil(n / SAEULEN)), werte = [];
  for (let i = 0; i < n; i += je) { const t = reihe.slice(i, i + je); werte.push(t.reduce((a, b) => a + b, 0) / t.length); }
  const hoehe = (x) => Math.max(2, Math.min(100, ((x - MIN_V) / (MAX_V - MIN_V)) * 100));
  if (teile.saeulen.childElementCount !== werte.length) teile.saeulen.replaceChildren(...werte.map(() => h("span", { class: "bn-s" })));
  [...teile.saeulen.children].forEach((el, i) => { el.style.transform = `scaleY(${hoehe(werte[i]) / 100})`; el.classList.toggle("jetzt", i === werte.length - 1); });
  const mittel = reihe.reduce((a, b) => a + b, 0) / n;
  teile.schnitt.hidden = false;
  teile.schnitt.style.transform = `translateY(${-hoehe(mittel)}%)`;
  teile.schnittTxt.textContent = `Ø ${numFix(mittel, 2)} V`;
  teile.saeulen.setAttribute("aria-label", `Spannung in ${werte.length} Abschnitten, Durchschnitt ${numFix(mittel, 2)} Volt`);
  teile.kz.min.textContent = `${numFix(Math.min(...reihe), 2)} V`;
  teile.kz.max.textContent = `${numFix(Math.max(...reihe), 2)} V`;
  teile.kz.mittel.textContent = `${numFix(mittel, 2)} V`;
  teile.kz.werte.textContent = n.toLocaleString("de-DE");
}

export function initBordnetz() {
  on("tab", (id) => { if (id === "bordnetz") renderBordnetz(); });
  on("status", renderBordnetz);
}
