import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The /slides route compiles slides with esbuild per request, and
  // /api/compile normalizes LaTeX with the TypeScript compiler API —
  // both are required at runtime, not bundled by Turbopack.
  serverExternalPackages: ["esbuild", "typescript"],

  /**
   * No `headers()` block here, deliberately. `headers()` is evaluated while
   * **building** and written into `.next/routes-manifest.json`, which `next start`
   * replays — so whatever it reads is the build's environment, never the
   * container's. The CSP `frame-ancestors` policy is set per request in
   * `middleware.ts` from `ALLOWED_FRAME_ANCESTORS`; the allowlist and its
   * fail-secure default stay in `core/frame-ancestors.ts`.
   */
};

export default nextConfig;
