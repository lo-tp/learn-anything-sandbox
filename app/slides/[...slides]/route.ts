/**
 * `/slides/*` — the backend-fed slide demos (issue #1).
 *
 * The slide bundle is **fetched from the backend**
 * (`${NEXT_PUBLIC_BACKEND_URL}/slides/{slide_id}` → JSON `{ slide_id, content }`,
 * `content` is self-contained **already-compiled ESM**). That server-to-server
 * fetch carries `X-Service-Token` (the service-identity gate, #102/#104):
 * the secret is read server-side from the gitignored local env
 * (`SANDBOX_SERVICE_TOKEN`), never exposed to the browser — the route 500s
 * fail-secure if it is unset. It is served as-is —
 * the backend compiles the JSX, so there is no per-request compile here.
 * The harness is a deploy build (`out/slides/harness.js`, from
 * `core/slides/framework.tsx`) that loads `/slides/{slide_id}/bundle.js`.
 * All vendor artifacts (React, KaTeX, MathText) are built into `out/slides/vendor/` and
 * served under `/slides/vendor/*` so the page's import map can route
 * `react`/`react-katex`/`katex`/`math-text` to them.
 *
 * | URL                               | Response                                                     |
 * |-----------------------------------|--------------------------------------------------------------|
 * | `/slides/{slide_id}?theme=light`  | the slide page with `<html class="light">` (theme sync, #78) |
 * | `/slides/{slide_id}`              | the slide page HTML — **403 unless `Sec-Fetch-Dest: iframe`**, except in dev with `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true` (see core/direct-slide-access.ts) |
 * | `/slides/{slide_id}/bundle.js`    | backend-fetched, pre-compiled slide — **no fetch-dest gate**   |
 * | `/slides/vendor/react.js`         | the deploy-built React (self-contained ESM)                  |
 * | `/slides/vendor/react-jsx-runtime.js` | the deploy-built JSX runtime (`react` external)         |
 * | `/slides/vendor/react-dom-client.js`  | the deploy-built React DOM client (`react` external)   |
 * | `/slides/vendor/react-katex.js`   | the deploy-built KaTeX React components (`out/slides/vendor/…`) |
 * | `/slides/vendor/math-text.js`     | the deploy-built MathText component (`temml` bundled in)        |
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
import { directSlideAccessEnabled } from "@/core/direct-slide-access";
import { VENDOR_PACKAGES } from "@/core/vendor-packages";

/** The slide page and bundle are rendered per request — they carry request-specific bytes. */
export const dynamic = "force-dynamic";

/** Honest-immutability for the deploy-built harness (built at deploy). */
const IMMUTABLE = "public, max-age=31536000, immutable";
const JS = "text/javascript; charset=utf-8";

/** Shared by every response — CORS for the opaque-origin iframe. */
const CORSA = { "Access-Control-Allow-Origin": "*" };

/**
 * Make the served bundle self-sufficient for the KaTeX components.
 *
 * The backend compiles slides with the *automatic* JSX runtime, which leaves
 * `InlineMath`/`BlockMath` as bare, un-imported identifiers when a slide uses
 * them without importing them (→ runtime ReferenceError). For each of those
 * names the content references but does not already import from react-katex,
 * prepend an import so the module always resolves them. Names the content
 * already imports are skipped, so we never emit a duplicate binding.
 */
function ensureKatexImports(content: string): string {
  const names = ["InlineMath", "BlockMath"].filter(
    (n) =>
      new RegExp(`\\b${n}\\b`).test(content) &&
      !new RegExp(
        `import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*["']react-katex["']`,
      ).test(content),
  );
  return names.length
    ? `import { ${names.join(", ")} } from "react-katex";\n${content}`
    : content;
}

/**
 * Fetch a slide from the backend and serve its bundle.
 *
 * `content` is self-contained, backend-compiled ESM with only `react`/
 * `react-dom`/`react-katex`/`katex`/`math-text` bare imports (all resolved by
 * the page's import map). The backend already compiles the JSX, so we serve it
 * as-is — no re-compilation here.
 */
async function slideBundle(slideId: string): Promise<Response> {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return new Response("NEXT_PUBLIC_BACKEND_URL is not set", {
      status: 500,
      headers: { ...CORSA },
    });
  }
  // Service-identity gate (#104): the backend's internal slides endpoint
  // rejects anything but a matching X-Service-Token. The secret is read
  // server-side from the gitignored local env — it is not a NEXT_PUBLIC_*
  // var, so it is never inlined into the browser bundle.
  const serviceToken = process.env.SANDBOX_SERVICE_TOKEN;
  if (!serviceToken) {
    return new Response("SANDBOX_SERVICE_TOKEN is not set", {
      status: 500,
      headers: { ...CORSA },
    });
  }

  let data: { slide_id?: unknown; content?: unknown };
  try {
    const res = await fetch(`${backend}/slides/${encodeURIComponent(slideId)}`, {
      headers: { "X-Service-Token": serviceToken },
    });
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

  return new Response(ensureKatexImports(data.content), {
    headers: { "Content-Type": JS, "Cache-Control": "no-store", ...CORSA },
  });
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
 * are served from `/slides/vendor/*` (one React instance). The import map is
 * generated from VENDOR_PACKAGES so it can never drift from the specifiers
 * the compile route leaves external.
 *
 * `?theme=light` puts the `light` class on `<html>` so the palette.css the
 * page loads (from the app origin) resolves its light tokens — the frame
 * then renders in the app's current theme (#78). Absent/dark keeps the
 * classless default, whose `:root` is the dark palette.
 */
function slidesPage(
  origin: string,
  mainOrigin: string,
  slideId: string,
  theme: string | null,
): string {
  const imports = Object.entries(VENDOR_PACKAGES)
    .map(([spec, file]) => `    "${spec}": "${file}"`)
    .join(",\n");
  const htmlTag = theme === "light" ? '<html class="light">' : "<html>";
  return `<!DOCTYPE html>
${htmlTag}
<head>
<meta charset="utf-8">
<script type="importmap">
{ "imports": {
${imports}
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

  // The per-slide bundle: fetched from the backend (already compiled there)
  // and served as-is. No Sec-Fetch-Dest gate — opened in a tab the JS source
  // renders as inert text.
  if (second === "bundle.js") {
    return slideBundle(slideId);
  }

  // The slide page (no further path segment).
  if (second === undefined) {
    // The app-origin execution guard: an iframe navigation sends
    // `Sec-Fetch-Dest: iframe`; a top-level tab sends `document` (or nothing).
    // Without the gate the same URL would execute LLM code in app origin.
    // Dev-only escape hatch: SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true opens it
    // so a slide URL can be pasted straight into a tab (never in production).
    const directAccess = directSlideAccessEnabled(
      process.env.SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS,
      process.env.NODE_ENV,
    );
    if (!directAccess && request.headers.get("sec-fetch-dest") !== "iframe") {
      return new Response("forbidden", { status: 403 });
    }
    const mainOrigin = process.env.ALLOWED_FRAME_ANCESTORS ?? "";
    const pageUrl = new URL(request.url);
    const origin = pageUrl.origin;
    const theme = pageUrl.searchParams.get("theme");
    return new Response(slidesPage(origin, mainOrigin, slideId, theme), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORSA,
      },
    });
  }

  return notFound();
}
