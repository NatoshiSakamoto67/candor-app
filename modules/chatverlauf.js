/* Chat-Verlauf nach Vorbild XDAB-Chat: mehrere Unterhaltungen je Gerät, Titel aus der ersten Frage, nach Zeit gruppiert
   (Heute, Gestern, Letzte 7 Tage, Älter), Suche in Titeln und Texten, Umbenennen, Löschen. Jeder Chat merkt sich das
   Fahrzeug, zu dem er gehört. Speicher wird übergeben (Tests), im Browser localStorage über storageGet/storageSet. */
export const MAX_CHATS = 80, MAX_NACHRICHTEN = 60;

export function titelAus(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46).replace(/\s\S*$/, "")} …` : t || "Neuer Chat";
}
export function gruppe(ts, jetzt = Date.now()) {
  const tag = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const tage = Math.round((tag(jetzt) - tag(ts)) / 86400000);
  return tage <= 0 ? "Heute" : tage === 1 ? "Gestern" : tage < 7 ? "Letzte 7 Tage" : "Älter";
}
export const GRUPPEN = ["Heute", "Gestern", "Letzte 7 Tage", "Älter"];

/** Treffer in Titeln und Nachrichten, mit kurzem Ausschnitt um die Fundstelle */
export function suche(chats, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const c of chats) {
    if (c.titel.toLowerCase().includes(s)) { out.push({ id: c.id, titel: c.titel, ausschnitt: "" }); continue; }
    const m = (c.nachrichten || []).find((n) => String(n.text || "").toLowerCase().includes(s));
    if (m) {
      const t = String(m.text), i = t.toLowerCase().indexOf(s);
      out.push({ id: c.id, titel: c.titel, ausschnitt: `${i > 30 ? "…" : ""}${t.slice(Math.max(0, i - 30), i + s.length + 40).replace(/\s+/g, " ")}…` });
    }
  }
  return out;
}

export function verlauf(speicher) {
  const lesen = () => speicher.get("kfzdiag-chats", []);
  const schreiben = (l) => speicher.set("kfzdiag-chats", l.sort((a, b) => b.geaendert - a.geaendert).slice(0, MAX_CHATS));
  return {
    alle: lesen,
    aktiv: () => speicher.get("kfzdiag-chat-aktiv", null),
    setzeAktiv: (id) => speicher.set("kfzdiag-chat-aktiv", id),
    holen: (id) => lesen().find((c) => c.id === id) || null,
    neu(fz) {
      const jetzt = Date.now();
      const c = { id: `c${jetzt.toString(36)}${Math.random().toString(36).slice(2, 6)}`, titel: "Neuer Chat", fz: fz ? fz.id : null, fzName: fz ? fz.name : "",
        erstellt: jetzt, geaendert: jetzt, nachrichten: [] };
      schreiben([c, ...lesen()]); speicher.set("kfzdiag-chat-aktiv", c.id);
      return c;
    },
    setzeNachrichten(id, nachrichten) {
      const l = lesen(), c = l.find((x) => x.id === id);
      if (!c) return;
      c.nachrichten = nachrichten.slice(-MAX_NACHRICHTEN);
      if (c.titel === "Neuer Chat") { const erste = nachrichten.find((n) => n.rolle === "nutzer" && n.text); if (erste) c.titel = titelAus(erste.text); }
      c.geaendert = Date.now();
      schreiben(l);
    },
    umbenennen(id, titel) { const l = lesen(), c = l.find((x) => x.id === id); if (c && titel.trim()) { c.titel = titel.trim().slice(0, 120); schreiben(l); } },
    loeschen(id) { schreiben(lesen().filter((c) => c.id !== id)); if (speicher.get("kfzdiag-chat-aktiv", null) === id) speicher.set("kfzdiag-chat-aktiv", null); },
    /** Einmalig: alte Verläufe je Fahrzeug (kfzdiag-chat-<fahrzeug>) zu Chats machen */
    uebernehmen(alteSchluessel, fahrzeugName) {
      if (speicher.get("kfzdiag-chats-uebernommen", false)) return;
      const l = lesen();
      for (const k of alteSchluessel) {
        const n = speicher.get(k, []);
        if (!Array.isArray(n) || !n.length) continue;
        const fz = k.slice("kfzdiag-chat-".length), t = n[n.length - 1].zeit || Date.now();
        const erste = n.find((x) => x.rolle === "nutzer" && x.text);
        l.push({ id: `c${t.toString(36)}${fz.slice(0, 4)}`, titel: titelAus(erste && erste.text), fz: fz === "ohne" ? null : fz, fzName: fahrzeugName(fz), erstellt: n[0].zeit || t, geaendert: t, nachrichten: n.slice(-MAX_NACHRICHTEN) });
      }
      schreiben(l); speicher.set("kfzdiag-chats-uebernommen", true);
    },
  };
}
