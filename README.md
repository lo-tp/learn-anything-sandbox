# learn-anything

Development home for the **slide demo surface** of [`learn-anything`](https://github.com/lo-tp/learn-anything): the `/slides/*` delivery route (harness/vendor artifacts, per-request esbuild-compiled slide bundles, per-slide pages/bundles), the trusted harness + vendor sources, and the build tooling.

Provenance: extracted from `lo-tp/learn-anything`. Design lives in main's [`docs/demos.md`](https://github.com/lo-tp/learn-anything/blob/main/docs/demos.md) and [ADR 0007](https://github.com/lo-tp/learn-anything/blob/main/docs/adr/0007-demos-in-opaque-origin-sandbox.md); related issues [#32](https://github.com/lo-tp/learn-anything/issues/32), [#36](https://github.com/lo-tp/learn-anything/issues/36), [#37](https://github.com/lo-tp/learn-anything/issues/37).

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
