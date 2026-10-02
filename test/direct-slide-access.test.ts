/**
 * Unit tests for the direct-access gate (core/direct-slide-access.ts).
 *
 * The gate decides whether `/slides/{id}` serves its page to a top-level tab
 * or 403s it (iframe-only by default, so untrusted slide code never executes
 * in an app origin). `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true` opens it in
 * development only.
 */
import { describe, expect, it, vi } from "vitest";
import { directSlideAccessEnabled } from "@/core/direct-slide-access";

const DEV = "development";

describe("directSlideAccessEnabled", () => {
  it("stays closed when unset or empty", () => {
    expect(directSlideAccessEnabled(undefined, DEV)).toBe(false);
    expect(directSlideAccessEnabled("", DEV)).toBe(false);
    expect(directSlideAccessEnabled("   ", DEV)).toBe(false);
  });

  it("opens for true / 1, whitespace- and case-insensitive", () => {
    expect(directSlideAccessEnabled("true", DEV)).toBe(true);
    expect(directSlideAccessEnabled(" TRUE ", DEV)).toBe(true);
    expect(directSlideAccessEnabled("1", DEV)).toBe(true);
  });

  it("warns and stays closed for any other value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(directSlideAccessEnabled("yes", DEV)).toBe(false);
    expect(directSlideAccessEnabled("1x", DEV)).toBe(false);
    expect(directSlideAccessEnabled("false", DEV)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("stays closed in production whatever the env says", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(directSlideAccessEnabled("true", "production")).toBe(false);
    expect(directSlideAccessEnabled("1", "production")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("says nothing in production when the switch is simply unset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(directSlideAccessEnabled(undefined, "production")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
