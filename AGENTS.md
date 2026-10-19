# Agent Instructions

When the user says "issues" or "the issues", they mean the GitHub issues of the author's **private** `lo-tp/learn-anything-frontend` repository:
https://github.com/lo-tp/learn-anything-frontend/issues

Use the `gh` CLI to fetch issues from that repository unless the user specifies otherwise. Example: `gh issue view 64 --repo lo-tp/learn-anything-frontend`

### Priority

Issues carry a priority label from `P0` (highest) to `P5` (lowest):

| Label | Meaning |
|---|---|
| `P0` | Drop everything — active incident or data loss |
| `P1` | Urgent — blocks shipping or a core flow is broken |
| `P2` | High — important feature or regression, scheduled soon |
| `P3` | Medium — valuable but not time-sensitive |
| `P4` | Low — nice to have, no active pressure |
| `P5` | Backlog — parked, revisit when capacity allows |

When the user says "prioritise" or "set priority", apply the matching label via `gh issue edit <n> --repo lo-tp/learn-anything-frontend --add-label P<n>`.

## How a change here reaches a browser

This repo follows Git Flow, adapted to its pipeline — the same branch model as
`lo-tp/learn-anything-backend`, so a branch name means the same thing in both app
repositories:

- `main` — the stable branch. Checked (lint, typecheck, unit tests); never builds
  an image. What lands here is ready to ship.
- `develop` — the integration branch. All development work happens here; feature
  work never lands on `main` directly.
- `feature/<slug>` — cut from `develop` for each feature or ticket; merged back
  into `develop` when done.
- `hotfix/<slug>` — cut from `main` when what is serving is broken; merged back
  into `main` and into `develop`.
- `release` — this repo's release step is a persistent protected branch, not a
  per-release branch: merging `main` into `release` is the act that ships. The
  image is built, its smoke step runs the container and asserts `/api/compile`
  and the runtime `frame-ancestors` header, it is published under a
  `sha-<commit>` tag, and `lo-tp/learn-anything-infra` pins the digest and
  deploys it — with no human step in between.

So: feature work flows `feature/<slug>` → `develop` → `main`, hotfixes flow
`hotfix/<slug>` → `main` + `develop`, nothing lands on `release` directly, and
never expect a push to `main` to change what is serving. What production runs is
recorded in that infrastructure repository's
`manifests/overlays/prod/kustomization.yaml`; reverting that pin commit is the
rollback. Because every promotion is a merge, the commit a pin names stays
reachable on `main`.

Every promotion is a **merge commit** — the PR's merge commit, never its
rebase or squash — and the same work lands on one branch at a time, never
on two of `develop`, `main`, `release` (a cherry-pick across the pair
counts as landing it twice); a hotfix is one commit merged into both `main`
and `develop`. `feature/<slug>` → `develop` may be rebase-merged instead.
If a promotion PR conflicts in files both branches recently touched, the
lineages may be duplicated; diagnose before resolving: `git cherry
<target> <source>` (a `-` line is work already on the target), `git
merge-base <source> <target>`, `git merge-tree --write-tree <source>
<target>` (the merge's conflicts, without touching a working tree).

Nothing enforces the first three bullets: `main` and `develop` accept a direct push,
which is why some older commits sit on `main` by themselves. Only `release` is
protected — required status check `check`, force-push and deletion disallowed — so a
merge into it cannot bypass the gate. `enforce_admins` is off, so an admin push
straight to `release` is possible, and it would build and ship unreviewed: that is the
one move this model exists to make impossible, so it does not happen here. The branch
model is a convention, and a convention exists only in being followed — cut the branch,
open the PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
