/**
 * `core/slides/framework.tsx` — the `/slides` harness (issue #1).
 *
 * Loads the per-slide bundle `/slides/{slug}/bundle.js` (the
 * backend-fetched, already-compiled slide). Vendor React is served from
 * the `/slides` surface (one React instance); this harness is a deploy build
 * (`out/slides/harness.js`).
 *
 * The trust rules: `window.DEMO` comes from the page we own (trusted);
 * everything else is the untrusted per-slide bundle, which is only ever
 * *rendered* by this app — never given a second program of its own.
 *
 * Cross-boundary surface:
 *
 * | direction        | message              | here |
 * |------------------|----------------------|------|
 * | parent → iframe  | `DEMO_SET_PART {part}` (integer) | clamped to `0..parts−1` |
 * | iframe → parent  | `SANDBOX_RESIZE {height}`        | body scrollHeight |
 * | iframe → parent  | `SANDBOX_ERROR {message}`        | boundary callback |
 */
import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { clampPart } from "./clamp-part";

/** Injected by the slide page (`window.DEMO`) before the harness module loads. */
type DemoMeta = { slug: string; parts: number };
const { slug, parts } = (window as unknown as { DEMO: DemoMeta }).DEMO;

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

/** The harness body. Production wiring is at the bottom of this module. */
interface SlidesAppProps {
  /** The lazy per-slide bundle (wired below to `/slides/{slug}/bundle.js`). */
  Demo: React.LazyExoticComponent<React.ComponentType<{ part: number }>>;
  /** Trusted stepper count from the page-injected `window.DEMO.parts`. */
  parts: number;
}

function SlidesApp({ Demo, parts }: SlidesAppProps) {
  const [part, setPart] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; part?: unknown } | null;
      if (data?.type === "DEMO_SET_PART" && Number.isInteger(data.part)) {
        // Clamp, never trust: the harness is the boundary, this is the seam.
        setPart(clampPart(data.part as number, parts));
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
    // `parts` is the page-injected constant (trusted DEMO meta); it never
    // changes, but it is a prop, so it stays in the deps list for the linter.
  }, [parts]);

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

// The per-slide bundle. Non-static template → esbuild leaves it a native
// import() of the backend-compiled slide module; the import map + module cache
// route its `react` to the same single vendored instance the harness uses.
const Demo = lazy(() => import(`/slides/${slug}/bundle.js`));

// Entry point: the slide page owns `<div id="root">` — boot there. Importing
// this module where no root exists (unit tests) renders nothing.
const root = document.getElementById("root");
if (root) createRoot(root).render(<SlidesApp Demo={Demo} parts={parts} />);
