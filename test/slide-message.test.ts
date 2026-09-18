/**
 * Unit tests for the untrusted parent-message parser
 * (core/slides/slide-message.ts; #1, #80).
 *
 * `DEMO_SET_PART` and `DEMO_SET_SLIDE` arrive from the parent via
 * `postMessage` — an untrusted boundary. The parser is the seam: whatever
 * the parent sends, the harness must either normalize it (part clamped into
 * `0..parts−1`, slide id kept as a non-empty string) or ignore it — never
 * act on it raw.
 */
import { describe, expect, it } from "vitest";
import { parseSlideMessage } from "@/core/slides/slide-message";

describe("parseSlideMessage", () => {
  describe("DEMO_SET_PART", () => {
    it("passes in-range parts through untouched", () => {
      expect(parseSlideMessage({ type: "DEMO_SET_PART", part: 0 }, 3)).toEqual({
        type: "part",
        part: 0,
      });
      expect(parseSlideMessage({ type: "DEMO_SET_PART", part: 2 }, 3)).toEqual({
        type: "part",
        part: 2,
      });
    });

    it("clamps out-of-range parts into 0..parts−1", () => {
      expect(parseSlideMessage({ type: "DEMO_SET_PART", part: -1 }, 3)).toEqual({
        type: "part",
        part: 0,
      });
      expect(parseSlideMessage({ type: "DEMO_SET_PART", part: 3 }, 3)).toEqual({
        type: "part",
        part: 2,
      });
      expect(
        parseSlideMessage({ type: "DEMO_SET_PART", part: 1e9 }, 2),
      ).toEqual({ type: "part", part: 1 });
    });

    it("rejects non-integer parts", () => {
      for (const part of [1.5, -0.5, NaN, Infinity, "2", true, null, undefined, {}]) {
        expect(parseSlideMessage({ type: "DEMO_SET_PART", part }, 3)).toBeNull();
      }
    });

    it("ignores the message when part is missing", () => {
      expect(parseSlideMessage({ type: "DEMO_SET_PART" }, 3)).toBeNull();
    });
  });

  describe("DEMO_SET_SLIDE", () => {
    it("passes a non-empty string slideId through as-is", () => {
      expect(parseSlideMessage({ type: "DEMO_SET_SLIDE", slideId: "slide-1" }, 1)).toEqual(
        { type: "slide", slug: "slide-1" },
      );
    });

    it("never normalizes the id — any non-empty string is a candidate slug (a bad one 404s later)", () => {
      for (const slideId of ["a", "slide-1", "Slide_2", "x y", "ünïcode", "/../etc"]) {
        expect(
          parseSlideMessage({ type: "DEMO_SET_SLIDE", slideId }, 1),
        ).toEqual({ type: "slide", slug: slideId });
      }
    });

    it("rejects empty and non-string slideIds", () => {
      for (const slideId of [
        "",
        1,
        1.5,
        true,
        false,
        null,
        undefined,
        {},
        [],
        { slideId: "nested" },
      ]) {
        expect(
          parseSlideMessage({ type: "DEMO_SET_SLIDE", slideId }, 1),
        ).toBeNull();
      }
    });

    it("ignores the message when slideId is missing", () => {
      expect(parseSlideMessage({ type: "DEMO_SET_SLIDE" }, 1)).toBeNull();
    });
  });

  describe("untrusted payloads", () => {
    it("ignores non-object payloads", () => {
      for (const data of [null, undefined, 0, 1, "", "DEMO_SET_PART", [], 42]) {
        expect(parseSlideMessage(data, 3)).toBeNull();
      }
    });

    it("ignores unknown, misspelled, or wrong-case message types", () => {
      for (const type of [
        "DEMO_SET_PARTX",
        "DEMO_SET_SLIDEX",
        "demo_set_part",
        "Demo_Set_Slide",
        "DEMO_SET_SLIDE ",
        "",
        1,
        null,
      ]) {
        expect(
          parseSlideMessage({ type, part: 1, slideId: "a" }, 3),
        ).toBeNull();
      }
      expect(parseSlideMessage({}, 3)).toBeNull();
    });

    it("lets the message type decide when both fields are present", () => {
      expect(
        parseSlideMessage(
          { type: "DEMO_SET_PART", part: 5, slideId: "a" },
          3,
        ),
      ).toEqual({ type: "part", part: 2 });
      expect(
        parseSlideMessage(
          { type: "DEMO_SET_SLIDE", part: 5, slideId: "a" },
          3,
        ),
      ).toEqual({ type: "slide", slug: "a" });
    });

    it("tolerates extra fields on a valid message", () => {
      expect(
        parseSlideMessage(
          { type: "DEMO_SET_SLIDE", slideId: "a", extra: 1 },
          1,
        ),
      ).toEqual({ type: "slide", slug: "a" });
    });

    it("never returns a part outside 0..parts−1 (property check)", () => {
      for (const parts of [1, 2, 7]) {
        for (const part of [-10, -1, 0, 1, parts - 1, parts, parts + 5]) {
          const cmd = parseSlideMessage({ type: "DEMO_SET_PART", part }, parts);
          expect(cmd?.type).toBe("part");
          if (cmd?.type === "part") {
            expect(cmd.part).toBeGreaterThanOrEqual(0);
            expect(cmd.part).toBeLessThanOrEqual(parts - 1);
          }
        }
      }
    });
  });
});
