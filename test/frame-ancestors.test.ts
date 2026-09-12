/**
 * Unit tests for the CSP frame-ancestors allowlist (core/frame-ancestors.ts).
 *
 * The policy is what next.config.ts sends as `Content-Security-Policy` on
 * every response — it controls which origins may embed this app in an
 * `<iframe>`. The policy builder is exercised directly, plus one wiring
 * check on the config's `headers()` entry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { frameAncestorsPolicy } from "@/core/frame-ancestors";
import nextConfig from "../next.config";

describe("frameAncestorsPolicy", () => {
  it("fails secure to 'self' when unset or empty", () => {
    expect(frameAncestorsPolicy(undefined)).toBe("frame-ancestors 'self'");
    expect(frameAncestorsPolicy("")).toBe("frame-ancestors 'self'");
    expect(frameAncestorsPolicy("  ,  ")).toBe("frame-ancestors 'self'");
  });

  it("always allows 'self' and appends the allowlist", () => {
    expect(frameAncestorsPolicy("http://localhost:3000")).toBe(
      "frame-ancestors 'self' http://localhost:3000",
    );
  });

  it("splits comma-separated origins and trims whitespace", () => {
    expect(frameAncestorsPolicy(" http://localhost:3000 , https://learn-anything.dev ")).toBe(
      "frame-ancestors 'self' http://localhost:3000 https://learn-anything.dev",
    );
  });

  it("skips schemeless entries (the browser would drop them silently) with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(frameAncestorsPolicy("localhost:3000,https://example.com")).toBe(
      "frame-ancestors 'self' https://example.com",
    );
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("skips protocol-relative (//host) entries too, one warning per bad entry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(frameAncestorsPolicy("//example.com,localhost:3000,https://ok.dev")).toBe(
      "frame-ancestors 'self' https://ok.dev",
    );
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("next.config.ts wiring", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the env allowlist as frame-ancestors CSP on every route", async () => {
    vi.stubEnv("ALLOWED_FRAME_ANCESTORS", "https://example.com");
    const entries = await nextConfig.headers!();
    expect(entries).toEqual([
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://example.com",
          },
        ],
      },
    ]);
  });

  it("falls back to 'self' only when the env var is unset", async () => {
    vi.stubEnv("ALLOWED_FRAME_ANCESTORS", undefined);
    const entries = await nextConfig.headers!();
    expect(entries?.[0]?.headers?.[0]?.value).toBe("frame-ancestors 'self'");
  });
});
