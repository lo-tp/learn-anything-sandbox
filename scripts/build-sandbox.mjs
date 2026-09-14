#!/usr/bin/env node
/**
 * build:vendor — the deploy-time esbuild step.
 *
 * Produces the immutable deploy artifacts under `out/` (gitignored):
 *
 *   out/slides/vendor/react.js             self-contained ESM of `node_modules/react`
 *   out/slides/vendor/react-jsx-runtime.js ESM facade, `react` external
 *   out/slides/vendor/react-dom-client.js  ESM facade, `react` external, `scheduler` bundled in
 *   out/slides/harness.js                  from `core/slides/framework.tsx`, react external
 *   out/slides/vendor/katex.js             self-contained ESM of `node_modules/katex`
 *   out/slides/vendor/react-katex.js       ESM facade, `react` + `katex` external (KaTeX components)
 *   out/slides/vendor/math-text.js         MathText component — `temml` bundled in, `react` external
 *   out/slides/vendor/katex.css            KaTeX stylesheet (+ `fonts/` dir)
 *
 * The slide page's import map routes bare `react` / `react/jsx-runtime` /
 * `react-dom/client` to these files and the browser's module cache makes
 * "same URL = same module" a language guarantee — one React instance across
 * the trust boundary.
 *
 * Why facades: the `node_modules` entries are CJS, and bundling a CJS entry to
 * ESM emits only `export default` — but every consumer of these files uses
 * *named* imports (`import { jsx } from "react/jsx-runtime"`, `import {
 * createRoot } from "react-dom/client"`, …). The facade entries below
 * re-export the CJS public API by name; the name lists are read from the
 * packages at build time, so a React bump can't silently drop one.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The shared vendor map (explicit .ts — Node ≥ 23.6 type stripping): the
// out/ file names are derived from it so a renamed vendor URL can't leave
// the build writing the old file.
import { VENDOR_PACKAGES } from "../core/vendor-packages.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nm = path.join(root, "node_modules");
const require_ = createRequire(import.meta.url);

/** The out/ path for a vendor package: its import-map URL with `out` prefixed. */
const vendorOut = (spec) => path.join(root, "out" + VENDOR_PACKAGES[spec]);

/**
 * Export names of a CJS package, in its own order.
 *
 * Underscore-prefixed names are included on purpose: react-dom/client's
 * production build reads React's shared internals via
 * `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, so a
 * facade that dropped it leaves the hooks dispatcher undefined at runtime.
 */
const apiOf = (id) => Object.keys(require_(id));

const shared = {
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  logLevel: "silent",
  // Production builds of the vendored React, regardless of the caller's env.
  define: { "process.env.NODE_ENV": '"production"' },
};

/**
 * ESM facade entry over a CJS package file. `withDefault` also exports the
 * namespace as `default` so `import React from "react"` interop keeps working.
 */
const facade = (pkgFile, pkgId, withDefault = false) => {
  const names = apiOf(pkgId);
  return [
    ...(withDefault ? [`import * as ns from "${pkgFile}";`] : []),
    `import { ${names.join(", ")} } from "${pkgFile}";`,
    `export { ${names.join(", ")} };`,
    ...(withDefault ? ["export default ns;"] : []),
  ].join("\n");
};

/**
 * Banner for builds with `react` external. esbuild never lifts a CJS
 * `require()` of an external into an ESM import — it emits a runtime
 * `__require` shim that throws in the browser. Declaring a `require` in
 * module scope fixes it: the shim prefers an in-scope `require`
 * (`typeof require !== "undefined"`), and this one is backed by a real
 * static import, so `require("react")` resolves through the import map to
 * the one vendored React.
 */
const requireBanner = [
  `import * as __ext_react from "react";`,
  `var require = (id) => (id === "react" ? __ext_react : (() => { throw new Error('Dynamic require of "' + id + '" is not supported'); })());`,
].join("\n");

/**
 * Banner for the slides vendor builds, where the externals are `react`,
 * `katex`, and (for the jsx-runtime seam) `react/jsx-runtime`. Same idea as
 * `requireBanner`: esbuild emits a runtime `__require` shim for a CJS
 * `require()` of an external that throws in the browser, so declare an in-scope
 * `require` backed by static imports — `require("react")`/`require("katex")`
 * then resolve through the slide page's import map to the vendored modules.
 */
const slidesVendorBanner = [
  `import * as __ext_react from "react";`,
  `import * as __ext_katex from "katex";`,
  `import * as __ext_jsxrt from "react/jsx-runtime";`,
  `var require = (id) => ({ "react": __ext_react, "katex": __ext_katex, "react/jsx-runtime": __ext_jsxrt }[id] ?? (() => { throw new Error('Dynamic require of "' + id + '" is not supported'); })());`,
].join("\n");

// 1. vendor/react.js — self-contained: React's whole production CJS inlined.
await build({
  ...shared,
  stdin: { contents: facade(path.join(nm, "react/index.js"), "react", true), resolveDir: root },
  outfile: vendorOut("react"),
});

// 2. vendor/react-jsx-runtime.js — `react` external. The prod jsx runtime is
//    self-contained, but keep the seam: any `react` require stays bare.
await build({
  ...shared,
  external: ["react"],
  banner: {
    js: requireBanner,
  },
  stdin: {
    contents: facade(path.join(nm, "react/jsx-runtime.js"), "react/jsx-runtime"),
    resolveDir: root,
  },
  outfile: vendorOut("react/jsx-runtime"),
});

// 3. vendor/react-dom-client.js — `react` external; `scheduler` is *not*
//    external, so it is bundled in (still one external specifier: react).
//    The banner (also emitted by build 2, where the prod jsx runtime is
//    self-contained) keeps the seam live should the dev build ever be selected.
await build({
  ...shared,
  external: ["react"],
  banner: {
    js: requireBanner,
  },
  stdin: {
    contents: facade(path.join(nm, "react-dom/client.js"), "react-dom/client"),
    resolveDir: root,
  },
  outfile: vendorOut("react-dom/client"),
});

// 4. slides/harness.js — the `/slides` harness, from
//    core/slides/framework.tsx. React is external so the import map routes it
//    to the vendored module; jsx is automatic; the non-static template
//    `import(`/slides/{slide_id}/bundle.js`)` must pass through untouched.
await build({
  ...shared,
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  entryPoints: [path.join(root, "core/slides/framework.tsx")],
  outfile: path.join(root, "out/slides/harness.js"),
});

// 5. slides/vendor/katex.js — self-contained ESM of `node_modules/katex`.
//    Facade (named + default) so both `import katex from "katex"` (used by
//    react-katex) and named imports resolve. No externals: katex is
//    self-contained (its CLI-only `commander` dep is not in this entry).
await build({
  ...shared,
  stdin: { contents: facade(path.join(nm, "katex/dist/katex.js"), "katex", true), resolveDir: root },
  outfile: vendorOut("katex"),
});

// 6. slides/vendor/react-katex.js — the KaTeX React components. react-katex is
//    CJS/UMD with getter-based named exports, so bundle it via a named-import
//    facade (like the React vendor): esbuild only emits `export default` for a
//    CJS entry, so re-export `BlockMath`/`InlineMath` by name. `react` and
//    `katex` are external (the slide page's import map resolves them to the one
//    shared React/KaTeX); `prop-types` is bundled in (tiny, self-contained).
await build({
  ...shared,
  external: ["react", "react/jsx-runtime", "katex"],
  banner: {
    js: slidesVendorBanner,
  },
  stdin: {
    contents: [
      `import { BlockMath, InlineMath } from "${path.join(nm, "react-katex/dist/react-katex.js")}";`,
      `export { BlockMath, InlineMath };`,
    ].join("\n"),
    resolveDir: root,
  },
  outfile: vendorOut("react-katex"),
});

// 7. slides/vendor/math-text.js — the shared MathText component
//    (components/math-text.tsx), bundled so the LLM can import it in slide
//    content (`import { MathText } from "math-text"`). `temml` is bundled in
//    (self-contained); `react` and `react/jsx-runtime` are external so the
//    import map routes them to the one shared React instance. No require
//    banner: the source is ESM TSX with named react imports, so esbuild emits
//    no runtime __require shim.
await build({
  ...shared,
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  entryPoints: [path.join(root, "components/math-text.tsx")],
  outfile: vendorOut("math-text"),
});

// 8. slides/vendor/katex.css + fonts/ — copy KaTeX's stylesheet and webfonts.
//    The CSS references `url(fonts/...)` relative to itself, so the fonts must
//    sit in `out/slides/vendor/fonts/` to match `/slides/vendor/katex.css`.
mkdirSync(path.join(root, "out/slides/vendor/fonts"), { recursive: true });
copyFileSync(path.join(nm, "katex/dist/katex.min.css"), path.join(root, "out/slides/vendor/katex.css"));
for (const font of readdirSync(path.join(nm, "katex/dist/fonts"))) {
  copyFileSync(path.join(nm, "katex/dist/fonts", font), path.join(root, "out/slides/vendor/fonts", font));
}

console.log("out/slides/:");
for (const f of [
  "harness.js",
  ...Object.values(VENDOR_PACKAGES).map((u) => u.replace("/slides/", "")),
  "vendor/katex.css",
]) {
  console.log(`  ${f}  ${statSync(path.join(root, "out/slides", f)).size} B`);
}
console.log(`  vendor/fonts/  ${readdirSync(path.join(root, "out/slides/vendor/fonts")).length} files`);
