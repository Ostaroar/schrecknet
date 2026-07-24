# ADR 0013 — CI redeploys the live pod after every main build

## Status

Accepted.

## Context

`docker.yml` built and pushed a new `ghcr.io/ostaroar/schrecknet:main` image
on every push to `main`, but nothing pulled it. The k8s Deployment uses
`imagePullPolicy: Always`, which only re-pulls on a pod restart — it doesn't
poll the registry. The result: the live site silently ran a stale image
until someone manually ran `kubectl rollout restart`. This wasn't
hypothetical — the 2026-07-24 V5-pool fix (docs/adr/0012) sat built and
pushed but undeployed for hours while the project owner kept seeing the bug
live and reasonably suspected a browser cache problem (it wasn't; the
browser-side card db has its own version-check-and-refetch logic in
`lib/dbWorker.ts`, unrelated to this gap).

## Decision

Add a `deploy` job to `docker.yml`, gated to `github.event_name == 'push' &&
github.ref == 'refs/heads/main'` (never PRs — no cluster credentials there,
and a fork's build shouldn't be able to touch prod; never the `v*` tag
trigger — a tag build isn't necessarily what the single-replica deployment,
which always tracks `:main`, should be running). It authenticates via
`digitalocean/action-doctl`, saves the DOKS kubeconfig, and runs `kubectl
rollout restart deployment/schrecknet-server` + `rollout status` to wait for
the new pod to come up healthy before the workflow reports success.

No `kubectl set image` / explicit tag bump: the deployment always tracks
`:main` and `imagePullPolicy: Always` guarantees a fresh pull on restart, so
a restart alone is sufficient and keeps the workflow from needing to know
the image digest.

Requires a `DIGITALOCEAN_ACCESS_TOKEN` repo secret (a DO API token scoped to
this project) — added by the repo owner directly via GitHub's secret UI,
never pasted through an agent session.

## Alternatives considered

- **GitOps (Flux/ArgoCD polling the registry)**: the standard answer for
  "cluster should track new images automatically," but it's new
  infrastructure (a controller, a repo/registry watch config) for a
  single-replica hobby-scale deployment where a 90-second CI step does the
  same job with far less to operate.
- **`kubectl set image` with the resolved digest**: more precise (pins the
  exact image the build just produced rather than trusting the registry's
  `:main` tag to be current by the time the pod pulls), but adds a
  digest-plumbing step for no real benefit here — there's no concurrent
  writer racing the tag, and `imagePullPolicy: Always` already gets the
  right image on this single-replica deployment.

## Consequences

- Every successful push to `main` that changes `core/`, `server/`,
  `frontend/`, `data/`, or `Dockerfile` now reaches schreck-net.com
  automatically, typically within a few minutes of the build finishing.
- A new required secret (`DIGITALOCEAN_ACCESS_TOKEN`) with cluster-scoped
  access lives in GitHub Actions — the standard CI blast-radius tradeoff of
  any auto-deploy setup. Scoped to this one DO project/cluster, not an
  account-wide token.
- If the deploy job fails (bad credentials, cluster unreachable, rollout
  timeout), the build itself already succeeded and pushed a valid image —
  a manual `kubectl rollout restart` remains the fallback, same as today.
