// @vitest-environment jsdom
/**
 * Unit tests for the sandbox harness (`core/sandbox/framework.tsx`, ADR 0007).
 *
 * Tests the exported surface — the pure `clampPart` and `SandboxApp` (the
 * harness body) — rendered with stub demo components. The entry glue at the
 * bottom of the module (per-slug lazy import + boot into `#root`) is thin and
 * is exercised in a real browser by the `/demo-sandbox` showcase host.
 *
 * `window.DEMO` is populated by `./demo-meta`, imported **before** the
 * framework so its module-scope read finds it (same order the demo page
 * guarantees in production).
 */
import "./demo-meta";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { SandboxApp, clampPart } from "../../core/sandbox/framework";

const PARTS = 3;

// ---------------------------------------------------------------------------
// environment stubs (jsdom has no ResizeObserver; `parent` === `window`)
// ---------------------------------------------------------------------------

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  observe = vi.fn();
  disconnect = vi.fn();
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.last = this;
  }
}

/** A settled lazy demo, the way the import-map bundle would resolve. */
function makeDemo(component: React.ComponentType<{ part: number }>) {
  return React.lazy(async () => ({ default: component }));
}

/** A pending lazy demo so the Suspense fallback is observable. */
function makePendingDemo() {
  let resolve: ((c: React.ComponentType<{ part: number }>) => void) | undefined;
  const Demo = React.lazy(
    () =>
      new Promise<{ default: React.ComponentType<{ part: number }> }>((r) => {
        resolve = (c) => r({ default: c });
      }),
  );
  return { Demo, resolve: (c: React.ComponentType<{ part: number }>) => resolve!(c) };
}

/** Dispatch a host message the way `parent.postMessage` from the page would. */
function postToSandbox(data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data }));
  });
}

/** Flush microtasks so settled lazy demos render. */
async function flush() {
  await act(async () => {});
}

const Show = ({ part }: { part: number }) => <div>part-{part}</div>;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakeResizeObserver.last = null;
});

// ---------------------------------------------------------------------------

describe("clampPart", () => {
  it("clamps below zero to 0", () => {
    expect(clampPart(-3, PARTS)).toBe(0);
  });

  it("clamps above parts-1 to parts-1", () => {
    expect(clampPart(9, PARTS)).toBe(2);
  });

  it("passes through in-range parts", () => {
    expect(clampPart(1, PARTS)).toBe(1);
  });

  it("collapses to 0 for a single-part demo", () => {
    expect(clampPart(5, 1)).toBe(0);
  });
});

describe("SandboxApp", () => {
  it("shows the Suspense fallback until the lazy demo resolves", async () => {
    const { Demo, resolve } = makePendingDemo();
    render(<SandboxApp Demo={Demo} parts={PARTS} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    await act(async () => {
      resolve(Show);
    });
    expect(screen.getByText("part-0")).toBeTruthy();
  });

  it("follows in-range DEMO_SET_PART messages", async () => {
    render(<SandboxApp Demo={makeDemo(Show)} parts={PARTS} />);
    await flush();
    expect(screen.getByText("part-0")).toBeTruthy();
    postToSandbox({ type: "DEMO_SET_PART", part: 1 });
    expect(screen.getByText("part-1")).toBeTruthy();
    postToSandbox({ type: "DEMO_SET_PART", part: 2 });
    expect(screen.getByText("part-2")).toBeTruthy();
  });

  it("clamps DEMO_SET_PART into 0..parts-1", async () => {
    render(<SandboxApp Demo={makeDemo(Show)} parts={PARTS} />);
    await flush();
    postToSandbox({ type: "DEMO_SET_PART", part: 1 });
    expect(screen.getByText("part-1")).toBeTruthy();
    postToSandbox({ type: "DEMO_SET_PART", part: -7 });
    expect(screen.getByText("part-0")).toBeTruthy();
    postToSandbox({ type: "DEMO_SET_PART", part: 42 });
    expect(screen.getByText("part-2")).toBeTruthy();
  });

  it("ignores DEMO_SET_PART with a non-integer part", async () => {
    render(<SandboxApp Demo={makeDemo(Show)} parts={PARTS} />);
    await flush();
    postToSandbox({ type: "DEMO_SET_PART", part: 1.5 });
    postToSandbox({ type: "DEMO_SET_PART", part: "1" });
    postToSandbox({ type: "DEMO_SET_PART", part: null });
    expect(screen.getByText("part-0")).toBeTruthy();
  });

  it("ignores messages that are not DEMO_SET_PART", async () => {
    render(<SandboxApp Demo={makeDemo(Show)} parts={PARTS} />);
    await flush();
    postToSandbox({ type: "OTHER", part: 1 });
    postToSandbox({ part: 1 });
    postToSandbox("nope");
    postToSandbox(null);
    expect(screen.getByText("part-0")).toBeTruthy();
  });

  it("does not remount the demo when the part changes (demo state survives)", async () => {
    const mounts: number[] = [];
    const unmounts: number[] = [];
    const Tracking = ({ part }: { part: number }) => {
      useEffect(() => {
        mounts.push(1);
        return () => {
          unmounts.push(1);
        };
      }, []);
      return <div>part-{part}</div>;
    };
    render(<SandboxApp Demo={makeDemo(Tracking)} parts={PARTS} />);
    await flush();
    postToSandbox({ type: "DEMO_SET_PART", part: 1 });
    postToSandbox({ type: "DEMO_SET_PART", part: 2 });
    expect(screen.getByText("part-2")).toBeTruthy();
    expect(mounts).toHaveLength(1);
    expect(unmounts).toHaveLength(0);
  });

  it("posts SANDBOX_ERROR to the host when the demo throws", async () => {
    const post = vi.spyOn(window, "postMessage");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): React.ReactNode {
      throw new Error("boom");
    }
    const { container } = render(<SandboxApp Demo={makeDemo(Boom)} parts={PARTS} />);
    await flush();
    expect(post).toHaveBeenCalledWith(
      { type: "SANDBOX_ERROR", message: "boom" },
      "*",
    );
    expect(post).toHaveBeenCalledTimes(1);
    // The boundary rendered nothing for the crashed demo.
    expect(container.innerHTML).toBe("");
    consoleError.mockRestore();
  });

  it("posts SANDBOX_RESIZE with the body height and disconnects on unmount", async () => {
    const post = vi.spyOn(window, "postMessage");
    Object.defineProperty(document.body, "scrollHeight", {
      value: 432,
      configurable: true,
    });
    const { unmount } = render(
      <SandboxApp Demo={makeDemo(Show)} parts={PARTS} />,
    );
    await flush();
    const ro = FakeResizeObserver.last;
    expect(ro).toBeTruthy();
    expect(ro!.observe).toHaveBeenCalledWith(document.body);
    act(() => {
      ro!.callback([], ro as unknown as ResizeObserver);
    });
    expect(post).toHaveBeenCalledWith(
      { type: "SANDBOX_RESIZE", height: 432 },
      "*",
    );
    unmount();
    expect(ro!.disconnect).toHaveBeenCalledTimes(1);
    delete (document.body as { scrollHeight?: number }).scrollHeight;
  });
});
