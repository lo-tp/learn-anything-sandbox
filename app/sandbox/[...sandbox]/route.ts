/**
 * `/sandbox/*` — the Sandbox delivery surface (ADR 0007, docs/demos.md, issue #36).
 *
 * One catch-all handler, dispatched on the path:
 *
 * | URL                          | Response                                                            |
 * |------------------------------|---------------------------------------------------------------------|
 * | `/sandbox/harness.js`        | the deploy-built harness module (`out/sandbox/harness.js`)          |
 * | `/sandbox/vendor/*.js`       | the deploy-built vendor modules (`out/sandbox/vendor/`)             |
 * | `/sandbox/{slug}`            | the demo page HTML — **403 unless `Sec-Fetch-Dest: iframe`**, 404 on unknown slug |
 * | `/sandbox/{slug}/bundle.js`  | the row's `demo_js` — **no fetch-dest gate**: in a plain tab the JS source is inert text |
 *
 * While the `demo_js` schema columns are pending (#32/#37), the hand-inserted
 * demos are `sample` (the deck, `core/sandbox/sample.tsx`) and `sample_N`
 * (`core/sandbox/sample_N.tsx` renders `sample/N.tsx` standalone — discovered
 * on disk, so adding slide 6 is adding the two files). Their entries are
 * compiled **per request** (same esbuild transform the write pipeline will
 * run) with a short `max-age` — their source is editable, so immutability
 * would be a lie. The deck's page declares `parts: SAMPLE_PARTS` (one per
 * slide), so the harness clamps `DEMO_SET_PART` across the whole deck instead
 * of the stub's random 1–3; a `sample_N` page declares `parts: 1`.
 *
 * The deploy-built artifacts and each row's bundle carry
 * `Cache-Control: public, max-age=31536000, immutable` — honest because the
 * slug is 128-bit random (unguessable), the row is append-only, and the
 * bundle is written once per row. The demo page is `no-store`: it embeds the
 * request's origin, and its security headers (CSP `frame-ancestors`) must
 * not freeze in an immutable cache — a year-old cached copy would still lack
 * a policy added later, and the browser would serve it without revalidating.
 * Every response also
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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
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

/**
 * The hand-inserted entry for a slug, or `null` when the slug is not one:
 * `sample` is always the deck; `sample_N` resolves to
 * `core/sandbox/sample_N.tsx` **only if that file exists on disk** (the
 * pattern keeps arbitrary slugs from mapping into files).
 */
function sampleEntry(slug: string): string | null {
  if (slug === "sample") return path.join("core", "sandbox", "sample.tsx");
  if (!/^sample_\d+$/.test(slug)) return null;
  const entry = path.join("core", "sandbox", `${slug}.tsx`);
  return existsSync(path.join(process.cwd(), entry)) ? entry : null;
}

/**
 * Compile a hand-inserted entry into the demo bundle. Bundled (not
 * `transform`) because the entries import the per-slide components
 * (sample/1.tsx … 5.tsx + shared.tsx). `react` is external so the bare
 * imports survive for the demo page's import map to resolve.
 */
async function compileSampleEntry(entry: string): Promise<Response> {
  try {
    const result = await build({
      entryPoints: [path.join(process.cwd(), entry)],
      bundle: true,
      write: false,
      format: "esm",
      target: "es2020",
      jsx: "automatic",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
      external: ["react", "react/jsx-runtime", "react-dom/client"],
    });
    const code = result.outputFiles[0].text;
    return new Response(code, {
      headers: { "Content-Type": JS, "Cache-Control": "public, max-age=3600", ...CORSA },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`sample demo failed to compile: ${msg}`, {
      status: 500,
      headers: { ...CORSA },
    });
  }
}

/** Vendor modules we ship — the fixed set from scripts/build-sandbox.mjs. */
const VENDOR_MODULES = [
  "react.js",
  "react-jsx-runtime.js",
  "react-dom-client.js",
] as const;

/** The deploy-built artifacts live in `out/sandbox/` (gitignored). */
const ARTIFACTS: Record<string, string> = {
  "harness.js": path.join("out", "sandbox", "harness.js"),
  ...Object.fromEntries(
    VENDOR_MODULES.map((name) => [
      `vendor/${name}`,
      path.join("out", "sandbox", "vendor", name),
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
    return new Response("artifact not built — run npm run build:sandbox", {
      status: 404,
    });
  }
}

/**
 * The demo page, byte-for-byte ours (docs/demos.md, "The demo page").
 * Exactly one untrusted thing is reachable from it: `{slug}/bundle.js`.
 */
function sandboxPage(origin: string, slug: string, parts: number | null): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">
{ "imports": {
    "react": "/sandbox/vendor/react.js",
    "react/jsx-runtime": "/sandbox/vendor/react-jsx-runtime.js",
    "react-dom/client": "/sandbox/vendor/react-dom-client.js"
} }
</script>
<link rel="stylesheet" href="${origin}/sandbox/reset.css">
</head>
<body>
<div id="root"></div>
<script>window.DEMO = { slug: ${JSON.stringify(slug)}, parts: ${parts ?? 0} };</script>
<script type="module" src="/sandbox/harness.js"></script>
</body>
</html>
`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sandbox: string[] }> },
) {
  const notFound = () => new Response("not found", { status: 404 });
  const [first, second, ...rest] = (await params).sandbox;

  // Deeper than `/sandbox/{a}/{b}` is not a demo URL.
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

  // Hand-inserted demos (#37) — compiled per request (editable source),
  // short-lived cache: `sample` is the deck, `sample_N` one slide standalone.
  if (second === "bundle.js") {
    const entry = sampleEntry(first);
    if (entry !== null) return compileSampleEntry(entry);
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
    // Hand-inserted demos (#37): the on-disk entry declares its parts —
    // the deck has one per slide, a `sample_N` demo has exactly one.
    const entry = sampleEntry(slug);
    if (entry !== null) {
      const parts = slug === "sample" ? SAMPLE_PARTS : 1;
      const origin = new URL(request.url).origin;
      return new Response(sandboxPage(origin, slug, parts), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          ...CORSA,
        },
      });
    }
    const demo = await getDemoBySlug(slug);
    if (!demo) return notFound();
    const origin = new URL(request.url).origin;
    return new Response(sandboxPage(origin, slug, demo.parts), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORSA,
      },
    });
  }

  return notFound();
}
