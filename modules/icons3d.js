/* Eigene 3D-Icons: jede Kachel und Funktion hat ein eigenes Motiv in eigener Farbe. Aufbau je Icon, bewusst zurückhaltend:
   weicher Bodenschatten, eine schmale Kante als Tiefe, Fläche mit sanftem Verlauf, leichter Glanz oben, Details.
   Farben nur aus Tokens (.i3 in tokens.css); ein Ton wie .t-crit am Icon oder an einem Vorfahren färbt das ganze Icon um. */
import { s } from "./dom.js";

const R = (x, y, width, height, rx = 0) => ["rect", { x, y, width, height, rx }];
const C = (cx, cy, r) => ["circle", { cx, cy, r }];
const P = (d) => ["path", { d }];

function gearPath(cx, cy, outer, inner, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * step - Math.PI / 2;
    pts.push([inner, a - step * .5], [inner, a - step * .3], [outer, a - step * .2], [outer, a + step * .2], [inner, a + step * .3]);
  }
  return pts.map(([r, a], i) => `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`).join("") + "Z";
}

/* body: Formen, die Tiefe, Verlauf und Glanz bekommen. detail: [klasse, form] darüber. */
/* Coupé: dient als Fahrzeug-Symbol und, mit Plus-Abzeichen, als »Fahrzeug anlegen«. Schlicht wie die anderen Icons:
   eine Karosserie mit flacher Kabine weit hinten, getönte Scheiben, zwei Räder, Scheinwerfer vorn rechts. */
const CAR = {
  body: [P("M4 45.5V39c0-2 1.2-3.2 3.5-3.8l3.5-.9c5-6.8 11-11.7 19-12.1 5-.2 9 2.3 12.6 7.8l12.9 2.6c3.5.7 5.5 2.8 5.5 5.9v7c0 1.1-.9 2-2 2h-1.5a8.5 8.5 0 0 0-17 0h-16a8.5 8.5 0 0 0-17 0H6c-1.1 0-2-.9-2-2z")],
  detail: [
    ["d-win", P("M13.6 34c4.3-5.2 9-8.6 14.4-9.2h.6V34z")],
    ["d-win", P("M30.4 24.7c4 0 7 1.7 9.6 5.9l.6 3.4H30.4z")],
    ["d-crease", P("M7 39.3c18-.8 35-.8 53-.3v.9c-18-.5-35-.5-53 .3z")],
    ["d-head", P("M56 34.6l4.6 1.4-.1 1.6-4.1-.8z")],
    ["d-tail", P("M4.2 37.4l4.4-1v1.6l-4.4.9z")],
    ...[16, 49].flatMap((x) => [["d-tire", C(x, 47.5, 7)], ["d-rimface", C(x, 47.5, 4.3)], ["d-rimlip", C(x, 47.5, 4.3)], ["d-cap", C(x, 47.5, 1.5)]]),
  ],
};

const ICONS = {
  mil: {
    body: [P("M9 27h6v-5h6v-4h17v4h5l4 4h6v-4h4v21h-4v-4h-6l-6 8H23l-6-6H9z")],
    detail: [["d-ink", R(29.5, 23, 5, 13, 2.5)], ["d-ink", C(32, 41.5, 2.8)]],
  },
  chip: {
    body: [R(14, 14, 36, 36, 8), ...[21, 30, 39].flatMap((x) => [R(x, 7, 4, 9, 2), R(x, 48, 4, 9, 2), R(7, x, 9, 4, 2), R(48, x, 9, 4, 2)])],
    detail: [["d-ink", R(21, 21, 22, 22, 5)], ["d-glow", R(27, 27, 10, 10, 2.5)], ["d-light", C(25, 25, 1.5)]],
  },
  scope: {
    body: [R(7, 10, 50, 37, 9), P("M24 46h16l3 8H21z")],
    detail: [["d-ink", R(12, 15, 40, 27, 5)], ["d-wave", P("M15 31h6l3-8 5 15 4-12 3 5h12")], ["d-light", C(48, 19, 1.6)]],
  },
  clipboard: {
    body: [R(13, 12, 38, 44, 7), R(23, 6, 18, 10, 4)],
    detail: [["d-light", R(18, 19, 28, 32, 4)], ["d-ink", R(27, 8.5, 10, 5, 2.5)], ["d-check", P("M24 35l6 6 11-12")]],
  },
  bubble: {
    body: [P("M10 18a9 9 0 0 1 9-9h26a9 9 0 0 1 9 9v17a9 9 0 0 1-9 9H31l-11 9v-9a9 9 0 0 1-10-9z")],
    detail: [["d-light", P("M32 15.5l3 7 7 3-7 3-3 7-3-7-7-3 7-3z")], ["d-glow", C(45, 17, 2.4)], ["d-glow", C(19, 34, 1.8)]],
  },
  report: {
    body: [R(20, 6, 32, 42, 6), R(12, 13, 32, 43, 6)],
    detail: [["d-light", R(18, 41, 5, 9, 1.5)], ["d-light", R(26, 32, 5, 18, 1.5)], ["d-light", R(34, 36, 5, 14, 1.5)], ["d-ink", R(18, 20, 20, 3.5, 1.75)], ["d-ink", R(18, 26, 13, 3.5, 1.75)]],
  },
  clock: {
    body: [C(32, 31, 23)],
    detail: [["d-light", C(32, 31, 16.5)], ["d-hand", P("M32 21v10l7.5 5")], ["d-ink", C(32, 31, 2.8)], ["d-tick", P("M32 16.5v3M47.5 31h-3M32 45.5v-3M16.5 31h3")]],
  },
  palette: {
    body: [P("M32 8C18 8 8 18 8 31c0 12 9 21 20 21 4 0 5-3 4-6-1-4 1-7 5-7h6c7 0 13-5 13-13C56 16 45 8 32 8z")],
    detail: [["d-ok", C(20, 25, 4.2)], ["d-warn", C(30.5, 17, 4.2)], ["d-crit", C(42.5, 20, 4.2)], ["d-light", C(19, 38, 4.2)]],
  },
  route: {
    body: [C(15, 46, 8), R(40, 8, 5, 42, 2.5), P("M45 10h14l-4.5 6.5L59 23H45z")],
    detail: [["d-trail", P("M15 46C20 30 34 56 41 40")], ["d-light", C(15, 46, 3)]],
  },
  gauge: {
    body: [P("M7 44a25 25 0 0 1 50 0v5H7z")],
    detail: [["d-scale", P("M14 44a18 18 0 0 1 36 0")], ["d-band", P("M26 27.2a18 18 0 0 1 12 0")], ["d-hand", P("M32 44L43 27")], ["d-ink", C(32, 44, 4.5)]],
  },
  exhaust: {
    body: [R(5, 25, 28, 20, 10), R(30, 30, 17, 10, 4)],
    detail: [["d-puff", C(53, 31, 5)], ["d-puff", C(57, 22, 4)], ["d-puff", C(51, 15, 3)], ["d-light", C(19, 35, 6.5)], ["d-checkink", P("M15.8 35l2.4 2.4 4.6-4.8")]],
  },
  freeze: {
    body: [R(7, 18, 50, 33, 8), R(19, 11, 15, 9, 3)],
    detail: [["d-ink", C(32, 34.5, 11.5)], ["d-snow", P("M32 26.5v16M25 30.5l14 8M25 38.5l14-8")], ["d-light", C(48, 25, 2)]],
  },
  gear: {
    body: [P(gearPath(32, 31, 24, 18, 9))],
    detail: [["d-ink", C(32, 31, 9)], ["d-glow", P("M33.5 23.5l-6 9h5l-1.5 7 6-9.5h-5z")]],
  },
  tag: {
    body: [P("M9 15a6 6 0 0 1 6-6h21l19 19a6 6 0 0 1 0 8.5L37.5 54a6 6 0 0 1-8.5 0L9 35z")],
    detail: [["d-ink", C(20, 20, 4.5)], ["d-code", P("M24 35l8 8M28.5 30.5l8 8M33 26l8 8")]],
  },
  book: {
    body: [R(11, 7, 40, 48, 6)],
    detail: [["d-spine", R(11, 7, 8, 48, 3)], ["d-light", R(25, 18, 19, 3.5, 1.75)], ["d-light", R(25, 25, 14, 3.5, 1.75)], ["d-light", R(25, 32, 17, 3.5, 1.75)], ["d-glow", P("M39 7h7v16l-3.5-3.5L39 23z")]],
  },
  plug: {
    body: [P("M9 17h46l-5.5 26a7 7 0 0 1-7 6H21.5a7 7 0 0 1-7-6z"), R(28, 47, 8, 11, 2.5)],
    detail: [...[17, 21.5, 26, 30.5, 35, 39.5, 44, 48.5].map((x) => ["d-ink", C(x - 1, 25, 1.7)]), ...[20, 24.5, 29, 33.5, 38, 42.5, 47].map((x) => ["d-ink", C(x - 1.5, 33, 1.7)])],
  },
  garage: {
    body: [P("M6 25.5 30 10.2a4 4 0 0 1 4 0l24 15.3V53a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z")],
    detail: [["d-ink", R(14, 30, 36, 26, 3)], ["d-light", R(17, 34, 30, 3, 1.5)], ["d-light", R(17, 40.5, 30, 3, 1.5)], ["d-light", R(17, 47, 30, 3, 1.5)], ["d-glow", C(32, 21, 2.6)]],
  },
  bluetooth: {
    body: [R(12, 7, 40, 50, 15)],
    detail: [["d-code", P("M24 23l16 14-8 7V20l8 7-16 14")]],
  },
  download: {
    body: [P("M26 6h12v19h9L32 41 17 25h9z"), R(7, 38, 50, 18, 7)],
    detail: [["d-ink", R(13, 46, 38, 4, 2)], ["d-light", C(48, 48, 2)]],
  },
  lock: {
    body: [P("M19 31v-8a13 13 0 0 1 26 0v8h-7v-8a6 6 0 0 0-12 0v8z"), R(11, 29, 42, 28, 8)],
    detail: [["d-ink", C(32, 40, 4.5)], ["d-ink", R(30, 41, 4, 9, 2)]],
  },
  shield: {
    body: [P("M32 5l22 8v16c0 14-9 23-22 29C19 52 10 43 10 29V13z")],
    detail: [["d-ink", P("M32 13l15 5.5v10.5c0 9.5-6 16-15 20.5z")], ["d-checkink", P("M23 31l6 6 12-13")]],
  },
  code: {
    body: [R(6, 11, 52, 42, 9)],
    detail: [["d-ink", R(11, 19, 42, 29, 5)], ["d-code", P("M25 27l-7 7 7 7M39 27l7 7-7 7M35 24l-6 20")]],
  },
  /* CANdor-Roboter: Erkennungszeichen der KI. Runder Kopf mit Visier, zwei leuchtende Augen, Antenne mit Kontaktkugel wie im Logo. */
  robot: {
    body: [R(30.6, 9, 2.8, 9, 1.4), C(32, 8.5, 4.6), R(5.5, 27, 7, 13, 3.5), R(51.5, 27, 7, 13, 3.5), R(11, 16, 42, 34, 13), R(23, 49, 18, 7, 3.5)],
    detail: [
      ["d-ink", R(16, 22.5, 32, 19, 9.5)],
      ["d-visor", P("M19 27c2-2.8 5-4 9-4.2h8c4 .2 7 1.4 9 4.2")],
      ["d-eye", ["ellipse", { cx: 25.5, cy: 32, rx: 3.6, ry: 4 }]],
      ["d-eye", ["ellipse", { cx: 38.5, cy: 32, rx: 3.6, ry: 4 }]],
      ["d-smile", P("M27.5 37.4c2.8 1.7 6.2 1.7 9 0")],
      ["d-tip", C(32, 8.5, 2.1)],
      ["d-light", C(45.5, 20.5, 1.5)],
      ["d-ink", R(27, 51.3, 10, 2.4, 1.2)],
    ],
  },
  car: CAR,
  carplus: { ...CAR, detail: [...CAR.detail, ["d-badge", C(51, 12.5, 9.5)], ["d-plus", P("M51 8v9M46.5 12.5h9")]] },
};
export const ICON3D_NAMES = Object.keys(ICONS);

let seq = 0;
const shape = ([tag, attrs], extra = {}) => s(tag, { ...attrs, ...extra });

export function icon3d(name, extraClass = "") {
  const def = ICONS[name] || ICONS.chip;
  const id = `i3x${++seq}`;
  return s("svg", { class: `i3 ${extraClass}`.trim(), viewBox: "0 0 64 64", width: 64, height: 64, "aria-hidden": "true", focusable: "false", "data-icon": name },
    s("defs", {},
      s("linearGradient", { id: `${id}f`, x1: 0, y1: 0, x2: .2, y2: 1 }, s("stop", { offset: 0, class: "s-hi" }), s("stop", { offset: .55, class: "s-mid" }), s("stop", { offset: 1, class: "s-lo" })),
      s("radialGradient", { id: `${id}g`, cx: .35, cy: 0, r: .8 }, s("stop", { offset: 0, class: "s-w0" }), s("stop", { offset: 1, class: "s-w1" })),
      s("radialGradient", { id: `${id}s` }, s("stop", { offset: 0, class: "s-sh0" }), s("stop", { offset: 1, class: "s-sh1" })),
      s("clipPath", { id: `${id}c` }, ...def.body.map((b) => shape(b)))),
    s("ellipse", { class: "i3-shadow", cx: 32, cy: 59, rx: 24, ry: 4.5, fill: `url(#${id}s)` }),
    s("g", { class: "i3-lo", transform: "translate(0 2)" }, ...def.body.map((b) => shape(b))),
    s("g", { fill: `url(#${id}f)` }, ...def.body.map((b) => shape(b))),
    def.clipped ? s("g", { "clip-path": `url(#${id}c)` }, ...def.clipped.map(([cls, b]) => shape(b, { class: cls }))) : null,
    s("rect", { x: 0, y: 0, width: 64, height: 30, fill: `url(#${id}g)`, "clip-path": `url(#${id}c)` }),
    s("g", { class: "i3-rim" }, ...def.body.map((b) => shape(b))),
    ...def.detail.map(([cls, b]) => shape(b, { class: cls })));
}
