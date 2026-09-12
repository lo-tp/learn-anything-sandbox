/**
 * `POST /api/compile` — the source-to-bundle compiler (issue #3).
 *
 * Accepts a JSON body `{ code: <source JSX/TSX> }`, normalizes the KaTeX
 * expressions it carries (see `core/latex-normalizer.ts`), compiles the result
 * to minified ESM with esbuild (react external — the same transform the
 * `/slides/{id}/bundle.js` and `/sandbox/{slug}/bundle.js` routes use), and
 * returns a JSON `{ code, error }` object.
 *
 * | status | body                          | when                                        |
 * |--------|-------------------------------|-------------------------------------------|
 * | 200    | `{ code, error: null }`        | compiled successfully                     |
 * | 400    | `{ code: "", error: <msg> }`   | malformed JSON, or `code` missing/empty   |
 * | 500    | `{ code: "", error: <msg> }`   | esbuild failed to compile the source      |
 *
 * The response is computed per request from caller-supplied source, so it is
 * `no-store` and carries `Access-Control-Allow-Origin: *` (consistent with the
 * other computed routes). The endpoint is public, like the rest.
 */
import { build } from "esbuild";
import { normalizeLatex } from "@/core/latex-normalizer";

/** Compiled per request from caller source — never cache. */
export const dynamic = "force-dynamic";

/** CORS, matching the other per-request computed routes. */
const CORSA = { "Access-Control-Allow-Origin": "*" };

function json(body: { code: string; error: string | null }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORSA,
    },
  });
}

/**
 * Compile a caller-supplied TSX module into minified ESM. The source is
 * assumed self-contained with only `react`/`react-dom`/`react-katex`/`katex`
 * bare imports (all external), mirroring the slide/sample compile.
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

  try {
    const result = await build({
      stdin: {
        contents: normalizeLatex(code),
        resolveDir: process.cwd(),
        loader: "tsx",
        sourcefile: "compile.tsx",
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
    return json({ code: result.outputFiles[0].text, error: null }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ code: "", error: msg }, 500);
  }
}
