import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { frameAncestorsPolicy } from "./core/frame-ancestors";

/**
 * The CSP `frame-ancestors` policy, set per request from runtime configuration.
 *
 * This used to live in `next.config.ts` as `headers()`. That cannot work for a
 * value supplied at deploy time: Next evaluates `headers()` while **building** and
 * writes the result into `.next/routes-manifest.json`, and `next start` replays
 * that manifest — so the built image carried `frame-ancestors 'self'` no matter
 * what the cluster put in the environment, and the app embedded this one in an
 * `<iframe>` could never show a slide. The deployed symptom was exactly that: the
 * iframe's document returned 200 and the browser refused to frame it
 * (`net::ERR_BLOCKED_BY_RESPONSE`, "Framing 'https://sandbox.lotp.xyz/' violates
 * the following Content Security Policy directive: frame-ancestors 'self'").
 *
 * So: middleware, where `process.env` is the environment the container is running
 * in. The allowlist itself is unchanged (`core/frame-ancestors.ts`, still
 * fail-secure to `'self'` when unset, `'self'` always kept), and its tests still
 * cover it.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.headers.set(
    "Content-Security-Policy",
    frameAncestorsPolicy(process.env.ALLOWED_FRAME_ANCESTORS),
  );
  return response;
}

export const config = {
  matcher: "/:path*",
};
