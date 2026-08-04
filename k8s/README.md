# Deploy to DigitalOcean Kubernetes (DOKS)

Assumes `doctl` and `kubectl` are installed and `doctl kubernetes cluster kubeconfig save <cluster>` was run.

## 1. Domain

Domain must already be registered elsewhere (DO is not a registrar). Point it at DO's nameservers:

```bash
doctl compute domain create your-domain.example
```

Set at your registrar:
```
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```

## 2. Ingress controller + cert-manager (one-time per cluster)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set installCRDs=true
```

Wait for the LoadBalancer's external IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
```

Point the domain's A record at that IP:

```bash
doctl compute domain records create your-domain.example \
  --record-type A --record-name @ --record-data <LB-IP>
```

## 3. GHCR pull secret

The `docker` CI workflow pushes to `ghcr.io/ostaroar/schrecknet`, which is **private** by default. Create a pull secret so the cluster can pull it (needs a GitHub PAT with `read:packages`):

```bash
kubectl create namespace schrecknet
kubectl create secret docker-registry ghcr-pull \
  -n schrecknet \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-pat-with-read:packages>
```

Then add to `deployment.yaml`'s pod spec:
```yaml
imagePullSecrets:
  - name: ghcr-pull
```

(Skip this entirely if you make the GHCR package public instead.)

## 4. Apply manifests

```bash
# replace DOMAIN_PLACEHOLDER in ingress.yaml first
sed -i '' 's/DOMAIN_PLACEHOLDER/your-domain.example/' k8s/ingress.yaml

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/cluster-issuer.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

**`deployment.yaml` edits deploy themselves.** `docker.yml`'s deploy job runs
`kubectl apply -f k8s/deployment.yaml` before each rollout, so a changed env
var, probe or resource limit takes effect on the push that introduced it. The
other manifests here (namespace, PVC, ingress, cluster-issuer) are still
bootstrap-only and need a manual `kubectl apply` when edited.

Check rollout and certificate:

```bash
kubectl -n schrecknet rollout status deployment/schrecknet-server
kubectl -n schrecknet get certificate
```

## 5. Redeploy after a new image push

CI does this automatically on every push to `main` (`.github/workflows/docker.yml`'s
`deploy` job, docs/adr/0013). Manual fallback if that job is broken or you need
to force a restart without a new commit:

```bash
kubectl -n schrecknet rollout restart deployment/schrecknet-server
```

Or pin an explicit tag (e.g. a `v*` release tag) in `deployment.yaml` instead of `:main` for reproducible deploys.

## 6. Emergency rollback

**Use the `rollback` workflow** (Actions → rollback → Run workflow), giving it an
immutable `sha-<short>` tag. It verifies the tag exists, points the deployment at
it, waits for the rollout, and smoke-checks the live site.

**Verified end-to-end on 2026-08-03**: rolling production back to `sha-4f5abd2`
took **61 s** from job start to a green smoke check (the live bundle really did
change to the older build's hash), and un-pinning back to `:main` took a further
43 s. Compare ~10 minutes for `git revert` → full image rebuild → deploy.

One flake to expect: `digitalocean/action-doctl` intermittently fails with
`401 mTLS verification failed` even with a valid token — it happened once during
that verification and a plain re-run succeeded, with `docker.yml`'s deploy job
having used the same secret minutes earlier. If a rollback fails on the very
first step, re-run it before assuming the token is broken.

Find a tag to roll back to:

```bash
gh api "/users/Ostaroar/packages/container/schrecknet/versions" \
  --jq '.[].metadata.container.tags[]?' | grep '^sha-'
```

Two traps worth knowing before you need them:

- **`kubectl rollout undo` does not roll back.** The pod template always names
  the mutable tag `:main` (`deployment.yaml`) with `imagePullPolicy: Always`, so
  every revision points at the same reference and undoing just re-pulls the same
  bad image. A rollback has to change the image reference.
- **A rollback only holds until the next push to main.** After a rollback the
  deployment names `…:sha-<short>`, but `docker.yml`'s deploy job now runs
  `kubectl apply -f k8s/deployment.yaml` before restarting, which restores the
  `:main` tag. That is deliberate — it used to be the opposite trap, where a
  pinned deployment made every later deploy a silent green no-op — but it means
  **a rollback is not a place to sit**: land the fix, don't just roll back. To
  un-pin manually without waiting for a deploy:

```bash
kubectl -n schrecknet set image deployment/schrecknet-server \
  server=ghcr.io/ostaroar/schrecknet:main
```

**Rollback depth is only ~5 builds.** `docker.yml`'s `cleanup-ghcr` job keeps 15
GHCR versions (~3 per build). That cap exists because package storage counts
against the account's shared quota, which this project has exhausted before. The
repo is public but **the GHCR package itself is still private**, and private
package storage is what the quota bills — making the package public would make
its storage free and let the buffer be deepened safely. Until someone decides
that, leave `min-versions-to-keep` alone.
