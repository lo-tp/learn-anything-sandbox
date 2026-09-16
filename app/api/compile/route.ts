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
 * Only a source that survives the gate is compiled to minified ESM with esbuild (react external — the same transform the
 * `/slides/{id}/bundle.js` route uses). This is what makes first-attempt garbage
 * and a degenerate regeneration fail instead of passing as "all valid."
 *
 * | status | body                              | when                                        |
 * |--------|-----------------------------------|-------------------------------------------|
 * | 200    | `{ code, error: null }`            | passed the gate, compiled successfully     |
 * | 400    | `{ code: "", error: <msg> }`        | malformed JSON, missing/empty/too-short `code`, no `export default`, default export not a function, or empty/whitespace-only render / render threw |
 * | 500    | `{ code: "", error: <msg> }`        | esbuild failed to compile the source       |
 *
 * On error responses the HTTP reason phrase (status text) also carries the
 * same message, so a caller that only reads the status line — e.g.
 * `${res.status} ${res.statusText}` — sees the real reason instead of the
 * generic "Bad Request" / "Internal Error". Whitespace in the message is
 * collapsed to single spaces, as the reason phrase forbids newlines/tabs.
 *
 * Compile and gate failures additionally carry a `traceback` field with the
 * full multi-line diagnostic — esbuild's pretty error output (file/line/column,
 * the offending source line, a caret, and any notes) for a failed compile, or
 * the thrown stack for a component that failed the render gate. The concise
 * `error` field is what the reason phrase mirrors; `traceback` is the detail
 * the backend should surface to the caller.
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
import { VENDOR_EXTERNALS } from "@/core/vendor-packages";
import { preProcess } from "./preprocess";


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

/** Known project components — auto-imported when used in JSX but not explicitly imported. */
const KNOWN_COMPONENTS: Record<string, string> = {
  MathText: "math-text",
};

/**
 * The gate's require, rooted at the project so `react` / `react-dom/server`
 * resolve to the *same* node_modules copies the compiled bundle imports — a
 * single React instance for the headless render (no "Invalid hook call").
 */
const require_ = createRequire(path.join(process.cwd(), "package.json"));

/**
 * Vendor packages whose exported names are auto-imported when referenced in
 * the source without an explicit import — the framework packages plus
 * react-katex (its BlockMath/InlineMath components may be used directly in a
 * slide). MathText is handled separately via KNOWN_COMPONENTS. Exports are
 * enumerated from the installed packages (via the project-rooted require), so
 * the list tracks the installed versions instead of a hard-coded snapshot.
 */
const AUTO_IMPORT_SPECIFIERS = ["react", "react/jsx-runtime", "react-dom/client", "react-katex", "better-react-mathjax"] as const;
const AUTO_IMPORT_PACKAGES: Record<string, string[]> = Object.fromEntries(
  AUTO_IMPORT_SPECIFIERS.map(
    (s) => [s, Object.keys(require_(s) as object).filter((n) => n !== "default")],
  ),
);

/** Escape a string for safe embedding in a RegExp pattern. */
function reEscape(s: string): string {
  return s.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Prepend imports for symbols the source references without importing:
 *
 *   - known project components used as JSX tags (e.g. `<MathText>`),
 *   - `React` used as a bare identifier (→ `import * as React from "react"`),
 *   - exported names of the auto-import packages (`useState`, `createRoot`, …).
 *
 * Heuristic identifier scan (no parse): a name is skipped when the source
 * already imports it, imports the package as a namespace (`import * as`),
 * or declares it locally (`const`/`let`/`var`/`function`/`class`).
 */
function injectImports(source: string): string {
  const imports: string[] = [];
  const injected = new Set<string>();

  for (const [name, specifier] of Object.entries(KNOWN_COMPONENTS)) {
    const used = new RegExp(`<${reEscape(name)}[\\s/>]`).test(source);
    const imported = new RegExp(`import\\s+\\{?\\s*${reEscape(name)}\\b`).test(source);
    if (used && !imported) {
      imports.push(`import { ${name} } from "${specifier}";`);
      injected.add(name);
    }
  }

  // A bare `React` identifier (e.g. `React.useState`) → a namespace import.
  // (Not a default import: React's CJS build has no `default` export, so a
  // default import would be undefined in the CJS headless-render gate.)
  if (
    /\bReact\b/.test(source) &&
    !/import\s+(?:\*\s+as\s+)?React\b/.test(source) &&
    !/\b(?:const|let|var|function|class)\s+React\b/.test(source)
  ) {
    imports.push(`import * as React from "react";`);
    injected.add("React");
  }

  for (const [specifier, names] of Object.entries(AUTO_IMPORT_PACKAGES)) {
    // A namespace import of this package already covers every one of its names.
    if (new RegExp(`import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+["']${reEscape(specifier)}["']`).test(source)) continue;
    const wanted = names.filter((name) => {
      if (injected.has(name)) return false;
      const re = reEscape(name);
      if (new RegExp(`\\b(?:const|let|var|function|class)\\s+${re}\\b`).test(source)) return false;
      if (!new RegExp(`\\b${re}\\b`).test(source)) return false;
      return !new RegExp(`import\\s+\\{?\\s*${re}\\b`).test(source);
    });
    if (wanted.length > 0) {
      imports.push(`import { ${wanted.join(", ")} } from "${specifier}";`);
      for (const n of wanted) injected.add(n);
    }
  }

  return imports.length > 0 ? imports.join("\n") + "\n" + source : source;
}

function json(
  body: { code: string; error: string | null; traceback?: string },
  status: number,
): Response {
  // The reason phrase mirrors the (concise) error, so callers that only read
  // the status line see the real reason. Collapsed to single spaces: a reason
  // phrase may not contain newlines or tabs (undici throws on them).
  const statusText = body.error ? body.error.replace(/\s+/g, " ") : undefined;
  // `error` stays concise (it feeds the reason phrase); `traceback` carries
  // the full multi-line diagnostic for the caller, present only on errors.
  const payload: Record<string, unknown> = { code: body.code, error: body.error };
  if (body.traceback) payload.traceback = body.traceback;
  return new Response(JSON.stringify(payload), {
    status,
    ...(statusText ? { statusText } : {}),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A single esbuild diagnostic location (file/line/column + the source line). */
type EsbLocation = {
  file?: string;
  line?: number;
  column?: number;
  lineText?: string;
  length?: number;
  suggestion?: string;
};
/** A secondary diagnostic note (e.g. "the opening tag is here"). */
type EsbNote = { text?: string; location?: EsbLocation };
/** A top-level esbuild diagnostic. */
type EsbError = { text?: string; location?: EsbLocation; notes?: EsbNote[] };

/**
 * Render one esbuild diagnostic's location block, mirroring esbuild's CLI
 * pretty-print: the `file:line:column:` header, the source line, a caret (or
 * `~~~` run) under the offending column, and a suggestion line if present.
 */
function fmtLoc(loc: EsbLocation, width: number, markerPrefix = "│"): string {
  const file = loc.file ?? "?";
  const line = loc.line ?? 0;
  const column = loc.column ?? 0;
  const lineText = loc.lineText ?? "";
  const gutter = String(line).padStart(width);
  const pad = " ".repeat(Math.max(0, column - 1));
  const len = loc.length ?? 0;
  const marker = len > 0 ? "~".repeat(len) : "^";
  const out: string[] = [];
  out.push(`    ${file}:${line}:${column}:`);
  out.push(`    ${gutter} │ ${lineText}`);
  out.push(`    ${gutter} ${markerPrefix} ${pad}${marker}`);
  if (loc.suggestion) out.push(`    ${gutter} ╵ ${pad}${loc.suggestion}`);
  return out.join("\n");
}

/** Render one esbuild diagnostic (text + location + its notes) as text. */
function formatDiagnostic(e: EsbError): string {
  const lineNos: number[] = [];
  if (e.location?.line) lineNos.push(e.location.line);
  for (const n of e.notes ?? []) if (n.location?.line) lineNos.push(n.location.line);
  const width = Math.max(2, ...lineNos.map((n) => String(n).length));
  const out: string[] = [`✘ [ERROR] ${e.text ?? "(unknown)"}`, ""];
  if (e.location) out.push(fmtLoc(e.location, width));
  for (const n of e.notes ?? []) {
    out.push("", `  ${n.text ?? ""}`);
    if (n.location) out.push(fmtLoc(n.location, width, "╵"));
  }
  return out.join("\n");
}

/**
 * Rebuild esbuild's pretty multi-line diagnostic (the "traceback") from the
 * structured `errors` array on a failed build, so the caller gets the
 * file/line/column, the offending source line, a caret, and any notes — not
 * just the one-line `err.message`.
 */
function formatEsbuildError(err: unknown): string | undefined {
  const errors = (err as { errors?: EsbError[] } | null)?.errors;
  if (!errors || errors.length === 0) return undefined;
  return errors.map(formatDiagnostic).join("\n\n");
}

/**
 * esbuild the source to a bundle in the requested format (react external).
 *
 * ESM (browser output): `math-text` stays external — the slide page's import
 * map resolves it to `/slides/vendor/math-text.js`.
 *
 * CJS (gate / headless render): `math-text` is aliased to its source file so
 * esbuild bundles it and Node can `require` the result.
 */
async function compile(source: string, format: "esm" | "cjs"): Promise<string> {
  const isCjs = format === "cjs";
  const result = await build({
    stdin: {
      contents: injectImports(source),
      resolveDir: process.cwd(),
      loader: "tsx",
      sourcefile: "compile.tsx",
    },
    bundle: true,
    write: false,
    format,
    platform: isCjs ? "node" : "browser",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    external: isCjs ? VENDOR_EXTERNALS.filter((e) => e !== "math-text") : VENDOR_EXTERNALS,
    alias: isCjs ? { "math-text": "./components/math-text" } : undefined,
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
    console.error(`[api/compile] source too short (< ${MIN_SOURCE_LENGTH} chars):\n` + code);
    return json(
      { code: "", error: `code must be at least ${MIN_SOURCE_LENGTH} characters` },
      400,
    );
  }

  // Gate 2 — a default export must be declared.
  if (!/(?:export\s+default\b)|(?:\bas\s+default\b)/.test(code)) {
    console.error("[api/compile] source missing `export default`:\n" + code);
    return json({ code: "", error: "code must declare `export default`" }, 400);
  }

  // Pre-process the source to fix known JSX issues before compiling.
  const source = preProcess(code);

  // Compile to ESM for the response; a compile failure is still a 500.
  let esm: string;
  try {
    esm = await compile(source, "esm");
  } catch (err) {
    // Log the offending source JSX so a compile failure is debuggable.
    console.error("[api/compile] esbuild failed to compile source JSX:\n" + code);
    // Return the full esbuild diagnostic (file/line/column + source line +
    // caret + notes) so the backend sees the real traceback, not just the
    // one-line message. Fall back to the stack if there are no structured errors.
    const traceback = formatEsbuildError(err) ?? (err instanceof Error ? err.stack : undefined);
    return json({ code: "", error: message(err), traceback }, 500);
  }

  // Gate 3 + 4 — the default export must be a real component that renders
  // non-empty DOM. Rebuilt as CJS so it can be required and headless-rendered.
  try {
    const html = await headlessRender(await compile(source, "cjs"));
    if (html.trim() === "") {
      console.error("[api/compile] component renders empty markup:\n" + code);
      return json({ code: "", error: "component renders empty or whitespace-only markup" }, 400);
    }
  } catch (err) {
    console.error(`[api/compile] component failed the gate: ${message(err)}\n` + code);
    // Surface the thrown stack so a render failure is debuggable by the caller.
    const traceback = err instanceof Error && err.stack ? err.stack : undefined;
    return json({ code: "", error: `component failed the gate: ${message(err)}`, traceback }, 400);
  }

  return json({ code: esm, error: null }, 200);
}
