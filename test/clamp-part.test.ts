/**
 * Unit tests for the untrusted-input clamp (core/slides/clamp-part.ts).
 *
 * `DEMO_SET_PART` arrives from the parent via `postMessage` — an untrusted
 * boundary. The harness is the seam: whatever integer the parent sends,
 * the rendered part must land in `0..parts−1`. The harness itself only
 * runs in a browser, so the clamp is extracted to a pure module and
 * tested here.
 */
import { describe, expect, it } from "vitest";
import { clampPart } from "@/core/slides/clamp-part";

describe("clampPart", () => {
  it("keeps in-range parts untouched", () => {
    expect(clampPart(0, 3)).toBe(0);
    expect(clampPart(1, 3)).toBe(1);
    expect(clampPart(2, 3)).toBe(2);
  });

  it("clamps negative parts up to 0", () => {
    expect(clampPart(-1, 3)).toBe(0);
    expect(clampPart(-999, 3)).toBe(0);
  });

  it("clamps parts ≥ parts down to parts−1", () => {
    expect(clampPart(3, 3)).toBe(2);
    expect(clampPart(100, 3)).toBe(2);
    // Hostile values can't escape the range either way.
    expect(clampPart(Number.MAX_SAFE_INTEGER, 2)).toBe(1);
    expect(clampPart(Number.MIN_SAFE_INTEGER, 2)).toBe(0);
  });

  it("collapses a single-part demo to part 0 for every input", () => {
    expect(clampPart(0, 1)).toBe(0);
    expect(clampPart(1, 1)).toBe(0);
    expect(clampPart(-5, 1)).toBe(0);
  });

  it("never returns a part outside 0..parts−1 (property check)", () => {
    for (const parts of [1, 2, 7]) {
      for (const part of [-10, -1, 0, 1, parts - 1, parts, parts + 5]) {
        const p = clampPart(part, parts);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(parts - 1);
        expect(Number.isInteger(p)).toBe(true);
      }
    }
  });
});
