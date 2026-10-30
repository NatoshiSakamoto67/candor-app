// @ts-check
/* Was ein Bauteil tut und welche Messwerte zu ihm gehören. Allgemeines Werkstattwissen, markenneutral.
   Signalnamen wie in kfzdiag/pids.py und frontend/wissen.json. */

/** @type {Record<string, { funktion: string, signale?: string[] }>} */
export const BAUTEILWISSEN = {
  motor: { funktion: "Verbrennungsmotor: wandelt Kraftstoff in Drehmoment. Drehzahl, Last und Temperatur sind seine Kennwerte.", signale: ["DREHZAHL", "LAST", "KUEHLMITTEL", "OELTEMPERATUR"] },
  zylinderkopf: { funktion: "Trägt Ventile, Nockenwellen, Zündkerzen und Injektoren. Undichtigkeiten zeigen sich an Kühlmittel und Verbrennung.", signale: ["KUEHLMITTEL", "ZUENDWINKEL"] },
  getriebe: { funktion: "Übersetzt das Drehmoment auf die Räder. Beim Automatikgetriebe mit eigenem Steuergerät und Öltemperatur.", signale: ["GESCHWINDIGKEIT", "DREHZAHL"] },
  motorsteuergeraet: { funktion: "Rechner des Motors: liest alle Sensoren, steuert Einspritzung, Zündung und Ladedruck, speichert die Fehlercodes P0xxx.", signale: ["DREHZAHL", "LAST", "TRIM_LANG_B1", "TRIM_KURZ_B1"] },
  anlasser: { funktion: "Dreht den Motor zum Start durch. Braucht volle Batteriespannung.", signale: ["SPANNUNG"] },
  luftfilter: { funktion: "Reinigt die Ansaugluft. Verstopft senkt er die Luftmasse und die Leistung.", signale: ["LUFTMASSE"] },
  luftmassenmesser: { funktion: "Misst, wie viel Luft der Motor ansaugt. Daraus berechnet das Steuergerät die Einspritzmenge.", signale: ["LUFTMASSE", "TRIM_LANG_B1", "ANSAUGLUFT"] },
  drosselklappe: { funktion: "Regelt die Luftmenge nach Gaspedal. Verschmutzt führt sie zu unruhigem Leerlauf.", signale: ["DROSSELKLAPPE", "DROSSEL_RELATIV", "DREHZAHL"] },
  ansaugbruecke: { funktion: "Verteilt die Luft auf die Zylinder. Der Saugrohrdruck zeigt Last und Falschluft.", signale: ["SAUGROHRDRUCK", "LAST"] },
  agr_ventil: { funktion: "Führt Abgas zur Ansaugluft zurück und senkt Stickoxide. Verkokt bleibt es hängen.", signale: ["AGR_SOLL", "SAUGROHRDRUCK"] },
  kurbelwellensensor: { funktion: "Gibt Drehzahl und Kolbenlage. Ohne Signal springt der Motor nicht an.", signale: ["DREHZAHL"] },
  nockenwellensensor: { funktion: "Gibt die Stellung der Nockenwelle für Einspritz- und Zündzeitpunkt.", signale: ["DREHZAHL", "ZUENDWINKEL"] },
  kuehlmittelsensor: { funktion: "Misst die Motortemperatur. Grundlage für Gemisch, Lüfter und Warmlauf.", signale: ["KUEHLMITTEL"] },
  kuehler: { funktion: "Gibt die Motorwärme an die Luft ab, mit Lüfter und Thermostat im Kreislauf.", signale: ["KUEHLMITTEL", "UMGEBUNG"] },
  tank: { funktion: "Kraftstoffvorrat mit Förderpumpe und Tankentlüftung.", signale: ["TANK", "RAILDRUCK"] },
  lambda_vor_kat: { funktion: "Misst den Restsauerstoff vor dem Kat und regelt das Gemisch.", signale: ["LAMBDA_SOLL", "TRIM_KURZ_B1", "TRIM_LANG_B1"] },
  kat: { funktion: "Wandelt Schadstoffe um. Der Wirkungsgrad wird über die Sonde dahinter überwacht.", signale: ["KAT_TEMP_B1", "LAMBDA_SOLL"] },
  lambda_nach_kat: { funktion: "Überwacht den Katalysator. Folgt sie der Sonde davor, arbeitet der Kat nicht mehr.", signale: ["LAMBDA_SOLL"] },
  dpf: { funktion: "Partikelfilter beim Diesel: sammelt Ruß und brennt ihn bei Regeneration ab.", signale: ["KAT_TEMP_B1", "LAST"] },
  adblue: { funktion: "Harnstofflösung für die SCR-Abgasreinigung. Leer oder falsch dosiert folgt eine Startsperre.", signale: [] },
  auspuff: { funktion: "Abgasstrang mit Schalldämpfern. Undichtigkeiten verfälschen die Lambdawerte.", signale: ["LAMBDA_SOLL"] },
  batterie: { funktion: "Speichert Strom für Start und Bordnetz. Ruhespannung und Spannung unter Last sind die Kennwerte.", signale: ["SPANNUNG"] },
  lichtmaschine: { funktion: "Lädt die Batterie und versorgt das Bordnetz bei laufendem Motor.", signale: ["SPANNUNG", "DREHZAHL"] },
  bordnetz: { funktion: "Steuert Licht, Zentralverriegelung, Fenster und Komfortfunktionen.", signale: ["SPANNUNG"] },
  gateway: { funktion: "Verbindet die Fahrzeugbusse und die Diagnosebuchse mit den Steuergeräten.", signale: [] },
  obd_buchse: { funktion: "Diagnoseanschluss nach SAE J1962, meist unter dem Lenkrad. Hier steckt der Adapter.", signale: ["SPANNUNG"] },
  kombiinstrument: { funktion: "Anzeigen und Warnleuchten, darunter die Motorkontrollleuchte.", signale: ["GESCHWINDIGKEIT", "DREHZAHL", "TANK"] },
  infotainment: { funktion: "Radio, Navigation und Anzeige. Diagnoserelevant vor allem über den Bus.", signale: [] },
  frontradar: { funktion: "Abstandsradar für Notbremsassistent und Tempomat. Nach Stoßfängerarbeiten kalibrieren.", signale: ["GESCHWINDIGKEIT"] },
  frontkamera: { funktion: "Kamera hinter der Windschutzscheibe für Spur- und Verkehrszeichenerkennung. Nach Scheibentausch kalibrieren.", signale: [] },
  parksensoren: { funktion: "Ultraschallsensoren im Stoßfänger für die Einparkhilfe.", signale: [] },
  airbag_steuergeraet: { funktion: "Löst Airbags und Gurtstraffer aus. Crashdaten werden nicht ausgelesen oder verändert.", signale: [] },
  lenkrad: { funktion: "Mit Fahrerairbag und Lenkwinkelsensor für ESP.", signale: [] },
  abs: { funktion: "Hydraulikblock mit Steuergerät für ABS und ESP. Liest die Raddrehzahlen und regelt den Bremsdruck.", signale: ["GESCHWINDIGKEIT"] },
  bremskraftverstaerker: { funktion: "Verstärkt die Pedalkraft mit Unterdruck oder elektrisch. Dahinter der Hauptbremszylinder.", signale: ["SAUGROHRDRUCK"] },
  lenkgetriebe: { funktion: "Überträgt die Lenkbewegung auf die Räder, meist mit elektrischer Servounterstützung.", signale: [] },
  hinterachse: { funktion: "Hinterachse mit Radaufhängung und Federung.", signale: [] },
  sitze: { funktion: "Sitze mit Sitzbelegungserkennung für den Beifahrerairbag.", signale: [] },
  armaturenbrett: { funktion: "Instrumententafel mit Beifahrerairbag und Bedienelementen.", signale: [] },
};
/** @type {[RegExp, { funktion: string, signale: string[] }][]} */
const PRAEFIX = [
  [/^rad_/, { funktion: "Rad mit Reifen. Reifendruck und Profil gehören zur Prüfung vor jeder Fahrt.", signale: ["GESCHWINDIGKEIT"] }],
  [/^bremse_/, { funktion: "Scheibenbremse mit Sattel und Belägen. Verschleiß und Rundlauf prüfen.", signale: ["GESCHWINDIGKEIT"] }],
  [/^raddrehzahl_/, { funktion: "Raddrehzahlsensor für ABS und ESP. Verschmutzt oder beschädigt fällt das Rad aus der Regelung.", signale: ["GESCHWINDIGKEIT"] }],
  [/^injektor_/, { funktion: "Einspritzdüse eines Zylinders.", signale: ["TRIM_KURZ_B1", "RAILDRUCK"] }],
  [/^zuendspule_/, { funktion: "Zündspule eines Zylinders.", signale: ["DREHZAHL", "ZUENDWINKEL"] }],
];

/** @param {string} id @returns {{ funktion: string, signale: string[] }} */
export function bauteilWissen(id) {
  const direkt = BAUTEILWISSEN[id];
  if (direkt) return { funktion: direkt.funktion, signale: direkt.signale || [] };
  const treffer = PRAEFIX.find(([re]) => re.test(id));
  return treffer ? { funktion: treffer[1].funktion, signale: treffer[1].signale } : { funktion: "", signale: [] };
}
