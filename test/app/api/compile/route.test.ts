/**
 * Tests for `POST /api/compile` (issue #3).
 *
 * Two layers:
 *   - `normalizeLatex` — the scoped LaTeX rewriter, exercised on exact
 *     character sequences (a single backslash is written `\\` in these
 *     template literals; two backslashes `\\\\`).
 *   - the `POST` handler — a synthetic `Request` (same pattern as the other
 *     route tests), asserting status, body shape, and compile behavior.
 *
 * A drift guard asserts the committed KaTeX whitelist was generated from the
 * installed katex version.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../app/api/compile/route";
import { normalizeLatex } from "@/core/latex-normalizer";
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

describe("normalizeLatex (scoped LaTeX rewriter)", () => {
  // Doubling — only the `math` prop string literals of the math components.
  it("doubles a KaTeX command in a braced math string (single quote)", () => {
    expect(normalizeLatex(`<InlineMath math={'\\text{a}'} />`)).toBe(
      `<InlineMath math={'\\\\text{a}'} />`,
    );
  });
  it("doubles several commands in one string", () => {
    expect(normalizeLatex(`<InlineMath math={'\\alpha'} />`)).toBe(
      `<InlineMath math={'\\\\alpha'} />`,
    );
    expect(normalizeLatex(`<BlockMath math={'\\frac{1}{2}'} />`)).toBe(
      `<BlockMath math={'\\\\frac{1}{2}'} />`,
    );
  });
  it("doubles a KaTeX accent that is followed by `{` (\\v{a})", () => {
    expect(normalizeLatex(`<InlineMath math={'\\v{a}'} />`)).toBe(
      `<InlineMath math={'\\\\v{a}'} />`,
    );
  });
  it("doubles KaTeX in template literal text, leaving ${…} expressions alone", () => {
    const src = "<InlineMath math={" + "`\\text{${x}}`" + "} />";
    expect(normalizeLatex(src)).toBe("<InlineMath math={" + "`\\\\text{${x}}`" + "} />");
  });
  it("does not touch a KaTeX-looking backslash inside a ${…} expression", () => {
    const src = "<InlineMath math={" + "`\\text{${\"\\text\"}x}`" + "} />";
    expect(normalizeLatex(src)).toBe("<InlineMath math={" + "`\\\\text{${\"\\text\"}x}`" + "} />");
  });

  // JS escapes inside the same string are preserved.
  it("leaves JS unicode, control, and unknown backslashes alone", () => {
    expect(normalizeLatex(`<InlineMath math={'\\u0041'} />`)).toBe(
      `<InlineMath math={'\\u0041'} />`,
    );
    expect(normalizeLatex(`<InlineMath math={'\\n'} />`)).toBe(
      `<InlineMath math={'\\n'} />`,
    );
    expect(normalizeLatex(`<InlineMath math={'\\foo'} />`)).toBe(
      `<InlineMath math={'\\foo'} />`,
    );
  });
  it("doubles only the KaTeX part of a mixed string", () => {
    expect(normalizeLatex(`<InlineMath math={'\\u0041 and \\n and \\text{x}'} />`)).toBe(
      `<InlineMath math={'\\u0041 and \\n and \\\\text{x}'} />`,
    );
  });

  // Out-of-scope forms are left byte-for-byte.
  it("does not touch a JSX attribute string (math=\"…\")", () => {
    const src = `<InlineMath math="\\text{a}" />`;
    expect(normalizeLatex(src)).toBe(src);
  });
  it("does not touch a non-literal math value (math={var})", () => {
    const src = `<InlineMath math={m} />`;
    expect(normalizeLatex(src)).toBe(src);
  });
  it("does not touch a non-math element", () => {
    const src = `<div title="\\text{a}">x</div>`;
    expect(normalizeLatex(src)).toBe(src);
  });
  it("does not touch children", () => {
    const src = `<InlineMath>\\text{a}</InlineMath>`;
    expect(normalizeLatex(src)).toBe(src);
  });

  // Idempotency.
  it("is idempotent (a second pass is a no-op)", () => {
    const once = normalizeLatex(`<InlineMath math={'\\text{a}'} />`);
    expect(once).toBe(`<InlineMath math={'\\\\text{a}'} />`);
    expect(normalizeLatex(once)).toBe(once);
  });
  it("does not re-double an already-escaped command", () => {
    const src = `<InlineMath math={'\\\\text'} />`;
    expect(normalizeLatex(src)).toBe(src);
  });

  // Multiple elements / props in one source are handled independently.
  it("handles multiple elements and props independently", () => {
    expect(
      normalizeLatex(`<BlockMath math={'\\frac{1}{2}'} /> <InlineMath math={'\\sqrt{x}'} />`),
    ).toBe(`<BlockMath math={'\\\\frac{1}{2}'} /> <InlineMath math={'\\\\sqrt{x}'} />`);
  });
});

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

  it("carries a real backslash for the KaTeX command end-to-end", async () => {
    const code = `import { InlineMath } from "react-katex"; export default () => <InlineMath math={'\\text{a} + \\alpha'} />;`;
    const res = await post({ code });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; error: string | null };
    expect(body.error).toBeNull();
    // The normalized string survives the compile as a real backslash.
    expect(body.code).toContain("\\text");
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

  it("500s an uncompilable source", async () => {
    const res = await post({ code: "export default () => <div>" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("");
    expect(body.error.length).toBeGreaterThan(0);
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
