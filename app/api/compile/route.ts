/**
 * `POST /api/compile` — the source-to-bundle compiler + validation gate (issue #3).
 *
 * Accepts a JSON body `{ code: <source JSX/TSX> }` and runs it through a gate
 * that validates the **component**, not just that it compiles:
 *
 *   1. **Length** — the source is above a minimum length, so a degenerate
 *      sliver is rejected before any compile.
 *   2. **Default export** — the source declares `export default`.
 *   3. **Real component** — the compiled default export is a function (a React
 *      component), not an element/object/primitive.
 *   4. **Headless render** — the component is rendered with
 *      `renderToStaticMarkup` against the same node_modules React the bundle
 *      uses; an empty/whitespace-only DOM, or a render that throws, is rejected.
 *
 * Only a source that survives the gate is normalized for KaTeX and compiled to
 * minified ESM with esbuild (react external — the same transform the
 * `/slides/{id}/bundle.js` route uses). This is what makes first-attempt garbage
 * and a degenerate regeneration fail instead of passing as "all valid."
 *
 * | status | body                          | when                                        |
 * |--------|-------------------------------|-------------------------------------------|
 * | 200    | `{ code, error: null }`        | passed the gate, compiled successfully     |
 * | 400    | `{ code: "", error: <msg> }`   | malformed JSON, missing/empty/too-short `code`, no `export default`, default export not a function, or empty/whitespace-only render / render threw |
 * | 500    | `{ code: "", error: <msg> }`   | esbuild failed to compile the source       |
 *
 * The response is computed per request from caller-supplied source, so it is
 * `no-store`. The endpoint is public and same-origin — unlike the module-serving
 * `/slides` route, no CORS headers are needed.
 */
import { build } from "esbuild";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { ComponentType } from "react";
import { normalizeLatex } from "@/core/latex-normalizer";

/** Compiled per request from caller source — never cache. */
export const dynamic = "force-dynamic";
/** The gate shells out to esbuild and requires node_modules — Node runtime only. */
export const runtime = "nodejs";

/**
 * Degenerate sources below this length are rejected before any compile. Real
 * slides run to hundreds of characters; a sliver this small is first-attempt
 * garbage, not a component.
 */
const MIN_SOURCE_LENGTH = 40;

/** The bare imports every slide bundle is built against (all external). */
const EXTERNALS = ["react", "react/jsx-runtime", "react-dom/client", "react-katex", "katex"];

/**
 * The gate's require, rooted at the project so `react` / `react-dom/server`
 * resolve to the *same* node_modules copies the compiled bundle imports — a
 * single React instance for the headless render (no "Invalid hook call").
 */
const require_ = createRequire(path.join(process.cwd(), "package.json"));

function json(body: { code: string; error: string | null }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** esbuild the source to a bundle in the requested format (react external). */
async function compile(source: string, format: "esm" | "cjs"): Promise<string> {
  const result = await build({
    stdin: {
      contents: normalizeLatex(source),
      resolveDir: process.cwd(),
      loader: "tsx",
      sourcefile: "compile.tsx",
    },
    bundle: true,
    write: false,
    format,
    platform: format === "cjs" ? "node" : "browser",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    external: EXTERNALS,
  });
  return result.outputFiles[0].text;
}

/**
 * Headless-render a compiled component and return its static markup.
 *
 * The CJS bundle is written to a temp file under the project root (so its bare
 * `react` imports resolve to node_modules) and required via the project-rooted
 * `require_`. Throws if the default export is not a function, or the render throws.
 */
async function headlessRender(bundle: string): Promise<string> {
  const tmp = path.join(process.cwd(), `compile-gate-${Math.random().toString(36).slice(2)}.cjs`);
  writeFileSync(tmp, bundle);
  try {
    const mod = require_(tmp) as { default?: unknown };
    const comp = mod?.default;
    if (typeof comp !== "function") {
      throw new Error("default export must be a function (a React component)");
    }
    const React = require_("react") as {
      createElement(type: ComponentType, props: object): object;
    };
    const { renderToStaticMarkup } = require_("react-dom/server") as {
      renderToStaticMarkup(element: object): string;
    };
    return renderToStaticMarkup(React.createElement(comp as unknown as ComponentType, {}));
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * The gate: validate the source is a real, non-degenerate component that renders
 * non-empty DOM, then compile it to minified ESM for the response.
 */
export async function POST(request: Request): Promise<Response> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return json({ code: "", error: "invalid JSON body" }, 400);
  }

  const obj = (data && typeof data === "object" ? data : null) as
    | { code?: unknown }
    | null;
  const code = obj?.code;
  if (typeof code !== "string" || code.trim() === "") {
    return json({ code: "", error: "code must be a non-empty string" }, 400);
  }

  // Gate 1 — length: reject degenerate slivers before any compile.
  if (code.trim().length < MIN_SOURCE_LENGTH) {
    return json(
      { code: "", error: `code must be at least ${MIN_SOURCE_LENGTH} characters` },
      400,
    );
  }

  // Gate 2 — a default export must be declared.
  if (!/(?:export\s+default\b)|(?:\bas\s+default\b)/.test(code)) {
    return json({ code: "", error: "code must declare `export default`" }, 400);
  }

  // Compile to ESM for the response; a compile failure is still a 500.
  let esm: string;
  try {
    esm = await compile(code, "esm");
  } catch (err) {
    return json({ code: "", error: message(err) }, 500);
  }

  // Gate 3 + 4 — the default export must be a real component that renders
  // non-empty DOM. Rebuilt as CJS so it can be required and headless-rendered.
  try {
    const html = await headlessRender(await compile(code, "cjs"));
    if (html.trim() === "") {
      return json({ code: "", error: "component renders empty or whitespace-only markup" }, 400);
    }
  } catch (err) {
    return json({ code: "", error: `component failed the gate: ${message(err)}` }, 400);
  }

  return json({ code: esm, error: null }, 200);
}
