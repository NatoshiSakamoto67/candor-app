/* Inhalt des Handbuchs. Blöcke: ["p", text] · ["liste", [..]] · ["schritte", [..]] · ["tabelle", kopf, zeilen]
   · ["code", text] · ["bild", name] · ["hinweis", ton, text] · ["funktion", { titel, icon, was, wie, dateien }].
   Stand 28.10.2026. Quellen: Code in kfzdiag/ und frontend/, README.md, docs/RECHERCHE_*.md. */

export const KAPITEL = [
  { id: "ueberblick", titel: "Überblick", icon: "car", kurz: "Was das Programm kann und was bewusst nicht", bloecke: [
    ["p", "CANdor liest Fahrzeuge über die OBD-Buchse aus: Fehlerspeicher, Live-Werte, Bereitschaftstests (Readiness), Freeze-Frames und einzelne Steuergeräte. Es speichert alles je Fahrzeug, vergleicht vorher und nachher, erstellt einen Bericht und kann die Fehler mit einer KI bewerten lassen, die nur belegte Aussagen machen darf."],
    ["p", "Das Programm besteht aus zwei Teilen: dem Diagnose-Server kfzdiag (Python) auf dem Rechner, der mit dem Adapter spricht, und dieser Oberfläche im Browser. Ohne Server läuft die Oberfläche als Vorschau mit Beispieldaten."],
    ["tabelle", ["Ebene", "Abdeckung", "Weg"], [
      ["Generisches OBD (Fehler, Live-Werte, FIN, Löschen)", "alle Marken mit OBD-Buchse, in der EU Benziner ab 2001, Diesel ab 2004", "ELM327/STN-Adapter mit Protokoll-Automatik"],
      ["Marke erkennen", "alle gängigen Hersteller", "aus den ersten drei Zeichen der FIN (WMI)"],
      ["Einzelne Steuergeräte per UDS (ABS, Airbag …)", "Fahrzeuge mit CAN, Adressen je Profil", "Vollscan 0x700 bis 0x7F7, Adressen nur mit Quelle als bestätigt"],
      ["Herstellertiefe (Sollwerte, Schaltpläne)", "je nach gekauften RMI-Daten", "siehe Kapitel »Erweitern über RMI«"],
    ]],
    ["hinweis", "crit", "Feste Grenzen: keine Wegfahrsperre und keine Schlüssel (braucht eine SERMI-Zulassung), keine Abgasmanipulation (DPF, AGR, AdBlue abschalten), kein Tacho verstellen, keine geknackten Herstellerdatenbanken. Diese Funktionen sind im Code gesperrt, nicht nur in der Oberfläche."],
    ["p", "Es gibt zwei Fassungen: »intern« für eigene Fahrzeuge mit allen erlaubten Funktionen und »Markt« für Werkstätten mit Lesen, Live-Werten und KI-Bewertung ohne tiefe Schreibfunktionen. Welche läuft, steht in der Fahrzeugkarte unter »Version«."],
  ] },

  { id: "hardware", titel: "Hardware", icon: "plug", kurz: "Adapter, Rechner, Fahrzeug", bloecke: [
    ["tabelle", ["Teil", "Empfehlung", "Warum"], [
      ["Adapter", "OBDLink MX+ (Bluetooth)", "ELM327-kompatibel mit STN-Chip, alle OBD-Protokolle inklusive K-Line, stabil auch bei vielen Anfragen. Erste Wahl."],
      ["Adapter, nur CAN", "OBDLink CX", "reicht für neuere Autos mit CAN (etwa Hyundai i20 BC3), nicht für ältere K-Line-Autos (etwa Opel Corsa C)."],
      ["Nicht geeignet", "Thinkdiag und ähnliche", "an die App des Herstellers gebunden, kein offener ELM327-Modus."],
      ["WLAN-Adapter", "ELM327 mit WLAN", "geht über socket://IP:35000, Bluetooth ist meist bequemer."],
      ["Rechner", "Windows, macOS oder Linux", "Python 3.10 oder neuer, Bluetooth oder USB. Ein älterer Laptop reicht."],
      ["Anzeige", "jeder aktuelle Browser", "die Oberfläche passt sich an Handy, Tablet und Bildschirm an (360 bis 1920 px)."],
    ]],
    ["p", "Die OBD-Buchse sitzt fast immer im Fußraum unter dem Lenkrad, manchmal hinter einer Klappe in der Mittelkonsole. Zündung an genügt zum Lesen, für manche Live-Werte muss der Motor laufen."],
    ["hinweis", "warn", "Bei langen Sitzungen mit Zündung an ohne laufenden Motor sinkt die Batteriespannung. Das Programm zeigt die Bordspannung oben in der Statusleiste; unter 12,2 V wird sie rot."],
  ] },

  { id: "installation", titel: "Installation", icon: "download", kurz: "Programm einrichten und starten", bloecke: [
    ["p", "Voraussetzung ist Python 3.10 oder neuer. Alles wird in eine eigene Umgebung (venv) installiert, nichts global. Die Abhängigkeiten sind auf feste Versionen gesetzt: FastAPI, Uvicorn, websockets, pyserial, pypdf, anthropic und httpx."],
    ["schritte", ["Projektordner öffnen, dann die Umgebung anlegen und das Programm installieren.", "Mit den Tests prüfen, ob alles läuft.", "Erst mit dem Simulator starten, nie gleich am Auto.", "Im Browser http://127.0.0.1:8420 öffnen."]],
    ["code", "# macOS und Linux\npython3 -m venv .venv\n.venv/bin/python -m pip install -e .[test]\n.venv/bin/python -m pytest\n.venv/bin/python -m kfzdiag web\n\n# Windows\npy -m venv .venv\n.venv\\Scripts\\python -m pip install -e .[test]\n.venv\\Scripts\\python -m kfzdiag web"],
    ["p", "Weitere Befehle: »kfzdiag doctor« liest FIN, Marke, Fehler und Live-Werte in der Konsole, »kfzdiag scan« sucht Steuergeräte."],
    ["tabelle", ["Einstellung", "Bedeutung"], [
      ["KFZDIAG_BACKEND", "simulator (Standard) oder elm327 für den echten Adapter"],
      ["KFZDIAG_ANSCHLUSS", "COM5, /dev/rfcomm0, /dev/cu.<Name> oder socket://192.168.0.10:35000"],
      ["KFZDIAG_PROTOKOLL", "0 sucht automatisch (Standard), sonst 1 bis 9 fest"],
      ["KFZDIAG_PROFIL", "leer, demo, hyundai_i20_bc3, opel_corsa_c"],
      ["KFZDIAG_SCHREIBEN", "1 schaltet Schreiben ein; die Freigabe bleibt trotzdem Pflicht"],
      ["KFZDIAG_KI, KFZDIAG_KI_MODELL, KFZDIAG_OLLAMA_URL", "KI aus (Standard), anthropic oder ollama, Modellname, Adresse von Ollama"],
      ["KFZDIAG_PORT, KFZDIAG_DATENBANK", "Port des Servers (8420) und Pfad der SQLite-Datei"],
    ]],
    ["hinweis", "info", "Der Server nimmt nur Verbindungen vom eigenen Rechner an (127.0.0.1) und prüft Host und Herkunft jeder Anfrage. Die Startseite liest er beim Start ein: Nach einem Update den Server neu starten."],
  ] },

  { id: "bluetooth", titel: "Verbinden per Bluetooth", icon: "bluetooth", kurz: "Vom Koppeln bis zur ersten Antwort", bloecke: [
    ["bild", "bluetooth"],
    ["p", "Ein Bluetooth-Adapter wie der OBDLink MX+ meldet sich beim Rechner als serieller Anschluss. Das Programm spricht ihn wie ein Kabel an (pyserial). Deshalb braucht es keinen eigenen Bluetooth-Treiber: Koppeln macht das Betriebssystem, kfzdiag öffnet danach nur den Anschluss."],
    ["schritte", [
      "Adapter in die OBD-Buchse stecken, Zündung an. Den Kopplungsmodus startest du nach der Anleitung des Herstellers (beim MX+ über die Taste am Adapter).",
      "Im Betriebssystem koppeln. Windows legt einen COM-Port an (Geräte-Manager, »Anschlüsse«), Linux /dev/rfcomm0, macOS /dev/cu. mit dem Gerätenamen.",
      "Diesen Anschluss in KFZDIAG_ANSCHLUSS eintragen, KFZDIAG_BACKEND=elm327 setzen und kfzdiag web starten.",
      "In der Oberfläche »Verbinden«. Die drei Schritte zeigen, was gerade passiert, und haben je ein Zeitlimit.",
    ]],
    ["p", "Was dabei technisch passiert (elm327.py): Der Adapter wird mit ATZ zurückgesetzt und mit ATE0, ATL0, ATS0, ATH1, ATAT1 und ATCAF1 eingestellt. ATH1 schaltet die Kopfzeilen ein, damit sich Antworten mehrerer Steuergeräte trennen lassen. Mit ATSP0 sucht der Adapter das Protokoll selbst; die erste Anfrage 0100 darf dafür bis zu 20 Sekunden dauern. ATDPN verrät danach, welches Protokoll gefunden wurde (CAN 11 oder 29 Bit, K-Line nach ISO 9141-2 oder ISO 14230, J1850)."],
    ["p", "Mehrteilige Antworten über CAN (ISO-TP) setzt das Programm selbst zusammen. Für einzelne Steuergeräte stellt es Sende- und Empfangsadresse mit ATSH und ATCRA ein und regelt die Flusskontrolle. »NO DATA« heißt: keine Antwort, kein Fehler."],
    ["hinweis", "warn", "Ältere herstellereigene K-Line-Protokolle (etwa KW81/KW82 bei Opel bis etwa 2004) beherrscht ein ELM327 nur teilweise. Generisches OBD am Motorsteuergerät geht immer."],
  ] },

  { id: "datenfluss", titel: "Systembild und Datenfluss", icon: "chip", kurz: "Wie die Daten vom Auto in die Oberfläche kommen", bloecke: [
    ["bild", "datenfluss"],
    ["p", "Jede Schicht kennt nur die darunter. transport.py beschreibt einen Bytekanal mit open, send, recv und close; dahinter steckt entweder der Simulator, der echte Bytes spricht, oder der ELM327-Adapter. obd.py und uds.py bauen daraus Anfragen nach SAE J1979 und ISO 14229. Jede Anfrage läuft durch guard.py, das nur erlaubte Dienste durchlässt."],
    ["p", "service.py bündelt alles zu Werkzeugen, web.py stellt sie als HTTP-Schnittstelle und WebSocket bereit. Der WebSocket meldet den Fortschritt des Vollscans Steuergerät für Steuergerät, Live-Werte holt die Oberfläche jede Sekunde. store.py speichert Fahrzeuge, Sitzungen, Fehler, Messwerte und das Schreibprotokoll in SQLite."],
    ["p", "Die Oberfläche hat keinen Build-Schritt: index.html, Stile und Module in modules/ werden direkt geladen. Ein kleiner Ereignisbus in state.js verbindet die Bereiche, damit sie sich nicht gegenseitig importieren. Fahrzeugbestand, Verlauf, Werkstattdaten und Anzeige liegen im localStorage des Browsers, also nur auf diesem Gerät."],
    ["tabelle", ["Schnittstelle", "Inhalt"], [
      ["GET /api/status", "Fahrzeug, Protokoll, Version, Schreiben an oder aus, KI"],
      ["GET /api/obd/fehler · /api/obd/bereitschaft · /api/obd/freeze", "Fehlerspeicher, Readiness, Freeze-Frame"],
      ["GET /api/live · /api/obd/signale", "aktuelle Messwerte und verfügbare Signale"],
      ["GET /api/vollanalyse", "Steuergeräte, Sollwertvergleich, Hinweise"],
      ["POST /api/scan · WS /ws", "Vollscan starten, Fortschritt und Funde live"],
      ["POST /api/ki/bewertung · /api/ki/frage", "KI-Bewertung mit Belegen, Fragen an den Assistenten"],
      ["GET /api/rmi/suche · /api/did · /api/funktionen", "Dokumentsuche, Kennung lesen, Service-Funktionen"],
    ]],
  ] },

  { id: "ablauf", titel: "Ablauf einer Diagnose", icon: "route", kurz: "Von der Werkstatt bis zum Bericht", bloecke: [
    ["bild", "ablauf"],
    ["p", "Der Ablauf folgt professioneller Werkstatt-Software (Bosch ESI[tronic], Autel MaxiSys, Launch X431, Gutmann mega macs): Erst das Fahrzeug, dann der Eingangsbefund, dann die Arbeit, zum Schluss der Ausgangsbefund und der Vergleich."],
    ["schritte", [
      "Beim allerersten Start: Werkstattdaten eintragen oder überspringen.",
      "Fahrzeug anlegen. Pflicht sind Marke und Modell, dazu Kennzeichen oder FIN. Oder »Mit Beispielfahrzeug ausprobieren«.",
      "Verbinden. Passt der Herstellercode des Autos nicht zur hinterlegten FIN, warnt die Fahrzeugkarte.",
      "Kilometerstand vom Tacho eintragen. Weniger als beim letzten Mal geht nur nach Bestätigung.",
      "Eingangsbefund: Der erste gelesene Stand wird festgehalten. Ein Vollscan vor jedem Schreiben gehört noch dazu.",
      "Diagnose mit Fehlerspeicher, Live-Werten, Prüfpfaden und KI. Fehler löschen nur mit Freigabe.",
      "Im Bericht »Nachher-Scan starten«: Vollscan und Fehlerspeicher neu lesen, das ist der Ausgangsbefund.",
      "Bericht als Eingangsbefund, Ausgangsbefund oder Vergleich drucken. Der Verlauf hält beides je Fahrzeug fest.",
    ]],
    ["p", "Nach einem Neustart ist das zuletzt gewählte Fahrzeug wieder aktiv und wird gleich verbunden. Jeder Start ist eine neue Sitzung mit eigenem Eintrag im Verlauf."],
  ] },

  { id: "funktionen", titel: "Funktionen im Einzelnen", icon: "clipboard", kurz: "Was jede Seite macht und wie sie gebaut ist", bloecke: [
    ["funktion", { titel: "Fahrzeuge", icon: "garage", was: "Fahrzeuge anlegen, bearbeiten, löschen, suchen und sortieren (zuletzt benutzt, zuletzt angelegt, A bis Z). Jedes Fahrzeug hat seine Diagnosen. Die Startseite zeigt die zuletzt benutzten zum schnellen Wechsel.",
      wie: "Reine Logik ohne DOM in fahrzeuge.js (prüfen, anlegen, sortieren, suchen, FIN-Abgleich), getestet mit Node. garage.js baut Liste, Formular und Detailseite und speichert im localStorage. Listen werden nie verändert, jede Änderung erzeugt eine neue.", dateien: "modules/fahrzeuge.js, modules/garage.js, garage.css" }],
    ["funktion", { titel: "Fehlerspeicher", icon: "mil", was: "Gespeicherte, vorläufige und permanente Fehler aus OBD und allen gescannten Steuergeräten, nach Dringlichkeit sortiert, mit Klartext, Freeze-Frame und Markierung »neu seit Sitzungsbeginn«.",
      wie: "OBD-Dienste 03, 07 und 0A je Steuergerät, UDS-Dienst 19 für einzelne Steuergeräte. Fehlertexte nur generisch nach SAE J2012 oder aus einem Profil mit Quelle; unbekannte Herstellercodes bleiben unbekannt.", dateien: "kfzdiag/obd.py, kfzdiag/dtc.py, modules/faults.js" }],
    ["funktion", { titel: "Steuergeräte und Vollscan", icon: "chip", was: "Fragt alle Adressen ab und zeigt jedes Steuergerät mit Zustand, als Fahrzeuggrafik nach Bauart oder als Bus-Ansicht mit Gateway.",
      wie: "UDS-Anfrage an 0x700 bis 0x7F7, Fortschritt über den WebSocket. Ein Wachhund bricht nach 15 Sekunden ohne Lebenszeichen ab und bietet »Erneut versuchen«. Die Platzierung nach Funktionsdomäne steckt in topology.js.", dateien: "kfzdiag/uds.py, modules/vehicle.js, modules/topology.js, topologie/*.svg" }],
    ["funktion", { titel: "Live-Werte, Diagramm, Aufnahme", icon: "scope", was: "Messwerte als Liste mit Richtwert, als Diagramm mit mehreren Kanälen und als Aufnahme mit Markierungen.",
      wie: "OBD-Dienst 01 jede Sekunde, Plausibilitätsprüfung in pids.py. Das Diagramm nutzt uPlot (lokal unter vendor/, MIT-Lizenz).", dateien: "kfzdiag/pids.py, modules/live.js, modules/recorder.js" }],
    ["funktion", { titel: "Prüfungen", icon: "clipboard", was: "Unter Messen: geführte Prüfpfade bis Pass oder Fail, Ist gegen Soll, AU-Bereitschaft, Freeze-Frame, Kennung lesen (DID), Suche in Herstellerdokumenten.",
      wie: "Prüfpfade und Erklärungen liegen in wissen.json. Ist gegen Soll vergleicht mit Herstellerwerten (mit Quelle) oder allgemeinen Richtwerten, nie gemischt. Kennungen über UDS-Dienst 22.", dateien: "frontend/wissen.json, kfzdiag/rmi.py, modules/check.js, modules/pfade.js" }],
    ["funktion", { titel: "Service und Anlernen", icon: "gear", was: "23 Arbeiten nach Anlass geordnet (Ölservice, Feststellbremse, Batterie, Drosselklappe, Lenkwinkel …). Suche mit Alltagswörtern wie »neue Batterie«. Jede Arbeit zeigt Risiko, Dauer, ob sie schreibt, und die Vorbedingungen live gemessen. Wegfahrsperre, Schlüssel, Tacho und Abgas-Abschaltung gibt es nicht; die Suche nennt den Grund.",
      wie: "Schreiben nur, wenn das Fahrzeugprofil eine Anfrage mit Quelle hat, nur nach der Halte-Freigabe und nach einer letzten Messung direkt davor. Jede Freigabe und jedes Ergebnis kommt ins Betriebsbuch, eine SHA-256-Kette wie im XDAB-Leitstand: wer einen alten Eintrag ändert, bricht die Kette.", dateien: "kern/service-katalog.js, kern/betriebsbuch.js, modules/service.js, modules/approval.js" }],
    ["funktion", { titel: "Fehlercode-Wissen", icon: "book", was: "Zu allen 9.533 genormten Codes eine deutsche Erklärung mit möglichen Ursachen nach Wahrscheinlichkeit, typischen Anzeichen, Aufwand, verwandten Codes und Quellen. Steht im Infoblatt jedes Fehlercodes und geht an die KI.",
      wie: "Daten aus OBDex (CC0), mit tools/obdex_import.py in 61 kleine Pakete umgebaut, die erst bei Bedarf geladen werden. Herstellerspezifische Codes bleiben ausdrücklich unbekannt; dafür gibt es die Websuche im Chat und die RMI-Daten.", dateien: "frontend/daten/dtc/, modules/dtcwissen.js, kfzdiag/dtcwissen.py" }],
    ["funktion", { titel: "Belegte Fälle", icon: "report", was: "Nach dem Nachher-Scan trägst du ein, was gemacht wurde. Der Vergleich von Eingangs- und Ausgangsbefund belegt, ob es geholfen hat: behoben, teilweise oder nicht behoben. Taucht derselbe Code wieder auf, zeigen Infoblatt und KI diese Fälle, ähnliche Modelle zuerst.",
      wie: "Fälle liegen ohne FIN und Kennzeichen im Browser (kfzdiag-faelle). Die Ähnlichkeit zählt gemeinsame Codes, gleiches Modell und gleiche Marke. Die KI bekommt höchstens fünf passende Fälle und muss sagen, worauf sie sich stützt.", dateien: "modules/faelle.js, modules/report.js, kfzdiag/chat.py" }],
    ["funktion", { titel: "Assistent und KI-Bewertung", icon: "robot", was: "Fasst das Fehlerbild zusammen, nennt wahrscheinliche Ursachen mit Stufe (belegt, plausibel, Vermutung) und Prüfschritte. Beantwortet Fragen zum Auto.",
      wie: "Anbieter frei wählbar: Claude über das offizielle SDK oder ein lokales Modell über Ollama. Die KI bekommt nur, was das Auto geliefert hat, ohne FIN, und hat keine Werkzeuge: Sie kann nichts ins Auto schreiben.", dateien: "kfzdiag/ki.py, kfzdiag/chat.py, modules/chat.js, modules/md.js" }],
    ["funktion", { titel: "Bericht", icon: "report", was: "Eingangsbefund, Ausgangsbefund oder Vergleich, als Fassung für Kunde oder Werkstatt, mit Briefkopf, Kilometerstand und Unterschriftsfeldern. Drucken als PDF, Teilen oder als HTML speichern.",
      wie: "Der Eingangsbefund ist der erste Stand der Sitzung, der Ausgangsbefund entsteht mit dem Nachher-Scan. Der Vergleich trennt behoben, neu, weiter bestehend und vorher nicht geprüft. Gedruckt wird immer hell.", dateien: "modules/report.js, modules/befund.js" }],
    ["funktion", { titel: "Verlauf", icon: "clock", was: "Jede Sitzung mit Datum, Fahrzeug, Kilometerstand, Fehlercodes sowie Eingangs- und Ausgangsbefund, nach Monaten gruppiert.",
      wie: "Ein Eintrag je Sitzung, der sich bei jedem neuen Stand aktualisiert. Die FIN steht nur maskiert drin.", dateien: "modules/history.js" }],
    ["funktion", { titel: "Anzeige", icon: "palette", was: "Eigene Akzentfarbe, Symbolfarben je Funktion oder in der Akzentfarbe, hell und dunkel, hoher Kontrast, Dichte bis zum Werkstatt-Modus mit 60-px-Zielen für Handschuhe.",
      wie: "farbe.js dunkelt oder hellt die gewählte Farbe so weit nach, bis sie gegen die Fläche 4,5 : 1 erreicht (bei hohem Kontrast 7 : 1), und warnt nahe der Fehlerfarbe. Alle Farben kommen aus tokens.css.", dateien: "modules/farbe.js, modules/shell.js, tokens.css" }],
  ] },

  { id: "schreibschutz", titel: "Sicherheit beim Schreiben", icon: "lock", kurz: "Warum nichts ohne dich ins Auto geht", bloecke: [
    ["bild", "schreibschutz"],
    ["p", "Schreiben heißt hier: Fehler löschen, Stellglieder, Grundeinstellungen. Jede dieser Aktionen muss durch eine einzige Engstelle (safety.py) und zusätzlich durch eine zweite, unabhängige Sperre (guard.py)."],
    ["tabelle", ["Erlaubte Dienste", "Bedeutung"], [
      ["01, 02, 03, 04, 07, 09, 0A", "generisches OBD: Live, Freeze-Frame, Fehler, Löschen, Fahrzeuginfo"],
      ["10, 14, 19, 22, 3E", "UDS: Sitzung, Fehler löschen, Fehler lesen, Kennung lesen, Verbindung halten"],
      ["gesperrt", "27 Security Access, 2E Schreiben, 2F Stellglied, 31 Routinen, 34 bis 37 Flashen, 3D Speicher schreiben"],
    ]],
    ["p", "Die Freigabe gehört nur der Oberfläche. Eine Anfrage erzeugt eine offene Freigabe mit eingefrorenen Argumenten; ausgeführt wird erst, wenn du den Knopf zwei Sekunden hältst. Sie gilt 300 Sekunden und nur einmal. Ohne Mensch wird abgelehnt, nie zugestimmt. Jede Aktion landet im Schreibprotokoll."],
  ] },

  { id: "datenschutz", titel: "Datenschutz", icon: "shield", kurz: "Was wo gespeichert wird", bloecke: [
    ["tabelle", ["Daten", "Wo", "Schutz"], [
      ["FIN im Server", "SQLite", "nur als HMAC-SHA-256 mit getrenntem Schlüssel, nie im Klartext"],
      ["Fahrzeugbestand, Kennzeichen, FIN, Notiz", "Browser dieses Geräts", "verlässt das Gerät nicht, gezeigt wird die FIN maskiert"],
      ["Verlauf, Werkstattdaten, Anzeige", "Browser dieses Geräts", "verlässt das Gerät nicht"],
      ["Belegte Fälle", "Browser dieses Geräts", "ohne FIN und Kennzeichen; passende Fälle gehen gekürzt an die KI"],
      ["KI mit Claude", "Anthropic", "nur Messwerte und Fehler, ohne FIN; mit Kundendaten nur mit AV-Vertrag"],
      ["KI mit Ollama", "eigener Rechner", "nichts verlässt den Rechner"],
    ]],
    ["hinweis", "warn", "Die FIN gilt als personenbezogen, sobald sie sich einem Halter zuordnen lässt (EuGH C-319/22). Kennzeichen ebenso. Fahrzeuge, die du nicht mehr brauchst, löschst du unter Fahrzeuge."],
  ] },

  { id: "rmi", titel: "Erweitern über RMI", icon: "book", kurz: "Herstellerdaten legal einbinden", bloecke: [
    ["bild", "rmi"],
    ["p", "RMI heißt Repair and Maintenance Information. Hersteller müssen sie in der EU unabhängigen Werkstätten zugänglich machen, meist über kostenpflichtige Portale (etwa VW erWin, BMW AOS, Mercedes mit Abrechnung je FIN). RMI sind Dokumente, keine auslesbare Datenbank. Das Programm bindet sie deshalb auf vier Wegen an, immer mit Quelle."],
    ["funktion", { titel: "1 · Sollwerte als Datei", icon: "gauge", was: "Herstellerwerte aus deinen RMI-Unterlagen als JSON in sollwerte/. Jeder Wert hat Signal, Zustand, min und max und die Art »hersteller« mit Pflichtfeld »quelle« (Dokument, Seite oder Datensatz).",
      wie: "rmi.py lädt die Dateien, lehnt Herstellerwerte ohne Quelle ab und hält sie strikt getrennt von den allgemeinen Richtwerten in allgemein.json. Herstellerwerte haben immer Vorrang.", dateien: "sollwerte/*.json, kfzdiag/rmi.py" }],
    ["code", "{\n  \"signal\": \"DREHZAHL\",\n  \"zustand\": \"leerlauf_warm\",\n  \"min\": 650, \"max\": 750,\n  \"art\": \"hersteller\",\n  \"quelle\": \"Werkstatthandbuch Motor, S. 42\"\n}"],
    ["funktion", { titel: "2 · Dokumente durchsuchen", icon: "book", was: "PDFs oder Texte aus den Portalen in den Ordner rmi_dokumente/ legen. Die Suche unter Messen, Prüfungen findet Treffer mit Datei und Seite.",
      wie: "Lesen mit pypdf, Index lokal. Der Ordner ist nicht im Git, nichts wird kopiert oder weitergegeben: Das Material bleibt beim Lizenznehmer.", dateien: "rmi_dokumente/, kfzdiag/rmi.py" }],
    ["funktion", { titel: "3 · Datenanbieter anschließen", icon: "plug", was: "Lizenzierte Anbieter wie TecRMI oder HaynesPro liefern Sollwerte je Fahrzeug.",
      wie: "Schnittstelle SollwertAnbieter mit einer Methode sollwerte(profil, marke). Eine echte Anbindung braucht Lizenz und Zugangsdaten des Anbieters.", dateien: "kfzdiag/rmi.py" }],
    ["funktion", { titel: "4 · Fahrzeugprofile", icon: "chip", was: "Je Modell die Steuergeräte mit Anfrage- und Antwortadresse, Beschreibung und Kennzeichen für sicherheitskritische Systeme.",
      wie: "Eine Adresse gilt nur als bestätigt, wenn eine Quelle dabei ist (Norm, RMI-Dokument oder eigener Mitschnitt). Eigene Profile entstehen durch Mitschneiden am eigenen Auto oder mit Einwilligung in der Werkstatt.", dateien: "profiles/*.json, kfzdiag/profiles.py" }],
    ["hinweis", "info", "Ein ODX-Diagnosepaket eines Herstellers wäre der nächste Schritt zu voller Herstellertiefe. Das braucht eine Lizenz; der Platz dafür ist die gleiche Schicht wie bei den Profilen."],
  ] },

  { id: "entwickler", titel: "Für Entwickler", icon: "code", kurz: "Aufbau, Tests, eigene Erweiterungen", bloecke: [
    ["tabelle", ["Ordner", "Inhalt"], [
      ["kfzdiag/", "Server in Python: Adapter, OBD, UDS, Sperren, Speicher, Web, KI, RMI"],
      ["frontend/", "Oberfläche ohne Build: index.html, Designsystem (tokens.css, komponenten.css, icons.svg), modules/*.js"],
      ["profiles/, sollwerte/", "Fahrzeugprofile und Sollwerte als JSON"],
      ["tests/", "pytest für den Server, node --test für die reine Logik der Oberfläche"],
      ["docs/", "Recherche, Designsystem, Übergaben"],
    ]],
    ["code", ".venv/bin/python -m pytest          # Server\nnode --test tests/frontend/*.test.mjs   # Oberfläche"],
    ["liste", [
      "Reine Logik ohne DOM gehört in eigene Module (fahrzeuge.js, farbe.js, befund.js, topology.js) und bekommt Tests.",
      "Daten werden nicht verändert: Funktionen geben neue Listen und Objekte zurück.",
      "Farben, Abstände und Schriften nur aus tokens.css. Neue Symbole in icons3d.js brauchen eine eigene Farbe in tokens.css, das prüft ein Test.",
      "Jeder Vorgang, der warten muss, hat ein Zeitlimit und bei einem Fehler eine Meldung mit Ausweg.",
      "Ein neuer Schreibbefehl braucht einen Eintrag in der Positivliste (safety.py), die Freigabe des Dienstes in guard.py und eigene Tests.",
    ]],
  ] },
];
