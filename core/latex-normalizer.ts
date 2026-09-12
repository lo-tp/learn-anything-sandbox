/**
 * LaTeX normalization for the `/api/compile` endpoint (issue #3).
 *
 * A KaTeX expression only gets mangled by esbuild when it lives in a **JS
 * string literal** (the `math={'…'}` form on `<BlockMath>`/`<InlineMath>`):
 * JS escape processing turns `\t` into a tab, `\n` into a newline, etc. By
 * contrast, a JSX *attribute* string (`math="…"`) already carries a literal
 * backslash — esbuild preserves it — so doubling there would corrupt it.
 *
 * `normalizeLatex` therefore rewrites **only** the string-literal value of the
 * `math` prop on `BlockMath`/`InlineMath`, and only the backslashes that begin
 * a KaTeX command (from the generated whitelist), skipping valid JS string
 * escapes so they keep working. Everything else is returned byte-for-byte.
 *
 * This is a pure, side-effect-free function so the route and the tests share
 * one implementation.
 */
import ts from "typescript";
import { KATEX_COMMANDS } from "./katex-commands";

/** One backslash, built to avoid string-escape counting confusion. */
const BS = String.fromCharCode(92);
const KATEX = new Set(KATEX_COMMANDS);
const MATH_TAGS = new Set(["BlockMath", "InlineMath"]);
const JS_CONTROL = new Set(["n", "t", "r", "b", "f", "v"]);
const HEX1 = /^[0-9a-fA-F]$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;

/**
 * Double a single backslash that begins a KaTeX command within a JS string,
 * leaving valid JS string escapes untouched. Idempotent: a backslash already
 * preceded by another backslash (`\\cmd`) is never doubled again.
 */
function doubleKaTeXInString(
  text: string,
  isMasked: (i: number) => boolean = () => false,
): string {
  let out = "";
  let last = 0;
  const re = /\\([A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const i = m.index;
    const name = m[1];
    // Inside a masked range (a `${…}` template expression) — never touch.
    if (isMasked(i)) continue;
    // Already escaped (`\\cmd`) — leave it so a second pass is a no-op.
    if (i > 0 && text[i - 1] === BS) continue;
    const after = i + 1 + name.length;
    const next = text[after] ?? "";
    const four = text.slice(after, after + 4);
    // A backslash that is a valid JS string escape must be preserved:
    //   \x<hex…>  JS hex escape
    //   \uXXXX    JS unicode escape
    //   \n \t \r \b \f \v  JS control escape (unless it is the KaTeX
    //                       accent, i.e. immediately followed by `{`)
    const isJsEscape =
      (name === "x" && HEX1.test(next)) ||
      (name === "u" && HEX4.test(four)) ||
      (JS_CONTROL.has(name) && next !== "{");
    if (!isJsEscape && KATEX.has(BS + name)) {
      out += text.slice(last, i) + BS + BS + name; // single -> double backslash
      last = after;
    }
  }
  return out + text.slice(last);
}

/**
 * Normalize the LaTeX in a self-contained TSX module. Only the `math` prop
 * string literals of `BlockMath`/`InlineMath` are touched; all other source is
 * preserved.
 */
export function normalizeLatex(src: string): string {
  const file = ts.createSourceFile(
    "normalize.tsx",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  const addSpan = (s: number, e: number): void => {
    const contents = src.slice(s, e);
    const next = doubleKaTeXInString(contents);
    if (next !== contents) edits.push({ start: s, end: e, text: next });
  };
  // A template literal WITH `${…}`: double backslashes in the literal text only,
  // masking out the expression ranges so JS inside them is never touched.
  const addTemplate = (ex: ts.TemplateExpression): void => {
    const start = ex.getFullStart();
    const end = ex.getEnd();
    const raw = src.slice(start, end);
    const masked = ex.templateSpans.map((span) => ({
      from: span.expression.getStart(file) - 2 - start,
      to: span.expression.getEnd() + 1 - start,
    }));
    const isMasked = (i: number): boolean => masked.some((r) => i >= r.from && i < r.to);
    const next = doubleKaTeXInString(raw, isMasked);
    if (next !== raw) edits.push({ start, end, text: next });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
      // Only identifier tags qualify (BlockMath / InlineMath are identifiers).
      // Note: no early return — children of non-math elements are still
      // visited, so nested math components get normalized too.
      if (ts.isIdentifier(tag) && MATH_TAGS.has(tag.text)) {
      const attrs = (
        ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes
      ).properties;
      for (const a of attrs) {
        if (!ts.isJsxAttribute(a) || !ts.isIdentifier(a.name) || a.name.text !== "math" || !a.initializer) continue;
        const init = a.initializer;
        if (ts.isJsxExpression(init) && init.expression) {
          const ex = init.expression;
          if (ts.isStringLiteral(ex) || ts.isNoSubstitutionTemplateLiteral(ex)) {
            // Contents only: just inside the opening and closing quotes/backticks.
            addSpan(ex.getStart(file) + 1, ex.getEnd() - 1);
          } else if (ts.isTemplateExpression(ex)) {
            // Rewrite only the literal text; never the `${…}` expressions.
            addTemplate(ex);
          }
        }
        // math="…" (JSX attribute string) and math={expr} are left as-is.
      }
      } // math-tag attributes
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Splice in reverse (descending start) so earlier offsets stay valid.
  let out = src;
  for (const ed of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, ed.start) + ed.text + out.slice(ed.end);
  }
  return out;
}
