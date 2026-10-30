// @ts-check
/* Fernzugriff als reine Logik: Serveradresse prüfen, einordnen und daraus den SSH-Tunnel bauen. Der Diagnose-Server
   nimmt nur Verbindungen von 127.0.0.1 an (Host-Prüfung in kfzdiag/web.py), deshalb führt der Weg von unterwegs über
   VPN plus Tunnel auf localhost. CANdor öffnet selbst keinen Port; die Seite merkt sich nur die Adresse
   (localStorage kfzdiag-server-url) und warnt, wenn sie im offenen Internet liegt. */

/** Standard-Port des Diagnose-Servers (KFZDIAG_PORT, kfzdiag/config.py). */
export const STANDARD_PORT = 8420;

/** @typedef {"vpn"|"lokal"|"oeffentlich"} Netz */

/**
 * Netz einer Rechneradresse: Tailscale-Bereich 100.64.0.0/10 als VPN, private Bereiche und .local als lokal, sonst öffentlich.
 * Namen ohne Punkt (Rechnername im Heimnetz) und *.ts.net gelten als lokal beziehungsweise VPN.
 * @param {string} host
 * @returns {Netz}
 */
export function netzVon(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (h.endsWith(".ts.net")) return "vpn";
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".") && !h.includes(":")) return "lokal";
  if (h === "::1" || /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith("fe80:")) return "lokal";
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return "oeffentlich";
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 100 && b >= 64 && b <= 127) return "vpn";
  if (a === 10 || a === 127 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254) return "lokal";
  return "oeffentlich";
}

/**
 * Eingabe prüfen und auf die Herkunft (Schema, Rechner, Port) kürzen. Ohne Schema gilt http.
 * @param {string} text
 * @returns {{url: string, netz: Netz} | {fehler: string}}
 */
export function pruefeServerAdresse(text) {
  const t = String(text || "").trim();
  if (!t) return { fehler: "Bitte eine Adresse eingeben." };
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t}`); } catch (_) { return { fehler: "Das ist keine gültige Adresse. Beispiel: 100.64.0.12:8420" }; }
  if (!/^https?:$/.test(u.protocol)) return { fehler: "Nur http oder https." };
  if (u.username || u.password) return { fehler: "Bitte ohne Benutzername und Passwort in der Adresse." };
  return { url: u.origin, netz: netzVon(u.hostname) };
}

/** Kurzer Text zur Einordnung für die Seite. @param {Netz} netz */
export const netzText = (netz) => (netz === "vpn" ? "im VPN" : netz === "lokal" ? "im eigenen Netz" : "im offenen Internet");

/**
 * SSH-Tunnel vom Handy oder Laptop zum Server-Rechner: derselbe Port lokal, Ziel 127.0.0.1 auf dem Server.
 * @param {string} url geprüfte Adresse (Herkunft)
 * @param {string} [nutzer] Benutzer auf dem Server-Rechner
 * @returns {{befehl: string, lokal: string}}
 */
export function tunnel(url, nutzer = "") {
  const u = new URL(url);
  const port = Number(u.port) || STANDARD_PORT;
  const n = String(nutzer || "").trim();
  if (n && !/^[a-z_][a-z0-9._-]{0,31}$/i.test(n)) throw new Error("Ungültiger Benutzername.");
  return { befehl: `ssh -N -L ${port}:127.0.0.1:${port} ${n ? `${n}@` : ""}${u.hostname}`, lokal: `http://127.0.0.1:${port}` };
}
