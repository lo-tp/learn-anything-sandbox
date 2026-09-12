/**
 * Edge-case unit tests for `normalizeLatex` (core/latex-normalizer.ts).
 *
 * Complements the cases in test/app/api/compile/route.test.ts: the exact
 * boundaries between JS string escapes (which must survive esbuild
 * untouched) and KaTeX command backslashes (which must be doubled inside a
 * JS string literal so esbuild's escape processing leaves one backslash).
 *
 * Escaping note: a single backslash is `\\` inside these template literals;
 * two backslashes are `\\\\`.
 */
import { describe, expect, it } from "vitest";
import { normalizeLatex } from "@/core/latex-normalizer";

describe("normalizeLatex — JS escape boundaries", () => {
  it("leaves the JS hex escape \\x… alone", () => {
    expect(normalizeLatex(`<InlineMath math={'\\x41'} />`)).toBe(
      `<InlineMath math={'\\x41'} />`,
    );
  });

  it("leaves JS control escapes that are NOT the \\v{…} accent alone", () => {
    for (const esc of ["\\n", "\\t", "\\r", "\\b", "\\f", "\\v"]) {
      const src = `<InlineMath math={'${esc}'} />`;
      expect(normalizeLatex(src)).toBe(src);
    }
  });

  it("keeps \\v a control escape and \\v{a} an accent in the same string", () => {
    const src = `<InlineMath math={'\\v and \\v{a}'} />`;
    expect(normalizeLatex(src)).toBe(`<InlineMath math={'\\v and \\\\v{a}'} />`);
  });

  it("treats \\u NOT followed by four hex digits as a KaTeX command", () => {
    // `\u0` is not a valid \uXXXX JS escape, and `\u` is a KaTeX command.
    expect(normalizeLatex(`<InlineMath math={'\\u0'} />`)).toBe(
      `<InlineMath math={'\\\\u0'} />`,
    );
    // …while `\u0041` is a JS escape and stays alone.
    expect(normalizeLatex(`<InlineMath math={'\\u0041'} />`)).toBe(
      `<InlineMath math={'\\u0041'} />`,
    );
  });

  it("doubles a command at the very end of the string (no trailing char)", () => {
    expect(normalizeLatex(`<InlineMath math={'\\text'} />`)).toBe(
      `<InlineMath math={'\\\\text'} />`,
    );
  });
});

describe("normalizeLatex — template literal forms", () => {
  it("doubles KaTeX in a no-substitution template literal", () => {
    const src = "<InlineMath math={" + "`\\text{x}`" + "} />";
    expect(normalizeLatex(src)).toBe("<InlineMath math={" + "`\\\\text{x}`" + "} />");
  });

  it("is idempotent on template literals (an already-escaped command is not re-doubled)", () => {
    const src = "<BlockMath math={" + "`\\\\frac{1}{2}`" + "} />";
    expect(normalizeLatex(src)).toBe(src);
  });
});

describe("normalizeLatex — scope boundaries", () => {
  it("ignores a math prop on a component that is not BlockMath/InlineMath", () => {
    const src = `<Foo math={'\\text{a}'} />`;
    expect(normalizeLatex(src)).toBe(src);
  });

  it("ignores a non-math prop on a math component", () => {
    const src = `<InlineMath label={'\\text{a}'} math={'x'} />`;
    expect(normalizeLatex(src)).toBe(src);
  });

  it("reaches math props nested in a function body", () => {
    const src = `export default () => <div><BlockMath math={'\\frac{1}{2}'} /></div>;`;
    expect(normalizeLatex(src)).toBe(
      `export default () => <div><BlockMath math={'\\\\frac{1}{2}'} /></div>;`,
    );
  });

  it("returns non-math sources byte-for-byte", () => {
    const src = `const x = '\\text{a}';\nexport default () => <div>{x}</div>;`;
    expect(normalizeLatex(src)).toBe(src);
  });
});
