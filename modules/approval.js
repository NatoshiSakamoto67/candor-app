/* Halte-Freigabe: Der einzige Weg, etwas ins Auto zu schreiben. Ring füllt sich 2 s, Loslassen setzt zurück,
   Leertaste halten als Tastaturweg, zweistufige Bestätigung als Alternative ohne Halten. Immer modal (<dialog>). */
import { $, h, s, icon, toast, jump, statusChip, mark } from "./dom.js";
import { state, logEvent, emit } from "./state.js";
import { busy, vorgang, showFailure, withTimeout, HILFE } from "./vorgang.js";

const HOLD_MS = 2000;
const approval = { req: null, timer: null, opts: {} };
const facts = (pairs) => h("dl", { class: "kv" }, ...pairs.filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
const vibrate = (pattern) => { try { navigator.vibrate && navigator.vibrate(pattern); } catch (_) { /* nicht überall erlaubt */ } };

/* opts.vorpruefung: wird unmittelbar vor dem Schreiben erneut gemessen (die Freigabe gilt bis zu 5 min, der Zustand
   kann kippen). Gibt sie einen Text zurück, wird nichts geschrieben. opts.vorbedingungen: Stand zur Anzeige im Dialog. */
export async function startAction(action, opts = {}) {
  const done = busy("Freigabe vorbereiten");
  const reply = await withTimeout(state.src.request(action), 8000, "Der Server hat die Freigabe in 8 Sekunden nicht vorbereitet.").catch((e) => ({ typ: "fehler", meldung: e.message })).finally(done);
  if (reply.typ !== "freigabe_anfrage") { showFailure({ titel: "Freigabe nicht möglich", meldung: `${reply.meldung || "Unbekannter Fehler."} Es wurde nichts geschrieben.`, hilfe: [], retry: () => startAction(action) }); return; }
  approval.req = reply;
  approval.opts = opts;
  emit("aktion-ergebnis", { phase: "angefordert", operation: reply.operation, funktion: (reply.auswirkung || {}).funktion, risiko: reply.risiko, vorbedingungen: opts.vorbedingungen || null });
  const a = reply.auswirkung || {};
  const title = a.funktion ? `${a.funktion} ausführen?` : reply.operation === "obd_fehler_loeschen" ? "Alle OBD-Fehler löschen?" : `Fehler in ${a.modul} löschen?`;
  /* Halte-Knopf (M-07): Ring r = 10, Umfang 62,83, füllt sich in 2 s linear, Loslassen fährt in 220 ms zurück. */
  const hold = h("button", { class: "btn dng hold", type: "button", id: "hold-btn", "aria-describedby": "hold-sub", "data-holding": "false" },
    s("svg", { class: "ring", viewBox: "0 0 24 24", width: 28, height: 28, "aria-hidden": "true" }, s("circle", { class: "ring-t", cx: 12, cy: 12, r: 10 }), s("circle", { class: "ring-p", cx: 12, cy: 12, r: 10, transform: "rotate(-90 12 12)" })),
    h("span", { class: "lbl" }, "Halten zum Schreiben, 2 s"));
  const countdown = h("span", { class: "countdown sm mono" });
  const twoStep = h("div", { class: "two-step", hidden: true });
  const twoStepToggle = h("button", { class: "btn qt small", type: "button", "aria-expanded": "false", onclick: (ev) => { twoStep.hidden = !twoStep.hidden; ev.currentTarget.setAttribute("aria-expanded", String(!twoStep.hidden)); if (!twoStep.hidden) renderTwoStep(twoStep, title); } }, "Ohne Halten: zweistufig bestätigen");
  const tone = { hoch: "crit", mittel: "warn", niedrig: "ok" }[reply.risiko] || "neutral";
  $("approval-body").replaceChildren(
    h("div", { class: "dlg-body" },
      statusChip(tone, `Risiko ${reply.risiko}`),
      h("h2", { class: "h2" }, title),
      h("p", { class: "p" }, a.beschreibung || ""),
      facts([["Steuergerät", a.modul], ["Codes", (a.betroffene_codes || []).join(", ") || null], ["Befehl", a.anfrage ? h("span", { class: "mono" }, a.anfrage) : null], ["Quelle", a.quelle],
        ["Rückgängig", a.umkehrbar ? "ja, Stopp möglich" : "nein, gelöschte Daten kommen nicht zurück"], ["Achtung", a.simuliert ? "nur Simulator" : null]]),
      opts.vorbedingungen ? h("div", { class: "dlg-vb" }, h("p", { class: "eyebrow" }, `Vorbedingungen, gemessen ${new Date().toLocaleTimeString("de-DE")}`),
        h("ul", { class: "vb-mini" }, ...opts.vorbedingungen.map((z) => h("li", {}, mark(z.zustand === "ok" ? "ok" : "crit"), h("span", {}, z.text), z.ist ? h("span", { class: "num" }, z.ist) : null))),
        h("p", { class: "sm" }, "Wird direkt vor dem Schreiben noch einmal gemessen.")) : null,
      h("div", { class: "dlg-row" }, jump({ "data-info": "begriff:halten" }, "Wie funktioniert die Freigabe?"), countdown),
      h("p", { class: "sm", id: "hold-sub" }, "Loslassen bricht ab. Tastatur: Leertaste gedrückt halten."),
      twoStepToggle, twoStep),
    h("div", { class: "dlg-foot" }, h("button", { class: "btn sec", type: "button", onclick: () => finishAction(false) }, "Abbrechen, nichts tun"), hold));
  const dlg = $("approval");
  if (!dlg.open) dlg.showModal();
  let left = Math.floor(reply.gueltig_noch_sekunden || 300);
  const tick = () => { countdown.textContent = `Freigabe gültig noch ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} min`; if (left-- <= 0) { finishAction(false); toast("Freigabe abgelaufen. Nichts ausgeführt."); } };
  tick(); clearInterval(approval.timer); approval.timer = setInterval(tick, 1000);
  setupHold(hold);
  hold.focus();
}

function renderTwoStep(box, title) {
  const check = h("input", { type: "checkbox", id: "two-step-ok" });
  const go = h("button", { class: "btn dng", type: "button", disabled: true, onclick: () => finishAction(true) }, "Jetzt ausführen");
  check.addEventListener("change", () => { go.disabled = !check.checked; });
  box.replaceChildren(h("label", { for: "two-step-ok" }, check, h("span", {}, `Ich habe gelesen, was „${title.replace(/\?$/, "")}“ bewirkt, und will es ausführen.`)), go);
}

function setupHold(button) {
  let timer = null;
  const start = (ev) => {
    if (ev.type === "keydown" && (ev.repeat || (ev.key !== " " && ev.key !== "Enter"))) return;
    if (ev.type === "pointerdown" && ev.button !== 0) return;
    ev.preventDefault();
    button.dataset.holding = "true";
    vibrate(12);
    timer = setTimeout(() => { button.dataset.holding = "false"; vibrate(12); finishAction(true); }, HOLD_MS);
  };
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } button.dataset.holding = "false"; };
  button.addEventListener("pointerdown", start);
  button.addEventListener("keydown", start);
  ["pointerup", "pointerleave", "pointercancel", "keyup", "blur"].forEach((t) => button.addEventListener(t, stop));
  button.addEventListener("contextmenu", (e) => e.preventDefault());
}

export async function finishAction(approved) {
  const req = approval.req, opts = approval.opts || {};
  clearInterval(approval.timer);
  approval.req = null;
  approval.opts = {};
  const dlg = $("approval");
  if (dlg.open) dlg.close();
  if (!req) return;
  const fnName = req.auswirkung && req.auswirkung.funktion;
  const melden = (daten) => emit("aktion-ergebnis", { operation: req.operation, funktion: fnName, ...daten });
  if (!approved) { await state.src.answer(req.freigabe_id, false).catch(() => null); toast("Abgebrochen. Nichts ausgeführt."); logEvent("Aktion abgelehnt, nichts geschrieben", "write"); melden({ phase: "abgelehnt" }); return; }
  /* Letzte Messung direkt vor dem Schreiben: kippt eine Bedingung, wird abgelehnt statt geschrieben. */
  const gekippt = opts.vorpruefung ? opts.vorpruefung() : null;
  if (gekippt) {
    await state.src.answer(req.freigabe_id, false).catch(() => null);
    showFailure({ titel: "Nicht ausgeführt", meldung: `${gekippt} Es wurde nichts geschrieben.`, hilfe: [], retry: null });
    logEvent(`Aktion gestoppt, Vorbedingung gekippt: ${gekippt}`, "write");
    melden({ phase: "gestoppt", grund: gekippt });
    return;
  }
  /* Schreiben: Fenster mit Stand, bis das Steuergerät antwortet. Nicht abbrechbar, weil der Befehl schon unterwegs ist. */
  const task = vorgang({ titel: fnName ? `${fnName} wird ausgeführt` : "Fehlerspeicher wird gelöscht", hinweis: "Nichts abziehen und die Zündung an lassen, bis die Antwort da ist.",
    schritte: ["Befehl an das Steuergerät senden", "Antwort des Steuergeräts abwarten"] });
  task.step(0);
  const pending = state.src.answer(req.freigabe_id, true);
  task.step(1, "wartet auf Bestätigung");
  const reply = await withTimeout(pending, 30000, "Das Steuergerät hat in 30 Sekunden nicht bestätigt.").catch((e) => ({ ok: false, meldung: e.message }));
  if (!reply.ok) {
    task.fail({ titel: "Nicht bestätigt", meldung: `${reply.meldung || "Unbekannter Fehler."} Ob der Befehl im Auto angekommen ist, zeigt erst ein neues Auslesen.`, hilfe: HILFE.schreiben, retry: () => emit("reload"), retryLabel: "Fehlerspeicher neu lesen" });
    logEvent("Aktion gescheitert: " + (reply.meldung || ""), "write");
    melden({ phase: "gescheitert", meldung: reply.meldung || "" });
    emit("reload");
    return;
  }
  task.finish();
  melden({ phase: "ausgefuehrt", antwort: reply.antwort || "OK", codes: ((req.auswirkung || {}).betroffene_codes || []) });
  toast(fnName ? `${fnName} ausgeführt.` : "Gelöscht. " + (reply.naechster_schritt || ""));
  logEvent(fnName ? `${fnName} ausgeführt (Antwort ${reply.antwort || "OK"})` : `Gelöscht nach Freigabe: ${((req.auswirkung || {}).betroffene_codes || []).join(", ") || req.auswirkung.modul}`, "write");
  if (reply.stopp_moeglich) {
    $("approval-body").replaceChildren(h("div", { class: "dlg-body" }, statusChip("running", "läuft"), h("h2", { class: "h2" }, `${fnName} läuft`), h("p", { class: "p" }, "Das Bauteil wird angesteuert, bis du stoppst.")),
      h("div", { class: "dlg-foot" }, h("span"), h("button", { class: "btn pri big-btn", type: "button", onclick: async () => { const r = await state.src.stop(req.operation); toast(r.meldung || "Gestoppt."); logEvent(`${fnName} gestoppt`, "write"); dlg.close(); } }, icon("stop"), "Stopp")));
    dlg.showModal();
  }
  emit("reload");
}

export function initApproval() {
  const dlg = $("approval");
  dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); if (approval.req) finishAction(false); else dlg.close(); });
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg && approval.req) finishAction(false); });
}
