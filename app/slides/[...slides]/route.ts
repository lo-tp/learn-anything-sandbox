/**
 * `/slides/*` — the backend-fed slide demos (issue #1).
 *
 * The React bundle is **fetched from the backend**
 * (`${NEXT_PUBLIC_BACKEND_URL}/slides/{slide_id}` → JSON `{ slide_id, content }`,
 * `content` is self-contained TSX) and **compiled per request** with esbuild
 * (react external). The harness is a deploy build (`out/slides/harness.js`,
 * from `core/slides/framework.tsx`) that loads `/slides/{slide_id}/bundle.js`.
 * All vendor artifacts (React, KaTeX) are built into `out/slides/vendor/` and
 * served under `/slides/vendor/*` so the page's import map can route
 * `react`/`react-katex`/`katex` to them.
 *
 * | URL                               | Response                                                     |
 * |-----------------------------------|--------------------------------------------------------------|
 * | `/slides/harness.js`              | the deploy-built slides harness (`out/slides/harness.js`)     |
 * | `/slides/{slide_id}`              | the slide page HTML — **403 unless `Sec-Fetch-Dest: iframe`** |
 * | `/slides/{slide_id}/bundle.js`    | backend-fetched + compiled slide — **no fetch-dest gate**      |
 * | `/slides/vendor/react.js`         | the deploy-built React (self-contained ESM)                  |
 * | `/slides/vendor/react-jsx-runtime.js` | the deploy-built JSX runtime (`react` external)         |
 * | `/slides/vendor/react-dom-client.js`  | the deploy-built React DOM client (`react` external)   |
 * | `/slides/vendor/react-katex.js`   | the deploy-built KaTeX React components (`out/slides/vendor/…`) |
 * | `/slides/vendor/katex.js`         | the deploy-built KaTeX engine                                    |
 * | `/slides/vendor/katex.css`        | the KaTeX stylesheet (+ `/slides/vendor/fonts/…` webfonts)      |
 *
 * Every response carries `Access-Control-Allow-Origin: *`: the opaque-origin
 * iframe loads its module scripts in **CORS mode**, so without the header the
 * module graph fails to load outright. The harness and vendor are `immutable`
 * (built at deploy); the slide page and bundle are `no-store` (per-request
 * origin / backend content).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/** The slide page and bundle are rendered per request — they carry request-specific bytes. */
export const dynamic = "force-dynamic";

/** Honest-immutability for the deploy-built harness (built at deploy). */
const IMMUTABLE = "public, max-age=31536000, immutable";
const JS = "text/javascript; charset=utf-8";

/** Shared by every response — CORS for the opaque-origin iframe. */
const CORSA = { "Access-Control-Allow-Origin": "*" };

/**
 * Fetch a slide's TSX from the backend and compile it into the demo bundle.
 *
 * `content` is assumed self-contained TSX with only `react`/`react-dom`/
 * `react-katex`/`katex` bare imports (all external, resolved by the page's
 * import map). esbuild can't resolve relative file imports from a backend
 * blob, so those fail (500).
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
        // Generated slides sometimes use <InlineMath>/<BlockMath> without
        // importing them (the automatic JSX runtime compiles that to a bare,
        // un-imported identifier → runtime ReferenceError). Prepend the import
        // unconditionally: with bundle:true, esbuild merges it with any
        // duplicate the content already has and drops unused named bindings,
        // so the delivered bundle carries one clean react-katex import.
        contents: `import { BlockMath, InlineMath } from "react-katex";\n${data.content}`,
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
      external: ["react", "react/jsx-runtime", "react-dom/client", "react-katex", "katex"],
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
    return new Response("artifact not built — run npm run build:vendor", {
      status: 404,
    });
  }
}

/**
 * A deploy-built vendor artifact (`out/slides/vendor/<rest>`), served under
 * `/slides/vendor/*` (NOT `public/`) so the slide page's import map — which
 * always serves `/slides/*` through this handler — can route `react`,
 * `react-katex`, and `katex` to it. The bytes are deploy-built and never
 * change per request, so they are `immutable`. `rest` is joined after
 * resolving (traversal guard).
 */
function serveSlidesVendor(rest: string[]): Response {
  const rel = path.posix.join(...rest);
  const vendorDir = path.resolve(process.cwd(), "out/slides/vendor");
  const abs = path.resolve(vendorDir, rel);
  // Traversal guard: the resolved path must stay inside out/slides/vendor.
  if (abs !== vendorDir && !abs.startsWith(vendorDir + path.sep)) {
    return new Response("not found", { status: 404 });
  }
  try {
    const bytes = readFileSync(abs);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentTypeFor(abs),
        "Cache-Control": IMMUTABLE,
        ...CORSA,
      },
    });
  } catch {
    return new Response("artifact not built — run npm run build:vendor", {
      status: 404,
    });
  }
}

/** Content-Type for a served vendor artifact, by extension. */
function contentTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".js":
      return JS;
    case ".css":
      return "text/css; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    default:
      return "application/octet-stream";
  }
}

/**
 * The slide page, byte-for-byte ours. All vendor artifacts (React, KaTeX)
 * are served from `/slides/vendor/*` (one React instance).
 */
function slidesPage(origin: string, mainOrigin: string, slideId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">
{ "imports": {
    "react": "/slides/vendor/react.js",
    "react/jsx-runtime": "/slides/vendor/react-jsx-runtime.js",
    "react-dom/client": "/slides/vendor/react-dom-client.js",
    "react-katex": "/slides/vendor/react-katex.js",
    "katex": "/slides/vendor/katex.js"
} }
</script>
<link rel="stylesheet" href="${origin}/slides/reset.css">
<link rel="stylesheet" href="${mainOrigin}/palette.css">
<link rel="stylesheet" href="${origin}/slides/vendor/katex.css">
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
  const [first, ...rest] = (await params).slides;

  // The deploy-built KaTeX vendor artifacts (`/slides/vendor/...`), served
  // under `/slides` so the page's import map can route `react-katex`/`katex`
  // to them (see the header table).
  if (first === "vendor" && rest.length > 0) {
    return serveSlidesVendor(rest);
  }

  const slideId = first;
  const second = rest[0];

  // Deeper than `/slides/{a}/{b}` is not a slide URL.
  if (rest.length > 1) return notFound();

  // The deploy-built slides harness, served as-is (immutable, built at deploy).
  if (first === "harness.js" && second === undefined) {
    return serveSlidesHarness();
  }

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
    const mainOrigin = process.env.ALLOWED_FRAME_ANCESTORS;
    const origin = new URL(request.url).origin;
    return new Response(slidesPage(origin, mainOrigin, slideId), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORSA,
      },
    });
  }

  return notFound();
}
