/**
 * Tests for `preProcess` — the ordered composition of the source fixes in
 * `app/api/compile/preprocess`. Each individual fix is tested in its own
 * colocated `*.test.ts`; here we only cover the composition contract: that
 * `preProcess` runs the registered fixes and is a no-op when none applies.
 */
import { describe, expect, it } from "vitest";
import { preProcess } from "../../../../app/api/compile/preprocess";

describe("preProcess", () => {
  it("applies the registered fixes to the source", () => {
    expect(preProcess("math={String.raw`(x - x_1)(x - x_2)}")).toBe(
      "math={String.raw`(x - x_1)(x - x_2)`}",
    );
  });

  it("returns the source unchanged when no fix applies", () => {
    const src = "export default function A() { return <div>hi</div>; }";
    expect(preProcess(src)).toBe(src);
  });
});
