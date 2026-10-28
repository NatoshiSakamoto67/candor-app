/* Infoblätter: Jedes antippbare Element öffnet hier seine Erklärung mit Werten, Quelle und Sprungmarken. */
import { $, h, num, cssVar, jump, mark, storageGet } from "./dom.js";
import { state, WISSEN, DTC_REG, signalTitle, sollFor, on, emit } from "./state.js";
import { openPane, go } from "./shell.js";
import { openHistoryEntry } from "./history.js";
import { lookup, isGeneric } from "./dtcwissen.js";
import { similar } from "./faelle.js";
import { startAction } from "./approval.js";
import { historyOf } from "./live.js";

export const facts = (pairs) => h("dl", { class: "facts" }, ...pairs.filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));

function sparkCanvas(values) {
  const c = h("canvas", { width: 600, height: 200, "aria-hidden": "true", style: "width:100%;height:120px" });
  requestAnimationFrame(() => {
    const ctx = c.getContext("2d"); if (values.length < 2) return;
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 3; ctx.beginPath();
    values.forEach((v, i) => { const x = i / (values.length - 1) * 600, y = 190 - (v - lo) / span * 180; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
  return c;
}

function infoSignal(sig) {
  const m = WISSEN.signale[sig] || { titel: sig, kurz: "" };
  const v = state.live[sig], soll = sollFor(sig), hist = historyOf(sig);
  return [
    h("p", { class: "eyebrow" }, `Messwert · SAE J1979 Modus 01 PID ${m.pid || "?"}`), h("h2", {}, m.titel), h("p", { class: "lead" }, m.kurz),
    facts([["Aktuell", v && v.wert != null ? `${num(v.wert, 2)} ${v.einheit}` : "–"],
      ["Soll", soll ? `${num(soll.soll_min)} bis ${num(soll.soll_max)} ${v ? v.einheit : ""} · ${soll.art === "hersteller" ? "Herstellerwert" : "Richtwert"} · ${soll.quelle}` : null],
      ["Typisch", m.typisch], ["Formel", m.formel ? `${m.formel}  (${m.einheit})` : null],
      ["Verlauf", hist.length > 1 ? `min ${num(Math.min(...hist), 2)} · max ${num(Math.max(...hist), 2)} · Ø ${num(hist.reduce((a, b) => a + b, 0) / hist.length, 2)}` : null]]),
    hist.length > 1 ? sparkCanvas(hist.slice(-120)) : null,
    m.erklaerung ? h("div", { class: "box" }, h("h3", {}, "Bedeutung"), m.erklaerung) : null,
    v && v.warnung ? h("div", { class: "box up" }, h("h3", {}, "Warnung"), v.warnung) : null,
    m.zu_hoch && m.zu_hoch !== "—" ? h("div", { class: "box up" }, h("h3", {}, "Wenn zu hoch"), m.zu_hoch) : null,
    m.zu_niedrig && m.zu_niedrig !== "—" ? h("div", { class: "box down" }, h("h3", {}, "Wenn zu niedrig"), m.zu_niedrig) : null,
    h("div", { class: "chips" }, jump({ onclick: () => { go("live"); emit("chart-add", sig); } }, "Im Diagramm zeigen")),
  ];
}

/* OBDex-Wissen und eigene belegte Fälle zu einem Code. Das Paket lädt im Hintergrund, die Seite steht sofort. */
const LIKE_TONE = { hoch: "crit", mittel: "warn", niedrig: "neutral" };
function wissenBox(code) {
  const box = h("section", { class: "box dtc-wissen" }, h("h3", {}, "Erklärung"), h("p", { class: "sm" }, "Lade …"));
  if (!isGeneric(code)) {
    box.replaceChildren(h("h3", {}, "Herstellerspezifischer Code"),
      h("p", {}, "Die Bedeutung legt der Hersteller fest. Belastbar wird sie erst mit Herstellerdaten (RMI) oder einer Quelle. Die KI kann im Internet nach Fundstellen suchen und nennt sie dann als unbestätigt."),
      h("button", { class: "btn sec small", type: "button", onclick: () => { go("agent"); emit("chat-prefill", `Was bedeutet ${code} bei diesem Fahrzeug? Bitte mit Quellen aus dem Internet.`); } }, "Im Chat nachfragen"));
    return box;
  }
  lookup(code).then((e) => {
    if (!e) { box.replaceChildren(h("h3", {}, "Erklärung"), h("p", { class: "sm" }, "Zu diesem Code ist im Fehlercode-Wissen nichts hinterlegt.")); return; }
    box.replaceChildren(
      h("h3", {}, `Erklärung · ${e.t}`),
      e.d ? h("p", {}, e.d) : null,
      e.u && e.u.length ? h("div", { class: "dw-blk" }, h("p", { class: "eyebrow" }, "Mögliche Ursachen"),
        h("ul", { class: "dw-list" }, ...e.u.map(([w, t]) => h("li", {}, h("span", { class: `cs t-${LIKE_TONE[w] || "neutral"}` }, w || "?"), h("span", {}, t))))) : null,
      e.s && e.s.length ? h("div", { class: "dw-blk" }, h("p", { class: "eyebrow" }, "Typische Anzeichen"), h("ul", { class: "dw-plain" }, ...e.s.map((t) => h("li", {}, t)))) : null,
      h("div", { class: "chips" }, e.mil ? h("span", { class: "cs t-warn" }, "Motorlampe") : null, e.abgas ? h("span", { class: "cs t-neutral" }, "abgasrelevant") : null,
        e.sw ? h("span", { class: "cs t-neutral" }, `Aufwand ${e.sw}`) : null, e.h ? h("span", { class: "cs t-neutral" }, `${num(e.h[0], 1)} bis ${num(e.h[1], 1)} h`) : null),
      e.r && e.r.length ? h("div", { class: "chips" }, h("span", { class: "sm" }, "Verwandt:"), ...e.r.map((r) => DTC_REG.has(r) || [...DTC_REG.values()].some((x) => x.dtc.code === r) ? jump({ "data-info": `dtc:${r}` }, r) : h("span", { class: "mono sm" }, r))) : null,
      h("p", { class: "sm dw-src" }, "Allgemeine Angabe zu genormten Codes aus ", h("a", { href: "https://github.com/foerbsnavi/obdex", target: "_blank", rel: "noopener noreferrer" }, "OBDex"), " (CC0), kein Herstellerwert, ohne Gewähr.",
        ...(e.q || []).map((q, i) => [" ", h("a", { href: q, target: "_blank", rel: "noopener noreferrer nofollow" }, `Quelle ${i + 1}`)])));
  }).catch(() => box.replaceChildren(h("h3", {}, "Erklärung"), h("p", { class: "sm" }, "Fehlercode-Wissen nicht ladbar. In der Handy-Vorschau ist es nicht enthalten, in der Fassung auf dem Rechner schon.")));
  return box;
}
const ERGEBNIS = { behoben: ["ok", "behoben"], teilweise: ["warn", "teilweise"], offen: ["crit", "nicht behoben"] };
function casesBox(code) {
  const fz = state.fahrzeug || {};
  const list = similar(storageGet("kfzdiag-faelle", []), { codes: [code], marke: fz.marke, modell: fz.modell });
  if (!list.length) return null;
  return h("section", { class: "box dtc-faelle" }, h("h3", {}, `Eigene belegte Fälle (${list.length})`),
    ...list.map((f) => h("div", { class: "dw-case" },
      h("span", { class: `cs t-${ERGEBNIS[f.ergebnis][0]}` }, ERGEBNIS[f.ergebnis][1]),
      h("span", {}, h("b", {}, [f.fz.marke, f.fz.modell, f.fz.baujahr].filter(Boolean).join(" ") || "Fahrzeug"), " · ", f.massnahme,
        h("span", { class: "sm" }, ` · ${new Date(f.at).toLocaleDateString("de-DE")}${f.behoben.length ? `, weg: ${f.behoben.join(", ")}` : ""}`)))),
    h("p", { class: "sm" }, "Ergebnis gemessen: Eingangsbefund gegen Ausgangsbefund."));
}

const SYSTEM = { P: "Antrieb", C: "Fahrwerk", B: "Karosserie", U: "Netzwerk" };
const GROUP = { 0: "Kraftstoff/Luft", 1: "Gemisch", 2: "Einspritzung", 3: "Zündung", 4: "Abgas", 5: "Leerlauf/Geschw.", 6: "Steuergerät", 7: "Getriebe", 8: "Getriebe", 9: "Steuergerät", A: "Hybrid", B: "Hybrid", C: "Hybrid" };
function infoDtc(key) {
  const entry = DTC_REG.get(key) || [...DTC_REG.values()].find((e) => e.dtc.code === key);
  if (!entry) return [h("p", { class: "eyebrow" }, "Fehlercode"), h("h2", { class: "mono" }, key), h("p", { class: "lead" }, "Dieser Code steht gerade nicht im Fehlerspeicher.")];
  const { dtc, where, kind, ecu } = entry;
  const c = dtc.code;
  const f = state.freeze && Object.values(state.freeze.steuergeraete || {}).find((x) => x.ausloeser === c);
  const canDelete = state.status.schreiben_an;
  const hits = (state.analysis && state.analysis.rmi_fundstellen && state.analysis.rmi_fundstellen[c]) || [];
  return [
    h("p", { class: "eyebrow" }, `Fehlercode · ${where}`), h("h2", { class: "mono" }, c), h("p", { class: "lead" + (dtc.bekannt === false ? " hint" : "") }, dtc.beschreibung),
    h("div", { class: "anatomy", "aria-hidden": "true" }, ...[...c].map((ch) => h("span", {}, ch))),
    h("div", { class: "anatomy-k" }, h("span", {}, SYSTEM[c[0]]), h("span", {}, c[1] === "0" || c[1] === "2" ? "genormt" : "Hersteller"), h("span", {}, c[0] === "P" ? GROUP[c[2]] || "–" : "Gruppe"), h("span", {}, "Fehler"), h("span", {}, "Nr.")),
    facts([["Status", [dtc.aktiv && "aktiv", dtc.bestaetigt ? "gespeichert" : "vorläufig"].filter(Boolean).join(", ") + ` (${dtc.status || "–"})`],
      ["Quelle", dtc.quelle || "keine, herstellerspezifisch"], ["Steuergerät", ecu ? `${ecu.name} · ${ecu.adresse}` : where]]),
    h("div", { class: "chips" }, jump({ "data-info": "begriff:dtc_aufbau" }, "Aufbau erklärt"),
      jump({ "data-info": dtc.bestaetigt ? "begriff:gespeichert" : "begriff:vorlaeufig" }, dtc.bestaetigt ? "gespeichert?" : "vorläufig?"),
      dtc.aktiv ? jump({ "data-info": "begriff:aktiv" }, "aktiv?") : null,
      dtc.bekannt === false ? h("button", { class: "chip warn", type: "button", "data-info": "begriff:unbekannt" }, "keine Quelle, warum?") : null),
    wissenBox(c),
    casesBox(c),
    f ? h("div", { class: "box" }, h("h3", {}, "Freeze-Frame beim Auftreten"), ...f.werte.map((v) => h("div", { class: "mono" }, `${signalTitle(v.signal)}: ${num(v.wert)} ${v.einheit}`))) : null,
    hits.length ? h("div", { class: "box" }, h("h3", {}, "Fundstellen in Herstellerdokumenten"), ...hits.map((t) => jump({ "data-info": `dok:${t.datei}|${t.seite}` }, `${t.datei}, S. ${t.seite}`))) : null,
    canDelete ? h("button", { class: "btn dng", type: "button", onclick: () => startAction(kind === "obd" ? { typ: "obd_fehler_loeschen" } : { typ: "fehler_loeschen", modul: ecu.name }) },
      kind === "obd" ? "Alle OBD-Fehler löschen …" : `Fehler in ${ecu.name} löschen …`) : h("p", { class: "hint" }, "Löschen ist ausgeschaltet."),
  ];
}

function infoEcu(addr) {
  const e = state.ecus.find((x) => x.adresse === addr);
  if (!e) {
    const m = (state.status.module || []).find((x) => x.adresse === addr) || { name: addr };
    const silent = state.scanned;
    return [h("p", { class: "eyebrow" }, `Steuergerät · ${addr}`), h("h2", {}, m.name),
      h("p", { class: "lead" }, silent ? "Im Profil erwartet, hat beim Vollscan aber nicht geantwortet. Entweder nicht verbaut, auf einem anderen Bus oder ohne Zündung nicht erreichbar." : "Noch nicht gescannt. Starte den Vollscan, um Kennung und Fehler zu lesen."),
      facts([["Beschreibung", m.beschreibung], ["Quelle der Adresse", m.quelle || "nicht verifiziert"], ["Sicherheitskritisch", m.sicherheitskritisch ? "ja" : "nein"]]),
      h("button", { class: "btn pri", type: "button", onclick: () => { go("car"); emit("run-scan"); } }, silent ? "Vollscan wiederholen" : "Vollscan starten")];
  }
  return [
    h("p", { class: "eyebrow" }, `Steuergerät · ${e.adresse} · Antwort ${"0x" + (parseInt(e.adresse, 16) + 8).toString(16).toUpperCase()}`), h("h2", {}, e.name),
    h("p", { class: "lead" }, e.im_profil ? "Im Fahrzeugprofil hinterlegt." : "Neu entdeckt, noch nicht im Profil."),
    facts([["Systemname", e.kennung.system], ["Teilenummer", e.kennung.teilenummer], ["Seriennummer", e.kennung.seriennummer], ["Software", e.kennung.software], ["Fehler", e.fehler.length ? e.fehler.map((d) => d.code).join(", ") : "keine"]]),
    h("div", { class: "chips" }, jump({ "data-info": "begriff:adresse" }, "Adresse?"), jump({ "data-info": "begriff:did" }, "Kennungen?"), jump({ "data-info": "begriff:uds" }, "UDS?")),
    h("button", { class: "btn sec", type: "button", onclick: () => { go("check", { sub: "did" }); $("did-addr").value = e.adresse.slice(2); $("did-id").focus(); } }, "Eigene DID an diesem Steuergerät lesen"),
    e.fehler.length && state.status.schreiben_an ? h("button", { class: "btn dng", type: "button", onclick: () => startAction({ typ: "fehler_loeschen", modul: e.name }) }, `Fehler in ${e.name} löschen …`) : null,
  ];
}

function infoFunction(id) {
  const fn = state.functions.funktionen.find((f) => f.id === id);
  if (!fn) return [h("p", {}, "Unbekannte Funktion.")];
  const ok = state.functions.verfuegbar && state.status.schreiben_an;
  return [
    h("p", { class: "eyebrow" }, `Service-Funktion · ${fn.art}`), h("h2", {}, fn.name), h("p", { class: "lead" }, fn.beschreibung),
    facts([["Steuergerät", fn.modul], ["Befehl", fn.anfrage], ["Stopp", fn.stopp], ["Quelle", fn.quelle]]),
    h("div", { class: "box" }, h("h3", {}, fn.art), WISSEN.funktionsarten[fn.art] || ""),
    ok ? h("button", { class: "btn dng", type: "button", onclick: () => startAction({ typ: "funktion", funktion: fn.id }) }, "Ausführen …")
      : h("p", { class: "hint" }, state.functions.verfuegbar ? "Schreiben ist ausgeschaltet." : "Nur in der internen Version (eigene Autos)."),
  ];
}

const BELEG_ART = { messwert: "Messwert", freeze_frame: "Freeze-Frame", readiness: "Bereitschaftstest", fehlercode: "Fehlercode", dokument: "Dokument" };
export function belegSpec(b) {
  if (b.art === "messwert") return `signal:${b.bezug}`;
  if (b.art === "fehlercode" || b.art === "freeze_frame") return `dtc:${b.bezug}`;
  if (b.art === "readiness") return `test:${b.bezug}`;
  if (b.art === "dokument") return `dok:${b.bezug}`;
  return null;
}
function infoCause(i) {
  const u = state.ki.bewertung.ursachen[+i];
  if (!u) return [h("p", {}, "Nicht mehr vorhanden.")];
  const belege = u.belege || [];
  return [
    h("p", { class: "eyebrow" }, `Ursache · Wahrscheinlichkeit ${u.wahrscheinlichkeit}`), h("h2", {}, u.titel),
    h("div", { class: "chips" }, h("span", { class: `lvl ${u.sicherheit || "vermutung"}` }, u.sicherheit || "Vermutung"), ...u.codes.map((c) => jump({ "data-info": `dtc:${c}` }, c))),
    h("p", { class: "lead" }, u.begruendung),
    h("div", { class: "box" }, h("h3", {}, belege.length ? `${belege.length} Beleg${belege.length === 1 ? "" : "e"} aus den Daten` : "Kein Beleg aus den Daten"),
      belege.length ? h("div", { class: "list" }, ...belege.map((b) => h("button", { class: "tap row", type: "button", "data-info": belegSpec(b) || "begriff:belege" },
        mark("accent"), h("span", {}, h("div", { class: "t" }, b.text), h("div", { class: "d" }, `${BELEG_ART[b.art] || b.art} · ${b.bezug}`)), h("span"), h("span", { class: "chev" }, "›"))))
        : "Diese Ursache ist eine Vermutung aus Erfahrung, die Daten stützen sie nicht direkt. Erst die belegten Ursachen prüfen."),
    jump({ "data-info": "begriff:belege" }, "Wie entstehen Belege und Stufen?"),
  ];
}

export function openInfo(spec) {
  const [type, ...rest] = spec.split(":");
  const key = rest.join(":");
  let content = null;
  if (type === "signal") content = infoSignal(key);
  else if (type === "dtc") content = infoDtc(key);
  else if (type === "ecu") content = infoEcu(key);
  else if (type === "fn") content = infoFunction(key);
  else if (type === "ursache") content = infoCause(key);
  else if (type === "test") content = [h("p", { class: "eyebrow" }, "Bereitschaftstest"), h("h2", {}, key), h("p", { class: "lead" }, WISSEN.readiness[key] || "Kein Erklärtext hinterlegt."), jump({ "data-info": "begriff:readiness" }, "Was ist Readiness?")];
  else if (type === "dok") { const [datei, seite] = key.split("|"); content = [h("p", { class: "eyebrow" }, "Herstellerdokument"), h("h2", {}, datei), facts([["Seite", seite], ["Ablage", "rmi_dokumente/ (lokal)"]]), h("p", { class: "lead" }, "Die Fundstelle stammt aus dem lokalen Dokumentenindex. Öffne die Datei auf dieser Seite, um den Zusammenhang zu lesen."), h("button", { class: "btn sec", type: "button", onclick: () => { go("check", { sub: "rmi" }); $("rmi-q").value = datei.replace(/\.pdf$/i, ""); $("rmi-form").requestSubmit(); } }, "In der RMI-Suche zeigen")]; }
  else if (type === "geplant") { const [name, art] = key.split("|"); content = [h("p", { class: "eyebrow" }, "Geplant"), h("h2", {}, name), h("p", { class: "lead" }, "Diese Funktion ist bei jeder Marke anders aufgebaut. Sie kommt je Fahrzeugprofil, sobald der genaue Befehl aus RMI-Daten oder eigenem Mitschnitt mit Quelle vorliegt."), h("div", { class: "box" }, h("h3", {}, art), WISSEN.funktionsarten[art] || "")]; }
  else if (type === "einstellungen") { emit("open-settings"); return; }
  else if (type === "verlauf") { openHistoryEntry(key); return; }
  else if (type === "fahrzeug") { emit("open-vehicle", key); return; }
  else if (type === "begriff") {
    const b = WISSEN.begriffe[key] || (key === "vin" ? { titel: "Fahrgestellnummer (VIN)", text: "17 Zeichen, weltweit eindeutig. Die ersten drei (WMI) nennen den Hersteller. Wir zeigen sie nur maskiert und speichern sie verschlüsselt (HMAC), weil sie zusammen mit dem Halter personenbezogen ist." } : { titel: key, text: "Kein Erklärtext hinterlegt." });
    content = [h("p", { class: "eyebrow" }, "Erklärung"), h("h2", {}, b.titel), h("p", { class: "lead" }, b.text)];
  }
  if (content) openPane(content, spec);
}

export function initInfo() {
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-info]");
    if (!el || !el.getAttribute("data-info")) return;
    ev.preventDefault();
    openInfo(el.getAttribute("data-info"));
  });
  on("open-info", openInfo);
}
