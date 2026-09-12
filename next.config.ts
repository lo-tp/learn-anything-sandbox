import type { NextConfig } from "next";
import { frameAncestorsPolicy } from "./core/frame-ancestors";

const nextConfig: NextConfig = {
  /* config options here */
  // The /slides route compiles slides with esbuild per request, and
  // /api/compile normalizes LaTeX with the TypeScript compiler API —
  // both are required at runtime, not bundled by Turbopack.
  serverExternalPackages: ["esbuild", "typescript"],

  /**
   * Who may embed this app in an `<iframe>`: CSP `frame-ancestors` on
   * every response. The allowlist is `ALLOWED_FRAME_ANCESTORS` in `.env`
   * (see core/frame-ancestors.ts): `'self'` is always allowed, and an
   * unset/empty value fails secure to `'self'` only.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestorsPolicy(process.env.ALLOWED_FRAME_ANCESTORS),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
