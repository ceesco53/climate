#!/usr/bin/env bash
set -euo pipefail

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  echo "ERROR: .env file not found."
  echo "  cp .env.example .env  then fill in your values"
  exit 1
fi
set -o allexport
source .env
set +o allexport

# ── Validate required variables ───────────────────────────────────────────────
: "${GITHUB_USER:?GITHUB_USER is not set in .env}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set in .env}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID is not set in .env}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET is not set in .env}"
: "${SDM_PROJECT_ID:?SDM_PROJECT_ID is not set in .env}"

# ── Warn about optional-but-recommended variables ────────────────────────────
for var in GOOGLE_REFRESH_TOKEN UPSTAIRS_DEVICE_ID DOWNSTAIRS_DEVICE_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "WARN: $var is empty — see README.md for how to obtain it."
  fi
done

# ── Docker image ──────────────────────────────────────────────────────────────
IMAGE="ghcr.io/${GITHUB_USER}/climate"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
NAMESPACE="climate"

# ── Login to ghcr.io ──────────────────────────────────────────────────────────
echo ""
echo "→ Logging in to ghcr.io as ${GITHUB_USER}..."
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo "→ Building ${IMAGE}:${TAG} (linux/amd64)..."
docker buildx build \
  --platform linux/amd64 \
  -t "${IMAGE}:${TAG}" \
  -t "${IMAGE}:latest" \
  --load \
  .

# ── Push ──────────────────────────────────────────────────────────────────────
echo ""
echo "→ Pushing ${IMAGE}:${TAG}..."
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

# ── Apply k8s namespace and pull secret ──────────────────────────────────────
echo ""
echo "→ Applying k8s namespace..."
kubectl apply -f k8s/namespace.yaml

echo "→ Syncing ghcr pull secret..."
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="${GITHUB_USER}" \
  --docker-password="${GITHUB_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -n "${NAMESPACE}" -f -

# ── Apply k8s app secrets from .env ──────────────────────────────────────────
echo "→ Syncing climate app secrets..."
kubectl create secret generic climate-secrets \
  --from-literal=GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  --from-literal=GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET}" \
  --from-literal=SDM_PROJECT_ID="${SDM_PROJECT_ID}" \
  --from-literal=GOOGLE_REFRESH_TOKEN="${GOOGLE_REFRESH_TOKEN:-}" \
  --from-literal=UPSTAIRS_DEVICE_ID="${UPSTAIRS_DEVICE_ID:-}" \
  --from-literal=DOWNSTAIRS_DEVICE_ID="${DOWNSTAIRS_DEVICE_ID:-}" \
  --dry-run=client -o yaml | kubectl apply -n "${NAMESPACE}" -f -

# ── Apply remaining k8s manifests ─────────────────────────────────────────────
echo "→ Applying k8s manifests..."
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# ── Rollout ───────────────────────────────────────────────────────────────────
echo ""
echo "→ Waiting for rollout..."
kubectl rollout restart deployment/climate -n "${NAMESPACE}"
kubectl rollout status deployment/climate -n "${NAMESPACE}"

echo ""
echo "✓ Deployed ${IMAGE}:${TAG}"
echo "  https://climate.ingress.realmclick.com"
