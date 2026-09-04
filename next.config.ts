import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The /sandbox route compiles the hand-inserted sample demo with esbuild
  // per request (#37). esbuild is a native package — it must be required
  // at runtime, not bundled by Turbopack.
  serverExternalPackages: ["esbuild"],
};

export default nextConfig;
