/**
 * `/slides/*` — the backend-fed slide demos (issue #1).
 *
 * Structurally a mirror of `/sandbox/*`, except the React bundle is **fetched
 * from the backend** (`${NEXT_PUBLIC_BACKEND_URL}/slides/{slide_id}` → JSON
 * `{ slide_id, content }`, `content` is self-contained TSX) and **compiled per
 * request** with esbuild (react external) — the same transform the `sample_N`
 * path uses. The harness is a parallel build (`out/slides/harness.js`, from
 * `core/slides/framework.tsx`) that loads `/slides/{slide_id}/bundle.js`.
 * Vendor React and reset.css are **reused** from the `/sandbox` surface (one
 * React instance); only the harness is new.
 *
 * | URL                            | Response                                                     |
 * |--------------------------------|--------------------------------------------------------------|
 * | `/slides/harness.js`           | the deploy-built slides harness (`out/slides/harness.js`)     |
 * | `/slides/{slide_id}`           | the slide page HTML — **403 unless `Sec-Fetch-Dest: iframe`** |
 * | `/slides/{slide_id}/bundle.js` | backend-fetched + compiled slide — **no fetch-dest gate**      |
 *
 * Every response carries `Access-Control-Allow-Origin: *`: the opaque-origin
 * iframe loads its module scripts (harness, bundle — and the reused sandbox
 * vendor) in **CORS mode**, so without the header the module graph fails to
 * load outright. The harness is `immutable` (built at deploy); the slide page
 * and bundle are `no-store` (per-request origin / backend content).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/** The slide page and bundle are rendered per request — they carry request-specific bytes. */
export const dynamic = "force-dynamic";

/** Honest-immutability for the deploy-built harness (built at deploy). */
const IMMUTABLE = "public, max-age=31536000, immutable";
const JS = "text/javascript; charset=utf-8";

/** Shared by every response — CORS for the opaque-origin sandbox. */
const CORSA = { "Access-Control-Allow-Origin": "*" };

/**
 * Fetch a slide's TSX from the backend and compile it into the demo bundle.
 *
 * `content` is assumed self-contained TSX with only `react`/`react-dom` bare
 * imports — esbuild can't resolve relative file imports from a backend blob, so
 * those fail (500), matching `compileSampleEntry`'s failure behavior.
 */
async function compileSlide(slideId: string): Promise<Response> {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return new Response("NEXT_PUBLIC_BACKEND_URL is not set", {
      status: 500,
      headers: { ...CORSA },
    });
  }

  let data: { slide_id?: unknown; content?: unknown };
  try {
    const res = await fetch(`${backend}/slides/${encodeURIComponent(slideId)}`);
    if (res.status === 404) {
      return new Response("not found", { status: 404, headers: { ...CORSA } });
    }
    if (!res.ok) {
      return new Response("backend error", { status: 502, headers: { ...CORSA } });
    }
    data = await res.json();
  } catch {
    // Network failure / non-JSON body from the backend.
    return new Response("backend error", { status: 502, headers: { ...CORSA } });
  }

  if (typeof data.content !== "string") {
    return new Response("invalid slide payload", {
      status: 502,
      headers: { ...CORSA },
    });
  }

  try {
    const result = await build({
      stdin: {
        contents: data.content,
        resolveDir: process.cwd(),
        loader: "tsx",
        sourcefile: `slide_${slideId}.tsx`,
      },
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
      headers: { "Content-Type": JS, "Cache-Control": "no-store", ...CORSA },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`slide failed to compile: ${msg}`, {
      status: 500,
      headers: { ...CORSA },
    });
  }
}

/** The deploy-built slides harness lives in `out/slides/` (gitignored). */
function serveSlidesHarness(): Response {
  try {
    const bytes = readFileSync(path.join(process.cwd(), "out/slides/harness.js"));
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
 * The slide page, byte-for-byte ours. Reuses the `/sandbox` vendor React and
 * reset.css (one React instance); only the harness and bundle are the
 * `/slides` variants.
 */
function slidesPage(origin: string, slideId: string): string {
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
<script>window.DEMO = { slug: ${JSON.stringify(slideId)}, parts: 1 };</script>
<script type="module" src="/slides/harness.js"></script>
</body>
</html>
`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slides: string[] }> },
) {
  const notFound = () => new Response("not found", { status: 404 });
  const [first, second, ...rest] = (await params).slides;

  // Deeper than `/slides/{a}/{b}` is not a slide URL.
  if (rest.length > 0) return notFound();

  // The deploy-built slides harness, served as-is (immutable, built at deploy).
  if (first === "harness.js" && second === undefined) {
    return serveSlidesHarness();
  }

  const slideId = first;

  // The per-slide bundle: fetched from the backend + compiled per request. No
  // Sec-Fetch-Dest gate — opened in a tab the JS source renders as inert text.
  if (second === "bundle.js") {
    return compileSlide(slideId);
  }

  // The slide page (no further path segment).
  if (second === undefined) {
    // The app-origin execution guard: an iframe navigation sends
    // `Sec-Fetch-Dest: iframe`; a top-level tab sends `document` (or nothing).
    // Without the gate the same URL would execute LLM code in app origin.
    if (request.headers.get("sec-fetch-dest") !== "iframe") {
      return new Response("forbidden", { status: 403 });
    }
    const origin = new URL(request.url).origin;
    return new Response(slidesPage(origin, slideId), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORSA,
      },
    });
  }

  return notFound();
}
