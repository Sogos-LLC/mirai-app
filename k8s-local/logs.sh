#!/usr/bin/env bash
set -e

# Mirai k3d Cluster Logs Viewer Script
# View logs from various services in the cluster

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
    echo "Mirai k3d Cluster Logs Viewer"
    echo ""
    echo "Usage: ./logs.sh [service] [options]"
    echo ""
    echo "Services:"
    echo "  backend       - Backend application logs"
    echo "  frontend      - Frontend application logs"
    echo "  marketing     - Marketing site logs"
    echo "  kratos        - Kratos authentication logs"
    echo "  postgres      - PostgreSQL database logs"
    echo "  redis         - Redis cache logs"
    echo "  minio         - MinIO object storage logs"
    echo "  mailpit       - Mailpit email testing logs"
    echo "  traefik       - Traefik ingress controller logs"
    echo "  all           - Tail all mirai namespace pods"
    echo ""
    echo "Options:"
    echo "  -f, --follow  - Follow log output (default)"
    echo "  --tail N      - Show last N lines (default: 100)"
    echo "  --previous    - Show logs from previous container (if crashed)"
    echo ""
    echo "Examples:"
    echo "  ./logs.sh backend"
    echo "  ./logs.sh postgres --tail 50"
    echo "  ./logs.sh kratos --previous"
    echo ""
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Check if stern is available (better multi-pod log viewer)
HAS_STERN=false
if command -v stern >/dev/null 2>&1; then
    HAS_STERN=true
fi

# Parse arguments
SERVICE="${1:-all}"
FOLLOW="-f"
TAIL_LINES="100"
PREVIOUS=""

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW="-f"
            shift
            ;;
        --tail)
            TAIL_LINES="$2"
            shift 2
            ;;
        --previous)
            PREVIOUS="--previous"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

CLUSTER_NAME="mirai-local"
EXPECTED_CONTEXT="k3d-mirai-local"

# Check if cluster is running
if ! k3d cluster list | grep -q "${CLUSTER_NAME}.*running"; then
    log_error "Cluster '${CLUSTER_NAME}' is not running."
    log_info "Start the cluster with: ./start.sh"
    exit 1
fi

# SAFETY: Set kubectl context before any kubectl commands
kubectl config use-context "${EXPECTED_CONTEXT}" >/dev/null 2>&1

current_context=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    log_error "SAFETY CHECK FAILED! Wrong kubectl context."
    log_error "Expected: ${EXPECTED_CONTEXT}, Got: ${current_context}"
    exit 1
fi

# Function to get logs with kubectl
get_kubectl_logs() {
    local selector="$1"
    local namespace="${2:-mirai-local}"

    log_info "Showing logs for ${selector} in namespace ${namespace}..."
    log_info "Press Ctrl+C to exit"
    echo ""

    kubectl logs -l "${selector}" -n "${namespace}" ${FOLLOW} --tail="${TAIL_LINES}" ${PREVIOUS} --all-containers=true
}

# Function to get logs with stern (if available)
get_stern_logs() {
    local selector="$1"
    local namespace="${2:-mirai-local}"

    log_info "Showing logs for ${selector} in namespace ${namespace} (via stern)..."
    log_info "Press Ctrl+C to exit"
    echo ""

    stern -n "${namespace}" -l "${selector}" --tail="${TAIL_LINES}"
}

# Main logic to show logs based on service
case "${SERVICE}" in
    backend)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=mirai-backend"
        else
            get_kubectl_logs "app=mirai-backend"
        fi
        ;;
    frontend)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=mirai-frontend"
        else
            get_kubectl_logs "app=mirai-frontend"
        fi
        ;;
    marketing)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=mirai-marketing"
        else
            get_kubectl_logs "app=mirai-marketing"
        fi
        ;;
    kratos)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app.kubernetes.io/name=kratos"
        else
            get_kubectl_logs "app.kubernetes.io/name=kratos"
        fi
        ;;
    postgres)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=postgres"
        else
            get_kubectl_logs "app=postgres"
        fi
        ;;
    redis)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=redis"
        else
            get_kubectl_logs "app=redis"
        fi
        ;;
    minio)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=minio"
        else
            get_kubectl_logs "app=minio"
        fi
        ;;
    mailpit)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app=mailpit"
        else
            get_kubectl_logs "app=mailpit"
        fi
        ;;
    traefik)
        if [[ "${HAS_STERN}" == "true" ]]; then
            get_stern_logs "app.kubernetes.io/name=traefik" "kube-system"
        else
            get_kubectl_logs "app.kubernetes.io/name=traefik" "kube-system"
        fi
        ;;
    all)
        if [[ "${HAS_STERN}" == "true" ]]; then
            log_info "Showing logs for all pods in mirai namespace (via stern)..."
            log_info "Press Ctrl+C to exit"
            echo ""
            stern -n mirai-local . --tail="${TAIL_LINES}"
        else
            log_warning "Stern is not installed. Showing combined logs via kubectl."
            log_info "For a better experience, install stern: brew install stern"
            log_info "Press Ctrl+C to exit"
            echo ""

            # Get all pod names and tail their logs
            kubectl logs -n mirai-local --all-containers=true -l 'app in (mirai-backend,mirai-frontend,mirai-marketing,postgres,redis,minio,mailpit)' ${FOLLOW} --tail="${TAIL_LINES}"
        fi
        ;;
    *)
        log_error "Unknown service: ${SERVICE}"
        echo ""
        show_help
        exit 1
        ;;
esac
