/* Werkhof-Anbindung in der Oberfläche (Stufe 1, 29.10.2026): einrichten, Fahrzeug aus der Werkstattsoftware holen,
   Befund ablegen. Alles läuft über den Diagnose-Server; der Werkhof-Schlüssel kommt nie in den Browser.
   CANdor redet nie selbst mit tmERIK, Werkhof ist die einzige Tür. */
import { h, icon, mark, toast } from "./dom.js";
import { state, logEvent, faultSet, firstReadiness } from "./state.js";
import { buchKopf } from "./service.js";
import { createServer } from "./sources.js";

/* Vor dem ersten Verbinden gibt es noch keine Quelle: dann selbst nachsehen, ob der Diagnose-Server da ist. */
let eigene = null;
async function quelle() {
  if (state.src && state.src.mode === "server") return state.src;
  if (state.src) return null;
  if (eigene === null) {
    eigene = await fetch("/api/status", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then((j) => (j && j.ok ? createServer() : false)).catch(() => false);
  }
  return eigene || null;
}
const nurServer = { ok: false, meldung: "Werkhof geht nur mit dem Diagnose-Server, nicht in der Vorschau." };

/* ---------- Einrichten (Einstellungen) ---------- */
let stand = null, fehler = {}, laeuft = false;
export async function werkhofSektion(neuZeichnen) {
  const src = await quelle();
  if (!src) return h("section", { class: "card set-sec", id: "werkhof-einrichten" }, h("h2", { class: "h3" }, "Werkhof"), h("p", { class: "sm" }, nurServer.meldung));
  if (!stand) { stand = await src.werkhof().catch(() => ({ ok: false })); }
  const url = h("input", { class: "inp", id: "wh-url", value: stand.url || "", placeholder: "http://100.x.y.z:8200", autocomplete: "off", spellcheck: "false" });
  const mandant = h("input", { class: "inp", id: "wh-mandant", value: stand.mandant || "", placeholder: "kfz-gorski", autocomplete: "off", spellcheck: "false" });
  const key = h("input", { class: "inp mono", id: "wh-key", type: "password", autocomplete: "off", spellcheck: "false", placeholder: stand.schluessel ? `gespeichert ${stand.schluessel}, leer = behalten` : "API-Schlüssel von Werkhof" });
  const feld = (id, lab, el, hint) => h("label", { class: "fld", for: id }, h("span", { class: "lab" }, lab), el, fehler[id.slice(3)] ? h("span", { class: "fld-err" }, mark("crit"), fehler[id.slice(3)]) : hint ? h("span", { class: "fld-hint" }, hint) : null);
  const speichern = h("button", { class: "btn pri", type: "button", disabled: laeuft || null, onclick: async () => {
    laeuft = true; neuZeichnen();
    const r = await src.werkhofSpeichern({ url: url.value, mandant: mandant.value, schluessel: key.value }).catch((e) => ({ ok: false, meldung: e.message }));
    laeuft = false;
    if (r.ok) { stand = r; fehler = {}; toast(r.eingerichtet ? "Werkhof verbunden. Der Schlüssel bleibt auf dem Server." : "Werkhof-Verbindung entfernt."); }
    else { fehler = r.fehler || {}; if (r.meldung) toast(r.meldung); }
    neuZeichnen();
  } }, icon("tick"), "Speichern");
  return h("section", { class: "card set-sec", id: "werkhof-einrichten" },
    h("div", { class: "sec-head" }, h("div", {}, h("p", { class: "eyebrow" }, "Werkstatt-Betriebssystem"), h("h2", { class: "h3" }, "Werkhof")),
      h("span", { class: `cs t-${stand.eingerichtet ? "ok" : "neutral"}` }, stand.eingerichtet ? "eingerichtet" : "aus")),
    h("p", { class: "sm" }, "Holt Fahrzeuge aus der Werkstattsoftware (tmERIK) und legt Befunde im Auftrag ab. CANdor spricht nur mit Werkhof; nur Adressen im eigenen Netz oder Tailnet."),
    h("div", { class: "fgrid" }, feld("wh-url", "Adresse", url), feld("wh-mandant", "Mandant", mandant), feld("wh-key", "Schlüssel", key, "Bleibt auf dem Diagnose-Server, nur die letzten vier Zeichen werden gezeigt.")),
    h("div", { class: "row-actions" }, speichern));
}

/* ---------- Fahrzeug holen (Formular) ---------- */
const KRAFTSTOFF = [[/diesel/i, "diesel"], [/elektr|electric|bev/i, "elektro"], [/hybrid/i, "hybrid"], [/gas|lpg|cng/i, "gas"], [/benz|petrol|gasoline|otto/i, "benzin"]];
export async function fahrzeugAusWerkhof(kennzeichen) {
  const src = await quelle();
  if (!src) return nurServer;
  if (!(kennzeichen || "").trim()) return { ok: false, meldung: "Zuerst das Kennzeichen eintragen." };
  const r = await src.werkhofFahrzeug(kennzeichen.trim()).catch((e) => ({ ok: false, meldung: e.message }));
  if (!r.ok || !r.fahrzeug) return { ok: false, meldung: r.meldung || "Nicht gefunden." };
  const f = r.fahrzeug, teile = String(f.modell || "").trim().split(/\s+/);
  const kraft = (KRAFTSTOFF.find(([re]) => re.test(f.kraftstoff || "")) || [])[1];
  logEvent(`Fahrzeug aus Werkhof übernommen: ${f.modell || "ohne Modell"}`);
  return { ok: true, werte: { marke: teile[0] || "", modell: teile.slice(1).join(" "), fin: f.vin || "", km: f.kmStand != null ? String(f.kmStand) : "", ...(kraft ? { kraftstoff: kraft } : {}) } };
}

/* ---------- Befund ablegen (Bericht) ---------- */
const MESSWERTE = ["SPANNUNG", "DREHZAHL", "KUEHLMITTEL", "TRIM_LANG_B1", "TRIM_KURZ_B1", "LUFTMASSE", "LAST", "OELTEMPERATUR", "GESCHWINDIGKEIT"];
export function befundPaket(phase) {
  const fz = state.fahrzeug || {}, live = state.live || {}, r = firstReadiness();
  const messwerte = Object.fromEntries(MESSWERTE.filter((k) => live[k] && typeof live[k].wert === "number").map((k) => [k, { wert: live[k].wert, einheit: live[k].einheit || "" }]));
  return {
    kennzeichen: fz.kennzeichen || "", fin: fz.fin || null, phase, km: state.sitzung && state.sitzung.km != null ? state.sitzung.km : fz.km != null && fz.km !== "" ? Number(fz.km) : null,
    zeitpunkt: new Date().toISOString(), quelle: "candor", version: "CANdor", simuliert: Boolean(state.status && state.status.simuliert),
    codes: [...faultSet().values()].slice(0, 500).map((d) => ({ code: d.code, status: d.art || "gespeichert", steuergeraet: String(d.wo || "").slice(0, 60), text: String(d.text || d.beschreibung || "").slice(0, 200) })).filter((c) => /^[PCBU][0-9A-F]{4}/i.test(c.code)),
    messwerte, readiness: r ? Object.fromEntries(r.tests.slice(0, 20).map((t) => [t.name.slice(0, 40), Boolean(t.fertig)])) : null,
    betriebsbuch_hash: buchKopf(),
  };
}
export async function befundSenden(phase) {
  const src = await quelle();
  if (!src) return nurServer;
  if (!state.fahrzeug || !state.fahrzeug.kennzeichen) return { ok: false, meldung: "Das Fahrzeug braucht ein Kennzeichen, damit Werkhof den Auftrag findet." };
  const r = await src.werkhofBefund(befundPaket(phase)).catch((e) => ({ ok: false, meldung: e.message }));
  if (r.ok) logEvent(`Befund (${phase}) an Werkhof übergeben, Fingerabdruck ${String(r.sha256 || "").slice(0, 8)}`);
  return r;
}
