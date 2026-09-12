/**
 * Unit tests for the `/slides/*` route handlers (issue #1).
 *
 * The handler is exercised directly: a synthetic `Request` plus the params
 * the App Router would resolve.
 * The backend (`NEXT_PUBLIC_BACKEND_URL`) is stubbed via a mocked global
 * `fetch`, so no network is needed — each case returns fixed TSX `content`
 * (with a marker string) or a specific backend status.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../../app/slides/[...slides]/route";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ORIGIN = "http://localhost:3000";
const BACKEND = "http://backend.test";
const MARKER = "SLIDE_MARKER_12345";

function get(pathname: string, headers: Record<string, string> = {}) {
  const slides = pathname.split("/").filter(Boolean); // ["slides", ...rest]
  return GET(
    new Request(`${ORIGIN}${pathname}`, { headers }),
    { params: Promise.resolve({ slides: slides.slice(1) }) },
  );
}

/** Stub the global `fetch` the route uses to talk to the backend. */
function mockFetch(res: Response) {
  vi.stubGlobal("fetch", () => res);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deploy-built slides harness", () => {
  it("serves /slides/harness.js with immutable cache headers", async () => {
    const res = await get("/slides/harness.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    const bytes = readFileSync(path.join(process.cwd(), "out/slides/harness.js"));
    expect(await res.text()).toBe(bytes.toString("utf8"));
  });
});

describe("the KaTeX vendor (GET /slides/vendor/...)", () => {
  it("serves react-katex.js as JS, immutable, with CORS", async () => {
    const res = await get("/slides/vendor/react-katex.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const bytes = readFileSync(path.join(process.cwd(), "out/slides/vendor/react-katex.js"));
    expect(await res.text()).toBe(bytes.toString("utf8"));
  });

  it("serves katex.js as JS, immutable", async () => {
    const res = await get("/slides/vendor/katex.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
  });

  it("serves katex.css as CSS (referencing its co-located fonts/), immutable", async () => {
    const res = await get("/slides/vendor/katex.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(await res.text()).toContain("fonts/");
  });

  it("serves webfonts with the right content-type", async () => {
    expect((await get("/slides/vendor/fonts/KaTeX_AMS-Regular.woff2")).headers.get("content-type")).toBe("font/woff2");
    expect((await get("/slides/vendor/fonts/KaTeX_AMS-Regular.woff")).headers.get("content-type")).toBe("font/woff");
    expect((await get("/slides/vendor/fonts/KaTeX_AMS-Regular.ttf")).headers.get("content-type")).toBe("font/ttf");
  });

  it("404s a missing vendor file", async () => {
    expect((await get("/slides/vendor/nope.js")).status).toBe(404);
  });

  it("404s path traversal out of the vendor dir", async () => {
    expect((await get("/slides/vendor/../../package.json")).status).toBe(404);
    expect((await get("/slides/vendor/..%2F..%2Fpackage.json")).status).toBe(404);
  });
});

describe("the slide page (GET /slides/{id})", () => {
  const IFRAME = { "sec-fetch-dest": "iframe" };

  it("serves the import-map page to a sandboxed iframe", async () => {
    const res = await get("/slides/s1", IFRAME);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    // no-store: the page embeds the request's origin (per-request bytes).
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    // Import map precedes every module script; all vendor from /slides.
    expect(html.indexOf('type="importmap"')).toBeGreaterThan(-1);
    expect(html).toContain('"/slides/vendor/react.js"');
    expect(html).toContain('"/slides/vendor/react-jsx-runtime.js"');
    expect(html).toContain('"/slides/vendor/react-dom-client.js"');
    expect(html).toContain('"/slides/vendor/react-katex.js"');
    expect(html).toContain('"/slides/vendor/katex.js"');
    // The page we own: root div, demo meta (single part), slides harness boot.
    expect(html).toContain("<div id=\"root\"></div>");
    expect(html).toContain('window.DEMO = { slug: "s1", parts: 1 }');
    expect(html).toContain(`<script type="module" src="/slides/harness.js"></script>`);
    // reset.css is served from the /slides surface (the link only).
    expect(html).toContain(`${ORIGIN}/slides/reset.css`);
    // The KaTeX stylesheet (link) is served from the /slides vendor surface.
    expect(html).toContain(`${ORIGIN}/slides/vendor/katex.css`);
  });

  it("403s a top-level tab (Sec-Fetch-Dest: document)", async () => {
    expect((await get("/slides/s1", { "sec-fetch-dest": "document" })).status).toBe(403);
  });

  it("403s a request with no Sec-Fetch-Dest at all", async () => {
    expect((await get("/slides/s1")).status).toBe(403);
  });
});

describe("the per-slide bundle (GET /slides/{id}/bundle.js)", () => {
  const tsx = `export default function Slide() { return <div>${MARKER}</div>; }`;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  });

  it("compiles the backend TSX per request (no-store, marker survives)", async () => {
    mockFetch(
      new Response(JSON.stringify({ slide_id: "s1", content: tsx }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    // no-store: the bundle is compiled per request from backend content.
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    // TSX/JSX is gone — plain ESM, `react` left bare; the content survives.
    expect(body).not.toContain("<div>");
    expect(body).toContain("react");
    expect(body).toContain(MARKER);
  });

  it("404s when the backend has no such slide", async () => {
    mockFetch(new Response(null, { status: 404 }));
    expect((await get("/slides/missing/bundle.js")).status).toBe(404);
  });

  it("502s on a backend 500", async () => {
    mockFetch(new Response(null, { status: 500 }));
    expect((await get("/slides/s1/bundle.js")).status).toBe(502);
  });

  it("502s on a backend 503", async () => {
    mockFetch(new Response(null, { status: 503 }));
    expect((await get("/slides/s1/bundle.js")).status).toBe(502);
  });

  it("502s when the backend omits `content`", async () => {
    mockFetch(
      new Response(JSON.stringify({ slide_id: "s1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect((await get("/slides/s1/bundle.js")).status).toBe(502);
  });

  it("502s when `content` is not a string", async () => {
    mockFetch(
      new Response(JSON.stringify({ slide_id: "s1", content: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect((await get("/slides/s1/bundle.js")).status).toBe(502);
  });

  it("502s when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("boom");
    });
    expect((await get("/slides/s1/bundle.js")).status).toBe(502);
  });

  it("500s when the backend TSX fails to compile", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ slide_id: "s1", content: "export default function Broken() { return <<<" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect((await get("/slides/s1/bundle.js")).status).toBe(500);
  });

  it("500s when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    expect((await get("/slides/s1/bundle.js")).status).toBe(500);
  });

  it("leaves react-katex/katex bare when the slide imports them (import map resolves them)", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          content: `import { BlockMath } from "react-katex";\nexport default function S() { return <BlockMath math={"E = mc^2"} />; }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // react-katex is external → left as a bare import specifier for the import map.
    expect(body).toContain('from"react-katex"');
    // JSX is compiled away (no raw <BlockMath> markup in the bundle).
    expect(body).not.toContain("<BlockMath");
  });

  it("prepends the react-katex import when the slide uses InlineMath without importing it", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          // No react-katex import — mirrors the backend bug (a bare, un-imported
          // InlineMath identifier would be a runtime ReferenceError).
          content: `export default function S() { return <InlineMath math={"x"} />; }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // The prepended InlineMath import survives bundling as a bare external for
    // the import map to resolve (fixes the runtime ReferenceError).
    expect(body).toMatch(/import\{[^}]*InlineMath[^}]*\}from"react-katex"/);
  });

  it("collapses to one import when the slide already imports from react-katex", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          content: `import { InlineMath } from "react-katex";\nexport default function S() { return <InlineMath math={"x"} />; }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // Source has two react-katex imports (prepended + the slide's own); with
    // bundle:true esbuild merges them into one — no duplicate-binding error.
    expect((body.match(/from"react-katex"/g) ?? []).length).toBe(1);
  });

  it("requests the backend with a URL-encoded slide id", async () => {
    let requested: string | undefined;
    vi.stubGlobal("fetch", (url: unknown) => {
      requested = String(url);
      return new Response(JSON.stringify({ slide_id: "s 1", content: tsx }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const res = await get("/slides/s 1/bundle.js");
    expect(res.status).toBe(200);
    expect(requested).toBe(`${BACKEND}/slides/s%201`);
  });
});

describe("vendor content-type fallback", () => {
  // Temp artifacts land in the gitignored, deploy-rebuilt out/ tree and are
  // removed in `finally` — the route serves whatever bytes are on disk.
  it("resolves the extension case-insensitively (.JS is served as JS)", async () => {
    const rel = "case-check.JS";
    const abs = path.join(process.cwd(), "out/slides/vendor", rel);
    try {
      writeFileSync(abs, "export {};\n");
      const res = await get(`/slides/vendor/${rel}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    } finally {
      rmSync(abs, { force: true });
    }
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const rel = "asset.bin";
    const abs = path.join(process.cwd(), "out/slides/vendor", rel);
    try {
      writeFileSync(abs, "bytes");
      const res = await get(`/slides/vendor/${rel}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
    } finally {
      rmSync(abs, { force: true });
    }
  });
});

describe("edge paths", () => {
  it("treats /slides/vendor (no artifact path) as a slide page — 403 without the iframe header", async () => {
    expect((await get("/slides/vendor")).status).toBe(403);
  });

  it("404s /slides/harness.js/extra (harness is only the exact file)", async () => {
    expect((await get("/slides/harness.js/extra")).status).toBe(404);
  });
});

describe("everything else", () => {
  it("404s deeper paths", async () => {
    expect((await get("/slides/s1/bundle.js/extra")).status).toBe(404);
  });
});
