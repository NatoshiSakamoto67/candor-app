/* Markdown der KI-Antworten, sicher: parse() zerlegt in Blöcke und Inline-Teile (reine Logik, getestet),
   render() baut daraus Elemente. Es wird nie HTML aus dem Text übernommen; Links nur mit http oder https. */
const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

export function inline(text) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(([^)\s]+)\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: "code", v: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: "b", c: inline(m[2].slice(2, -2)) });
    else if (m[3]) out.push({ t: "i", c: inline(m[3].slice(1, -1)) });
    else {
      const label = m[4].slice(1, m[4].indexOf("]("));
      out.push(SAFE_URL.test(m[5]) ? { t: "a", href: m[5], c: inline(label) } : { t: "text", v: label });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function parse(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [], list = null;
  const flushPara = () => { if (para.length) { blocks.push({ t: "p", c: inline(para.join(" ")) }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const body = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i]);
      blocks.push({ t: "code", lang: fence[1], v: body.join("\n") });
      continue;
    }
    const head = line.match(/^(#{1,4})\s+(.+)$/);
    const ul = line.match(/^\s*[-*•]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) { flushPara(); flushList(); }
    else if (head) { flushPara(); flushList(); blocks.push({ t: "h", level: Math.min(4, head[1].length + 1), c: inline(head[2]) }); }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ t: "hr" }); }
    else if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (!list || list.t !== kind) { flushList(); list = { t: kind, items: [] }; }
      list.items.push(inline((ul || ol)[1]));
    } else if (/^>\s?/.test(line)) { flushPara(); flushList(); blocks.push({ t: "quote", c: inline(line.replace(/^>\s?/, "")) }); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return blocks;
}

/* Elemente bauen; h kommt von außen (dom.js), damit parse() ohne Browser testbar bleibt. */
export function render(src, h) {
  const inl = (parts) => parts.map((p) => {
    if (p.t === "text") return p.v;
    if (p.t === "code") return h("code", {}, p.v);
    if (p.t === "b") return h("strong", {}, ...inl(p.c));
    if (p.t === "i") return h("em", {}, ...inl(p.c));
    return h("a", { href: p.href, target: "_blank", rel: "noopener noreferrer nofollow" }, ...inl(p.c));
  });
  return parse(src).map((b) => {
    if (b.t === "p") return h("p", {}, ...inl(b.c));
    if (b.t === "h") return h(`h${b.level}`, {}, ...inl(b.c));
    if (b.t === "ul" || b.t === "ol") return h(b.t, {}, ...b.items.map((it) => h("li", {}, ...inl(it))));
    if (b.t === "code") return h("pre", {}, h("code", { "data-lang": b.lang || null }, b.v));
    if (b.t === "quote") return h("blockquote", {}, ...inl(b.c));
    return h("hr", {});
  });
}
