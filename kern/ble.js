// @ts-check
// @ts-check
/* Bluetooth-LE-Anschluss für günstige ELM327-Adapter (Web Bluetooth: Chrome am Rechner und auf Android).
   Dienste aus docs/RECHERCHE_ADAPTER_GUENSTIG.md. Die Rollen (lesen, schreiben) leiten wir aus den Eigenschaften
   der Characteristics ab, statt sie fest zu verdrahten: Nachbauten belegen sie unterschiedlich.
   iPhone-Safari kann kein Web Bluetooth; dort übernimmt die App mit dem Capacitor-Plugin dieselbe Aufgabe. */

const kurz = (n) => `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

/** Bekannte Dienste, Reihenfolge = Suchreihenfolge. */
export const BLE_DIENSTE = Object.freeze([
  { name: "vLinker", dienst: "e7810a71-73ae-499d-8c15-faa9aef0c3f2" },
  { name: "OBDLink CX, Veepeak", dienst: kurz(0xfff0) },
  { name: "HM-10-Nachbau, Deep OBD", dienst: kurz(0xffe0) },
  { name: "Vgate iCar Pro BLE", dienst: kurz(0x18f0) },
]);
/** Der vLinker-Dienst steckt auch in Etikettendruckern: darum zusätzlich nach Namen filtern. */
export const NAMEN = Object.freeze(["OBD", "OBDII", "OBDLink", "vLinker", "VLINK", "IOS-Vlink", "Android-Vlink", "V-LINK", "Veepeak", "iCar", "VEEPEAK", "ELM327"]);
const STUECK = 20; // sichere Schreiblänge ohne ausgehandelte MTU

/**
 * @typedef {{ uuid: string, properties: { notify?: boolean, indicate?: boolean, write?: boolean, writeWithoutResponse?: boolean } }} Merkmal
 * @param {Merkmal[]} merkmale
 * @returns {{ lesen: Merkmal, schreiben: Merkmal } | null}
 */
export function waehleRollen(merkmale) {
  const lesen = merkmale.find((m) => m.properties.notify) || merkmale.find((m) => m.properties.indicate);
  const schreiben = merkmale.find((m) => m.properties.writeWithoutResponse) || merkmale.find((m) => m.properties.write);
  return lesen && schreiben ? { lesen, schreiben } : null;
}

export const bluetoothVerfuegbar = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

/** Fragt den Nutzer nach dem Adapter (Browser-Dialog) und liefert einen Anschluss für Elm327.
 * @returns {Promise<import("./elm327.js").Anschluss>} */
export async function waehleBleAdapter() {
  if (!bluetoothVerfuegbar()) throw new Error("Dieser Browser kann kein Bluetooth. Chrome am Rechner oder auf Android nutzen, am iPhone die CANdor-App.");
  const bt = /** @type {any} */ (navigator).bluetooth;
  const dienste = BLE_DIENSTE.map((d) => d.dienst);
  const geraet = await bt.requestDevice({
    filters: [...dienste.slice(1).map((d) => ({ services: [d] })), ...NAMEN.map((n) => ({ namePrefix: n }))],
    optionalServices: dienste,
  });
  return bleAnschluss(geraet);
}

/** @param {any} geraet BluetoothDevice @returns {import("./elm327.js").Anschluss} */
export function bleAnschluss(geraet) {
  /** @type {any} */ let lesen = null;
  /** @type {any} */ let schreiben = null;
  /** @type {((e: any) => void) | null} */ let hoerer = null;
  /** @type {(() => void) | null} */ let trennung = null;
  const decoder = new TextDecoder("ascii");
  const encoder = new TextEncoder();
  return {
    name: geraet.name || "Bluetooth-Adapter",
    async open(empfang, getrennt) {
      trennung = () => { if (getrennt) getrennt(); };
      geraet.addEventListener("gattserverdisconnected", trennung);
      try {
        const server = await geraet.gatt.connect();
        for (const { dienst } of BLE_DIENSTE) {
          let service;
          try { service = await server.getPrimaryService(dienst); } catch (e) {
            if (!geraet.gatt.connected) throw e; // Abbruch mitten in der Suche, nicht „Dienst fehlt“
            continue;
          }
          const rollen = waehleRollen(await service.getCharacteristics());
          if (!rollen) continue;
          ({ lesen, schreiben } = rollen);
          hoerer = (e) => empfang(decoder.decode(e.target.value));
          lesen.addEventListener("characteristicvaluechanged", hoerer);
          await lesen.startNotifications();
          return;
        }
        throw new Error("Adapter gefunden, aber kein bekannter OBD-Dienst. Ist das wirklich ein ELM327-Adapter?");
      } catch (e) {
        await this.close();
        throw e;
      }
    },
    async write(text) {
      if (!schreiben) throw new Error("Adapter ist nicht verbunden");
      const bytes = encoder.encode(text);
      for (let i = 0; i < bytes.length; i += STUECK) {
        const teil = bytes.slice(i, i + STUECK);
        if (schreiben.properties.writeWithoutResponse && schreiben.writeValueWithoutResponse) await schreiben.writeValueWithoutResponse(teil);
        else await schreiben.writeValue(teil);
      }
    },
    async close() {
      if (lesen && hoerer) lesen.removeEventListener("characteristicvaluechanged", hoerer);
      if (trennung) geraet.removeEventListener("gattserverdisconnected", trennung);
      lesen = schreiben = hoerer = trennung = null;
      if (geraet.gatt.connected) geraet.gatt.disconnect();
    },
  };
}
