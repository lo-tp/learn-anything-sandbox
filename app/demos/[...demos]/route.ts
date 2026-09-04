/**
 * `/demos/*` — the Demos delivery surface (ADR 0007, docs/demos.md, issue #36).
 *
 * One catch-all handler, dispatched on the path:
 *
 * | URL                          | Response                                                            |
 * |------------------------------|---------------------------------------------------------------------|
 * | `/demos/harness.js`          | the deploy-built harness module (`out/demos/harness.js`)            |
 * | `/demos/vendor/*.js`         | the deploy-built vendor modules (`out/demos/vendor/`)               |
 * | `/demos/{slug}`              | the demo page HTML — **403 unless `Sec-Fetch-Dest: iframe`**, 404 on unknown slug |
 * | `/demos/{slug}/bundle.js`    | the row's `demo_js` — **no fetch-dest gate**: in a plain tab the JS source is inert text |
 *
 * While the `demo_js` schema columns are pending (#32/#37), the exact slug
 * `sample` is the hand-inserted demo: `core/demos/sample.tsx` is compiled
 * **per request** (same esbuild transform the write pipeline will run) and
 * served `no-store` — its source is editable, so immutability would be a
 * lie. Its page declares `parts: SAMPLE_PARTS` (one per slide), so the
 * harness clamps `DEMO_SET_PART` across the whole deck instead of the
 * stub's random 1–3.
 *
 * Every response carries `Cache-Control: public, max-age=31536000, immutable`
 * — honest because the slug is 128-bit random (unguessable), the row is
 * append-only, and the bundle is written once per row. Every response also
 * carries `Access-Control-Allow-Origin: *`: the opaque-origin sandbox loads
 * its module scripts (harness, vendor, bundle) in **CORS mode**, so without
 * the header the module graph fails to load outright (empirical —
 * findings.md, #33/#34 verification). `*` is right: these assets are
 * public-safe by design and carry no credentials.
 *
 * The demo page cannot be a Next.js-managed document (ADR 0007 delivery
 * note): the import map must precede every module script, and App Router
 * emits its own into `<head>`; Next's React instance is also private to its
 * chunks. We therefore own the returned bytes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { transform } from "esbuild";
import { getDemoBySlug } from "@/core/store";

/** The demo page is rendered per request — it carries request-specific bytes. */
export const dynamic = "force-dynamic";

/** Honest-immutability for every artifact below (see header). */
const IMMUTABLE = "public, max-age=31536000, immutable";
const JS = "text/javascript; charset=utf-8";

/** Shared by every response below — CORS for the opaque-origin sandbox. */
const CORSA = { "Access-Control-Allow-Origin": "*" };

/** Slide count of the hand-inserted sample deck (one part per slide). */
const SAMPLE_PARTS = 5;

/** Vendor modules we ship — the fixed set from scripts/build-demos.mjs. */
const VENDOR_MODULES = [
  "react.js",
  "react-jsx-runtime.js",
  "react-dom-client.js",
] as const;

/** The deploy-built artifacts live in `out/demos/` (gitignored). */
const ARTIFACTS: Record<string, string> = {
  "harness.js": path.join("out", "demos", "harness.js"),
  ...Object.fromEntries(
    VENDOR_MODULES.map((name) => [
      `vendor/${name}`,
      path.join("out", "demos", "vendor", name),
    ]),
  ),
};

function serveArtifact(file: string): Response {
  try {
    const bytes = readFileSync(path.join(process.cwd(), ARTIFACTS[file]));
    return new Response(bytes, {
      headers: {
        "Content-Type": JS,
        "Cache-Control": IMMUTABLE,
        ...CORSA,
      },
    });
  } catch {
    return new Response("artifact not built — run npm run build:demos", {
      status: 404,
    });
  }
}

/**
 * The demo page, byte-for-byte ours (docs/demos.md, "The demo page").
 * Exactly one untrusted thing is reachable from it: `{slug}/bundle.js`.
 */
function demoPage(origin: string, slug: string, parts: number | null): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">
{ "imports": {
    "react": "/demos/vendor/react.js",
    "react/jsx-runtime": "/demos/vendor/react-jsx-runtime.js",
    "react-dom/client": "/demos/vendor/react-dom-client.js"
} }
</script>
<link rel="stylesheet" href="${origin}/demos/reset.css">
</head>
<body>
<div id="root"></div>
<script>window.DEMO = { slug: ${JSON.stringify(slug)}, parts: ${parts ?? 0} };</script>
<script type="module" src="/demos/harness.js"></script>
</body>
</html>
`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ demos: string[] }> },
) {
  const notFound = () => new Response("not found", { status: 404 });
  const [first, second, ...rest] = (await params).demos;

  // Deeper than `/demos/{a}/{b}` is not a demo URL.
  if (rest.length > 0) return notFound();

  // Deploy-built artifacts, served as-is (immutable, built at deploy).
  if (first === "harness.js" && second === undefined) {
    return serveArtifact("harness.js");
  }
  if (
    first === "vendor" &&
    second !== undefined &&
    (VENDOR_MODULES as readonly string[]).includes(second)
  ) {
    return serveArtifact(`vendor/${second}`);
  }

  // Hand-inserted demo (#37) — exact slug. The db row doesn't exist yet, so
  // the source file IS the row: read `core/demos/sample.tsx` and run it
  // through the same write-time transform every LLM-authored demo will go
  // through (esbuild, TSX, jsx automatic, react left bare for the import
  // map). Per request, `no-store` — the source is editable in dev.
  if (first === "sample" && second === "bundle.js") {
    try {
      const src = readFileSync(
        path.join(process.cwd(), "core/demos/sample.tsx"),
        "utf8",
      );
      const { code } = await transform(src, {
        loader: "tsx",
        format: "esm",
        target: "es2020",
        jsx: "automatic",
        minify: true,
        define: { "process.env.NODE_ENV": '"production"' },
        sourcefile: "sample.tsx",
      });
      return new Response(code, {
        headers: { "Content-Type": JS, "Cache-Control": "no-store", ...CORSA },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`sample demo failed to compile: ${msg}`, {
        status: 500,
        headers: { ...CORSA },
      });
    }
  }

  // Everything else is a slug: `{slug}/bundle.js` or the demo page itself.
  // (A slug can never equal "harness.js" or sit under "vendor" — those are
  // 128-bit random hex; the dispatch above is exact-match.)
  const slug = first;

  // Per-slug demo bundle: the row's derived ESM module. No Sec-Fetch-Dest
  // gate — opened in a tab the JS source renders as inert text.
  if (second === "bundle.js") {
    const demo = await getDemoBySlug(slug);
    if (!demo) return notFound();
    return new Response(demo.js, {
      headers: { "Content-Type": JS, "Cache-Control": IMMUTABLE, ...CORSA },
    });
  }

  // The demo page (no further path segment).
  if (second === undefined) {
    // The app-origin execution guard (docs/demos.md rule 1): an iframe
    // navigation sends `Sec-Fetch-Dest: iframe`; a top-level tab sends
    // `document` (or nothing). Without the gate the same URL would execute
    // LLM code in app origin — cookies, session, full XSS.
    if (request.headers.get("sec-fetch-dest") !== "iframe") {
      return new Response("forbidden", { status: 403 });
    }
    // Hand-inserted demo (#37): the on-disk row declares one part per slide.
    if (slug === "sample") {
      const origin = new URL(request.url).origin;
      return new Response(demoPage(origin, slug, SAMPLE_PARTS), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": IMMUTABLE,
          ...CORSA,
        },
      });
    }
    const demo = await getDemoBySlug(slug);
    if (!demo) return notFound();
    const origin = new URL(request.url).origin;
    return new Response(demoPage(origin, slug, demo.parts), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": IMMUTABLE,
        ...CORSA,
      },
    });
  }

  return notFound();
}
