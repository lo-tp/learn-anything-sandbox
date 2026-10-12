/**
 * The slide canvas (#177) — the defaults every generated slide inherits.
 *
 * `public/slides/reset.css` is the canvas the slide page hands to an LLM bundle
 * (`<link rel="stylesheet" href="/slides/reset.css">`). A generated slide styles
 * its own cards, but its default text, and the ground behind the demo, come from
 * here — and KaTeX/MathJax paint with `currentColor`, so math follows whatever
 * text it inherits. That default was `color: #d0daff`: correct on the night desk
 * (12.7:1) and effectively invisible on riso paper (1.24:1 against `--background`
 * `#f8f2e6`), which is the reported symptom on `?theme=light` while the frame
 * itself was correctly themed.
 *
 * These tests read the canvas stylesheet from `public/`, which is what the
 * browser's CSS parser receives: `/slides/reset.css` is answered by Next's static
 * handling, not by the `[...slides]` route (verified against the running dev
 * server: `GET /slides/reset.css` returns these bytes as `text/css`, while that
 * route would answer the same path with a slide page — 403 for anything that
 * isn't `Sec-Fetch-Dest: iframe`, and a stylesheet request never is). The file
 * is deliberately not moved behind that route for the same reason.
 *
 * The contract:
 * - ground and text both come from the palette's own pair (`--background` /
 *   `--on-background`), so whichever theme `palette.css` resolves, the pair stays
 *   paired and the canvas carries no theme of its own;
 * - a `var()` fallback is what renders when `palette.css` cannot load — the slide
 *   page emits no palette link at all when `ALLOWED_FRAME_ANCESTORS` is unset
 *   (staging's overlay omits it on purpose) — so the fallbacks must be the
 *   palette's own classless `:root`, the night desk, and legible on their own.
 *
 * The palette pairs below are a hand-copy of `learn-anything-frontend`'s
 * `public/palette.css` (`:root` and `.light`). That duplication is the point:
 * those two pairs are what this canvas inherits its colors from, and if the
 * palette re-themes, this test is the alarm that says so rather than a slide
 * rendering unreadably in production.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The canvas stylesheet a slide page links. */
const CANVAS = readFileSync(
  path.join(process.cwd(), "public", "slides", "reset.css"),
  "utf8",
);

/** A background and the text color designed against it. */
type Pair = { ground: string; text: string };

/** The palette pairs this canvas inherits from (see the header). */
const PALETTE: Record<"dark" | "light", Pair> = {
  // `:root` — the classless "Night Desk" default, the theme of a page with no class.
  dark: { ground: "#1d1813", text: "#f4efe1" },
  // `.light` — "riso paper", opted into by `<html class="light">`, which the
  // slide page emits for `?theme=light`. The reported repro.
  light: { ground: "#f8f2e6", text: "#181420" },
};

type Decl = { property: string; value: string };

/** Declarations, comments stripped: prose about retired colors can't satisfy a guard. */
function declarations(css: string): Decl[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...code.matchAll(/([-a-z]+)\s*:\s*([^;{}]+);/gi)].map(
    ([, property, value]) => ({ property: property.toLowerCase(), value: value.trim() }),
  );
}

const CANVAS_DECLS = declarations(CANVAS);

/** The two declarations that paint the canvas itself: its ground and its text. */
const GROUND = CANVAS_DECLS.find((d) => d.property === "background");
const TEXT = CANVAS_DECLS.find((d) => d.property === "color");

/** Whether a declaration is one of the two that paint the canvas. */
const paints = (d: Decl): boolean =>
  d.property === "color" || d.property.startsWith("background");

/**
 * A painted value that resolves without a theme: a palette token reference
 * (`var(--token)`, `color-mix` of tokens), or one of these keywords. Anything
 * else — a hex literal, a named color — is a color that is correct in exactly
 * one theme, which is the defect class #177 is about.
 */
const THEME_NEUTRAL = ["transparent", "currentcolor", "inherit", "none"];
function isThemeNeutral(value: string): boolean {
  if (/var\(\s*--[\w-]+/.test(value)) return true;
  return value
    .split(/[\s,()]+/)
    .filter(Boolean)
    .every((token) => THEME_NEUTRAL.includes(token.toLowerCase()));
}

/** The literal a `var(--token, #rrggbb)` falls back to, if it is that shape.
 * 6 digits only: that is the form palette.css publishes, and a shorthand would
 * not be a copy of it. */
function fallbackOf(value: string | undefined): string | undefined {
  const match = value?.match(/^var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{6})\s*\)$/i);
  return match?.[2];
}

/** WCAG 2.1 relative luminance (sRGB) — the standard, not this file. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio between two colors. */
function contrastRatio({ ground, text }: Pair): number {
  const [hi, lo] = [relativeLuminance(text), relativeLuminance(ground)].sort(
    (a, b) => b - a,
  );
  return (hi + 0.05) / (lo + 0.05);
}

describe("the slide canvas (#177)", () => {
  it("paints nothing on the canvas from a theme-specific color", () => {
    const themeSpecific = CANVAS_DECLS.filter((d) => paints(d) && !isThemeNeutral(d.value));
    // `color: #d0daff` is the shape this rejects.
    expect(themeSpecific).toEqual([]);
  });

  it("takes its text from the ground's own palette pair", () => {
    // Paired tokens, not two independently chosen colors: whatever theme resolves
    // --background, --on-background is the text that was designed against it.
    expect(GROUND?.value).toMatch(/^var\(\s*--background\s*[,)]/);
    expect(TEXT?.value).toMatch(/^var\(\s*--on-background\s*[,)]/);
  });

  it("falls back to the palette's own classless default pair", () => {
    // With no palette link the page is classless, so the fallbacks are the
    // palette's dark `:root` — or the frame is a different theme than the app
    // it sits in (the retired pre-Colour-Press navy `#081425` used to be here).
    expect({ ground: fallbackOf(GROUND?.value), text: fallbackOf(TEXT?.value) }).toEqual(
      PALETTE.dark,
    );
  });

  it("keeps inherited text legible in both themes (WCAG AA text)", () => {
    // The acceptance bar from the issue: every inherited-text case ≥ 4.5:1 in
    // both themes. Measured with the WCAG 2.1 formula rather than copied from
    // the issue's report.
    const cases: Record<string, Pair> = {
      // Light theme: the reported repro, text `--on-background` on `--background`.
      "palette light": PALETTE.light,
      // Dark theme with palette.css loaded.
      "palette dark": PALETTE.dark,
      // No palette.css at all: whatever the canvas's own fallbacks resolve to.
      "canvas fallback": {
        ground: fallbackOf(GROUND?.value) ?? "",
        text: fallbackOf(TEXT?.value) ?? "",
      },
    };
    for (const [name, pair] of Object.entries(cases)) {
      expect(contrastRatio(pair), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
