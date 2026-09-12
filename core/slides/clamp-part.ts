/**
 * `core/slides/clamp-part.ts` — the untrusted-input clamp (issue #1).
 *
 * `DEMO_SET_PART` messages come from the parent (which may be hostile or
 * buggy); the harness never trusts the value — it clamps it into
 * `0..parts−1`, where `parts` is the page-injected trusted `DEMO` meta.
 * Pure and side-effect-free so it is unit-tested directly (the harness
 * module itself can only run in a browser).
 */

/** Clamp an untrusted `DEMO_SET_PART` value into `0..parts−1`. */
export function clampPart(part: number, parts: number): number {
  return Math.min(Math.max(part, 0), parts - 1);
}
