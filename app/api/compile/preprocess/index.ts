/**
 * `app/api/compile/preprocess` — source fixes applied to slide JSX before it is
 * compiled (issue #3).
 *
 * Each fix for a known source issue lives in its own module in this folder and
 * is registered in `FIXES` below. `preProcess` runs them in order; to add a new
 * fix, create a module here and list it in `FIXES` (list order = run order).
 *
 * The fixes are pure and side-effect-free, so they are unit-tested directly.
 */
import { fixKaTeXBacktick } from "./fix-katex-backtick";

/** A single source fix: a pure string → string transform. */
export type Fix = (source: string) => string;

/** Fixes applied in order — each one receives the previous one's output. */
const FIXES: readonly Fix[] = [fixKaTeXBacktick];

/** Run every registered fix against `source`, in order. */
export function preProcess(source: string): string {
  return FIXES.reduce((src, fix) => fix(src), source);
}
