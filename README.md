# learn-anything-sandbox

Development home for the **demos surface** of [`learn-anything`](https://github.com/lo-tp/learn-anything): the `/demos/*` delivery route (harness/vendor artifacts, per-request esbuild-compiled sample bundle, per-slug pages/bundles), the `/demo-sandbox` dev showcase host, the trusted harness + sample sources, and the demos build tooling.

Provenance: extracted from `lo-tp/learn-anything`. Design lives in main's [`docs/demos.md`](https://github.com/lo-tp/learn-anything/blob/main/docs/demos.md) and [ADR 0007](https://github.com/lo-tp/learn-anything/blob/main/docs/adr/0007-demos-in-opaque-origin-sandbox.md); related issues [#32](https://github.com/lo-tp/learn-anything/issues/32), [#36](https://github.com/lo-tp/learn-anything/issues/36), [#37](https://github.com/lo-tp/learn-anything/issues/37).

This is a **standalone demo host app** (own dev server, own origin) — a development home, not a production deploy. The `getDemoBySlug` store is a minimal stub in [`core/store.ts`](core/store.ts) (any slug → stub demo with the slug embedded, `parts >= 1`; mirrors main's stub while the db columns land in #32).

## Run

```sh
npm install
npm run dev
# → http://localhost:3000/demo-sandbox
```

`predev`/`prebuild`/`pretest` run `build:demos` (`node scripts/build-demos.mjs`), which esbuilds `out/demos/harness.js` + `out/demos/vendor/*.js`.

Quality gates: `npm run typecheck` and `npm test`.

## Sync back into `learn-anything`

To ship demos into the main app: copy `app/demos/`, `app/demo-sandbox/`, `core/demos/`, `scripts/build-demos.mjs`, and `test/demos-routes.test.ts` back into `learn-anything`, and re-add the `build:demos` script plus the `predev`/`prebuild`/`pretest` hooks to its `package.json`. Re-integration is tracked under main's map #11 / #37.
