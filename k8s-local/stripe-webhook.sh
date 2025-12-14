#!/usr/bin/env bash
set -e

# Mirai Stripe Webhook Helper Script
# Updates the webhook secret after starting stripe listen

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show help
show_help() {
    echo "Mirai Stripe Webhook Helper"
    echo ""
    echo "Usage: ./stripe-webhook.sh <webhook-secret>"
    echo ""
    echo "This script updates the Stripe webhook secret in the cluster after starting"
    echo "'stripe listen'. The stripe CLI generates a new secret each time it starts."
    echo ""
    echo "Workflow:"
    echo "  1. In terminal 1, run: stripe listen --forward-to https://api.mirai.dev/api/v1/billing/webhook"
    echo "  2. Copy the webhook secret shown (whsec_...)"
    echo "  3. In terminal 2, run: ./stripe-webhook.sh whsec_your_secret_here"
    echo ""
    echo "Example:"
    echo "  ./stripe-webhook.sh whsec_cec7519cf24f879519cd5416802d0bf9e0ff663c1f4e2da29cfb7376bc0dd88c"
    echo ""
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || -z "${1:-}" ]]; then
    show_help
    exit 0
fi

WEBHOOK_SECRET="$1"
CLUSTER_NAME="mirai-local"
EXPECTED_CONTEXT="k3d-mirai-local"

# Validate webhook secret format
if [[ ! "${WEBHOOK_SECRET}" =~ ^whsec_ ]]; then
    log_error "Invalid webhook secret format. It should start with 'whsec_'"
    exit 1
fi

# Check if cluster is running
if ! k3d cluster list | grep -q "${CLUSTER_NAME}.*running"; then
    log_error "Cluster '${CLUSTER_NAME}' is not running."
    log_info "Start the cluster with: ./start.sh"
    exit 1
fi

# SAFETY: Set kubectl context
kubectl config use-context "${EXPECTED_CONTEXT}" >/dev/null 2>&1

current_context=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    log_error "SAFETY CHECK FAILED! Wrong kubectl context."
    log_error "Expected: ${EXPECTED_CONTEXT}, Got: ${current_context}"
    exit 1
fi

log_info "Updating Stripe webhook secret..."

# Base64 encode the secret
WEBHOOK_SECRET_B64=$(echo -n "${WEBHOOK_SECRET}" | base64)

# Patch the secret
kubectl patch secret mirai-stripe-secret -n mirai-local --type='json' \
    -p="[{\"op\": \"replace\", \"path\": \"/data/webhook-secret\", \"value\": \"${WEBHOOK_SECRET_B64}\"}]"

log_success "Webhook secret updated"

# Restart backend to pick up new secret
log_info "Restarting backend to pick up new secret..."
kubectl rollout restart deployment/mirai-backend -n mirai-local
kubectl rollout status deployment/mirai-backend -n mirai-local --timeout=120s

log_success "Backend restarted with new webhook secret"
echo ""
log_info "Stripe webhooks are now configured!"
log_info "Make sure 'stripe listen' is still running in another terminal."
echo ""
