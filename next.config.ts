import type { NextConfig } from "next";
import { frameAncestorsPolicy } from "./core/frame-ancestors";

const nextConfig: NextConfig = {
  /* config options here */
  // The /sandbox route compiles the hand-inserted sample demo with esbuild
  // per request (#37). esbuild is a native package — it must be required
  // at runtime, not bundled by Turbopack.
  serverExternalPackages: ["esbuild"],

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
