/**
 * The direct-access gate — may `/slides/{id}` serve its page to a top-level
 * browser tab, or only to a parent's `<iframe>`?
 *
 * The default is the safe one: the slide page executes untrusted,
 * backend-compiled slide code, so it is served only for a frame navigation
 * (`Sec-Fetch-Dest: iframe`) — it then runs in the parent's sandboxed
 * opaque-origin frame, never in an app origin. A top-level tab sends
 * `Sec-Fetch-Dest: document` (or nothing) and gets 403.
 *
 * For development, `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true` (set it in the
 * gitignored `.env.local`) opens that gate: paste a
 * `/slides/{slide_id}?theme=light` URL straight into a tab and it renders.
 * Two fail-safes keep the switch dev-only:
 *
 * - unset, empty, or anything other than `true`/`1` → closed (a mistyped
 *   value warns instead of silently doing something else).
 * - `NODE_ENV=production` → closed whatever the env says, because this gate is
 *   a trust boundary, not a convenience: it must not be openable by a
 *   committed default that travels into a deploy.
 */

/** The only spellings that open the gate; anything else leaves it closed. */
const TRUTHY = new Set(["true", "1"]);

export function directSlideAccessEnabled(
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return false;

  if (nodeEnv === "production") {
    console.warn(
      "[direct-slide-access] SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS is ignored in " +
        "production — the iframe-only execution gate stays closed.",
    );
    return false;
  }

  if (TRUTHY.has(value)) return true;

  console.warn(
    `[direct-slide-access] ignoring ${JSON.stringify(value)} — use ` +
      `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true (development only).`,
  );
  return false;
}
