# Agent Instructions

When the user says "issues" or "the issues", they mean the GitHub issues of the author's **private** `lo-tp/learn-anything-frontend` repository:
https://github.com/lo-tp/learn-anything-frontend/issues

Use the `gh` CLI to fetch issues from that repository unless the user specifies otherwise. Example: `gh issue view 64 --repo lo-tp/learn-anything-frontend`

## How a change here reaches a browser

`main` is checked — lint, typecheck, unit tests — and never builds an image.
Merging `main` into `release` is the act that ships: the image is built, its smoke
step runs it and asserts `/api/compile`, it is published under a `sha-<commit>` tag,
and `lo-tp/learn-anything-infra` pins the digest and deploys it, with no human step
in between. `release` is protected and moves only by merging `main` into it, so every
commit production runs stays reachable on `main`.

Two rules follow from that: never commit directly to `release`, and never expect a
push to `main` to change what is serving.
