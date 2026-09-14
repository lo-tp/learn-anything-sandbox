/**
 * Tests for `POST /api/compile` (issue #3).
 *
 * The `POST` handler is tested with a synthetic `Request` (same pattern as
 * the other route tests), asserting status, body shape, and compile behavior.
 *
 * A drift guard asserts the committed KaTeX whitelist was generated from the
 * installed katex version.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../app/api/compile/route";
import { KATEX_COMMANDS, KATEX_VERSION } from "@/core/katex-commands";

const require_ = createRequire(import.meta.url);
const ORIGIN = "http://localhost:3000";

function post(body: unknown, raw?: string) {
  return POST(
    new Request(`${ORIGIN}/api/compile`, {
      method: "POST",
      body: raw ?? JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("POST /api/compile", () => {
  it("compiles valid JSX to minified ESM (200, error null)", async () => {
    const res = await post({ code: "export default function A() { return <div>hello</div>; }" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { code: string; error: string | null };
    expect(body.error).toBeNull();
    expect(body.code.length).toBeGreaterThan(0);
    // TS/JSX gone, `react` left as a bare import.
    expect(body.code).not.toContain("<div>");
    expect(body.code).toContain("react");
  });

  it("400s a malformed JSON body", async () => {
    const res = await post(undefined, "{not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toBe("invalid JSON body");
  });
  it("400s a missing / non-string / empty code", async () => {
    for (const payload of [{}, { code: 123 }, { code: "" }, { code: "   " }]) {
      const res = await post(payload);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string; error: string };
      expect(body.code).toBe("");
      expect(body.error).toBe("code must be a non-empty string");
    }
  });
  it("400s a JSON body that is not an object", async () => {
    for (const payload of [42, "str", null, [1], true]) {
      const res = await post(payload);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string; error: string };
      expect(body.code).toBe("");
      expect(body.error).toBe("code must be a non-empty string");
    }
  });

  it("500s an uncompilable source", async () => {
    // Long enough to clear the min-length gate, but still fails to parse.
    const res = await post({ code: "export default function Broken() { return <div>unterminated" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error.length).toBeGreaterThan(0);
  });

  // The gate validates the component, not just that it compiles.
  it("400s a source below the minimum length", async () => {
    const res = await post({ code: "export default () => null" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("at least 40 characters");
  });

  it("400s a source with no `export default`", async () => {
    const res = await post({ code: "export function A() { return <div>hello world</div>; }" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("export default");
  });

  it("400s a component whose default export is not a function", async () => {
    const res = await post({ code: "export default <div className=\"slide\">not a function</div>" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("default export must be a function");
  });

  it("400s a component that renders empty markup", async () => {
    const res = await post({ code: "export default function A() { return null; }" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("empty or whitespace-only");
  });

  it("400s a component that renders whitespace-only markup", async () => {
    const res = await post({ code: "export default function A() { return '   '; }" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("empty or whitespace-only");
  });

  it("400s a component that throws during render", async () => {
    const res = await post({ code: "export default function A() { throw new Error('boom'); }" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error).toContain("component failed the gate");
  });

  it("200s a component that uses hooks and renders real DOM", async () => {
    const res = await post({
      code: "import { useState } from 'react'; export default () => { const [n] = useState(42); return <div>{n}</div>; }",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; error: string | null };
    expect(body.error).toBeNull();
    expect(body.code.length).toBeGreaterThan(0);
  });
});

describe("KaTeX whitelist drift guard", () => {
  it("was generated from the installed katex version", () => {
    expect(KATEX_VERSION).toBe(require_("katex/package.json").version);
  });
  it("is a non-empty, sorted set of backslash commands", () => {
    expect(KATEX_COMMANDS.length).toBeGreaterThan(0);
    expect(KATEX_COMMANDS[0]).toMatch(/^\\[A-Za-z]+$/);
    expect([...KATEX_COMMANDS].sort()).toEqual(KATEX_COMMANDS);
    expect(KATEX_COMMANDS).toContain("\\text");
  });
});
