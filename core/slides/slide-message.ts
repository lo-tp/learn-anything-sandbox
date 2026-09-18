/**
 * `core/slides/slide-message.ts` — the untrusted parent-message parser
 * (`DEMO_SET_PART`, `DEMO_SET_SLIDE`; #1, #80).
 *
 * These messages arrive from the parent via `postMessage` — an untrusted
 * boundary; the harness never trusts the payload. This parser is the seam:
 * it returns a normalized command, or null to ignore the message. Pure and
 * side-effect-free so it is unit-tested directly (the harness module itself
 * can only run in a browser).
 */
import { clampPart } from "./clamp-part";

/** A parent message the harness acts on; null means "ignore this message". */
export type SlideCommand =
  | { type: "part"; part: number }
  | { type: "slide"; slug: string };

/**
 * Parse an untrusted `postMessage` payload into a harness command.
 *
 * - `DEMO_SET_PART {part}`: only an integer `part` is accepted, clamped
 *   into `0..parts−1` (`parts` is the trusted page-injected count).
 * - `DEMO_SET_SLIDE {slideId}`: only a non-empty string `slideId` is
 *   accepted and used as-is to build the bundle URL (a bad id simply 404s
 *   the bundle → Boundary → `SANDBOX_ERROR`).
 * - anything else: null — the message is ignored.
 */
export function parseSlideMessage(
  data: unknown,
  parts: number,
): SlideCommand | null {
  const msg = data as
    | { type?: unknown; part?: unknown; slideId?: unknown }
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
  return null;
}
