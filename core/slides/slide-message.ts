/**
 * `core/slides/slide-message.ts` — the untrusted parent-message parser
 * (`DEMO_SET_PART`, `DEMO_SET_SLIDE`, `DEMO_SET_THEME`; #1, #80, #185).
 *
 * These messages arrive from the parent via `postMessage` — an untrusted
 * boundary; the harness never trusts the payload. This parser is the seam:
 * it returns a normalized command, or null to ignore the message. Pure and
 * side-effect-free so it is unit-tested directly (the harness module itself
 * can only run in a browser).
 */
import { clampPart } from "./clamp-part";

/**
 * The themes a parent may put a frame in — the two `public/palette.css`
 * defines (`:root` dark, `.light`). Anything else has no palette to switch
 * to, so it is not a command.
 */
export type SlideTheme = "light" | "dark";

/** A parent message the harness acts on; null means "ignore this message". */
export type SlideCommand =
  | { type: "part"; part: number }
  | { type: "slide"; slug: string }
  | { type: "theme"; theme: SlideTheme };

/**
 * Parse an untrusted `postMessage` payload into a harness command.
 *
 * - `DEMO_SET_PART {part}`: only an integer `part` is accepted, clamped
 *   into `0..parts−1` (`parts` is the trusted page-injected count).
 * - `DEMO_SET_SLIDE {slideId}`: only a non-empty string `slideId` is
 *   accepted and used as-is to build the bundle URL (a bad id simply 404s
 *   the bundle → Boundary → `SANDBOX_ERROR`).
 * - `DEMO_SET_THEME {theme}` (#185): only the two themes the palette
 *   defines are accepted. The whole point of the message is that the frame
 *   repaints *without* reloading, so there is no `?theme=`-style fallback to
 *   default to: an unknown theme is ignored rather than guessed at, leaving
 *   the frame exactly as it is.
 * - anything else: null — the message is ignored.
 */
export function parseSlideMessage(
  data: unknown,
  parts: number,
): SlideCommand | null {
  const msg = data as
    | { type?: unknown; part?: unknown; slideId?: unknown; theme?: unknown }
    | null;
  if (msg?.type === "DEMO_SET_PART" && Number.isInteger(msg.part)) {
    // Clamp, never trust: whatever integer the parent sends, the rendered
    // part must land in `0..parts−1`.
    return { type: "part", part: clampPart(msg.part as number, parts) };
  }
  if (
    msg?.type === "DEMO_SET_SLIDE" &&
    typeof msg.slideId === "string" &&
    msg.slideId.length > 0
  ) {
    return { type: "slide", slug: msg.slideId };
  }
  // The two literal themes, compared exactly: no case folding, no trimming,
  // no nearest match. A theme the palette does not define is not a request to
  // repaint, it is a message to ignore.
  if (
    msg?.type === "DEMO_SET_THEME" &&
    (msg.theme === "light" || msg.theme === "dark")
  ) {
    return { type: "theme", theme: msg.theme };
  }
  return null;
}
