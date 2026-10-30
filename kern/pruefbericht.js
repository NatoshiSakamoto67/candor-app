// @ts-check
/* Deterministischer Prüfbericht ohne DOM: dieselben Regeln (frontend/daten/pruefregeln.json) und dieselbe Logik wie
   kfzdiag/pruefbericht.py. Gleicher Eingang gibt denselben Hash, dieselbe Prüfnummer und dieselben Ergebnisse.
   Keine KI in pruefen(); die KI-Spur läuft nur über den Server. Getestet in tests/frontend/pruefbericht.test.mjs. */

/** @typedef {{ id: string, titel: string, bereich: string, eingang: string[], bedingung: Record<string, any>, ergebnis_wenn_wahr: "ok" | "hinweis" | "mangel", text: string, quelle: string }} Regel */
/** @typedef {"ok" | "hinweis" | "mangel" | "offen" | "entfaellt"} Ergebnis */
/** @typedef {{ id: string, titel: string, bereich: string, ergebnis: Ergebnis, text: string, werte: Record<string, unknown>, quelle: string }} RegelErgebnis */
/** @typedef {{ pruefnummer: string, hash: string, zeit: string, regeln: number, ergebnisse: RegelErgebnis[], zusammenfassung: Record<Ergebnis, number> }} Bericht */
/** @typedef {Record<string, any>} Eingang */
/** @typedef {{ signal: string, zustand: string, min: number, max: number }} Richtwert */

export const MOTOR_LAEUFT_AB = 100;
export const ERGEBNISSE = /** @type {Ergebnis[]} */ (["ok", "hinweis", "mangel", "offen", "entfaellt"]);
const GEHEIM_RE = /^(fin|vin|vin_maskiert|kennzeichen|zeit|at|auftrag)$/i;
const BEREICH_FEHLT = /** @type {Record<string, string>} */ ({ nachweis: "kein Ausgangsbefund (Nachher-Scan)", readiness: "keine Readiness-Abfrage", sollwerte: "kein Ist-Soll-Vergleich", fall: "kein Fall zu einem Code" });
const FEHLT = Symbol("fehlt");

/* ---------- Kanonische Darstellung und Hash ---------- */
/** @param {number} v */
function zahlNorm(v) {
  if (!Number.isFinite(v)) throw new Error("Zahl im Eingang ist nicht endlich.");
  const r = Math.round(v * 1e6) / 1e6;
  return Number.isInteger(r) ? Math.trunc(r) : r;
}
/** Schlüssel sortiert, Zahlen normiert, wie kanonisch() im Server. @param {unknown} v @returns {string} */
export function kanonisch(v) {
  if (v === null || v === undefined || typeof v === "boolean") return JSON.stringify(v ?? null);
  if (typeof v === "number") return JSON.stringify(zahlNorm(v));
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(kanonisch).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${kanonisch(/** @type {any} */ (v)[k])}`).join(",")}}`;
  throw new TypeError(`Wert vom Typ ${typeof v} gehört nicht in den Eingang.`);
}
/** Neuer Eingang ohne Zeit-, FIN- und Kennzeichenfelder, auf jeder Ebene. @param {unknown} v @returns {any} */
export function bereinigen(v) {
  if (Array.isArray(v)) return v.map(bereinigen);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !GEHEIM_RE.test(k)).map(([k, x]) => [k, bereinigen(x)]));
  return v;
}
/** @param {string} text */
async function sha256(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Bereinigter Eingang und SHA-256 über seine kanonische Darstellung. @param {Eingang} eingang */
export async function hashEingang(eingang) {
  const rein = bereinigen(eingang);
  return { rein, hash: await sha256(kanonisch(rein)) };
}

/* ---------- Bedingungen ---------- */
/** @param {Eingang} eingang @param {string} pfad @returns {any} */
function feld(eingang, pfad) {
  let aktuell = eingang;
  for (const teil of pfad.split(".")) {
    if (!aktuell || typeof aktuell !== "object" || !(teil in aktuell)) return FEHLT;
    aktuell = aktuell[teil];
  }
  return aktuell === null || aktuell === undefined ? FEHLT : aktuell;
}
/** @param {unknown} v @returns {v is number} */
const istZahl = (v) => typeof v === "number" && Number.isFinite(v);
/** @typedef {[boolean | null, string]} Urteil */
/** @param {string} op @param {number} a @param {number} b */
const vergleich = (op, a, b) => ({ ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b, "==": a === b, "!=": a !== b })[op];

/** @param {Record<string, any>} b @param {Eingang} eingang @returns {Urteil} */
function feldBedingung(b, eingang) {
  const wert = feld(eingang, b.feld), op = b.op;
  if (wert === FEHLT) return [null, BEREICH_FEHLT[b.feld.split(".")[0]] || `${b.feld} fehlt`];
  if (op === "wahr" || op === "falsch") return [Boolean(wert) === (op === "wahr"), ""];
  if (op === "leer" || op === "nicht_leer") {
    const leer = Array.isArray(wert) || typeof wert === "string" ? wert.length === 0 : typeof wert === "object" ? Object.keys(wert).length === 0 : wert === 0 || wert === false;
    return [leer === (op === "leer"), ""];
  }
  if (!istZahl(wert) || !istZahl(b.wert)) return [null, `${b.feld} ist keine Zahl`];
  return [/** @type {boolean} */ (vergleich(op, wert, b.wert)), ""];
}

/** @param {Record<string, any>} b @param {Eingang} eingang @returns {Urteil} */
function signalBedingung(b, eingang) {
  const live = eingang.live || {};
  const wert = live[b.signal], drehzahl = live.DREHZAHL;
  if (!istZahl(wert)) return [null, `${b.signal} ohne Messwert`];
  if ("zustand" in b) {
    if (!istZahl(drehzahl)) return [null, "Motorzustand unbekannt, keine Drehzahl"];
    const laeuft = drehzahl > MOTOR_LAEUFT_AB;
    if (laeuft !== (b.zustand === "motor_laeuft")) return [null, b.zustand === "motor_laeuft" ? "gilt erst bei laufendem Motor" : "gilt erst bei stehendem Motor"];
  }
  if ("unter" in b) return [wert < b.unter, ""];
  if ("ueber" in b) return [wert > b.ueber, ""];
  if ("ueber_gleich" in b) return [wert >= b.ueber_gleich, ""];
  if ("unter_gleich" in b) return [wert <= b.unter_gleich, ""];
  if ("ausserhalb" in b) return [wert < b.ausserhalb[0] || wert > b.ausserhalb[1], ""];
  return [b.innerhalb[0] <= wert && wert <= b.innerhalb[1], ""];
}

/** Wahr, falsch oder null (nicht prüfbar) mit Grund. alle: ein Falsch gewinnt vor Unbekannt; eine: ein Wahr.
 * @param {Record<string, any>} b @param {Eingang} eingang @returns {Urteil} */
export function bedingung(b, eingang) {
  if ("alle" in b || "eine" in b) {
    const gewinner = !("alle" in b);
    const teile = (b.alle || b.eine).map((/** @type {Record<string, any>} */ t) => bedingung(t, eingang));
    if (teile.some(([s]) => s === gewinner)) return [gewinner, ""];
    const offen = [...new Set(teile.filter(([s]) => s === null).map(([, g]) => g))];
    return offen.length ? [null, offen.join("; ")] : [!gewinner, ""];
  }
  return "feld" in b ? feldBedingung(b, eingang) : signalBedingung(b, eingang);
}

/* ---------- Texte ---------- */
/** Eine Nachkommastelle, kaufmännisch gerundet, Komma; ganze Zahlen ohne Nachkommastelle (wie zahl() im Server). @param {number} w */
export function zahl(w) {
  const r = Math.floor(w * 10 + 0.5) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}
/** @param {unknown} v @returns {string} */
export function wertText(v) {
  if (v === FEHLT || v === null || v === undefined) return "kein Wert";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (istZahl(v)) return zahl(v);
  if (Array.isArray(v)) return v.length ? v.map(wertText).join(", ") : "keine";
  return String(v);
}
/** @param {string} text @param {Eingang} eingang */
export const fuelle = (text, eingang) => text.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, p) => wertText(feld(eingang, p)));

/** @param {Regel} regel @param {Eingang} eingang @returns {RegelErgebnis} */
function ergebnisFuer(regel, eingang) {
  const [status, grund] = bedingung(regel.bedingung, eingang);
  const wennWahr = regel.ergebnis_wenn_wahr;
  /** @type {[Ergebnis, string]} */
  const [ergebnis, text] = status === null ? ["offen", `Nicht prüfbar: ${grund}.`] : status ? [wennWahr, fuelle(regel.text, eingang)]
    : wennWahr === "ok" ? ["entfaellt", "Nicht zutreffend."] : ["ok", "Geprüft, kein Befund."];
  const werte = Object.fromEntries((regel.eingang || []).map((f) => { const w = feld(eingang, f); return [f, w === FEHLT ? null : w]; }));
  return { id: regel.id, titel: regel.titel, bereich: regel.bereich, ergebnis, text, werte, quelle: regel.quelle };
}

/** Regelspur. Gleicher Eingang, gleiche Regeln: gleicher Hash, gleiche Ergebnisse. Die Zeit geht nicht in den Hash.
 * @param {Eingang} eingang @param {Regel[]} regeln @param {string} [zeit] ISO-Zeit, sonst jetzt @returns {Promise<Bericht>} */
export async function pruefen(eingang, regeln, zeit) {
  const { rein, hash } = await hashEingang(eingang);
  const zeitIso = zeit || lokaleIso(new Date());
  const ergebnisse = regeln.map((r) => ergebnisFuer(r, rein));
  const zusammenfassung = /** @type {Record<Ergebnis, number>} */ (Object.fromEntries(ERGEBNISSE.map((e) => [e, ergebnisse.filter((x) => x.ergebnis === e).length])));
  return { pruefnummer: `CD-${zeitIso.slice(0, 10).replace(/-/g, "")}-${hash.slice(0, 6)}`, hash, zeit: zeitIso, regeln: regeln.length, ergebnisse, zusammenfassung };
}
/** Lokale Zeit als ISO ohne Millisekunden, wie datetime.now().astimezone().isoformat(timespec="seconds"). @param {Date} d */
export function lokaleIso(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(), vz = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${vz}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/* ---------- Eingang aus dem Fahrzeugstand (Vorschau ohne Server) ---------- */
/** @typedef {{ code: string, wo: string, art: string, bekannt?: boolean, aktiv?: boolean }} Fehler */
/** @typedef {{ mil: boolean, anzahl_fehler: number, tests: { name: string, fertig: boolean }[] } | null | undefined} Readiness */
/** @typedef {{ ok: boolean, code: string, grund?: string, hypothesen?: { stufe: string, klartext: string, fehlt: { messung: string }[] }[] }} Fall */

/** Fehlerteil des Eingangs aus dem Befund (faultSet-Werte) plus OBD-Rohliste für aktiv und bekannt.
 * @param {Fehler[]} faults @param {{ code: string, aktiv?: boolean, bestaetigt?: boolean, bekannt?: boolean }[]} obdGespeichert */
export function fehlerEingang(faults, obdGespeichert) {
  const gesp = new Set(faults.filter((f) => f.art === "gespeichert").map((f) => f.code));
  const vorl = new Set(faults.filter((f) => f.art !== "gespeichert" && !gesp.has(f.code)).map((f) => f.code));
  const aktiv = new Set(obdGespeichert.filter((d) => d.aktiv && d.bestaetigt).map((d) => d.code));
  const unbekannt = new Set([...faults.filter((f) => f.bekannt === false), ...obdGespeichert.filter((d) => d.bekannt === false)].map((f) => f.code));
  const sortiert = (/** @type {Set<string>} */ s) => [...s].sort();
  return { gesamt: gesp.size + vorl.size, gespeichert: gesp.size, codes: sortiert(new Set([...gesp, ...vorl])), aktiv: aktiv.size, aktiv_codes: sortiert(aktiv),
    vorlaeufig: vorl.size, vorlaeufig_codes: sortiert(vorl), unbekannt: unbekannt.size, unbekannt_codes: sortiert(unbekannt) };
}
/** @param {Readiness} r */
export function readinessEingang(r) {
  if (!r) return { vorhanden: false };
  return { vorhanden: true, mil: Boolean(r.mil), anzahl_fehler: Number(r.anzahl_fehler || 0), offen: r.tests.filter((t) => !t.fertig).map((t) => t.name), gesamt: r.tests.length };
}
/** @param {{ vergleich: unknown[], abweichungen?: number, zustand?: string | null } | null | undefined} soll */
export const sollwerteEingang = (soll) => (soll && soll.vergleich.length ? { anzahl: soll.vergleich.length, abweichungen: Number(soll.abweichungen || 0), zustand: soll.zustand ?? null } : null);

/** Aus den Fällen der aktiven Codes: belegte Ursachen, offene Messungen, Codes ohne Pfad. @param {Fall[]} faelle */
export function fallEingang(faelle) {
  const belegt = new Set(), belegtText = [], ohnePfad = [];
  let offen = 0;
  for (const f of faelle) {
    if (!f.ok) { if (f.grund === "kein_pfad") ohnePfad.push(f.code); continue; }
    const hyps = f.hypothesen || [];
    offen += new Set(hyps.flatMap((h) => h.fehlt.map((e) => e.messung))).size;
    for (const h of hyps) if (h.stufe === "belegt") { belegt.add(f.code); belegtText.push(`${f.code}: ${h.klartext}`); }
  }
  return { codes: faelle.map((f) => f.code).filter(Boolean).sort(), belegt: [...belegt].sort(), belegt_text: belegtText.sort(), offene_messungen: offen, ohne_pfad: ohnePfad.sort() };
}

/** @param {Richtwert} w @param {Record<string, number>} werte */
function einordnung(w, werte) {
  const v = werte[w.signal];
  return istZahl(v) ? (v < w.min ? "unter" : v > w.max ? "ueber" : "im_bereich") : null;
}
/** Signale vorher außerhalb und nachher im Richtwertbereich, und solche weiter außerhalb. Nur bei laufendem Motor beidseitig.
 * @param {Record<string, number>} vorher @param {Record<string, number>} nachher @param {Richtwert[]} richtwerte */
export function normalisiert(vorher, nachher, richtwerte) {
  const aus = { normalisiert: /** @type {string[]} */ ([]), weiter_ausserhalb: /** @type {string[]} */ ([]) };
  for (const seite of [vorher, nachher]) if (!istZahl(seite.DREHZAHL) || seite.DREHZAHL <= MOTOR_LAEUFT_AB) return aus;
  for (const w of richtwerte.filter((x) => x.zustand === "leerlauf_warm")) {
    const v = einordnung(w, vorher), n = einordnung(w, nachher);
    if (v === null || v === "im_bereich" || n === null) continue;
    aus[n === "im_bereich" ? "normalisiert" : "weiter_ausserhalb"].push(`${w.signal} ${zahl(vorher[w.signal])} vorher, ${zahl(nachher[w.signal])} nachher`);
  }
  return aus;
}
/** @typedef {{ codes_vorher: string[], codes_nachher: string[], werte_vorher: Record<string, number>, werte_nachher: Record<string, number> }} Nachweis */
/** @param {Nachweis | null} n @param {Richtwert[]} richtwerte */
export function nachweisEingang(n, richtwerte) {
  if (!n) return { vorhanden: false };
  const vorher = new Set(n.codes_vorher), nachher = new Set(n.codes_nachher);
  const sortiert = (/** @type {Iterable<string>} */ s) => [...s].sort();
  return { vorhanden: true, weiter: sortiert([...vorher].filter((c) => nachher.has(c))), neu: sortiert([...nachher].filter((c) => !vorher.has(c))),
    behoben: sortiert([...vorher].filter((c) => !nachher.has(c))), ...normalisiert(n.werte_vorher || {}, n.werte_nachher || {}, richtwerte) };
}
