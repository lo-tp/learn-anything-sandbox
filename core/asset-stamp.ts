/**
 * `core/asset-stamp.ts` — the identity a deploy-built asset's URL must carry
 * (#185).
 *
 * `/slides/harness.js` and the `/slides/vendor/*` artifacts are built at deploy
 * and served `max-age=31536000, immutable`. That is only honest while the URL
 * *is* the bytes. At a constant path, a browser that framed one slide page keeps
 * running the build it cached: a normal reload does not revalidate a resource
 * that is fresh for a year, so neither a rebuild nor a new deploy can reach it.
 *
 * #185 is the concrete case. A frame still running the pre-#185 harness
 * receives `DEMO_SET_THEME` and ignores it, so the theme switch does nothing —
 * from the reader's side indistinguishable from the fix never having been
 * written. Measured, not reasoned about: with the new build on the server and
 * a warm browser profile, the frame served its harness from its own cache
 * (`transferSize: 0`) and the toggle did nothing; the same page in a cold
 * profile repainted.
 *
 * The stamp is the sha256 of the bytes about to be served, first 12 hex: 48
 * bits, so a collision would cost a re-download, never a wrong file. Same bytes
 * always give the same stamp, which is what keeps an unchanged build — React,
 * KaTeX — cached forever while a changed one cannot be.
 *
 * Pure and synchronous: bytes in, stamp out. Reading the file is the caller's
 * job, because the caller is the one that serves it.
 */
import { createHash } from "node:crypto";

/** How much of the digest goes in the URL. */
const HEX = 12;

/** The identity of these bytes. */
export function stampOf(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, HEX);
}

/** The URL for `bytes` at `urlPath`: the same path, carrying their identity. */
export function stampUrl(urlPath: string, bytes: Buffer | string): string {
  return `${urlPath}?v=${stampOf(bytes)}`;
}
