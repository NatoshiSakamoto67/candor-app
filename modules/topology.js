/* Topologie ohne DOM: Funktionsdomäne je Steuergerät (Schlüsselwörter aus topologie/platzierung.md)
   und feste Sortierung nach Adresse. Das Fahrzeugbild zeigt je Domäne eine Markierung, die Geräte selbst die Liste. */

/* Reihenfolge ist Regel: Netzwerk zuerst, erster Treffer gewinnt. Kurze Schlüssel nur als ganzes Wort. */
export const DOMAINS = [
  { id: "netzwerk", name: "Netzwerk", keys: ["gateway", "diagnose", "=bus"] },
  { id: "rueckhalte", name: "Rückhalte", keys: ["airbag", "rückhalt", "gurtstraffer"] },
  { id: "fahrwerk", name: "Fahrwerk", keys: ["=abs", "=esp", "lenkung", "federung", "niveau", "bremse"] },
  { id: "antrieb", name: "Antrieb", keys: ["motor", "getriebe", "hochvolt", "batteriemanagement", "lader", "inverter"] },
  { id: "assistenz", name: "Assistenz", keys: ["einparkhilfe", "kamera", "radar", "spurhalte", "abstand"] },
  { id: "anzeige", name: "Anzeige und Bedienung", keys: ["kombiinstrument", "infotainment", "display", "bedienteil"] },
  { id: "karosserie", name: "Karosserie und Komfort", keys: ["karosserie", "=bcm", "tür", "sitz", "klima", "licht", "dach"] },
];
export const UNASSIGNED = { id: "unzugeordnet", name: "Unzugeordnet" };
export const ZONE_ORDER = [...DOMAINS.map((d) => d.id), UNASSIGNED.id];
export const domainName = (id) => (DOMAINS.find((d) => d.id === id) || UNASSIGNED).name;

const LETTER = "a-z0-9äöüß";
const matches = (text, key) => key.startsWith("=")
  ? new RegExp(`(^|[^${LETTER}])${key.slice(1)}($|[^${LETTER}])`).test(text)
  : text.includes(key);

/** Systemname aus DID F197, sonst Profilname. */
export const systemName = (ecu) => ((ecu.kennung && ecu.kennung.system) || ecu.name || "").trim();

export function domainOf(ecu) {
  const text = systemName(ecu).toLowerCase();
  if (!text) return UNASSIGNED.id;
  const hit = DOMAINS.find((d) => d.keys.some((k) => matches(text, k)));
  return hit ? hit.id : UNASSIGNED.id;
}

const addr = (ecu) => parseInt(String(ecu.adresse || "").replace(/^0x/i, ""), 16) || 0;
export const byAddress = (a, b) => addr(a) - addr(b) || String(a.adresse).localeCompare(String(b.adresse));
