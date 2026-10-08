/**
 * CSP `frame-ancestors` allowlist — who may embed this app in an `<iframe>`.
 *
 * `next.config.ts` sends the result as `Content-Security-Policy` on every
 * response. The allowlist comes from `ALLOWED_FRAME_ANCESTORS` in `.env`
 * (overridable by gitignored `.env.local`): comma-separated full origins
 * with scheme, e.g. `http://localhost:3000,https://learn-anything.dev`.
 *
 * Fail-secure: unset or empty → `'self'` only, i.e. nobody else can frame
 * us. `'self'` is always kept — same-origin framing must keep working.
 */

/** A frame-ancestors source: a scheme, then `://` (host, optional port). */
const CSP_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The first allowed ancestor, as an origin URL — the one the slide page links
 * its palette stylesheet to, because palette.css belongs to the app, not here.
 * `undefined` when the allowlist is unset or holds nothing usable, which the
 * page treats as "link no palette" rather than emitting a broken href.
 */
export function firstFrameAncestor(raw: string | undefined): string | undefined {
  for (const entry of (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (CSP_ORIGIN.test(entry)) return entry.replace(/\/+$/, "");
  }
  return undefined;
}

export function frameAncestorsPolicy(raw: string | undefined): string {
  const sources = ["'self'"];
  for (const entry of (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (CSP_ORIGIN.test(entry)) {
      sources.push(entry);
    } else {
      // A schemeless origin (e.g. "localhost:3000") is not a valid CSP
      // source — the browser would drop it silently. Warn and skip.
      console.warn(
        `[frame-ancestors] ignoring ${JSON.stringify(entry)} — origins need ` +
          `a scheme, e.g. https://learn-anything.dev (see ALLOWED_FRAME_ANCESTORS in .env)`,
      );
    }
  }
  return `frame-ancestors ${sources.join(" ")}`;
}
