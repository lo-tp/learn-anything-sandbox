/**
 * Tests for `preProcess` — the pre-compile source fixes (issue #3).
 *
 * Pure and side-effect-free, so it is unit-tested directly.
 */
import { describe, expect, it } from "vitest";
import { preProcess } from "../../../../app/api/compile/preprocess";

describe("preProcess", () => {
  it("inserts a dropped closing backtick on a KaTeX math template", () => {
    expect(preProcess("math={String.raw`(x - x_1)(x - x_2)}")).toBe(
      "math={String.raw`(x - x_1)(x - x_2)`}",
    );
  });

  it("fixes a broken math template that contains braces (depth-tracked)", () => {
    expect(preProcess("math={String.raw`\\frac{b}{a}}")).toBe(
      "math={String.raw`\\frac{b}{a}`}",
    );
  });

  it("fixes a broken math template with nested braces", () => {
    expect(
      preProcess("math={String.raw`\\begin{aligned} a &= b \\end{aligned}}"),
    ).toBe("math={String.raw`\\begin{aligned} a &= b \\end{aligned}`}");
  });

  it("leaves a well-formed math template with braces untouched", () => {
    const src =
      "math={String.raw`\\begin{aligned} x_1+x_2 &= -\\frac{b}{a} \\end{aligned}`}";
    expect(preProcess(src)).toBe(src);
  });

  it("leaves a well-formed math template (no braces) untouched", () => {
    const src = "math={String.raw`ax^2 + bx + c = a(x - x_1)(x - x_2)`}";
    expect(preProcess(src)).toBe(src);
  });

  it("does not touch a String.raw outside a math= attribute", () => {
    const src = "x = String.raw`(a - a_1)}";
    expect(preProcess(src)).toBe(src);
  });

  it("tolerates whitespace around the attribute", () => {
    expect(preProcess("math = { String.raw`(a_1, a_2)}")).toBe(
      "math = { String.raw`(a_1, a_2)`}",
    );
  });

  it("fixes multiple broken templates in one pass", () => {
    const src =
      "<I math={String.raw`(a_1 - a_2)} /><J math={String.raw`(b_1, b_2)} />";
    expect(preProcess(src)).toBe(
      "<I math={String.raw`(a_1 - a_2)`} /><J math={String.raw`(b_1, b_2)`} />",
    );
  });

  it("is a no-op on source with no math template", () => {
    const src = "export default function A() { return <div>hi</div>; }";
    expect(preProcess(src)).toBe(src);
  });

  it("is idempotent (a second pass changes nothing)", () => {
    const once = preProcess("math={String.raw`(x - x_1)(x - x_2)}");
    expect(preProcess(once)).toBe(once);
  });
});
