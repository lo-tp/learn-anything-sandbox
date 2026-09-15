/**
 * Unit tests for `fixKaTeXBacktick` — the fix that re-inserts a dropped closing
 * backtick on a KaTeX `math={String.raw`…`}` template before compiling.
 *
 * Pure and side-effect-free, so it is unit-tested directly.
 */
import { describe, expect, it } from "vitest";
import { fixKaTeXBacktick } from "../../../../../app/api/compile/preprocess/fix-katex-backtick";

describe("fixKaTeXBacktick", () => {
  it("inserts a dropped closing backtick on a KaTeX math template", () => {
    expect(fixKaTeXBacktick("math={String.raw`(x - x_1)(x - x_2)}")).toBe(
      "math={String.raw`(x - x_1)(x - x_2)`}",
    );
  });

  it("fixes a broken math template that contains braces (depth-tracked)", () => {
    expect(fixKaTeXBacktick("math={String.raw`\\frac{b}{a}}")).toBe(
      "math={String.raw`\\frac{b}{a}`}",
    );
  });

  it("fixes a broken math template with nested braces", () => {
    expect(
      fixKaTeXBacktick("math={String.raw`\\begin{aligned} a &= b \\end{aligned}}"),
    ).toBe("math={String.raw`\\begin{aligned} a &= b \\end{aligned}`}");
  });

  it("leaves a well-formed math template with braces untouched", () => {
    const src =
      "math={String.raw`\\begin{aligned} x_1+x_2 &= -\\frac{b}{a} \\end{aligned}`}";
    expect(fixKaTeXBacktick(src)).toBe(src);
  });

  it("leaves a well-formed math template (no braces) untouched", () => {
    const src = "math={String.raw`ax^2 + bx + c = a(x - x_1)(x - x_2)`}";
    expect(fixKaTeXBacktick(src)).toBe(src);
  });

  it("does not touch a String.raw outside a math= attribute", () => {
    const src = "x = String.raw`(a - a_1)}";
    expect(fixKaTeXBacktick(src)).toBe(src);
  });

  it("tolerates whitespace around the attribute", () => {
    expect(fixKaTeXBacktick("math = { String.raw`(a_1, a_2)}")).toBe(
      "math = { String.raw`(a_1, a_2)`}",
    );
  });

  it("fixes multiple broken templates in one pass", () => {
    const src =
      "<I math={String.raw`(a_1 - a_2)} /><J math={String.raw`(b_1, b_2)} />";
    expect(fixKaTeXBacktick(src)).toBe(
      "<I math={String.raw`(a_1 - a_2)`} /><J math={String.raw`(b_1, b_2)`} />",
    );
  });

  it("is a no-op on source with no math template", () => {
    const src = "export default function A() { return <div>hi</div>; }";
    expect(fixKaTeXBacktick(src)).toBe(src);
  });

  it("is idempotent (a second pass changes nothing)", () => {
    const once = fixKaTeXBacktick("math={String.raw`(x - x_1)(x - x_2)}");
    expect(fixKaTeXBacktick(once)).toBe(once);
  });
});
