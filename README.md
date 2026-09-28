# learn-anything-sandbox

Development home for the **slide demo surface** of the `learn-anything` project: the `/slides/*` delivery route (harness/vendor artifacts, per-request esbuild-compiled slide bundles, per-slide pages/bundles), the trusted harness + vendor sources, and the build tooling.

Provenance: extracted from the author's `learn-anything` project (a private repository — the design docs, ADR 0007, and tracking issues live there and are not linked from this public repo).

This is a **standalone host app** (own dev server, own origin) — a development home, not a production deploy.

## Run

```sh
npm install
npm run dev
# → http://localhost:3001/slides/{slide_id}
```

The `/slides/*` route serves backend-fed slide demos: each `/slides/{slide_id}` fetches the slide TSX from the backend, compiles it per request with esbuild, and serves it in an opaque-origin iframe.

`predev`/`prebuild`/`pretest` run `build:vendor` (`node scripts/build-sandbox.mjs`), which esbuilds `out/slides/harness.js` + `out/slides/vendor/*.js` (React, KaTeX).

Quality gates: `npm run typecheck` and `npm test`.

## Sync back into `learn-anything`

To ship the slide surface into the main app: copy `app/slides/`, `core/slides/`, `scripts/build-sandbox.mjs`, and `test/app/` back into `learn-anything`, and re-add the `build:vendor` script plus the `predev`/`prebuild`/`pretest` hooks to its `package.json`. Re-integration is tracked under main's map #11 / #37.
