# learn-anything-sandbox

The **slide demo surface** of the `learn-anything` project as its own service: the `/slides/*` delivery route (harness/vendor artifacts, per-request esbuild-compiled slide bundles, per-slide pages/bundles), the trusted harness + vendor sources, and the build tooling.

Provenance: extracted from the author's `learn-anything` project. The design docs, the ADRs (`docs/adr/`) and every tracking issue — backend ones included — live in **[lo-tp/learn-anything-frontend](https://github.com/lo-tp/learn-anything-frontend)**, which is also where `CONTEXT.md` lives. This repository keeps none of them, the same rule `lo-tp/learn-anything-backend` follows.

It is a **standalone host app** with its own origin: locally a dev server on `:3001`, in the cluster the service the slide pages are framed into (`ALLOWED_FRAME_ANCESTORS` names the origin allowed to frame it, `learn.lotp.xyz`).

## Run

```sh
npm install
npm run dev
# → http://localhost:3001/slides/{slide_id}
```

The `/slides/*` route serves backend-fed slide demos: each `/slides/{slide_id}` fetches the slide TSX from the backend, compiles it per request with esbuild, and serves it in an opaque-origin iframe.

By default the slide page is iframe-only (403 for a top-level tab), so LLM-authored slide code never runs in an app origin. While developing, set `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true` in the gitignored `.env.local` to open `http://localhost:3001/slides/{slide_id}?theme=light` directly in a browser tab (the switch is ignored when `NODE_ENV=production`; see `core/direct-slide-access.ts`).

`predev`/`prebuild`/`pretest` run `build:vendor` (`node scripts/build-sandbox.mjs`), which esbuilds `out/slides/harness.js` + `out/slides/vendor/*.js` (React, KaTeX).

Quality gates: `npm run check` (lint + typecheck + tests) — the same chain the pre-push hook runs.

## Branches

Git Flow, the same branch model as [lo-tp/learn-anything-backend](https://github.com/lo-tp/learn-anything-backend) (the reasoning is written out in `AGENTS.md`):

| Work | Where it starts | Where it lands |
|---|---|---|
| a feature or ticket | `feature/<slug>`, cut from `develop` | `develop` |
| a fix to what is serving | `hotfix/<slug>`, cut from `main` | `main`, then `develop` |
| promoting what is ready | `develop` | `main` |
| shipping | `main` | `release` |

Every one of those moves is a merge, and a merge is opened as a PR so there is a place to read it. `develop` and `main` are checked and never build an image; nothing is ever committed directly to `release`.

## Shipping

This repository builds the artifact; it does not decide where it runs. That lives in **[lo-tp/learn-anything-infra](https://github.com/lo-tp/learn-anything-infra)**: the production overlay pins this image **by digest** in `manifests/overlays/prod/kustomization.yaml`, and the variables the app reads at runtime — `ALLOWED_FRAME_ANCESTORS`, `NEXT_PUBLIC_BACKEND_URL`, `SANDBOX_SERVICE_TOKEN` — come from that repository. Nothing environment-specific is baked into the image, so one artifact serves every environment.

What happens here is `.github/workflows/build-image.yml`: lint, typecheck and tests; then build the image, **run the container and assert its request-time behaviour** (a smoke step — `/api/compile` answers a real slide, and the served CSP `frame-ancestors` comes from the runtime environment, not from `next.config.ts`); and only then publish it under a `sha-<commit>` tag and hand the delivery to the infrastructure repository, which pins the digest and deploys it. No human step in between.

Only `release` builds and publishes, and `release` moves only by merging `main` into it — that merge is the act that ships. So a push to `main` changes nothing that is serving: what production runs is the digest that overlay names, and reverting that pin commit is the rollback.

## The boundary, not a copy

The slide surface is not copied back into the main app. `learn-anything-frontend` keeps a thin `SandboxFrame` component that frames this service (`NEXT_PUBLIC_SANDBOX_ORIGIN`), and a Demo executes here, in its own origin — ADR 0007, named in that component's own comment — and the `frame-ancestors` policy described above is what lets that frame load in production.

The older plan — copy `app/slides/`, `core/slides/`, `scripts/build-sandbox.mjs` and `test/app/` back, re-add `build:vendor` and its `pre*` hooks to the main app's `package.json` — is how it was going to be reunited (that repository's map #11 and its sandbox-verification issue #37). Both are closed: the two surfaces ship as two images now, each from its own repository's pipeline.
