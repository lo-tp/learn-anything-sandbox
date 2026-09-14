/**
 * The vendor packages every slide bundle may import as bare specifiers —
 * the single source of truth shared by:
 *
 *   - `POST /api/compile`, which keeps them `external` when esbuilding slide
 *     source (and auto-imports some of their exported names), and
 *   - the `/slides/*` route, whose slide-page import map routes each
 *     specifier to a deploy-built artifact under `/slides/vendor/*`.
 *
 * A bundle that imports a specifier not listed here would fail to resolve
 * on the slide page, so both consumers derive from this map instead of
 * carrying their own copy.
 */
export const VENDOR_PACKAGES: Record<string, string> = {
  react: "/slides/vendor/react.js",
  "react/jsx-runtime": "/slides/vendor/react-jsx-runtime.js",
  "react-dom/client": "/slides/vendor/react-dom-client.js",
  "react-katex": "/slides/vendor/react-katex.js",
  katex: "/slides/vendor/katex.js",
  "math-text": "/slides/vendor/math-text.js",
};

/** The bare specifiers themselves — esbuild `external` for slide bundles. */
export const VENDOR_EXTERNALS: string[] = Object.keys(VENDOR_PACKAGES);
