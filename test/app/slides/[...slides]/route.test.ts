/**
 * Unit tests for the `/slides/*` route handlers (issue #1).
 *
 * The handler is exercised directly: a synthetic `Request` plus the params
 * the App Router would resolve.
 * The backend (`NEXT_PUBLIC_BACKEND_URL`) is stubbed via a mocked global
 * `fetch`, so no network is needed — each case returns fixed compiled-ESM
 * `content` (with a marker string) or a specific backend status.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../../app/slides/[...slides]/route";
import { VENDOR_PACKAGES } from "@/core/vendor-packages";

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

  it("serves math-text.js as JS, immutable, with CORS", async () => {
    const res = await get("/slides/vendor/math-text.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const bytes = readFileSync(path.join(process.cwd(), "out/slides/vendor/math-text.js"));
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
    // Drift guard: every shared vendor specifier (the same set the compile
    // route leaves external) is mapped to its vendor artifact.
    expect(html.indexOf('type="importmap"')).toBeGreaterThan(-1);
    for (const [spec, file] of Object.entries(VENDOR_PACKAGES)) {
      expect(html).toContain(`"${spec}": "${file}"`);
    }
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

  // The theme sync (#78): the caller appends ?theme= and the page puts the
  // matching class on <html>. These call GET directly (the `get` helper's
  // pathname split would swallow the query string).
  it("puts the light class on <html> when ?theme=light", async () => {
    const res = await GET(
      new Request(`${ORIGIN}/slides/s1?theme=light`, { headers: IFRAME }),
      { params: Promise.resolve({ slides: ["s1"] }) },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<html class="light">');
  });

  it("stays classless (dark) when ?theme=dark", async () => {
    const res = await GET(
      new Request(`${ORIGIN}/slides/s1?theme=dark`, { headers: IFRAME }),
      { params: Promise.resolve({ slides: ["s1"] }) },
    );
    const html = await res.text();
    expect(html).toContain("<html>\n");
    expect(html).not.toContain('class="light"');
  });

  it("stays classless (dark) when no theme param is given", async () => {
    const html = await (await get("/slides/s1", IFRAME)).text();
    expect(html).toContain("<html>\n");
    expect(html).not.toContain('class="light"');
  });

  it("treats an unknown theme value as dark", async () => {
    const res = await GET(
      new Request(`${ORIGIN}/slides/s1?theme=bogus`, { headers: IFRAME }),
      { params: Promise.resolve({ slides: ["s1"] }) },
    );
    const html = await res.text();
    expect(html).toContain("<html>\n");
    expect(html).not.toContain('class="light"');
  });
});

describe("the per-slide bundle (GET /slides/{id}/bundle.js)", () => {
  // The backend delivers the slide already compiled to ESM: JSX is transformed
  // to jsx-runtime calls and `react/jsx-runtime` is left bare for the import map.
  const compiled = `import { jsx as _jsx } from "react/jsx-runtime";\nexport default function Slide() { return _jsx("div", { children: "${MARKER}" }); }`;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  });

  it("serves the backend-compiled bundle per request (no-store, marker survives)", async () => {
    mockFetch(
      new Response(JSON.stringify({ slide_id: "s1", content: compiled }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    // no-store: the bundle carries request-specific backend bytes.
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    // Served as-is: the backend-compiled ESM is not re-compiled here. The bare
    // jsx-runtime import stays for the import map, and the content survives.
    expect(body).toContain("react/jsx-runtime");
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

  it("500s when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    expect((await get("/slides/s1/bundle.js")).status).toBe(500);
  });

  it("leaves react-katex/katex bare when the slide imports them (import map resolves them)", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          content: `import { jsx as _jsx } from "react/jsx-runtime";\nimport { BlockMath } from "react-katex";\nexport default function S() { return _jsx(BlockMath, { math: "E = mc^2" }); }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // react-katex stays a bare import specifier for the import map; the
    // backend-compiled ESM is served as-is (JSX already transformed).
    expect(body).toContain('from "react-katex"');
    expect(body).not.toContain("<BlockMath");
  });

  it("leaves math-text bare when the slide imports MathText (import map resolves it)", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          content: `import { jsx as _jsx } from "react/jsx-runtime";\nimport { MathText } from "math-text";\nexport default function S() { return _jsx(MathText, { content: "E = $E=mc^2$" }); }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // math-text stays a bare import specifier for the import map; the
    // backend-compiled ESM is served as-is.
    expect(body).toContain('from "math-text"');
    expect(body).toContain("MathText");
    expect(body).not.toContain("<MathText");
  });

  it("prepends the react-katex import when the slide uses InlineMath without importing it", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          // No react-katex import — mirrors the backend bug (a bare, un-imported
          // InlineMath identifier would be a runtime ReferenceError).
          content: `import { jsx as _jsx } from "react/jsx-runtime";\nexport default function S() { return _jsx(InlineMath, { math: "x" }); }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // The prepended InlineMath import fixes the bare identifier (it was not
    // imported in the backend output) and stays a bare external for the map.
    expect(body).toMatch(/import\s*\{[^}]*InlineMath[^}]*\}\s*from\s*"react-katex"/);
  });

  it("does not add a react-katex import the slide already provides", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          slide_id: "s1",
          content: `import { jsx as _jsx } from "react/jsx-runtime";\nimport { InlineMath } from "react-katex";\nexport default function S() { return _jsx(InlineMath, { math: "x" }); }`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await get("/slides/s1/bundle.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    // InlineMath is already imported, so no duplicate react-katex import is
    // prepended — exactly one survives.
    expect((body.match(/from "react-katex"/g) ?? []).length).toBe(1);
  });

  it("requests the backend with a URL-encoded slide id", async () => {
    let requested: string | undefined;
    vi.stubGlobal("fetch", (url: unknown) => {
      requested = String(url);
      return new Response(JSON.stringify({ slide_id: "s 1", content: compiled }), {
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
