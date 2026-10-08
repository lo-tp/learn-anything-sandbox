/**
 * Unit tests for the CSP frame-ancestors allowlist (core/frame-ancestors.ts).
 *
 * The policy is what the app sends as `Content-Security-Policy` on every
 * response — it controls which origins may embed this app in an `<iframe>`. The
 * policy builder is exercised directly, plus one wiring check on the middleware
 * that actually sends it.
 *
 * That wiring check used to target `nextConfig.headers()`, and it passed while
 * production was broken: `headers()` is evaluated at build time and frozen into
 * `.next/routes-manifest.json`, so the container's `ALLOWED_FRAME_ANCESTORS`
 * never reached the header. Testing the unit is not testing the shipped
 * behaviour — the header is asserted against the response the container produces
 * in the image smoke test (.github/workflows/build-image.yml).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  firstFrameAncestor,
  frameAncestorsPolicy,
} from "@/core/frame-ancestors";
import { middleware } from "../middleware";

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

describe("middleware wiring", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the runtime allowlist as the response's CSP header", () => {
    vi.stubEnv("ALLOWED_FRAME_ANCESTORS", "https://example.com");
    const response = middleware(new Request("https://sandbox.test/slides/x") as never);
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://example.com",
    );
  });

  it("fails secure to 'self' when the runtime env is empty", () => {
    vi.stubEnv("ALLOWED_FRAME_ANCESTORS", "");
    const response = middleware(new Request("https://sandbox.test/") as never);
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
  });
});

describe("firstFrameAncestor — the origin the slide page links to", () => {
  it("takes the first entry, not the list", () => {
    expect(firstFrameAncestor("https://a.example,https://b.example")).toBe("https://a.example");
  });

  it("is undefined when nothing usable is configured", () => {
    expect(firstFrameAncestor(undefined)).toBeUndefined();
    expect(firstFrameAncestor("")).toBeUndefined();
    expect(firstFrameAncestor("localhost:3000")).toBeUndefined();
  });

  it("strips a trailing slash so the joined href cannot double up", () => {
    expect(firstFrameAncestor("https://a.example/")).toBe("https://a.example");
  });
});
