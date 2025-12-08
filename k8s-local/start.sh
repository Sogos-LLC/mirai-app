#!/usr/bin/env bash
set -e

# Mirai k3d Cluster Start Script
# Starts a stopped cluster and verifies all pods are running

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
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Mirai k3d Cluster Start Script"
    echo ""
    echo "Usage: ./start.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --k9s    Launch k9s after starting (if installed)"
    echo "  -h       Show this help"
    echo ""
    echo "This script starts a stopped k3d cluster and verifies all services are running."
    echo "If the cluster doesn't exist, you'll need to run ./setup.sh first."
    exit 0
fi

CLUSTER_NAME="mirai-local"
EXPECTED_CONTEXT="k3d-mirai-local"
LAUNCH_K9S=false

# Parse arguments
if [[ "${1:-}" == "--k9s" ]]; then
    LAUNCH_K9S=true
fi

log_info "Starting Mirai k3d cluster..."

# Check if cluster exists
if ! k3d cluster list | grep -q "${CLUSTER_NAME}"; then
    log_error "Cluster '${CLUSTER_NAME}' does not exist."
    log_info "Please run ./setup.sh to create the cluster first."
    exit 1
fi

# Check cluster status
CLUSTER_STATUS=$(k3d cluster list | grep "${CLUSTER_NAME}" | awk '{print $2}' || echo "unknown")

if [[ "${CLUSTER_STATUS}" == *"running"* ]]; then
    log_success "Cluster '${CLUSTER_NAME}' is already running"
else
    log_info "Starting cluster '${CLUSTER_NAME}'..."
    k3d cluster start "${CLUSTER_NAME}"
    log_success "Cluster started"
fi

# SAFETY: Set and verify kubectl context before any kubectl commands
log_info "Setting kubectl context to ${EXPECTED_CONTEXT}..."
kubectl config use-context "${EXPECTED_CONTEXT}"

current_context=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    log_error "SAFETY CHECK FAILED!"
    log_error "Expected context: ${EXPECTED_CONTEXT}"
    log_error "Current context:  ${current_context}"
    exit 1
fi

# Wait for nodes to be ready
log_info "Waiting for nodes to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=60s
log_success "Nodes are ready"

# Wait for core system pods
log_info "Waiting for Traefik..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=traefik -n kube-system --timeout=60s 2>/dev/null || log_warning "Traefik may still be starting"

# Wait for infrastructure (with correct labels)
log_info "Waiting for infrastructure..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=postgres -n mirai-local --timeout=60s 2>/dev/null || log_warning "PostgreSQL starting..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis -n mirai-local --timeout=60s 2>/dev/null || log_warning "Redis starting..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=minio -n mirai-local --timeout=60s 2>/dev/null || log_warning "MinIO starting..."

# Wait for Kratos
log_info "Waiting for Kratos..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=kratos -n mirai-local --timeout=60s 2>/dev/null || log_warning "Kratos starting..."

# Wait for apps
log_info "Waiting for applications..."
kubectl wait --for=condition=Ready pod -l app=mirai-backend -n mirai-local --timeout=30s 2>/dev/null || log_warning "Backend starting..."
kubectl wait --for=condition=Ready pod -l app=mirai-frontend -n mirai-local --timeout=30s 2>/dev/null || log_warning "Frontend starting..."
kubectl wait --for=condition=Ready pod -l app=mirai-marketing -n mirai-local --timeout=30s 2>/dev/null || log_warning "Marketing starting..."

# Display cluster status
echo ""
log_success "======================================"
log_success "Mirai k3d cluster is running!"
log_success "======================================"
echo ""

# Show pod status
log_info "Cluster Status:"
echo ""
kubectl get pods -n mirai-local --no-headers | while read line; do
    NAME=$(echo "$line" | awk '{print $1}')
    READY=$(echo "$line" | awk '{print $2}')
    STATUS=$(echo "$line" | awk '{print $3}')
    if [[ "$STATUS" == "Running" ]]; then
        echo -e "  ${GREEN}✓${NC} $NAME ($READY)"
    else
        echo -e "  ${YELLOW}○${NC} $NAME ($STATUS)"
    fi
done
echo ""

log_info "Application URLs:"
echo "  Frontend:   https://mirai.test"
echo "  Marketing:  https://get-mirai.test"
echo "  Auth:       https://auth.mirai.test"
echo "  API:        https://api.mirai.test"
echo "  Mailpit:    https://mailpit.mirai.test"
echo "  MinIO:      https://minio.mirai.test"
echo "  Traefik:    https://traefik.mirai.test/dashboard/"
echo ""

# Open Traefik dashboard
if command -v open >/dev/null 2>&1; then
    sleep 1
    open "https://traefik.mirai.test/dashboard/"
fi

# k9s handling
if [[ "${LAUNCH_K9S}" == "true" ]]; then
    if command -v k9s >/dev/null 2>&1; then
        log_info "Launching k9s..."
        exec k9s --context k3d-mirai-local -n mirai-local
    else
        log_warning "k9s not installed. Install with: brew install k9s"
    fi
else
    if command -v k9s >/dev/null 2>&1; then
        log_info "Launch cluster UI with:"
        echo -e "  ${GREEN}k9s --context k3d-mirai-local -n mirai-local${NC}"
        echo "  or run: ./start.sh --k9s"
    else
        log_info "Recommended: Install k9s for cluster UI"
        echo -e "  ${YELLOW}brew install k9s${NC}"
        echo "  Then run: k9s --context k3d-mirai-local -n mirai-local"
    fi
fi

echo ""
log_info "Quick commands:"
echo "  ./status.sh       - View full status"
echo "  ./logs.sh backend - View logs"
echo "  ./stop.sh         - Stop cluster"
echo ""
