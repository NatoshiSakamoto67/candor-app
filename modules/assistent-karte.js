/* Karte »Assistent« auf der Startseite (30.10.2026): unter dem nächsten Schritt, vor den Listen. Echtes Eingabefeld
   (auf iOS bleibt die Tastatur auf der Startseite, beim Senden öffnet der Chat mit der Frage in einem neuen Chat),
   darunter Vorschläge aus dem Fehlerstand und eine Statuszeile wie der Modell-Chip im Chat. Logik in kern/assistent-start.js. */
import { h, icon } from "./dom.js";
import { state, on, faultSet, firstReadiness } from "./state.js";
import { go, currentRoute } from "./shell.js";
import { neueFrage } from "./chat.js";
import { startVorschlaege, startStatus } from "../kern/assistent-start.js";

/* Frage wartet, bis der Chat gezeichnet ist (der Seitenwechsel läuft mit View Transition verzögert). */
let offen = null, horchtTab = false;
function fragen(text) {
  const t = String(text || "").trim();
  if (!t) { go("agent"); return; }
  offen = t;
  if (!horchtTab) {
    horchtTab = true;
    on("tab", (id) => { if (id !== "agent" || !offen) return; const f = offen; offen = null; setTimeout(() => neueFrage(f), 0); });
  }
  if (currentRoute().page === "agent") { const f = offen; offen = null; neueFrage(f); } else go("agent");
}

/* Modellname kommt aus den Server-Einstellungen; je Anbieter einmal laden (den Schlüssel sieht der Browser nie). */
let einst = null, geladen = null;
const isServer = () => Boolean(state.src && state.src.mode === "server");
function ladeEinst(nachher) {
  const a = isServer() && state.status ? state.status.ki || "aus" : null;
  if (a === geladen) return;
  geladen = a;
  if (!a) { einst = null; return; }
  state.src.settings().then((r) => { einst = r && r.ok ? r : null; nachher(); }, () => { einst = null; nachher(); });
}
const lage = () => ({ server: isServer(), anbieter: einst ? einst.ki.anbieter : state.status && state.status.ki, modell: einst && einst.ki.modell, modelle: einst ? einst.modelle : [] });

let nr = 0;
export function assistentKarte() {
  const id = `ak-titel-${++nr}`;
  const feld = h("input", { class: "ak-eingabe", type: "text", enterkeyhint: "send", autocomplete: "off", autocorrect: "on", spellcheck: "true", maxlength: 2000,
    placeholder: "Frag etwas zum Auto …", "aria-label": "Frage an den Assistenten" });
  const senden = h("button", { class: "ak-senden", type: "submit", "aria-label": "Frage senden", disabled: true }, icon("up"));
  feld.addEventListener("input", () => { senden.disabled = !feld.value.trim(); });
  const form = h("form", { class: "ak-feld", role: "search", "aria-label": "Assistent fragen", onsubmit: (ev) => {
    ev.preventDefault();
    const t = feld.value.trim();
    if (!t) return;
    feld.value = ""; senden.disabled = true; feld.blur();
    fragen(t);
  } }, feld, senden);
  const chips = h("div", { class: "ak-chips", role: "list", "aria-label": "Vorschläge" });
  const status = h("button", { class: "ak-status", type: "button" });
  const kopf = h("a", { class: "ak-kopf", href: "#agent", onclick: (ev) => { ev.preventDefault(); go("agent"); } },
    h("img", { class: "ak-zeichen", src: "marke/candor-zeichen.svg", alt: "", width: 30, height: 30, decoding: "async", draggable: "false" }),
    h("h2", { class: "ak-titel", id }, "Assistent"), h("span", { class: "ak-verlauf" }, "Chats"), h("span", { class: "li-chev", "aria-hidden": "true" }, "›"));
  const karte = h("section", { class: "ak", "aria-labelledby": id, "data-id": "assistent" }, kopf, form, chips, h("div", { class: "ak-fuss" }, status));
  return { el: karte, kopf, chips, status, schluessel: "" };
}

/** Vorschläge und Status nur tauschen, wenn sie sich geändert haben (die Liste wird jede Sekunde aktualisiert). */
export function aktualisiereKarte(k, neuZeichnen = () => {}) {
  if (!k) return;
  ladeEinst(neuZeichnen);
  const r = firstReadiness();
  const v = startVorschlaege({ verbunden: Boolean(state.status), scanned: state.scanned, codes: [...faultSet().values()].map((f) => f.code), readinessGesamt: r ? r.tests.length : null });
  const s = startStatus(lage());
  const schluessel = JSON.stringify([v, s]);
  if (currentRoute().page === "agent" && currentRoute().sub !== "kamera") k.kopf.setAttribute("aria-current", "page"); else k.kopf.removeAttribute("aria-current");
  if (schluessel === k.schluessel) return;
  k.schluessel = schluessel;
  k.chips.replaceChildren(...v.map((x) => h("button", { class: "ak-chip", type: "button", role: "listitem", title: x.frage, onclick: () => fragen(x.frage) }, x.kurz)));
  k.status.replaceChildren(...[h("span", { class: `ak-punkt t-${s.ton}`, "aria-hidden": "true" }), h("span", {}, s.text), s.stufe ? h("span", { class: "ak-stufe" }, s.stufe) : null,
    s.ziel ? h("span", { class: "li-chev", "aria-hidden": "true" }, "›") : null].filter(Boolean));
  k.status.disabled = !s.ziel;
  k.status.onclick = s.ziel ? () => go(s.ziel) : null;
  k.status.setAttribute("aria-label", s.ton === "bereit" ? `Modell ${s.text}${s.stufe ? `, Stufe ${s.stufe}` : ""}, öffnet KI und Dienste` : s.ton === "einrichten" ? "KI einrichten, öffnet KI und Dienste" : "Vorschau: Beispielantworten ohne Server");
}
