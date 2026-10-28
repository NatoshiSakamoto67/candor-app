/* Marke CANdor: Zeichen als Bild (marke/candor-zeichen.svg), Schriftzug als Text in den App-Schriften,
   damit er Hell und Dunkel von selbst folgt. »CAN« in IBM Plex Mono, »dor« in Barlow Semi Condensed. */
import { h } from "./dom.js";

export const NAME = "CANdor";
export const wordmark = (cls = "") => h("span", { class: `wordmark ${cls}`.trim(), "aria-label": NAME }, h("b", { "aria-hidden": "true" }, "CAN"), h("span", { "aria-hidden": "true" }, "dor"));
export const brandMark = (size = 28) => h("img", { class: "brand-mark", src: "marke/candor-zeichen.svg", alt: "", width: size, height: size, decoding: "async" });
export const lockup = (size = 56, cls = "") => h("span", { class: `lockup ${cls}`.trim() }, brandMark(size), wordmark());
