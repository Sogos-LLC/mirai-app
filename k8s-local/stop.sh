#!/usr/bin/env bash
set -e

# Mirai k3d Cluster Stop Script
# Stops the cluster while preserving all data

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
    echo "Mirai k3d Cluster Stop Script"
    echo ""
    echo "Usage: ./stop.sh"
    echo ""
    echo "This script stops the k3d cluster while preserving all data."
    echo "Use ./start.sh to resume the cluster later."
    exit 0
fi

CLUSTER_NAME="mirai-local"

log_info "Stopping Mirai k3d cluster..."

# Check if cluster exists
if ! k3d cluster list | grep -q "${CLUSTER_NAME}"; then
    log_error "Cluster '${CLUSTER_NAME}' does not exist."
    exit 1
fi

# Check cluster status
CLUSTER_STATUS=$(k3d cluster list | grep "${CLUSTER_NAME}" | awk '{print $2}' || echo "unknown")

if [[ "${CLUSTER_STATUS}" == *"stopped"* ]]; then
    log_warning "Cluster '${CLUSTER_NAME}' is already stopped"
    exit 0
fi

# Stop the cluster
log_info "Stopping cluster '${CLUSTER_NAME}'..."
k3d cluster stop "${CLUSTER_NAME}"

log_success "Cluster stopped successfully"
echo ""
log_info "All data has been preserved. To resume the cluster, run:"
echo "  ./start.sh"
echo ""
log_info "To completely remove the cluster and all data, run:"
echo "  ./reset.sh"
echo ""
