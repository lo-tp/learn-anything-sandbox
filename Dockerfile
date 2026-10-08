# syntax=docker/dockerfile:1
#
# The sandbox: a Next app that compiles and runs user code at request time. It is
# the one image in this product that cannot use `output: "standalone"`, and the
# reason is what it does per request:
#
#   * `app/slides/[...slides]/route.ts` reads `out/slides/harness.js` and
#     `out/slides/vendor/*` **from disk** (`process.cwd()`), and resolves `react`
#     and friends from the working directory's `node_modules` — a bundler cannot see
#     that, so a traced standalone server would be missing both;
#   * `/api/compile` runs the TypeScript compiler API and esbuild, and writes temp
#     `.cjs` files into its own working directory.
#
# So the runtime stage carries a production `node_modules`, the built `.next`, and
# the generated `out/`. And unlike the frontend, nothing app-specific is baked in:
# `ALLOWED_FRAME_ANCESTORS`, `NEXT_PUBLIC_BACKEND_URL` and `SANDBOX_SERVICE_TOKEN`
# are read at runtime, so one image is valid for every environment. `out/` is
# generated at build time and is gitignored, which is the other half of why this
# file exists at all: an image built from a clean checkout would otherwise have no
# harness to serve.

FROM node:24-slim AS install
WORKDIR /app
COPY package.json package-lock.json ./
# Empty by default, and CI never sets it. It exists because the slow step of a
# *local* build on this network is fetching from registry.npmjs.org through a proxy;
# `--build-arg NPM_REGISTRY=https://registry.npmmirror.com` makes a laptop build a
# few times faster. The published artifact is built against the lockfile's own
# registry, so this cannot change what runs in the cluster.
ARG NPM_REGISTRY
RUN npm ci ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}

# A separate production install, so the runtime carries exactly what the app needs
# to answer a request and nothing that only the build or the tests needed. `esbuild`
# and `typescript` are in `dependencies` for this reason, not by accident: they are
# used while serving, not while bundling.
FROM node:24-slim AS prod-install
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY
# `--ignore-scripts` because package.json's `prepare` hook runs `husky`, a
# devDependency this stage deliberately does not install — the first build of this
# file failed with exit 127 for exactly that reason. Lifecycle hooks are skipped
# wholesale, and the one worth thinking about is esbuild's postinstall: it does not
# fetch anything here, it verifies a binary that arrives as a platform-specific
# optional dependency, and the smoke test in the CI workflow proves it works by
# compiling something.
RUN npm ci --omit=dev --ignore-scripts ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}

FROM node:24-slim AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `prebuild` runs `build:vendor` (the KaTeX command table and `out/slides/*`), then
# `next build`. Nothing here repeats those steps: the package.json hooks are the
# single statement of what a build requires.
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app

# Numeric uid, same rule as every other image here: the cluster's
# `runAsNonRoot: true` is verified numerically, and a named user is a pod stuck in
# CreateContainerConfigError. The home directory is not created because nothing
# should write to it — the writable place that matters is the working directory,
# which is why it is chowned to the same uid rather than left root-owned.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid 10001 --home-dir /app --no-create-home app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

COPY --from=prod-install --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/.next ./.next
COPY --from=build --chown=10001:10001 /app/public ./public
# The generated compile fixtures (harness, vendor bundles). Read from disk on every
# slide request, so they ship with the image.
COPY --from=build --chown=10001:10001 /app/out ./out
# Kept as runtime files rather than trimmed. `next start` does read next.config.ts,
# but not for the CSP: `headers()` is evaluated at build time and frozen into
# .next/routes-manifest.json, which is why frame-ancestors is set per request in
# middleware.ts instead. Left in place because stripping config this build does not
# need today is a guess about tomorrow.
COPY --from=build --chown=10001:10001 /app/next.config.ts ./next.config.ts
COPY --from=build --chown=10001:10001 /app/core ./core

# The working directory itself, not just what is in it. `WORKDIR /app` created it
# root-owned, and `COPY --chown` only reaches the copied paths — so the first
# version of this image started fine, answered `/api/compile`, and failed inside
# the handler with `EACCES: permission denied, open '/app/compile-gate-….cjs'`.
# The directory needs to be writable by the process for that write to be possible,
# which is a different claim from "its files are owned by the app user".
RUN chown 10001:10001 /app

USER 10001
EXPOSE 3001

# The binary from the installed tree, not `npx` (which would look for something to
# fetch), and `exec` so the Next server is PID 1 and receives SIGTERM.
CMD ["sh", "-c", "exec ./node_modules/.bin/next start -p \"${PORT:-3001}\""]
