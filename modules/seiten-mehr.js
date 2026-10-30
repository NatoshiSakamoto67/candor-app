/* Weitere Unterseiten im Apple-Stil (aus seiten.js ausgelagert): Pannenhilfe, Töne & Haptik, Papiere, Fernzugriff,
   dazu die Kamera-Aktion (Foto an den Assistenten). Bausteine aus bausteine-seiten.js; neu zeichnen über render(). */
import { $, h, numFix, storageGet, storageSet, toast, clockTime } from "./dom.js";
import { state, on, emit, faultSet } from "./state.js";
import { go, currentRoute } from "./shell.js";
import { FARBE, bordnetzTon } from "../kern/einstellungs-baum.js";
import { dashboardTon } from "../kern/dashboard-ton.js";
import { ablage, indexedDbSpeicher, arbeitsspeicher, ARTEN, artLabel, groesseText, MAX_BYTES } from "../kern/papiere.js";
import { hatPfad } from "./fall.js";
import { workshop } from "./werkstatt.js";
import { toneinstellung, setzeToneinstellung, setzeEreignis, tonSpielen, TONARTEN } from "./toene.js";
import { RUFNUMMERN, telHref, standortText } from "../kern/panne.js";
import { pruefeServerAdresse, netzText, tunnel } from "../kern/fernzugriff.js";
import { kopf, zeile, gruppe, zahlen } from "./bausteine-seiten.js";

const SERVER_KEY = "kfzdiag-server-url";
const v = (sig) => { const x = (state.live || {})[sig]; return x && typeof x.wert === "number" ? x.wert : null; };
const motorLaeuft = () => (v("DREHZAHL") || 0) > 100;
const verbunden = () => Boolean(state.status);
const datumText = (iso) => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); };

/* ---------- Pannenhilfe: Haken und Standort gelten nur für diese Sitzung ---------- */
let checkliste = {}, standort = null;
function standortHolen(render) {
  if (!navigator.geolocation) { toast("Dieses Gerät kennt seinen Standort nicht."); return; }
  toast("Standort wird bestimmt …");
  navigator.geolocation.getCurrentPosition(
    (p) => { standort = { lat: p.coords.latitude, lon: p.coords.longitude, genau: Math.round(p.coords.accuracy), zeit: new Date() }; render(true); },
    (err) => toast(err.code === 1 ? "Standort nicht erlaubt. In der Adressleiste oder den Einstellungen freigeben." : `Standort nicht bestimmbar: ${err.message}`),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
async function standortTeilen() {
  const text = standortText(standort, clockTime);
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast("Standort in die Zwischenablage kopiert."); }
  } catch (err) { if (err.name !== "AbortError") toast(`Teilen ging nicht: ${err.message}`); }
}

/* ---------- Papiere: IndexedDB, im Notfall Arbeitsspeicher (dann nur bis zum Neuladen) ---------- */
let papiere = null, loeschFrage = null, urls = [];
function papierAblage() {
  if (papiere) return papiere;
  if (typeof indexedDB === "undefined") { toast("Dieser Browser hat keine Ablage. Papiere bleiben nur bis zum Neuladen."); papiere = ablage(arbeitsspeicher()); }
  else papiere = ablage(indexedDbSpeicher());
  return papiere;
}
function urlFuer(blob) { const u = URL.createObjectURL(blob); urls = [...urls, u]; return u; }
function urlsFreigeben() { for (const u of urls) URL.revokeObjectURL(u); urls = []; }
function papierOeffnen(p) {
  const u = urlFuer(p.daten);
  const w = window.open(u, "_blank", "noopener");
  if (!w) toast("Der Browser hat das Öffnen blockiert. Pop-ups für CANdor erlauben.");
}
function papierZeile(p, render) {
  const vorschau = p.bild ? h("img", { class: "sk-pp-bild", src: urlFuer(p.daten), alt: "", width: 44, height: 44 }) : h("span", { class: "sk-pp-pdf", "aria-hidden": "true" }, "PDF");
  const offen = h("button", { class: "li-row sk-row sk-pp", type: "button", onclick: () => papierOeffnen(p) }, vorschau,
    h("span", { class: "li-t" }, p.titel, h("span", { class: "li-unter" }, `${artLabel(p.art)} · ${datumText(p.datum)} · ${groesseText(p.groesse)}`)), h("span", { class: "li-chev", "aria-hidden": "true" }, "›"));
  const frage = loeschFrage === p.id;
  const unten = frage
    ? [zeile({ typ: "aktion", ton: "rot", label: `»${p.titel}« wirklich löschen`, tun: async () => { try { await papierAblage().loeschen(p.id); loeschFrage = null; toast("Papier gelöscht."); render(true); } catch (err) { toast(`Löschen ging nicht: ${err.message}`); } } }),
      zeile({ typ: "aktion", label: "Behalten", tun: () => { loeschFrage = null; render(true); } })]
    : [zeile({ typ: "aktion", ton: "rot", label: "Löschen", tun: () => { loeschFrage = p.id; render(true); } })];
  return h("section", { class: "sk-block" }, h("div", { class: "li-gruppe" }, offen, ...unten));
}
async function papiereLaden(box, render) {
  try {
    const l = await papierAblage().liste();
    let frei = null;
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate().catch(() => null); if (e && e.quota) frei = e.quota - (e.usage || 0); }
    urlsFreigeben();
    box.replaceChildren(
      zahlen([["Papiere", String(l.anzahl)], ["Belegt", groesseText(l.summe)]], frei != null ? `Auf dem Gerät sind noch etwa ${groesseText(frei)} frei.` : null),
      ...(l.papiere.length ? l.papiere.map((p) => papierZeile(p, render)) : [gruppe({ zeilen: [{ label: "Noch keine Papiere", unter: "Oben eine Datei wählen" }] })]));
  } catch (err) { box.replaceChildren(gruppe({ zeilen: [{ label: "Ablage nicht lesbar", unter: err.message }] })); }
}
function papierFormular(render) {
  const art = h("select", { class: "inp sk-select", "aria-label": "Art" }, ...ARTEN.map((a) => h("option", { value: a.id }, a.label)));
  const titel = h("input", { class: "inp", type: "text", placeholder: "Rechnung Bremsen", maxlength: 120, "aria-label": "Titel" });
  const datum = h("input", { class: "inp", type: "date", value: new Date().toISOString().slice(0, 10), "aria-label": "Datum" });
  const datei = h("input", { type: "file", accept: "image/*,application/pdf", hidden: true });
  datei.addEventListener("change", async () => {
    const f = datei.files && datei.files[0];
    datei.value = "";
    if (!f) return;
    try {
      const p = await papierAblage().anlegen({ art: art.value, titel: titel.value, datum: datum.value, datei: { name: f.name, type: f.type, size: f.size }, daten: f });
      titel.value = ""; toast(`»${p.titel}« abgelegt.`); render(true);
    } catch (err) { toast(err.message); }
  });
  return h("section", { class: "sk-block" }, h("h3", { class: "li-k" }, "Neues Papier"),
    h("div", { class: "li-gruppe sk-form" }, h("label", { class: "sk-feld" }, h("span", {}, "Art"), art), h("label", { class: "sk-feld" }, h("span", {}, "Titel"), titel), h("label", { class: "sk-feld" }, h("span", {}, "Datum"), datum),
      zeile({ typ: "aktion", label: "Datei wählen …", tun: () => datei.click() }), datei),
    h("p", { class: "li-fuss" }, `Bild oder PDF bis ${groesseText(MAX_BYTES)}. Papiere bleiben auf diesem Gerät und gehen nie an die KI oder den Server.`));
}

export function seitenMehr(render) {
  return {
    panne() {
      const ws = workshop(), fehler = verbunden() ? [...faultSet().values()] : [], sp = v("SPANNUNG"), kt = v("KUEHLMITTEL");
      const s = (id, label, unter) => ({ typ: "schalter", label, unter, an: Boolean(checkliste[id]), setze: (x) => { checkliste = { ...checkliste, [id]: x }; } });
      const tel = (label, nummer, unter) => ({ label, unter, wert: nummer, mono: true, href: telHref(nummer) });
      return [
        kopf({ icon: "sos", farbe: FARBE.rot, titel: "Pannenhilfe", text: "Erst sichern, dann schauen, dann anrufen. Die Hilfe hier geht auch ohne Verbindung zum Auto." }),
        gruppe({ titel: "Jetzt", zeilen: [s("blinker", "Warnblinker an"), s("weste", "Warnweste anziehen", "vor dem Aussteigen"), s("dreieck", "Warndreieck aufstellen", "100 m hinter dem Auto, auf der Autobahn 200 m"), s("leitplanke", "Alle hinter die Leitplanke", "nie im Auto sitzen bleiben")],
          fuss: "Die Haken gelten nur für diese Sitzung." }),
        gruppe({ titel: "Zustand des Autos", zeilen: verbunden() ? [
          { label: "Bordspannung", wert: sp == null ? "–" : `${numFix(sp, 2)} V`, ton: bordnetzTon(sp, motorLaeuft()) },
          { label: "Kühlmittel", wert: kt == null ? "–" : `${numFix(kt, 0)} °C`, ton: dashboardTon("KUEHLMITTEL", kt, motorLaeuft()) === "ok" ? null : dashboardTon("KUEHLMITTEL", kt, motorLaeuft()) },
          ...(fehler.length ? fehler.slice(0, 8).map((f) => ({ label: f.code, unter: f.beschreibung || f.wo, mono: false, ton: f.art === "gespeichert" ? "crit" : "warn", wert: f.art,
            ziel: () => (hatPfad(f.code) ? go("fall", { sub: f.code }) : emit("open-info", `dtc:${f.code}`)) })) : [{ label: "Keine Fehler gespeichert", mark: "ok" }]),
        ] : [{ label: "Kein Fahrzeug verbunden", unter: "Die Hilfe unten geht auch so", ziel: () => go("connect") }],
          fuss: verbunden() ? "Tippe einen Fehler für den Fall oder das Infoblatt." : null }),
        gruppe({ titel: "Anrufen", zeilen: [...RUFNUMMERN.map((r) => tel(r.label, r.nummer, r.unter)),
          ws && ws.telefon && telHref(ws.telefon) ? tel(ws.name || "Meine Werkstatt", ws.telefon, ws.name ? "Meine Werkstatt" : "Werkstatt") : { label: "Eigene Werkstatt", unter: "Telefon in den Werkstattdaten hinterlegen", ziel: () => go("werkstatt") }],
          fuss: "Aus dem Mobilfunk kostet die ADAC-Nummer höchstens 42 Cent je Minute. ADAC und ACE helfen Mitgliedern kostenlos, sonst gegen Rechnung." }),
        gruppe({ titel: "Standort teilen", zeilen: [
          { typ: "aktion", label: standort ? "Standort neu bestimmen" : "Standort bestimmen", tun: () => standortHolen(render) },
          standort ? { label: `${standort.lat.toFixed(5)}, ${standort.lon.toFixed(5)}`, unter: `etwa ${standort.genau} m genau, ${clockTime(standort.zeit)} Uhr`, mono: true } : null,
          standort ? { typ: "aktion", label: "Standort teilen", tun: standortTeilen } : null],
          fuss: "Der Standort kommt einmalig vom Gerät, wird nicht gespeichert und geht nur dorthin, wohin du ihn teilst." }),
      ];
    },
    toene() {
      const e = toneinstellung(), kann = typeof navigator.vibrate === "function";
      const w = (id, label) => ({ typ: "wahl", label, an: e.lautstaerke === id, setze: () => { setzeToneinstellung("lautstaerke", id); tonSpielen("klick"); render(true); } });
      const vorschau = (art) => { const r = tonSpielen(art, { vorschau: true }); if (!r.ton && !r.vibration) toast(e.an || e.vibration ? "Dieser Browser kann keine Töne oder Vibration." : "Töne und Vibration sind aus."); };
      const ereignis = ([id, a]) => ({ typ: "schalter", label: a.label, unter: a.kurz, an: e.ereignisse[id], setze: (x) => { setzeEreignis(id, x); if (x) vorschau(id); render(true); } });
      return [
        kopf({ icon: "ton", farbe: FARBE.pink, titel: "Töne & Haptik", text: "Kurze Töne und Vibration, wenn am Auto etwas passiert. Alles entsteht auf dem Gerät, nichts wird geladen." }),
        gruppe({ zeilen: [{ typ: "schalter", label: "Töne", an: e.an, setze: (x) => { setzeToneinstellung("an", x); render(true); } },
          { typ: "schalter", label: "Vibration", unter: kann ? null : "Dieses Gerät kann nicht vibrieren", an: e.vibration, setze: (x) => { setzeToneinstellung("vibration", x); render(true); } }] }),
        e.an ? gruppe({ titel: "Lautstärke", zeilen: [w("leise", "Leise"), w("normal", "Normal"), w("laut", "Laut")], fuss: "Im Auto mit laufendem Motor ist »Laut« meist richtig." }) : null,
        gruppe({ titel: "Wann CANdor sich meldet", zeilen: Object.entries(TONARTEN).map(ereignis), fuss: "Einschalten spielt den Ton einmal vor. Ein neuer Fehler meldet sich erst ab dem zweiten Lesen, eine Wertgrenze nur beim Wechsel nach Rot." }),
        gruppe({ titel: "Vorschau", zeilen: Object.entries(TONARTEN).map(([id, a]) => ({ typ: "aktion", label: `${a.kurz} anhören`, tun: () => vorschau(id) })), fuss: "Spielt den Ton mit der gewählten Lautstärke, auch wenn das Ereignis aus ist." }),
      ];
    },
    papiere() {
      const box = h("div", { class: "sk-papiere" }, gruppe({ zeilen: [{ label: "Ablage wird gelesen …" }] }));
      papiereLaden(box, render);
      return [
        kopf({ icon: "karte", farbe: FARBE.dunkel, titel: "Papiere", text: "Fahrzeugschein, Rechnungen und Prüfberichte zum Fahrzeug. Papiere bleiben auf diesem Gerät und gehen nie an die KI." }),
        papierFormular(render),
        box,
      ];
    },
    fernzugriff() {
      const url = storageGet(SERVER_KEY, "") || "", gemerkt = url ? pruefeServerAdresse(url) : null, t = gemerkt && gemerkt.url ? tunnel(gemerkt.url) : null;
      const feld = h("input", { class: "inp", type: "text", inputmode: "url", placeholder: "100.64.0.12:8420", value: url, "aria-label": "Serveradresse im VPN", autocomplete: "off", spellcheck: "false", id: "sk-server-url" });
      const speichern = () => {
        const text = feld.value.trim();
        if (!text) { storageSet(SERVER_KEY, ""); toast("Adresse entfernt."); render(true); return; }
        const r = pruefeServerAdresse(text);
        if (r.fehler) { toast(r.fehler); return; }
        storageSet(SERVER_KEY, r.url); toast(r.netz === "oeffentlich" ? "Gespeichert. Achtung: Die Adresse liegt im offenen Internet." : "Adresse gespeichert."); render(true);
      };
      const kopieren = async () => { try { await navigator.clipboard.writeText(t.befehl); toast("Befehl kopiert."); } catch (err) { toast(`Kopieren ging nicht: ${err.message}`); } };
      feld.addEventListener("keydown", (ev) => { if (ev.key === "Enter") speichern(); });
      return [
        kopf({ icon: "globus", farbe: FARBE.blau, titel: "Fernzugriff", text: "Der Diagnose-Server nimmt nur Verbindungen vom eigenen Rechner an. Von unterwegs kommst du über dein VPN und einen SSH-Tunnel hin, nie offen über das Internet." }),
        gruppe({ titel: "So geht es", zeilen: [
          { label: "1. VPN einrichten", unter: "Tailscale oder WireGuard auf dem Server-Rechner und auf Handy oder Laptop. Beide sind dann im selben privaten Netz." },
          { label: "2. SSH auf dem Server-Rechner erlauben", unter: "Am Mac unter Systemeinstellungen, Allgemein, Teilen: Entfernte Anmeldung. Nur für deinen Benutzer." },
          { label: "3. Tunnel öffnen", unter: "Mit dem Befehl unten im Terminal, am Handy mit einer SSH-App, die Portweiterleitung kann." },
          { label: "4. CANdor lokal öffnen", unter: "Die Adresse 127.0.0.1 mit dem Port im Browser auf diesem Gerät. Adapter und Auto hängen weiter am Server-Rechner." }] }),
        h("section", { class: "sk-block" }, h("h3", { class: "li-k" }, "Server im VPN"),
          h("div", { class: "li-gruppe sk-form" }, h("label", { class: "sk-feld" }, h("span", {}, "Adresse"), feld), zeile({ typ: "aktion", label: "Speichern", tun: speichern })),
          h("p", { class: "li-fuss" }, "VPN-Adresse des Server-Rechners mit Port, nur auf diesem Gerät gemerkt. Einen Schalter, der den Server von außen öffnet, gibt es absichtlich nicht.")),
        t ? gruppe({ titel: "Tunnel", zeilen: [
          gemerkt.netz ? { label: "Die Adresse liegt", wert: netzText(gemerkt.netz), ton: gemerkt.netz === "oeffentlich" ? "crit" : null, mark: gemerkt.netz === "oeffentlich" ? "crit" : "ok" } : null,
          { label: "Befehl", unter: t.befehl },
          { typ: "aktion", label: "Befehl kopieren", tun: kopieren },
          { label: "Danach öffnen", unter: t.lokal, href: t.lokal }],
          fuss: gemerkt.netz === "oeffentlich" ? "Eine Adresse im offenen Internet heißt meist: der Port ist freigegeben. Bitte schließen und über VPN gehen." : "Heißt dein Benutzer auf dem Server-Rechner anders als hier, schreib ihn mit @ vor die Adresse." }) : null,
        gruppe({ titel: "Sicherheit", zeilen: [
          { label: "Port nie ins Internet freigeben", unter: "Keine Portfreigabe am Router, kein öffentlicher Proxy. Wer den Server erreicht, sieht Fahrzeugdaten und kann Freigaben anfordern.", mark: "crit" },
          { label: "Nur über VPN und Tunnel", unter: "Der Server selbst lauscht nur auf 127.0.0.1.", mark: "ok" }] }),
        gruppe({ zeilen: [{ label: "Datenschutz & Sicherheit", ziel: () => go("handbuch", { sub: "datenschutz" }) }] }),
      ];
    },
  };
}

/* Kamera: kein eigener Bildschirm. Die Listenzeile führt zum KI-Assistenten (#agent/kamera), dort öffnet sich die Kamera. */
export function initSeitenMehr() {
  on("tab", (id) => {
    if (id === "agent" && currentRoute().sub === "kamera") {
      requestAnimationFrame(() => { const k = $("cx-camera"); if (k) k.click(); toast("Kennzeichen und FIN auf Fotos erkennt CANdor nicht, bitte nicht mit fotografieren."); });
    }
    if (id !== "seite") { urlsFreigeben(); loeschFrage = null; }
  });
}
