/**
 * Emits the rendering-signature probe used for the ADR-015 parity proof.
 *
 * Screenshot diffing needs an image toolchain and still tolerates
 * antialiasing noise. This instead hashes the COMPUTED STYLE of every rendered
 * element on a page — which resolves CSS custom properties to their actual
 * values, so a token indirection that changes nothing produces an identical
 * hash, and one that changes anything cannot possibly produce one.
 *
 *   npx tsx scripts/storefront-parity-probe.ts     # prints the snippet
 *
 * Paste the snippet into the browser console (or a javascript_exec call) on
 * each page, on the tree before the change and the tree after it, and compare.
 *
 * Two deliberate normalizations, both semantics-preserving:
 *   - <style>/<script>/<meta> and friends are excluded. They render nothing,
 *     and emitting the theme block into <head> would otherwise shift indices.
 *   - Duplicate entries in a font stack are collapsed. A family repeated later
 *     in a stack is unreachable, so `Inter, system-ui, sans-serif, system-ui,
 *     sans-serif` and `Inter, system-ui, sans-serif` select the same face.
 *     The pre-tokenization config produced the duplicated form by accident.
 */
const PROPS = [
  "color", "backgroundColor", "backgroundImage",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "boxShadow", "fontWeight", "fontSize", "lineHeight", "letterSpacing",
  "outlineColor", "fill", "stroke", "padding", "margin", "opacity",
];

const SKIP = "SCRIPT|STYLE|LINK|META|TITLE|NOSCRIPT|TEMPLATE";

console.log(
  `(async()=>{const P=${JSON.stringify(PROPS)};` +
  `const els=[document.documentElement,document.body,...document.body.querySelectorAll("*")]` +
  `.filter(e=>!/^(${SKIP})$/.test(e.tagName));` +
  `const ff=e=>getComputedStyle(e).fontFamily.split(",").map(s=>s.trim()).filter((v,i,a)=>a.indexOf(v)===i).join(",");` +
  `const sig=els.map((el,i)=>i+"|"+el.tagName+"|"+ff(el)+"|"+P.map(p=>getComputedStyle(el)[p]).join("|")).join("\\n");` +
  `const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sig));` +
  `return {path:location.pathname,n:els.length,hash:[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")};})()`
);
