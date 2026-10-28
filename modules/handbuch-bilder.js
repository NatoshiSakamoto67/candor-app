/* Systembilder fürs Handbuch: senkrechte Abläufe, 360 Einheiten breit, damit sie auf dem Handy lesbar bleiben.
   Knoten: { id, x, y, w, h, t, sub, tone, group }. Kanten: [von, nach, Beschriftung]; senkrecht von unten nach oben,
   bei gleicher Höhe waagerecht. Farben nur über Klassen aus handbuch.css. */
import { s } from "./dom.js";

let seq = 0;
const center = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

function edge(a, b, label, mid) {
  const sameRow = Math.abs(center(a).y - center(b).y) < 4;
  const [x1, y1, x2, y2] = sameRow
    ? (a.x < b.x ? [a.x + a.w, center(a).y, b.x, center(b).y] : [a.x, center(a).y, b.x + b.w, center(b).y])
    : [center(a).x, a.y + a.h, center(b).x, b.y];
  return s("g", { class: "dg-edge" },
    s("line", { x1, y1, x2, y2: sameRow ? y2 : y2 - 2, "marker-end": `url(#${mid})` }),
    label ? s("text", { class: "dg-el", x: sameRow ? (x1 + x2) / 2 : x1 + 8, y: sameRow ? y1 - 6 : (y1 + y2) / 2 + 4, "text-anchor": sameRow ? "middle" : "start" }, label) : null);
}

function node(n) {
  if (n.group) return s("g", { class: "dg-group" }, s("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 14 }));
  const lines = [n.t, n.sub].filter(Boolean);
  const top = center(n).y - (lines.length - 1) * 8 + 4;
  return s("g", { class: `dg-node t-${n.tone || "neutral"}` }, s("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 10 }),
    s("text", { class: "dg-t", x: center(n).x, y: top, "text-anchor": "middle" }, n.t),
    n.sub ? s("text", { class: "dg-s", x: center(n).x, y: top + 16, "text-anchor": "middle" }, n.sub) : null);
}

function diagram(title, height, nodes, edges) {
  const mid = `dgm${++seq}`;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return s("svg", { class: "dg", viewBox: `0 0 360 ${height}`, role: "img", "aria-label": title },
    s("defs", {}, s("marker", { id: mid, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0 0L10 5L0 10z", class: "dg-arrow" }))),
    ...nodes.filter((n) => n.group).map(node),
    ...edges.map(([a, b, label]) => edge(byId[a], byId[b], label, mid)),
    /* Gruppentitel nach den Pfeilen, mit Hintergrund-Kontur, damit keine Linie durch die Schrift läuft */
    ...nodes.filter((n) => n.group).map((n) => s("text", { class: "dg-gt", x: n.x + 12, y: n.y + 18 }, n.t)),
    ...nodes.filter((n) => !n.group).map(node));
}

const BILDER = {
  datenfluss: () => diagram("Datenfluss vom Auto bis in die Oberfläche", 690, [
    { id: "auto", x: 14, y: 8, w: 220, h: 50, t: "Fahrzeug", sub: "Steuergeräte an CAN, K-Line, J1850", tone: "warn" },
    { id: "adapter", x: 14, y: 100, w: 220, h: 50, t: "Adapter (ELM327/STN)", sub: "z. B. OBDLink MX+", tone: "info" },
    { id: "srv", group: true, x: 8, y: 192, w: 344, h: 372, t: "Diagnose-Server kfzdiag (Python, auf dem Rechner)" },
    { id: "elm", x: 24, y: 220, w: 200, h: 46, t: "transport.py · elm327.py", sub: "Protokoll, Rahmen, ISO-TP" },
    { id: "obd", x: 24, y: 300, w: 200, h: 46, t: "obd.py · uds.py", sub: "Fehler, Live-Werte, Vollscan" },
    { id: "guard", x: 24, y: 380, w: 200, h: 46, t: "guard.py · safety.py", sub: "Sperre und Freigabe", tone: "crit" },
    { id: "service", x: 24, y: 460, w: 200, h: 46, t: "service.py · web.py", sub: "Werkzeuge, API, WebSocket" },
    { id: "store", x: 240, y: 300, w: 100, h: 46, t: "store.py", sub: "SQLite" },
    { id: "rmi", x: 240, y: 380, w: 100, h: 46, t: "rmi.py", sub: "Sollwerte, PDFs" },
    { id: "ki", x: 240, y: 460, w: 100, h: 46, t: "ki.py", sub: "Claude/Ollama" },
    { id: "ui", x: 14, y: 606, w: 220, h: 62, t: "Oberfläche im Browser", sub: "modules/*.js · localStorage", tone: "ok" },
  ], [["auto", "adapter", "OBD-Buchse, 16 Pol"], ["adapter", "elm", "Bluetooth, WLAN oder USB"], ["elm", "obd"], ["obd", "guard"], ["guard", "service"],
    ["obd", "store"], ["guard", "rmi"], ["service", "ki"], ["service", "ui", "HTTP + WebSocket, nur 127.0.0.1"]]),

  bluetooth: () => diagram("Verbinden über Bluetooth Schritt für Schritt", 640, [
    { id: "a", x: 30, y: 8, w: 300, h: 50, t: "1 · Adapter koppeln", sub: "im Betriebssystem, wie ein Headset" },
    { id: "b", x: 30, y: 92, w: 300, h: 50, t: "2 · Serieller Anschluss entsteht", sub: "COM5 · /dev/rfcomm0 · /dev/cu.<Name>" },
    { id: "c", x: 30, y: 176, w: 300, h: 50, t: "3 · kfzdiag starten", sub: "KFZDIAG_BACKEND=elm327, KFZDIAG_ANSCHLUSS" },
    { id: "d", x: 30, y: 260, w: 300, h: 50, t: "4 · ATZ, ATE0, ATL0, ATS0, ATH1 …", sub: "Adapter zurücksetzen und einstellen", tone: "info" },
    { id: "e", x: 30, y: 344, w: 300, h: 50, t: "5 · ATSP0 und 0100", sub: "Protokoll selbst suchen, bis 20 Sekunden", tone: "info" },
    { id: "f", x: 30, y: 428, w: 300, h: 50, t: "6 · 09 02 und ATDPN", sub: "FIN lesen, Protokoll merken, Marke aus WMI" },
    { id: "g", x: 30, y: 512, w: 300, h: 50, t: "7 · Fehlerspeicher und Readiness", sub: "03, 07, 0A, 01 01 je Steuergerät" },
    { id: "h", x: 30, y: 590, w: 300, h: 40, t: "Oberfläche: verbunden", tone: "ok" },
  ], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g"], ["g", "h"]]),

  schreibschutz: () => diagram("Fünf Sperren vor jedem Schreibbefehl", 560, [
    { id: "req", x: 60, y: 8, w: 240, h: 46, t: "Anfrage", sub: "Knopf in der Oberfläche oder Vorschlag der KI" },
    { id: "l1", x: 30, y: 88, w: 300, h: 46, t: "1 · Hauptschalter", sub: "ab Werk aus, nur beim Start änderbar", tone: "crit" },
    { id: "l2", x: 30, y: 168, w: 300, h: 46, t: "2 · Positivliste", sub: "nur registrierte Operationen, eingefroren", tone: "crit" },
    { id: "l3", x: 30, y: 248, w: 300, h: 46, t: "3 · Verbotsliste", sub: "Wegfahrsperre, Schlüssel, Abgas, Tacho", tone: "crit" },
    { id: "l4", x: 30, y: 328, w: 300, h: 46, t: "4 · Technische Sperre (guard.py)", sub: "nur erlaubte Dienste verlassen den Rechner", tone: "crit" },
    { id: "l5", x: 30, y: 408, w: 300, h: 46, t: "5 · Freigabe durch den Menschen", sub: "2 s halten, 300 s gültig, einmalig", tone: "warn" },
    { id: "car", x: 90, y: 496, w: 180, h: 46, t: "Fahrzeug", sub: "Antwort ins Schreibprotokoll", tone: "ok" },
  ], [["req", "l1"], ["l1", "l2"], ["l2", "l3"], ["l3", "l4"], ["l4", "l5"], ["l5", "car"]]),

  rmi: () => diagram("Erweiterung über RMI-Daten", 560, [
    { id: "src", group: true, x: 8, y: 8, w: 344, h: 196, t: "Quellen, die du selbst einbringst" },
    { id: "s1", x: 20, y: 34, w: 156, h: 46, t: "sollwerte/*.json", sub: "Hersteller mit Quelle", tone: "info" },
    { id: "s2", x: 184, y: 34, w: 156, h: 46, t: "rmi_dokumente/", sub: "PDFs aus dem Portal", tone: "info" },
    { id: "s3", x: 20, y: 94, w: 156, h: 46, t: "SollwertAnbieter", sub: "TecRMI, HaynesPro …", tone: "info" },
    { id: "s4", x: 184, y: 94, w: 156, h: 46, t: "profiles/*.json", sub: "Steuergeräte-Adressen", tone: "info" },
    { id: "s5", x: 100, y: 150, w: 160, h: 42, t: "allgemein.json", sub: "Richtwerte ohne Hersteller" },
    { id: "core", x: 60, y: 246, w: 240, h: 50, t: "rmi.py · profiles.py", sub: "laden, prüfen, Quelle Pflicht" },
    { id: "ana", x: 60, y: 338, w: 240, h: 50, t: "Vollanalyse", sub: "Ist gegen Soll, Dokumenttreffer" },
    { id: "ki", x: 20, y: 430, w: 150, h: 50, t: "KI-Bewertung", sub: "Belege mit Quelle" },
    { id: "ui", x: 190, y: 430, w: 150, h: 50, t: "Prüfen und Service", sub: "Ist/Soll, Dokumente", tone: "ok" },
    { id: "rep", x: 105, y: 506, w: 150, h: 44, t: "Bericht", sub: "Quelle je Wert", tone: "ok" },
  ], [["s5", "core"], ["core", "ana"], ["ana", "ki"], ["ana", "ui"], ["ki", "rep"]]),

  ablauf: () => diagram("Ablauf einer Diagnose", 700, [
    { id: "a", x: 30, y: 8, w: 300, h: 46, t: "Werkstattdaten", sub: "einmal beim ersten Start" },
    { id: "b", x: 30, y: 84, w: 300, h: 46, t: "Fahrzeug anlegen oder wählen", sub: "Kennzeichen oder FIN, Marke, Modell" },
    { id: "c", x: 30, y: 160, w: 300, h: 46, t: "Verbinden", sub: "Server, Fahrzeug erkennen, Speicher lesen", tone: "info" },
    { id: "d", x: 30, y: 236, w: 300, h: 46, t: "Kilometerstand heute", sub: "Pflicht für den Bericht" },
    { id: "e", x: 30, y: 312, w: 300, h: 46, t: "Eingangsbefund (Pre-Scan)", sub: "erster Stand plus erster Vollscan", tone: "warn" },
    { id: "f", x: 30, y: 388, w: 300, h: 46, t: "Diagnose", sub: "Fehler, Live-Werte, Prüfpfade, KI" },
    { id: "g", x: 30, y: 464, w: 300, h: 46, t: "Reparatur, Fehler löschen", sub: "nur mit Freigabe", tone: "crit" },
    { id: "h", x: 30, y: 540, w: 300, h: 46, t: "Ausgangsbefund (Post-Scan)", sub: "Nachher-Scan im Bericht", tone: "warn" },
    { id: "i", x: 30, y: 616, w: 300, h: 46, t: "Bericht und Verlauf", sub: "Vergleich, Druck, Akte je Fahrzeug", tone: "ok" },
  ], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g"], ["g", "h"], ["h", "i"]]),
};
export const BILD_NAMEN = Object.keys(BILDER);
export const bild = (name) => (BILDER[name] ? BILDER[name]() : null);
