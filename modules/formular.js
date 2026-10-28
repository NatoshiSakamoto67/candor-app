/* Formularfeld wie im Designsystem: Beschriftung, Eingabe, Hinweis oder Fehler mit aria-describedby.
   f: { k, label, ph, req, hint, options, area, mode, max, auto, cap, mono, list, suffix, type }. Genutzt von garage.js und werkstatt.js. */
import { h, mark } from "./dom.js";

export function formField(f, values, errors, prefix) {
  const id = `${prefix}-${f.k}`, err = errors[f.k], hintId = `${id}-hint`;
  const common = { id, name: f.k, "aria-invalid": err ? "true" : null, "aria-describedby": err || f.hint ? hintId : null, required: f.req || null };
  let ctl;
  if (f.options) ctl = h("select", { ...common, class: "inp" }, ...f.options.map(([val, text]) => h("option", { value: val, selected: String(values[f.k] ?? "") === val || null }, text)));
  else if (f.area) ctl = h("textarea", { ...common, class: "inp", rows: 3, maxlength: 500, placeholder: f.ph }, values[f.k] || "");
  else ctl = h("input", { ...common, class: `inp${f.mono ? " mono" : ""}${f.cap ? " caps" : ""}`, type: "text", value: values[f.k] ?? "", placeholder: f.ph, inputmode: f.mode || null, maxlength: f.max || null, autocomplete: f.auto || null, list: f.list || null, autocapitalize: f.cap ? "characters" : null, spellcheck: "false" });
  return h("div", { class: `fld${f.area ? " wide" : ""}${err ? " bad" : ""}` },
    h("label", { for: id }, f.label, f.req ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
    f.suffix ? h("span", { class: "with-suffix" }, ctl, h("span", { class: "suffix" }, f.suffix)) : ctl,
    err || f.hint ? h("span", { class: err ? "fld-err" : "fld-hint", id: hintId }, err ? mark("crit") : null, err || f.hint) : null);
}
