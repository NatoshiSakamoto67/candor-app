// @ts-check
/* CAN-Werkbank: reine Funktionen für die Oberfläche (modules/werkbank.js), ohne DOM und ohne Speicher. */

export const MAX_DBC_BYTES = 2 * 1024 * 1024;

/** Letzter Wert je Signal aus den dekodierten Zeilen. @param {{ t: number, signale: Record<string, number> }[]} zeilen */
export function letzteWerte(zeilen) {
  /** @type {Map<string, { signal: string, wert: number, t: number, anzahl: number }>} */
  const je = new Map();
  for (const z of zeilen) for (const [signal, wert] of Object.entries(z.signale || {})) {
    const alt = je.get(signal);
    const anzahl = (alt ? alt.anzahl : 0) + 1;
    je.set(signal, !alt || z.t >= alt.t ? { signal, wert, t: z.t, anzahl } : { ...alt, anzahl });
  }
  return [...je.values()].sort((a, b) => a.signal.localeCompare(b.signal));
}

/** Funde des Erkunders nach Steuergerät, beides sortiert. @param {{ adresse: string, did: string }[]} funde */
export function nachSteuergeraet(funde) {
  /** @type {Map<string, any[]>} */
  const je = new Map();
  for (const f of funde) je.set(f.adresse, [...(je.get(f.adresse) || []), f]);
  return [...je.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([adresse, liste]) => ({ adresse, funde: [...liste].sort((x, y) => x.did.localeCompare(y.did)) }));
}

/** Fehlermeldung oder null. @param {{ name: string, size: number }} datei */
export function dbcDateiPruefen(datei) {
  if (!/\.dbc$/i.test(datei.name)) return "Bitte eine Datei mit der Endung .dbc wählen.";
  if (!datei.size) return "Die Datei ist leer.";
  if (datei.size > MAX_DBC_BYTES) return "Die Datei ist größer als 2 MB.";
  return null;
}

/** @param {Record<string, boolean>} liste @param {string} schluessel */
export const zustimmungAn = (liste, schluessel) => Boolean(liste && liste[schluessel]);
/** Neue Liste mit gesetzter oder entfernter Zustimmung. @param {Record<string, boolean>} liste @param {string} schluessel @param {boolean} an */
export function mitZustimmung(liste, schluessel, an) {
  const { [schluessel]: _weg, ...rest } = liste || {};
  return an ? { ...rest, [schluessel]: true } : rest;
}

/** Eingaben für »Bedeutung abgleichen«. @param {{ adresse: string, did: string, byte: string, anzahl: string }} e */
export function beobachtenEingabe(e) {
  const adresse = String(e.adresse || "").trim().toUpperCase(), did = String(e.did || "").trim().toUpperCase();
  const byte = Number(e.byte), anzahl = Number(e.anzahl);
  if (!/^7[0-9A-F]{2}$/.test(adresse) || parseInt(adresse, 16) > 0x7f7) return { ok: false, meldung: "Adresse 700 bis 7F7 eingeben." };
  if (!/^[0-9A-F]{4}$/.test(did)) return { ok: false, meldung: "Kennung vierstellig hexadezimal, etwa F18C." };
  if (did === "F190") return { ok: false, meldung: "Die FIN wird nicht beobachtet." };
  if (!Number.isInteger(byte) || byte < 0 || byte > 63) return { ok: false, meldung: "Byte 0 bis 63." };
  if (!Number.isInteger(anzahl) || anzahl < 60 || anzahl > 300) return { ok: false, meldung: "60 bis 300 Messpunkte, weniger ergibt keine Aussage." };
  return { ok: true, wert: { adresse, did, byte, anzahl } };
}

/**
 * @typedef {{ adresse: string, name: string, bus: string, airbag: boolean, kennungen: number, fehler: number | null,
 *   dids: number, dids_erweitert: number, geschuetzt: number, hinweis: string | null, status: string }} ErkundetesSg
 */
const anzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/** Ergebniszeile der Erkundung für ein Steuergerät. @param {ErkundetesSg} sg */
export function erkundungZeile(sg) {
  const titel = sg.name || sg.adresse;
  const unter = `${sg.adresse} · ${sg.bus}`;
  if (sg.status === "wartet") return { titel, unter, wert: "wartet", hinweis: "", ton: "" };
  const dids = sg.dids + sg.dids_erweitert;
  const teile = [
    anzahl(sg.kennungen, "Kennung", "Kennungen"),
    sg.fehler === null ? "Fehler nicht lesbar" : `${sg.fehler} Fehler`,
    sg.airbag ? "keine Bereichsabfrage" : anzahl(dids, "DID", "DIDs"),
  ];
  const extra = [sg.dids_erweitert ? `${anzahl(sg.dids_erweitert, "DID", "DIDs")} nur in der erweiterten Sitzung` : "",
    sg.geschuetzt ? `${sg.geschuetzt} geschützt` : ""].filter(Boolean).join(", ");
  return { titel, unter, wert: sg.status === "laeuft" ? `${teile.join(" · ")} …` : teile.join(" · "), hinweis: sg.hinweis || extra, ton: sg.hinweis ? "warn" : "" };
}

/** Läuft gerade eine Erkundung? @param {{ laeuft?: boolean } | null | undefined} stand */
export const erkundungLaeuft = (stand) => Boolean(stand && stand.laeuft);

/* ---------- Recherche-Agent (E2): Funde, Ergebnis, Stand ---------- */

/** Text der Status-Leiter (Bestandsaufnahme C.5). */
export const STATUS_TEXT = Object.freeze({ unbekannt: "unbekannt", beobachtet: "beobachtet", vermutet: "vermutet", plausibel: "plausibel",
  bestaetigt: "bestätigt", geprueft: "geprüft", freigegeben: "freigegeben" });

/** Abzeichen für einen Status. @param {string | undefined} status */
export function statusAbzeichen(status) {
  const s = status && Object.hasOwn(STATUS_TEXT, status) ? status : "unbekannt";
  return { text: STATUS_TEXT[/** @type {keyof typeof STATUS_TEXT} */ (s)], klasse: `wb-st st-${s}` };
}

/** Nur Links mit http oder https, alles andere fällt weg. @param {any} q */
const sichereQuelle = (q) => {
  try {
    const u = new URL(String(q && q.url));
    return u.protocol === "https:" || u.protocol === "http:" ? { url: u.href, titel: String((q && q.titel) || u.hostname) } : null;
  } catch { return null; }
};

/**
 * Letztes Rechercheergebnis eines Funds für die Anzeige oder null.
 * @param {{ belege?: any[] }} wert
 */
export function rechercheErgebnis(wert) {
  const b = [...((wert && wert.belege) || [])].reverse().find((x) => x && x.art === "recherche");
  if (!b) return null;
  const pruefung = b.pruefung || {};
  return {
    deutung: b.bedeutung || "unbekannt",
    formel: b.formel ? `${b.formel}${b.einheit ? ` · ${b.einheit}` : ""}` : "",
    sicherheit: b.sicherheit || "niedrig",
    pruefung: pruefung.hinweis || "",
    notiz: b.notiz || "",
    quellen: (b.quellen || []).map(sichereQuelle).filter(Boolean),
    verworfen: (b.verworfen || []).length,
    herkunft: b.websuche ? `Websuche, ${b.modell || "KI"}` : `aus Vorwissen, nicht im Netz geprüft (${b.modell || "KI"})`,
    ton: pruefung.passt === false ? "warn" : "",
  };
}

/**
 * DID-Funde eines Steuergeräts aus dem Fahrzeugwissen, nach DID sortiert.
 * @param {{ art: string, kennung: string, wert: any }[]} eintraege @param {string} adresse
 */
export function didFunde(eintraege, adresse) {
  return (eintraege || []).filter((e) => e.art === "did" && e.wert && e.wert.steuergeraet === adresse)
    .map((e) => ({ kennung: e.kennung, did: e.wert.did, roh: e.wert.roh || "", sitzung: e.wert.sitzung === "03" ? "Sitzung 03" : "Sitzung 01",
      status: e.wert.status || "unbekannt", ergebnis: rechercheErgebnis(e.wert) }))
    .sort((a, b) => a.kennung.localeCompare(b.kennung));
}

/** Läuft gerade eine Recherche? @param {{ laeuft?: boolean } | null | undefined} stand */
export const rechercheLaeuft = (stand) => Boolean(stand && stand.laeuft);

const tausender = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Kopfzeile des Recherche-Stands: Fortschritt, Token, geschätzte Kosten.
 * @param {{ laeuft: boolean, phase: string, meldung: string, funde: { status: string }[], eingabe_tokens?: number, ausgabe_tokens?: number, kosten_usd?: number | null, websuche?: boolean }} st
 */
export function rechercheKopf(st) {
  const fertig = st.funde.filter((f) => f.status !== "wartet" && f.status !== "laeuft").length;
  const token = (st.eingabe_tokens || 0) + (st.ausgabe_tokens || 0);
  const kosten = typeof st.kosten_usd === "number" ? `, ca. ${st.kosten_usd.toFixed(2).replace(".", ",")} USD` : "";
  return {
    titel: st.laeuft ? `Recherche läuft: ${fertig} von ${st.funde.length}` : st.phase === "fertig" ? "Recherche fertig" : "Recherche abgebrochen",
    unter: `${st.meldung || ""}${st.meldung ? " " : ""}${tausender(token)} Token${kosten}${st.websuche === false ? ", ohne Websuche" : ""}`.trim(),
    ton: st.phase === "abgebrochen" ? "warn" : "",
  };
}

/** Status je Fund im laufenden Lauf (wartet, laeuft, fertig, fehler). @param {{ funde: { kennung: string, status: string, meldung?: string | null }[] } | null} st */
export const rechercheJeFund = (st) => new Map(((st && st.funde) || []).map((f) => [f.kennung, f]));

/* ---------- Status-Leiter (E3): eigene Funde, Verlauf, Knöpfe, eigene Signale in Live ---------- */
const LEITER = ["unbekannt", "beobachtet", "vermutet", "plausibel", "bestaetigt", "geprueft", "freigegeben"];
/** @param {string | undefined} s */
const rangVon = (s) => Math.max(0, LEITER.indexOf(String(s)));
const statusText = (s) => statusAbzeichen(s).text;

/** Jüngste Deutung mit Formel. @param {any} wert */
function deutungVon(wert) {
  const b = [...((wert && wert.belege) || [])].reverse().find((x) => x && x.formel);
  return b ? { deutung: String(b.bedeutung || "ohne Deutung"), formel: `${b.formel}${b.einheit ? ` · ${b.einheit}` : ""}` } : { deutung: "ohne Deutung", formel: "" };
}

/**
 * Funde ab »vermutet« für die Status-Leiter, höchster Status zuerst.
 * @param {{ art: string, kennung: string, wert: any }[]} eintraege
 */
export function eigeneFunde(eintraege) {
  return (eintraege || []).filter((e) => e.art === "did" && e.wert && rangVon(e.wert.status) >= rangVon("vermutet"))
    .map((e) => ({ kennung: e.kennung, titel: `${e.wert.steuergeraet} · ${e.wert.did}`, status: e.wert.status, widerspruch: Boolean(e.wert.widerspruch),
      sitzung: e.wert.sitzung, ...deutungVon(e.wert), verlauf: verlaufZeilen(e.wert),
      fahrten: ((e.wert.validierung && e.wert.validierung.fahrten) || []).length }))
    .sort((a, b) => rangVon(b.status) - rangVon(a.status) || a.kennung.localeCompare(b.kennung));
}

const DURCH = { mensch: "von Hand", validierung: "Validierung", recherche: "Recherche", erkundung: "Erkundung" };
/** »2026-10-30T11:05:00« als »30.10.2026, 11:05«. @param {string} iso */
const zeitText = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}` : "";
};

/** Verlauf eines Funds, neueste Änderung zuerst. @param {{ verlauf?: any[] }} wert */
export function verlaufZeilen(wert) {
  return [...((wert && wert.verlauf) || [])].reverse().map((v) => ({
    titel: v.von === v.nach ? `Vermerk (${statusText(v.nach)})` : `${statusText(v.von)} → ${statusText(v.nach)}`,
    unter: [zeitText(v.zeit), DURCH[/** @type {keyof typeof DURCH} */ (v.durch)] || String(v.durch || "")].filter(Boolean).join(" · "),
    grund: String(v.grund || ""), beleg: v.beleg ? String(v.beleg) : "",
  }));
}

/** Knöpfe, die ein Mensch bei diesem Status hat (mit Beleg und Bestätigung). @param {string} status */
export function statusKnoepfe(status) {
  const r = rangVon(status);
  /** @type {{ ziel: string, text: string, ton: string }[]} */
  const k = [];
  if (r >= rangVon("vermutet") && r < rangVon("geprueft")) k.push({ ziel: "geprueft", text: "Als geprüft markieren", ton: "blau" });
  if (status === "geprueft") k.push({ ziel: "freigegeben", text: "Freigeben", ton: "gruen" });
  if (r > rangVon("vermutet")) k.push({ ziel: "herabstufen", text: "Herabstufen", ton: "rot" });
  return k;
}

/** @param {{ signal?: string, eigen?: boolean }} v */
export const istEigenesSignal = (v) => Boolean(v && v.eigen && String(v.signal || "").startsWith("eigen:"));

/** Zeile für ein eigenes Signal in den Live-Werten. @param {any} v */
export function eigenesSignal(v) {
  const [, sg = "", did = ""] = String(v.signal).split(":");
  return {
    titel: v.beschreibung || `${sg} ${did}`, abzeichen: statusAbzeichen(v.status),
    unter: `${sg} · ${did} · ${v.hinweis || "eigene Deutung"}${v.qualitaet && v.qualitaet !== "ok" ? ` · ${v.qualitaet}` : ""}`,
    ton: v.qualitaet === "unplausibel" || v.qualitaet === "ausserhalb" ? "warn" : "",
  };
}
