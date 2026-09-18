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
 * #80 — no slide navigation: the parent never changes this frame's `src`
 * (a per-slide `src` navigation appends a top-level history entry that
 * swallows the browser Back button). Instead it posts `DEMO_SET_SLIDE` and
 * this harness swaps the rendered slide in its own React state: the
 * per-slide bundle is loaded with a dynamic `import()` — an import is not a
 * navigation, so it appends no history entry.
 *
 * Cross-boundary surface:
 *
 * | direction        | message                     | here |
 * |------------------|-----------------------------|------|
 * | parent → iframe  | `DEMO_SET_PART {part}` (integer) | clamped to `0..parts−1` |
 * | parent → iframe  | `DEMO_SET_SLIDE {slideId}`  | non-empty string → swaps the rendered slide in state, no navigation (#80) |
 * | iframe → parent  | `SANDBOX_RESIZE {height}`   | body scrollHeight |
 * | iframe → parent  | `SANDBOX_ERROR {message}`   | boundary callback |
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseSlideMessage } from "./slide-message";

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

/**
 * Renders the current slide *below* the Boundary, so both bundle load
 * failures and the untrusted slide's render errors surface there
 * (→ `SANDBOX_ERROR`).
 */
function SlideView({
  failure,
  Demo,
  part,
}: {
  failure: unknown;
  Demo: React.ComponentType<{ part: number }> | null;
  part: number;
}) {
  // A failed bundle load throws through the Boundary, exactly as a render
  // error does.
  if (failure) throw failure;
  return Demo ? (
    <Demo part={part} />
  ) : (
    <div style={{ padding: 16, opacity: 0.6 }}>Loading…</div>
  );
}

/** The harness body. Production wiring is at the bottom of this module. */
interface SlidesAppProps {
  /** The page's own slide — the frame's constant `src` (#80). */
  initialSlug: string;
  /** Trusted stepper count from the page-injected `window.DEMO.parts`. */
  parts: number;
}

function SlidesApp({ initialSlug, parts }: SlidesAppProps) {
  const [part, setPart] = useState(0);

  // The rendered slide. Starts at the page's own slug (what the frame's
  // constant `src` loaded) and is swapped in-place by `DEMO_SET_SLIDE`
  // — never by navigating the frame (#80).
  const [slug, setSlug] = useState(initialSlug);
  // The last settled load, tagged with the slug it belongs to — so a result
  // for a previous slug can never be rendered (or throw) under a new one.
  const [loaded, setLoaded] = useState<{
    slug: string;
    Demo: React.ComponentType<{ part: number }>;
  } | null>(null);
  const [failure, setFailure] = useState<{ slug: string; error: unknown } | null>(
    null,
  );

  // Load the per-slide bundle for `slug`. Non-static template → esbuild
  // leaves it a native import() of the backend-compiled slide module; the
  // import map + module cache route its `react` to the same single vendored
  // instance the harness uses. Revisiting a slide re-imports the same URL,
  // which the browser module cache serves without a fetch.
  useEffect(() => {
    let cancelled = false;
    import(`/slides/${slug}/bundle.js`).then(
      (mod: { default: React.ComponentType<{ part: number }> }) => {
        if (!cancelled) {
          setLoaded({ slug, Demo: mod.default });
          setFailure(null);
        }
      },
      (error: unknown) => {
        if (!cancelled) setFailure({ slug, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Parse, never trust: the harness is the boundary, this is the seam.
      const command = parseSlideMessage(event.data, parts);
      if (command?.type === "part") setPart(command.part);
      else if (command?.type === "slide") setSlug(command.slug);
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

  // Only the failure for the *current* slug is live — an older failure for
  // a previous slug must neither throw nor mask a later success.
  const liveFailure = failure?.slug === slug ? failure.error : undefined;
  // The component for the current slug — or nothing while its import is
  // still in flight (SlideView shows the fallback meanwhile).
  const Demo = loaded?.slug === slug ? loaded.Demo : null;

  return (
    <Boundary
      onError={(error) =>
        postToParent({
          type: "SANDBOX_ERROR",
          message: String((error as { message?: unknown })?.message ?? error),
        })
      }
    >
      <SlideView failure={liveFailure} Demo={Demo} part={part} />
    </Boundary>
  );
}

// Entry point: the slide page owns `<div id="root">` — boot there. Importing
// this module where no root exists (unit tests) renders nothing.
const root = document.getElementById("root");
if (root) createRoot(root).render(<SlidesApp initialSlug={slug} parts={parts} />);
