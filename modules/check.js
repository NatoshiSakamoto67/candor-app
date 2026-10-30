/* Bereich Prüfen: Ist-Soll, Readiness, Freeze-Frame, Service-Funktionen, DID-Leser, RMI-Suche. Prüfpfade: pfade.js */
import { $, h, num, chev, mark, toast } from "./dom.js";
import { state, on, signalTitle, firstReadiness, logEvent } from "./state.js";
import { busy, withTimeout } from "./vorgang.js";

export function renderCheck() {
  const a = state.analysis;
  if (a) {
    $("soll-state").textContent = a.sollwerte.zustand_text + (a.sollwerte.abweichungen ? ` · ${a.sollwerte.abweichungen} Abweichung(en)` : " · alles im Bereich");
    $("soll").replaceChildren(...a.sollwerte.vergleich.map((r) => h("button", { class: "tap row", type: "button", "data-info": `signal:${r.signal}` },
      mark(r.bewertung === "ok" ? "ok" : "crit"),
      h("span", {}, h("div", { class: "t" }, signalTitle(r.signal)), h("div", { class: "d" }, `Soll ${num(r.soll_min)} bis ${num(r.soll_max)} · ${r.art === "hersteller" ? "Herstellerwert" : "Richtwert"}`)),
      h("span", { class: "r " + (r.bewertung === "ok" ? "ok" : "crit") }, num(r.ist, 2) + (r.bewertung === "zu_hoch" ? " ▲" : r.bewertung === "zu_niedrig" ? " ▼" : "")), chev())));
  } else {
    $("soll").replaceChildren(h("p", { class: "hint" }, "Noch keine Vollanalyse."));
  }
  const r = firstReadiness();
  $("readiness").replaceChildren(...(r ? r.tests.map((t) => h("button", { class: "tap test", type: "button", "data-info": `test:${t.name}` },
    mark(t.fertig ? "ok" : "warn"), h("span", {}, t.name, h("div", { class: "d" }, t.fertig ? "fertig" : "offen")))) : [h("p", { class: "hint" }, "Keine Readiness-Daten.")]));
  const f = state.freeze && Object.values(state.freeze.steuergeraete || {})[0];
  $("freeze-title").textContent = f ? `Freeze-Frame zu ${f.ausloeser}` : "Freeze-Frame";
  $("freeze").replaceChildren(...(f ? f.werte.map((v) => h("button", { class: "tap row", type: "button", "data-info": `signal:${v.signal}` },
    mark("muted"), h("span", {}, h("div", { class: "t" }, signalTitle(v.signal))), h("span", { class: "r" }, `${num(v.wert)} ${v.einheit}`), chev())) : [h("p", { class: "hint" }, "Kein Freeze-Frame gespeichert.")]));
}

export function initCheck() {
  $("did-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const addr = $("did-addr"), did = $("did-id");
    const badAddr = !/^[0-9a-f]{3}$/i.test(addr.value.trim()), badDid = !/^[0-9a-f]{4}$/i.test(did.value.trim());
    addr.setAttribute("aria-invalid", String(badAddr)); did.setAttribute("aria-invalid", String(badDid));
    if (badAddr || badDid) { toast(badAddr ? "Adresse: drei Hex-Zeichen, zum Beispiel 7E0." : "DID: vier Hex-Zeichen, zum Beispiel F190."); return; }
    const out = $("did-result"); out.hidden = false;
    const submit = ev.submitter || $("did-form").querySelector("button");
    submit.disabled = true;
    out.textContent = `Lese DID ${did.value.toUpperCase()} an 0x${addr.value.toUpperCase()} …`;
    const done = busy("Kennung lesen");
    const r = await withTimeout(state.src.did(addr.value.trim(), did.value.trim()), 8000, "Das Steuergerät hat in 8 Sekunden nicht geantwortet.").catch((e) => ({ ok: false, meldung: e.message })).finally(() => { done(); submit.disabled = false; });
    out.textContent = r.ok ? `${r.adresse} · DID ${r.did}${r.bekannt_als ? " (" + r.bekannt_als + ")" : ""}\nLänge ${r.laenge} Byte\nHex   ${r.hex}\nText  ${r.ascii}` : `Nicht gelesen: ${r.meldung}`;
    logEvent(`DID ${$("did-id").value.toUpperCase()} an 0x${$("did-addr").value.toUpperCase()} gelesen`);
  });
  $("rmi-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("rmi-result").replaceChildren(h("p", { class: "hint", role: "status" }, "Suche in den Herstellerdokumenten …"));
    const done = busy("Dokumente durchsuchen");
    const r = await withTimeout(state.src.rmi($("rmi-q").value.trim()), 10000, "Die Suche hat in 10 Sekunden nichts geliefert.").catch((e) => ({ ok: false, meldung: e.message })).finally(done);
    $("rmi-result").replaceChildren(...(r.ok ? (r.treffer.length ? r.treffer.map((t) => h("button", { class: "tap row", type: "button", "data-info": `dok:${t.datei}|${t.seite}` },
      mark("accent"), h("span", {}, h("div", { class: "t" }, `${t.datei}, Seite ${t.seite}`), h("div", { class: "d" }, t.auszug)), h("span"), chev())) : [h("p", { class: "hint" }, "Keine Treffer.")]) : [h("p", { class: "hint" }, r.meldung)]));
  });
  on("render", renderCheck);
}
