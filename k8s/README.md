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

Check rollout and certificate:

```bash
kubectl -n schrecknet rollout status deployment/schrecknet-server
kubectl -n schrecknet get certificate
```

## 5. Redeploy after a new image push

```bash
kubectl -n schrecknet rollout restart deployment/schrecknet-server
```

Or pin an explicit tag (e.g. a `v*` release tag) in `deployment.yaml` instead of `:main` for reproducible deploys.
