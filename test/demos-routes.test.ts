/**
 * Unit tests for the `/demos/*` route handlers (issue #36).
 *
 * The handler is exercised directly (same pattern as the other route tests):
 * a synthetic `Request` plus the params the App Router would resolve. The
 * `getDemoBySlug` stub answers any slug with random data, so the 404 path is
 * verified structurally, not by slug.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../app/demos/[...demos]/route";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ORIGIN = "http://localhost:3000";

function get(pathname: string, headers: Record<string, string> = {}) {
  const demos = pathname.split("/").filter(Boolean); // ["demos", ...rest]
  return GET(
    new Request(`${ORIGIN}${pathname}`, { headers }),
    { params: Promise.resolve({ demos: demos.slice(1) }) },
  );
}

describe("deploy-built artifacts", () => {
  it("serves /demos/harness.js with immutable cache headers", async () => {
    const res = await get("/demos/harness.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    const bytes = readFileSync(path.join(process.cwd(), "out/demos/harness.js"));
    expect(await res.text()).toBe(bytes.toString("utf8"));
  });

  it.each(["react.js", "react-jsx-runtime.js", "react-dom-client.js"])(
    "serves /demos/vendor/%s immutable",
    async (name) => {
      const res = await get(`/demos/vendor/${name}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
      const bytes = readFileSync(path.join(process.cwd(), "out/demos/vendor", name));
      expect(await res.text()).toBe(bytes.toString("utf8"));
    },
  );

  it("compiles the hand-inserted sample demo per request (#37)", async () => {
    const res = await get("/demos/sample/bundle.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    // The source is editable, so the response must not be immutable-cached.
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.text();
    // TS annotations and JSX are gone — the browser receives plain ESM,
    // `react` left bare for the import map.
    expect(body).not.toContain("{ part: number }");
    expect(body).not.toContain("<section");
    expect(body).toContain("react");
  });

  it("404s a vendor module we don't ship", async () => {
    const res = await get("/demos/vendor/preact.js");
    expect(res.status).toBe(404);
  });
});

describe("the demo page (GET /demos/{slug})", () => {
  const IFRAME = { "sec-fetch-dest": "iframe" };

  it("serves the import-map page to a sandboxed iframe", async () => {
    const res = await get("/demos/abc123", IFRAME);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    const html = await res.text();
    // Import map precedes every module script.
    expect(html.indexOf('type="importmap"')).toBeGreaterThan(-1);
    expect(html).toContain('"/demos/vendor/react.js"');
    expect(html).toContain('"/demos/vendor/react-jsx-runtime.js"');
    expect(html).toContain('"/demos/vendor/react-dom-client.js"');
    // The page we own: root div, demo meta, harness boot.
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('window.DEMO = { slug: "abc123", parts: ');
    expect(html).toContain(`<script type="module" src="/demos/harness.js"></script>`);
    // reset.css is app-served (the link only).
    expect(html).toContain(`${ORIGIN}/demos/reset.css`);
  });

  it("403s a top-level tab (Sec-Fetch-Dest: document)", async () => {
    const res = await get("/demos/abc123", { "sec-fetch-dest": "document" });
    expect(res.status).toBe(403);
  });

  it("403s a request with no Sec-Fetch-Dest at all", async () => {
    const res = await get("/demos/abc123");
    expect(res.status).toBe(403);
  });
});

describe("the per-slug bundle (GET /demos/{slug}/bundle.js)", () => {
  it("serves demo_js as inert javascript — no fetch-dest gate", async () => {
    const res = await get("/demos/abc123/bundle.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    const js = await res.text();
    expect(js).toContain("abc123");
  });
});

describe("everything else", () => {
  it("404s deeper paths", async () => {
    expect((await get("/demos/abc123/bundle.js/extra")).status).toBe(404);
    expect((await get("/demos/vendor/react.js/extra")).status).toBe(404);
  });
});
