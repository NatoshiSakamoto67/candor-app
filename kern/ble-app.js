// @ts-check
/* Bluetooth in der App (iPhone, Android) über das Capacitor-Plugin @capacitor-community/bluetooth-le.
   Ohne Bundler: wir sprechen die rohe Plugin-Schnittstelle unter window.Capacitor.Plugins.BluetoothLe an.
   Native nimmt und liefert sie Hex-Text; Dienste und Rollen wie im Browser (ble.js). */
import { BLE_DIENSTE, NAMEN, waehleRollen } from "./ble.js";
import { fromHex, toHex } from "./bytes.js";

const SUCHDAUER_MS = 6000;
const STUECK = 20;

/** @returns {any} */
const plugin = () => /** @type {any} */ (globalThis).Capacitor?.Plugins?.BluetoothLe;
export const appBluetoothVerfuegbar = () => Boolean(/** @type {any} */ (globalThis).Capacitor?.isNativePlatform?.() && plugin());

/** Ist das wahrscheinlich ein OBD-Adapter? Name oder beworbener Dienst. @param {string | undefined} name @param {string[] | undefined} uuids */
export function passtZuAdapter(name, uuids) {
  const n = (name || "").toUpperCase();
  if (NAMEN.some((p) => n.startsWith(p.toUpperCase()))) return true;
  const dienste = BLE_DIENSTE.map((d) => d.dienst);
  return (uuids || []).some((u) => dienste.includes(u.toLowerCase()));
}

const decoder = new TextDecoder("ascii");
/** Plugin liefert Hex-Text, manchmal mit Leerzeichen. Steuerzeichen wie CR bleiben erhalten: der Adapter trennt damit Zeilen.
 * @param {string} hex */
export const hexZuText = (hex) => decoder.decode(fromHex(hex.replace(/[^0-9a-f]/gi, ""))).replace(/\0/g, "");

/** @typedef {{ deviceId: string, name: string, rssi: number }} Fund */

/** Sucht einige Sekunden nach Adaptern in Reichweite, stärkstes Signal zuerst. @returns {Promise<Fund[]>} */
export async function sucheAdapter(dauer = SUCHDAUER_MS) {
  const ble = plugin();
  await ble.initialize({ androidNeverForLocation: true });
  /** @type {Map<string, Fund>} */
  const funde = new Map();
  const hoerer = await ble.addListener("onScanResult", (/** @type {any} */ r) => {
    const name = r.localName || (r.device && r.device.name) || "";
    if (r.device && passtZuAdapter(name, r.uuids)) funde.set(r.device.deviceId, { deviceId: r.device.deviceId, name: name || "OBD-Adapter", rssi: r.rssi ?? -100 });
  });
  try {
    await ble.requestLEScan({ allowDuplicates: false });
    await new Promise((r) => setTimeout(r, dauer));
  } finally {
    await ble.stopLEScan().catch(() => {});
    await hoerer.remove();
  }
  return [...funde.values()].sort((a, b) => b.rssi - a.rssi);
}

/** Anschluss für Elm327 über das Plugin. @param {Fund} fund @returns {import("./elm327.js").Anschluss} */
export function appAnschluss(fund) {
  const ble = plugin();
  const id = fund.deviceId;
  /** @type {{ service: string, lesen: any, schreiben: any } | null} */ let ziel = null;
  /** @type {any[]} */ let hoerer = [];
  return {
    name: fund.name,
    async open(empfang, getrennt) {
      try {
        hoerer.push(await ble.addListener(`disconnected|${id}`, () => { if (getrennt) getrennt(); }));
        await ble.connect({ deviceId: id, timeout: 10000 });
        const { services } = await ble.getServices({ deviceId: id });
        for (const { dienst } of BLE_DIENSTE) {
          const service = services.find((/** @type {any} */ s) => s.uuid.toLowerCase() === dienst);
          const rollen = service && waehleRollen(service.characteristics);
          if (!rollen) continue;
          ziel = { service: service.uuid, lesen: rollen.lesen, schreiben: rollen.schreiben };
          hoerer.push(await ble.addListener(`notification|${id}|${service.uuid}|${rollen.lesen.uuid}`, (/** @type {any} */ e) => empfang(hexZuText(e.value || ""))));
          await ble.startNotifications({ deviceId: id, service: service.uuid, characteristic: rollen.lesen.uuid });
          return;
        }
        throw new Error("Adapter gefunden, aber kein bekannter OBD-Dienst. Ist das wirklich ein ELM327-Adapter?");
      } catch (e) {
        await this.close();
        throw e;
      }
    },
    async write(text) {
      if (!ziel) throw new Error("Adapter ist nicht verbunden");
      const bytes = new TextEncoder().encode(text);
      const ohneAntwort = ziel.schreiben.properties.writeWithoutResponse;
      for (let i = 0; i < bytes.length; i += STUECK) {
        const auftrag = { deviceId: id, service: ziel.service, characteristic: ziel.schreiben.uuid, value: toHex(bytes.slice(i, i + STUECK)) };
        await (ohneAntwort ? ble.writeWithoutResponse(auftrag) : ble.write(auftrag));
      }
    },
    async close() {
      const offen = hoerer;
      hoerer = [];
      ziel = null;
      await Promise.all(offen.map((h) => h.remove().catch(() => {})));
      await ble.disconnect({ deviceId: id }).catch(() => {});
    },
  };
}
