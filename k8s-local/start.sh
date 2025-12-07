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
    echo "Usage: ./start.sh"
    echo ""
    echo "This script starts a stopped k3d cluster and verifies all services are running."
    echo "If the cluster doesn't exist, you'll need to run ./setup.sh first."
    exit 0
fi

CLUSTER_NAME="mirai-local"

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
    log_warning "Cluster '${CLUSTER_NAME}' is already running"
else
    log_info "Starting cluster '${CLUSTER_NAME}'..."
    k3d cluster start "${CLUSTER_NAME}"
    log_success "Cluster started"
fi

# Wait for nodes to be ready
log_info "Waiting for nodes to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=60s
log_success "Nodes are ready"

# Wait for core system pods
log_info "Waiting for core system pods..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=traefik -n kube-system --timeout=60s 2>/dev/null || log_warning "Traefik may still be starting"
log_success "System pods ready"

# Check infrastructure pods
log_info "Checking infrastructure pods..."
sleep 5

INFRA_READY=true

kubectl wait --for=condition=Ready pod -l app=postgres -n mirai --timeout=60s 2>/dev/null || { log_warning "PostgreSQL not ready yet"; INFRA_READY=false; }
kubectl wait --for=condition=Ready pod -l app=redis -n mirai --timeout=60s 2>/dev/null || { log_warning "Redis not ready yet"; INFRA_READY=false; }
kubectl wait --for=condition=Ready pod -l app=minio -n mirai --timeout=60s 2>/dev/null || { log_warning "MinIO not ready yet"; INFRA_READY=false; }

if [[ "${INFRA_READY}" == "true" ]]; then
    log_success "Infrastructure pods ready"
else
    log_warning "Some infrastructure pods are still starting. This is normal, please wait a moment."
fi

# Check Kratos
log_info "Checking Kratos pods..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=kratos -n mirai --timeout=60s 2>/dev/null || log_warning "Kratos not ready yet"

# Check application pods
log_info "Checking application pods..."
APP_READY=true

kubectl wait --for=condition=Ready pod -l app=mirai-backend -n mirai --timeout=30s 2>/dev/null || { log_warning "Backend not ready yet"; APP_READY=false; }
kubectl wait --for=condition=Ready pod -l app=mirai-frontend -n mirai --timeout=30s 2>/dev/null || { log_warning "Frontend not ready yet"; APP_READY=false; }
kubectl wait --for=condition=Ready pod -l app=mirai-marketing -n mirai --timeout=30s 2>/dev/null || { log_warning "Marketing not ready yet"; APP_READY=false; }

if [[ "${APP_READY}" == "true" ]]; then
    log_success "Application pods ready"
else
    log_warning "Some application pods are still starting. Run './status.sh' to check progress."
fi

# Display cluster information
echo ""
log_success "======================================"
log_success "Mirai k3d cluster is running!"
log_success "======================================"
echo ""
log_info "Access URLs:"
echo "  Frontend:  https://mirai.local"
echo "  Auth:      https://auth.mirai.local"
echo "  API:       https://api.mirai.local"
echo "  MinIO:     https://minio.mirai.local"
echo "  Mailpit:   https://mailpit.mirai.local"
echo ""
log_info "Useful commands:"
echo "  View status:      ./status.sh"
echo "  View logs:        ./logs.sh [service]"
echo "  Stop cluster:     ./stop.sh"
echo "  Rebuild images:   ./build-local.sh [service]"
echo ""
