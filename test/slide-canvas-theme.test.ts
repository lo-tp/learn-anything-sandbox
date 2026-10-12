/**
 * The slide canvas (#177) — the defaults every generated slide inherits.
 *
 * `public/slides/reset.css` is the canvas the slide page hands to an LLM bundle.
 * A generated slide styles its own cards, but its default text and the ground
 * behind the demo come from here, and KaTeX/MathJax paint with `currentColor` —
 * so anything in the bundle that never sets `color` inherits the canvas default.
 * That default was `#d0daff`: correct on the dark desk (12.7:1) and effectively
 * invisible on riso paper (1.24:1 against `--background` `#f8f2e6`), which is the
 * reported symptom on `?theme=light` while the frame itself was correctly themed.
 *
 * These tests guard the served bytes. `public/` is served byte-for-byte by Next
 * and that is what the browser's CSS parser receives — deliberately not moved
 * behind the `/slides/{id}` route, because a stylesheet fetched from *inside* a
 * framed slide carries `Sec-Fetch-Dest: document`, which that route 403s.
 *
 * The contract:
 * - ground and text both come from the palette's own pair (`--background` /
 *   `--on-background`), so whichever theme `palette.css` resolves, the pair stays
 *   paired and the canvas needs no theme of its own;
 * - a `var()` fallback is what renders when `palette.css` cannot load (staging
 *   sets no `ALLOWED_FRAME_ANCESTORS`, so the page links no palette at all), so
 *   the fallbacks must be the palette's own classless `:root` defaults — the
 *   night desk — and legible on their own. Acceptance bar: ≥ 4.5:1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The canvas stylesheet a slide page links (`<link href="/slides/reset.css">`). */
const CANVAS = readFileSync(
  path.join(process.cwd(), "public", "slides", "reset.css"),
  "utf8",
);

/**
 * The palette's classless default (`:root`, the "Night Desk") — the ground and
 * its paired text. Read from `learn-anything-frontend/public/palette.css`; the
 * values are asserted here on purpose, so a retired theme (the pre-Colour-Press
 * navy `#081425` this file used to carry) cannot survive as a fallback.
 */
const PALETTE_DEFAULT_GROUND = "#1d1813";
const PALETTE_DEFAULT_TEXT = "#f4efe1";

type Decl = { property: string; value: string };

/** Declarations, comments stripped: prose about retired colors can't satisfy a guard. */
function declarations(css: string): Decl[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...code.matchAll(/([-a-z]+)\s*:\s*([^;{}]+);/gi)].map(
    ([, property, value]) => ({
      property: property.toLowerCase(),
      value: value.trim(),
    }),
  );
}

/** The declarations that paint the canvas itself: text and ground. */
function painted(decls: Decl[]): Decl[] {
  return decls.filter(
    (d) => d.property === "color" || /^(background|background-color)$/.test(d.property),
  );
}

/** The literal a `var(--token, literal)` falls back to, or undefined if not tokened. */
function fallbackOf(value: string): string | undefined {
  const m = value.match(/^var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{3,8})\s*\)$/i);
  return m ? m[2] : undefined;
}

/** WCAG 2.1 relative luminance (sRGB, s = 0.055) — the standard, not this file. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio between two colors. */
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the slide canvas (#177)", () => {
  it("paints nothing from a bare literal — text and ground both come from a palette token", () => {
    const untokened = painted(declarations(CANVAS)).filter(
      (d) => !/^var\(\s*--[\w-]+/.test(d.value),
    );
    // `color: #d0daff` is the shape this rejects: a color correct in exactly one theme.
    expect(untokened).toEqual([]);
  });

  it("takes its text from the ground's own palette pair", () => {
    const ground = declarations(CANVAS).find((d) => d.property === "background");
    const text = declarations(CANVAS).find((d) => d.property === "color");
    // Paired tokens, not two independently-chosen colors: whatever theme resolves
    // --background, --on-background is the text that was designed against it.
    expect(ground?.value).toMatch(/^var\(\s*--background\b/);
    expect(text?.value).toMatch(/^var\(\s*--on-background\b/);
  });

  it("falls back to the palette's own classless default ground and text", () => {
    const ground = declarations(CANVAS).find((d) => d.property === "background");
    const text = declarations(CANVAS).find((d) => d.property === "color");
    // No palette link is emitted when ALLOWED_FRAME_ANCESTORS is unset, and the
    // page's classless default is the palette's dark `:root` — so these fallbacks
    // are the night desk, or the frame clashes with the app it sits in.
    expect(fallbackOf(ground?.value ?? "")).toBe(PALETTE_DEFAULT_GROUND);
    expect(fallbackOf(text?.value ?? "")).toBe(PALETTE_DEFAULT_TEXT);
  });

  it("is legible on its own terms without palette.css (WCAG AA text)", () => {
    const ground = fallbackOf(
      declarations(CANVAS).find((d) => d.property === "background")?.value ?? "",
    );
    const text = fallbackOf(
      declarations(CANVAS).find((d) => d.property === "color")?.value ?? "",
    );
    expect(ground).toBeDefined();
    expect(text).toBeDefined();
    // The bar from the issue: inherited text ≥ 4.5:1. Measured here against the
    // WCAG 2.1 formula rather than copied from a report.
    expect(contrastRatio(text!, ground!)).toBeGreaterThanOrEqual(4.5);
  });
});
