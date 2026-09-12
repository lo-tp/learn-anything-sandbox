#!/usr/bin/env node
/**
 * build:sandbox — the deploy-time esbuild step (docs/demos.md, "Pipeline — DEPLOY").
 *
 * Produces the four immutable sandbox artifacts in `out/sandbox/` (gitignored):
 *
 *   vendor/react.js            self-contained ESM of `node_modules/react`
 *   vendor/react-jsx-runtime.js ESM facade, `react` external
 *   vendor/react-dom-client.js ESM facade, `react` external, `scheduler` bundled in
 *   harness.js                 from `core/sandbox/framework.tsx`, all react specifiers external
 *
 * The demo page's import map routes bare `react` / `react/jsx-runtime` /
 * `react-dom/client` to these files and the browser's module cache makes
 * "same URL = same module" a language guarantee — one React instance across
 * the trust boundary (ADR 0007).
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
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nm = path.join(root, "node_modules");
const require_ = createRequire(import.meta.url);

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

// 1. vendor/react.js — self-contained: React's whole production CJS inlined.
await build({
  ...shared,
  stdin: { contents: facade(path.join(nm, "react/index.js"), "react", true), resolveDir: root },
  outfile: path.join(root, "out/sandbox/vendor/react.js"),
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
  outfile: path.join(root, "out/sandbox/vendor/react-jsx-runtime.js"),
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
  outfile: path.join(root, "out/sandbox/vendor/react-dom-client.js"),
});

// 4. harness.js — the trusted harness app (core/sandbox/framework.tsx). React is
//    external so the import map routes it to the vendored module; jsx is
//    automatic; the non-static template `import(`/sandbox/{slug}/bundle.js`)`
//    must pass through untouched.
await build({
  ...shared,
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  entryPoints: [path.join(root, "core/sandbox/framework.tsx")],
  outfile: path.join(root, "out/sandbox/harness.js"),
});

// 5. slides/harness.js — the `/slides` harness (issue #1), from
//    core/slides/framework.tsx. Same settings as the sandbox harness; it loads
//    `/slides/{slug}/bundle.js` (the backend-compiled slide). The slides route
//    reuses `out/sandbox/vendor/*` and `/sandbox/reset.css`, so no vendor or
//    css is rebuilt here — only this parallel harness.
await build({
  ...shared,
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  entryPoints: [path.join(root, "core/slides/framework.tsx")],
  outfile: path.join(root, "out/slides/harness.js"),
});

console.log("out/sandbox/:");
for (const f of [
  "vendor/react.js",
  "vendor/react-jsx-runtime.js",
  "vendor/react-dom-client.js",
  "harness.js",
]) {
  console.log(`  ${f}  ${statSync(path.join(root, "out/sandbox", f)).size} B`);
}

console.log("out/slides/:");
for (const f of ["harness.js"]) {
  console.log(`  ${f}  ${statSync(path.join(root, "out/slides", f)).size} B`);
}
