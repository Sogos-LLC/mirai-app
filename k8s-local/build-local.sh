#!/usr/bin/env bash
set -e

# Mirai k3d Local Build and Import Script
# Builds Docker images from source and imports them into k3d cluster

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
    echo "Mirai k3d Local Build and Import Script"
    echo ""
    echo "Usage: ./build-local.sh [service] [options]"
    echo ""
    echo "Services:"
    echo "  backend       - Build and import backend image"
    echo "  frontend      - Build and import frontend image"
    echo "  marketing     - Build and import marketing image"
    echo "  all           - Build and import all images (default)"
    echo ""
    echo "Options:"
    echo "  --restart     - Restart deployments after importing (default: yes)"
    echo "  --no-restart  - Skip restarting deployments"
    echo "  --no-cache    - Build without using Docker cache"
    echo ""
    echo "Examples:"
    echo "  ./build-local.sh              # Build all images"
    echo "  ./build-local.sh backend      # Build only backend"
    echo "  ./build-local.sh frontend --no-cache"
    echo "  ./build-local.sh all --no-restart"
    echo ""
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Parse arguments
SERVICE="${1:-all}"
RESTART="true"
CACHE_FLAG=""

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --restart)
            RESTART="true"
            shift
            ;;
        --no-restart)
            RESTART="false"
            shift
            ;;
        --no-cache)
            CACHE_FLAG="--no-cache"
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

# Check if cluster exists and is running
if ! k3d cluster list | grep -q "${CLUSTER_NAME}"; then
    log_error "Cluster '${CLUSTER_NAME}' does not exist."
    log_info "Run ./setup.sh to create the cluster first."
    exit 1
fi

# Check if cluster nodes are running (k3d node list shows actual running status)
if ! k3d node list 2>/dev/null | grep -q "${CLUSTER_NAME}.*running"; then
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

# Function to build and import a single service
build_and_import() {
    local service_name="$1"
    local dockerfile="$2"
    local context="$3"
    local image_name="$4"
    local build_args="${5:-}"  # Optional build args for Next.js NEXT_PUBLIC_* vars

    log_info "Building ${service_name} image..."

    if [[ ! -f "${dockerfile}" ]]; then
        log_error "Dockerfile not found: ${dockerfile}"
        return 1
    fi

    # Build the image (build_args allows passing --build-arg for Next.js env vars)
    docker build ${CACHE_FLAG} ${build_args} -t "${image_name}" -f "${dockerfile}" "${context}"
    log_success "${service_name} image built"

    # Import into k3d
    log_info "Importing ${service_name} image into k3d cluster..."
    k3d image import "${image_name}" -c "${CLUSTER_NAME}"
    log_success "${service_name} image imported"

    # Restart deployment if requested
    if [[ "${RESTART}" == "true" ]]; then
        local deployment_name=""
        case "${service_name}" in
            backend)
                deployment_name="mirai-backend"
                ;;
            frontend)
                deployment_name="mirai-frontend"
                ;;
            marketing)
                deployment_name="mirai-marketing"
                ;;
        esac

        if [[ -n "${deployment_name}" ]]; then
            log_info "Restarting ${deployment_name} deployment..."
            kubectl rollout restart deployment/${deployment_name} -n mirai-local
            log_success "${deployment_name} deployment restarted"

            # Wait for rollout to complete
            log_info "Waiting for rollout to complete..."
            kubectl rollout status deployment/${deployment_name} -n mirai-local --timeout=180s
            log_success "Rollout complete"
        fi
    fi
}

# Build based on service selection
case "${SERVICE}" in
    backend)
        build_and_import \
            "backend" \
            "${PROJECT_ROOT}/backend/Dockerfile" \
            "${PROJECT_ROOT}/backend" \
            "mirai-backend:local"
        ;;
    frontend)
        build_and_import \
            "frontend" \
            "${PROJECT_ROOT}/frontend/Dockerfile" \
            "${PROJECT_ROOT}/frontend" \
            "mirai-frontend:local" \
            "--build-arg NEXT_PUBLIC_APP_URL=https://mirai.dev --build-arg NEXT_PUBLIC_API_URL=https://api.mirai.dev --build-arg NEXT_PUBLIC_LANDING_URL=https://get-mirai.dev --build-arg NEXT_PUBLIC_KRATOS_BROWSER_URL=https://auth.mirai.dev"
        ;;
    marketing)
        build_and_import \
            "marketing" \
            "${PROJECT_ROOT}/frontend/Dockerfile" \
            "${PROJECT_ROOT}/frontend" \
            "mirai-marketing:local" \
            "--build-arg BUILD_TARGET=marketing --build-arg NEXT_PUBLIC_APP_URL=https://mirai.dev --build-arg NEXT_PUBLIC_LANDING_URL=https://get-mirai.dev"
        ;;
    all)
        log_info "Building all images..."
        echo ""

        build_and_import \
            "backend" \
            "${PROJECT_ROOT}/backend/Dockerfile" \
            "${PROJECT_ROOT}/backend" \
            "mirai-backend:local"

        echo ""

        build_and_import \
            "frontend" \
            "${PROJECT_ROOT}/frontend/Dockerfile" \
            "${PROJECT_ROOT}/frontend" \
            "mirai-frontend:local" \
            "--build-arg NEXT_PUBLIC_APP_URL=https://mirai.dev --build-arg NEXT_PUBLIC_API_URL=https://api.mirai.dev --build-arg NEXT_PUBLIC_LANDING_URL=https://get-mirai.dev --build-arg NEXT_PUBLIC_KRATOS_BROWSER_URL=https://auth.mirai.dev"

        echo ""

        build_and_import \
            "marketing" \
            "${PROJECT_ROOT}/frontend/Dockerfile" \
            "${PROJECT_ROOT}/frontend" \
            "mirai-marketing:local" \
            "--build-arg BUILD_TARGET=marketing --build-arg NEXT_PUBLIC_APP_URL=https://mirai.dev --build-arg NEXT_PUBLIC_LANDING_URL=https://get-mirai.dev"

        echo ""
        log_success "All images built and imported"
        ;;
    *)
        log_error "Unknown service: ${SERVICE}"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
log_success "======================================"
log_success "Build and import complete!"
log_success "======================================"
echo ""

if [[ "${RESTART}" == "true" ]]; then
    log_info "Deployments have been restarted with new images."
else
    log_warning "Deployments were not restarted. To use the new images, run:"
    echo "  kubectl rollout restart deployment/<name> -n mirai-local"
fi

echo ""
log_info "Check status with: ./status.sh"
log_info "View logs with: ./logs.sh [service]"
echo ""
