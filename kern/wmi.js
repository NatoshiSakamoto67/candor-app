// @ts-check
/* Marke aus den ersten drei Zeichen der FIN (ISO 3780), wie kfzdiag/wmi.py. */

const FIN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** @type {Readonly<Record<string, string>>} */
export const WMI = Object.freeze({
  WVW: "Volkswagen", WV1: "Volkswagen Nutzfahrzeuge", WV2: "Volkswagen Nutzfahrzeuge",
  WAU: "Audi", WUA: "Audi", WBA: "BMW", WBS: "BMW M", WBY: "BMW i", WMW: "MINI",
  WDB: "Mercedes-Benz", WDD: "Mercedes-Benz", WDC: "Mercedes-Benz", W1K: "Mercedes-Benz",
  W1N: "Mercedes-Benz", WDF: "Mercedes-Benz Transporter", W1V: "Mercedes-Benz Transporter",
  WP0: "Porsche", WP1: "Porsche", W0L: "Opel", W0V: "Opel", WF0: "Ford (Deutschland)", WME: "smart",
  VF1: "Renault", VF3: "Peugeot", VF7: "Citroën", VR1: "DS", VR3: "Peugeot", VR7: "Citroën",
  UU1: "Dacia", ZFA: "Fiat", ZFF: "Ferrari", ZAR: "Alfa Romeo", ZLA: "Lancia",
  VSS: "SEAT", VSK: "Nissan (Spanien)", TMB: "Škoda", TMA: "Hyundai (Tschechien)",
  TRU: "Audi (Ungarn)", VNK: "Toyota (Frankreich)",
  SAL: "Land Rover", SAJ: "Jaguar", SCC: "Lotus", SFD: "Alexander Dennis", YV1: "Volvo", YS3: "Saab",
  JTD: "Toyota", JT2: "Toyota", JTE: "Toyota", SB1: "Toyota (Großbritannien)", NMT: "Toyota (Türkei)",
  JHM: "Honda", SHH: "Honda (Großbritannien)", JMZ: "Mazda", JN1: "Nissan", SJN: "Nissan (Großbritannien)",
  JS2: "Suzuki", TSM: "Suzuki (Ungarn)", JMB: "Mitsubishi", JF1: "Subaru",
  KMH: "Hyundai", NLH: "Hyundai (Türkei)", KNA: "Kia", KNE: "Kia", U5Y: "Kia (Slowakei)", U6Y: "Kia (Slowakei)",
  LSV: "Volkswagen (China)", LRW: "Tesla (China)", XP7: "Tesla (Deutschland)", "5YJ": "Tesla",
  "1FA": "Ford (USA)", "1G1": "Chevrolet", "1C4": "Chrysler/Jeep",
});

/** 17 Zeichen ohne I, O, Q. @param {string} fin */
export const istGueltigeFin = (fin) => FIN.test(fin.trim().toUpperCase());
/** @param {string} fin @returns {string | null} */
export const markeAusFin = (fin) => WMI[fin.trim().toUpperCase().slice(0, 3)] || null;
/** "Hyundai (Türkei)" -> "Hyundai" @param {string | null} marke */
export const grundmarke = (marke) => (marke ? marke.split(" (")[0] : null);
