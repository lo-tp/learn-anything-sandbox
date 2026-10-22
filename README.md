# learn-anything-sandbox

The **slide surface** of the `learn-anything` project as its own service: the `/slides/*` delivery route (the deploy-built harness and vendor artifacts, the backend-fed slide bundles, the per-slide pages), the trusted harness and vendor sources, the `/api/compile` gate, and the build tooling.

Provenance: extracted from the author's `learn-anything` project. The design docs, the ADRs (`docs/adr/`) and every tracking issue — backend ones included — live in **[lo-tp/learn-anything-frontend](https://github.com/lo-tp/learn-anything-frontend)**, which is also where `CONTEXT.md` lives. This repository keeps none of them, the same rule `lo-tp/learn-anything-backend` follows.

It is a **standalone host app** with its own origin: locally a dev server on `:3001`; in the cluster `sandbox.lotp.xyz`, the service the app's slide pages are framed into. `ALLOWED_FRAME_ANCESTORS` names the origin allowed to frame it — production names `learn.lotp.xyz`.

## Run

```sh
npm install
npm run dev
# → http://localhost:3001/slides/{slide_id}
```

The committed `.env` holds the dev defaults — `PORT=3001` (so this server never collides with the main app's 3000), `NEXT_PUBLIC_BACKEND_URL`, `ALLOWED_FRAME_ANCESTORS` — and the gitignored `.env.local` shadows them. What a working `/slides/*` needs that a committed file cannot hold is `SANDBOX_SERVICE_TOKEN`: the route 500s without it, and the backend refuses the fetch without a matching header.

The page is written here. The slide bundle comes from the backend: `/slides/{slide_id}/bundle.js` fetches `${NEXT_PUBLIC_BACKEND_URL}/slides/{slide_id}` → JSON `{ slide_id, content }`, where `content` is self-contained **already-compiled ESM**, and the fetch carries `X-Service-Token` — read server-side, never sent to the browser. The bundle is served as it arrives, `no-store`: there is no per-request compile on this path, because the backend compiles slide source and this service owns what runs it. The harness then pulls that URL with a dynamic `import()`.

| URL | what it is |
|---|---|
| `/slides/{slide_id}?theme=light` | the slide page, `<html class="light">` — the frame's *initial* paint (#78) |
| `/slides/{slide_id}` | the same page, **403 unless the request is a frame navigation** (`Sec-Fetch-Dest: iframe`), except in dev with the switch below |
| `/slides/{slide_id}/bundle.js` | the backend-fetched slide bundle, no frame gate, `no-store` |
| `/slides/harness.js`, `/slides/vendor/*` | the deploy-built harness and vendor artifacts, `immutable`, each at a URL carrying the identity of its bytes |

By default the slide page is iframe-only, so LLM-authored slide code never executes in the app's origin: it runs in *this* service's origin, inside a frame the parent sandboxes to `allow-scripts allow-same-origin`. The page is the trusted half — it injects `window.DEMO` and only ever *renders* the untrusted bundle, never gives it a second program of its own. While developing, set `SANDBOX_ALLOW_DIRECT_SLIDE_ACCESS=true` in the gitignored `.env.local` to open `http://localhost:3001/slides/{slide_id}?theme=light` directly in a browser tab (the switch is ignored when `NODE_ENV=production`; see `core/direct-slide-access.ts`).

The parent drives the frame by `postMessage`, never by changing `src` — a per-slide `src` navigation appends a top-level history entry that swallows the Back button (#80). The cross-boundary surface, in `core/slides/framework.tsx`:

| direction | message | here |
|---|---|---|
| parent → frame | `DEMO_SET_SLIDE {slideId}` | swaps the rendered slide with a dynamic `import()` — an import is not a navigation (#80) |
| parent → frame | `DEMO_SET_THEME {theme}` | toggles the `light` class on this frame's own `<html>`; a theme change repaints, it does not reload or re-render (#185) |
| parent → frame | `DEMO_SET_PART {part}` | clamped to `0..parts−1` (`core/slides/clamp-part.ts`) |
| frame → parent | `SANDBOX_READY` | the listener is attached — the parent's cue to re-post theme and slide, so neither is lost to the mount race (#185) |
| frame → parent | `SANDBOX_RESIZE {height}`, `SANDBOX_ERROR {message}` | layout and boundary reporting |

`palette.css` belongs to the app, so the page links it at the first configured ancestor — the one asset this surface deliberately borrows across origins.

## The compile gate

`POST /api/compile` takes `{ code }` — slide JSX/TSX — and answers with minified ESM, the vendor specifiers left external, after a gate that validates the **component** rather than only the syntax: a minimum length, a declared `export default`, that default being a function, and a headless `renderToStaticMarkup` that must produce real DOM. A source that survives is esbuilt; failures come back as `{ code: "", error, traceback }` with the reason in the status text as well, so a caller that only reads the status line still learns what failed. This is the endpoint the image's smoke step drives.

Before the compiler, `app/api/compile/preprocess/` runs a registered list of source fixes in order — each one its own pure, unit-tested module, added by listing it in `FIXES`. That is where a known defect (a KaTeX backtick) gets a named correction, and where the LaTeX normalizer checks a macro against the whitelist `build:katex` derives from the installed `katex`.

## The deploy build

`predev`/`prebuild`/`pretest` run `build:vendor`, which is two steps: `build:katex` (`node scripts/build-katex-commands.mjs`, which derives the KaTeX command whitelist from the installed package and writes it to `core/katex-commands.ts` — regenerated on every build, with a test asserting the version it recorded is the version installed, so the normalizer tracks katex instead of a hand-kept list), then `node scripts/build-sandbox.mjs` — the esbuild pass that writes `out/slides/harness.js` (from `core/slides/framework.tsx`) and `out/slides/vendor/`: React, the JSX runtime, `react-dom/client`, KaTeX, `react-katex`, MathText (with `temml` bundled in), `better-react-mathjax`, and `katex.css` with its fonts. `core/vendor-packages.ts` is the single map both this build and the slide page's import map derive from, so a renamed vendor URL cannot leave the build writing the old file.

That import map is what makes "same URL = same module" a language guarantee: one React instance across the trust boundary, rather than a second copy of React loaded into a slide.

These artifacts are served `max-age=31536000, immutable` — which is only honest while the URL *is* the bytes. So the page asks for them at `?v=<sha256-12>` (`core/asset-stamp.ts`): unchanged bytes keep their cached build forever, a changed build cannot be kept. That was #185: a frame still running a pre-#185 harness ignored `DEMO_SET_THEME`, and a theme toggle looked like a fix that had never been written.

Quality gates: `npm run check` (lint + typecheck + tests) — the same chain the pre-push hook runs, and the same chain CI runs on every push and every PR.

## Branches

Git Flow, the same branch model as [lo-tp/learn-anything-backend](https://github.com/lo-tp/learn-anything-backend) (the reasoning is written out in `AGENTS.md`):

| Work | Where it starts | Where it lands |
|---|---|---|
| a feature or ticket | `feature/<slug>`, cut from `develop` | `develop`, by rebase-merge |
| a fix to what is serving | `hotfix/<slug>`, cut from `main` | `main`, by rebase-merge; `develop` is then rebased onto `main` to inherit it |
| a docs-only change | `docs/<slug>`, cut from the branch it documents | that branch, by rebase-merge |
| promoting what is ready | `develop` | `main`, by **merge commit** |
| shipping | `main` | `release`, by **merge commit** |

A promotion is the PR's merge commit — never its rebase or squash — because the merge is what names the commit a review saw, and that commit has to stay reachable from the branch a deployment points at. Feature and hotfix work lands by rebase-merge instead, so history stays linear where nobody is pinning it. Either way the same change lands on one branch at a time, never on two of `develop`, `main`, `release`.

`develop` and `main` are checked and never build an image. `release` is this repository's release step: a persistent protected branch — required check `check`, no force-push, no deletion — and merging `main` into it is the act that ships; nothing is ever committed directly to it. `main` and `develop` are not protected, so a direct push is *possible* (that is why some older commits sit on `main` by themselves); the model is a convention, and a convention exists only in being followed, so cut the branch and open the PR.

## Shipping

This repository builds the artifact; it does not decide where it runs. That lives in **[lo-tp/learn-anything-infra](https://github.com/lo-tp/learn-anything-infra)**: the production overlay pins this image **by digest** in `manifests/overlays/prod/kustomization.yaml`, and the variables the app reads at runtime — `ALLOWED_FRAME_ANCESTORS`, `NEXT_PUBLIC_BACKEND_URL`, `SANDBOX_SERVICE_TOKEN` — come from that repository (`sandbox-config` and `sandbox-env`). Nothing environment-specific is baked into the image, so one artifact serves every environment.

What happens here is `.github/workflows/build-image.yml`: `check` on every push and PR; then, for `release` only, build the image, **run the container and assert its request-time behaviour** — `/api/compile` answers a real slide, and the CSP `frame-ancestors` the container serves comes from the runtime environment rather than from `next.config.ts`, which is the assertion that was missing when production framed this service and every slide came up blank — and only then publish it under a `sha-<commit>` tag and hand the delivery to the infrastructure repository by dispatching its `deliver.yml`, which pins the digest and deploys it. No human step in between. If `DELIVERY_TOKEN` is ever missing from this repository the job warns instead of failing — the image is already published — and the manual path is `make deliver` over there.

Only `release` builds and publishes, and `release` moves only by merging `main` into it — that merge is the act that ships. So a push to `main` changes nothing that is serving: what production runs is the digest that overlay names, and reverting that pin commit is the rollback.

## The boundary, not a copy

The slide surface is not copied back into the main app. `learn-anything-frontend` keeps a thin `SandboxFrame` component (`components/sandbox/sandbox-frame.tsx`) that frames this service, and `lib/utils.ts`'s `sandboxSlideSrc` builds the URL it frames — `${NEXT_PUBLIC_SANDBOX_ORIGIN}/slides/{slideId}?theme=…` — for the deck's slides and for the scaled-down previews in the session sidebar (#47). What the app never does is run slide code in its own origin: the deck renders here, in this service's origin, and the `frame-ancestors` policy above is what lets that frame load in production. (That component's own comment cites "ADR 0007", which no longer names this boundary — 0007 is the decision about which notation math is written in — so the boundary here is carried by the policy and the iframe-only gate, not by an ADR number.)

The older plan — copy `app/slides/`, `core/slides/`, `scripts/build-sandbox.mjs` and `test/app/` back, re-add `build:vendor` and its `pre*` hooks to the main app's `package.json` — is how it was going to be reunited (that repository's map #11 and its sandbox-verification issue #37). Both are closed: the two surfaces ship as two images now, each from its own repository's pipeline.
