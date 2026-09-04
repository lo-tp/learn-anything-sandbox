/**
 * `core/sandbox/harness.tsx` — the sandbox harness (ADR 0007, docs/demos.md).
 *
 * The only program in the opaque-origin sandbox that is **not** LLM-generated.
 * Identical for every demo; built once at deploy (`harness.js`, ESM, react
 * external) and loaded by the demo page. It owns every lifecycle concern a
 * demo is not allowed to have:
 *
 * - **Loading** → Suspense fallback (a real state, not a blank document);
 * - **Import failure** (404, syntax, network) and **render crashes** → the
 *   error boundary → `SANDBOX_ERROR` to the host;
 * - **Part switching** → `setPart` re-render, no remount (demo state survives);
 * - **Auto-height** → `ResizeObserver` → `SANDBOX_RESIZE`.
 *
 * Trust rules: `window.DEMO` comes from the page we own (trusted); everything
 * else is the untrusted per-demo bundle, which is only ever *rendered* by this
 * app — never given a second program of its own. The only untrusted input that
 * crosses back in is `DEMO_SET_PART`, whose `part` is clamped, never trusted.
 *
 * Cross-boundary surface (full v1 — adding a message is an ADR-level decision):
 *
 * | direction        | message              | here |
 * |------------------|----------------------|------|
 * | parent → iframe  | `DEMO_SET_PART {part}` (integer) | clamped to `0..parts−1` |
 * | iframe → parent  | `SANDBOX_RESIZE {height}`        | body scrollHeight |
 * | iframe → parent  | `SANDBOX_ERROR {message}`        | boundary callback |
 *
 * `postMessage` targetOrigin: posts to the parent use `"*"` — the parent is
 * the app origin, which the opaque-origin sandbox cannot know, so
 * `postMessage(msg, "null")` would never be delivered. This is not the
 * confidentiality mechanism: the host validates every field on receipt.
 */
import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/** Injected by the demo page (`window.DEMO`) before the harness module loads. */
type DemoMeta = { slug: string; parts: number };
const { slug, parts } = (window as unknown as { DEMO: DemoMeta }).DEMO;

// Non-static template → esbuild leaves it a native import() of the per-demo
// bundle; the import map + module cache route its `react` to the same single
// vendored instance the harness uses.
const Demo = lazy(() => import(`/sandbox/${slug}/bundle.js`));

class Boundary extends React.Component<
  { onError: (error: unknown) => void; children: React.ReactNode },
  { error: unknown }
> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

function postToParent(message: object) {
  // "*" — the app origin is unknowable from an opaque origin (see header).
  parent.postMessage(message, "*");
}

function App() {
  const [part, setPart] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; part?: unknown } | null;
      if (data?.type === "DEMO_SET_PART" && Number.isInteger(data.part)) {
        // Clamp, never trust: the sandbox is the boundary, this is the seam.
        setPart(Math.min(Math.max(data.part as number, 0), parts - 1));
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
    // `parts` is a module-scope constant (from the page-injected DEMO meta),
    // never changes → not a dependency.
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      postToParent({ type: "SANDBOX_RESIZE", height: document.body.scrollHeight });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  return (
    <Boundary
      onError={(error) =>
        postToParent({
          type: "SANDBOX_ERROR",
          message: String((error as { message?: unknown })?.message ?? error),
        })
      }
    >
      <Suspense fallback={<div style={{ padding: 16, opacity: 0.6 }}>Loading…</div>}>
        <Demo part={part} />
      </Suspense>
    </Boundary>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
