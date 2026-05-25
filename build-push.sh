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

# ── Apply k8s manifests ───────────────────────────────────────────────────────
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
echo ""
echo "  First time? Open the dashboard and click 'Open Settings' to enter"
echo "  your Google credentials. They are stored only in the app database."
