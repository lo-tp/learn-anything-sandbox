# learn-anything-sandbox

Development home for the **sandbox surface** of [`learn-anything`](https://github.com/lo-tp/learn-anything): the `/sandbox/*` delivery route (harness/vendor artifacts, per-request esbuild-compiled sample bundle, per-slug pages/bundles), the `/demo-sandbox` dev showcase host, the trusted harness + sample sources, and the sandbox build tooling.

Provenance: extracted from `lo-tp/learn-anything`. Design lives in main's [`docs/demos.md`](https://github.com/lo-tp/learn-anything/blob/main/docs/demos.md) and [ADR 0007](https://github.com/lo-tp/learn-anything/blob/main/docs/adr/0007-demos-in-opaque-origin-sandbox.md); related issues [#32](https://github.com/lo-tp/learn-anything/issues/32), [#36](https://github.com/lo-tp/learn-anything/issues/36), [#37](https://github.com/lo-tp/learn-anything/issues/37).

This is a **standalone sandbox host app** (own dev server, own origin) — a development home, not a production deploy. The `getDemoBySlug` store is a minimal stub in [`core/store.ts`](core/store.ts) (any slug → stub demo with the slug embedded, `parts >= 1`; mirrors main's stub while the db columns land in #32).

## Run

```sh
npm install
npm run dev
# → http://localhost:3001/demo-sandbox
```

`predev`/`prebuild`/`pretest` run `build:sandbox` (`node scripts/build-sandbox.mjs`), which esbuilds `out/sandbox/harness.js` + `out/sandbox/vendor/*.js`.

Quality gates: `npm run typecheck` and `npm test`.

## Sync back into `learn-anything`

To ship demos into the main app: copy `app/sandbox/`, `app/demo-sandbox/`, `core/sandbox/`, `scripts/build-sandbox.mjs`, and `test/sandbox/` + `test/app/` back into `learn-anything`, and re-add the `build:sandbox` script plus the `predev`/`prebuild`/`pretest` hooks to its `package.json`. Re-integration is tracked under main's map #11 / #37.
