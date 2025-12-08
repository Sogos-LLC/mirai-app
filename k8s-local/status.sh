#!/usr/bin/env bash
set -e

# Mirai k3d Cluster Status Script
# Shows comprehensive status of the cluster and all services

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
    echo "Mirai k3d Cluster Status Script"
    echo ""
    echo "Usage: ./status.sh"
    echo ""
    echo "This script shows comprehensive status of the k3d cluster including:"
    echo "  - Cluster and node status"
    echo "  - All pod statuses by category"
    echo "  - Service endpoints"
    echo "  - Ingress routes"
    echo "  - Access URLs"
    exit 0
fi

CLUSTER_NAME="mirai-local"
EXPECTED_CONTEXT="k3d-mirai-local"

# Check if cluster exists
if ! k3d cluster list | grep -q "${CLUSTER_NAME}"; then
    log_error "Cluster '${CLUSTER_NAME}' does not exist."
    log_info "Run ./setup.sh to create the cluster."
    exit 1
fi

# Get cluster status
CLUSTER_STATUS=$(k3d cluster list | grep "${CLUSTER_NAME}" | awk '{print $2}' || echo "unknown")

echo ""
echo "======================================"
echo "Mirai k3d Cluster Status"
echo "======================================"
echo ""

# Cluster info
log_info "Cluster Information:"
echo "  Name: ${CLUSTER_NAME}"
echo "  Status: ${CLUSTER_STATUS}"

if [[ "${CLUSTER_STATUS}" != *"running"* ]]; then
    echo ""
    log_warning "Cluster is not running!"
    log_info "Start the cluster with: ./start.sh"
    exit 0
fi

# SAFETY: Set kubectl context before any kubectl commands
kubectl config use-context "${EXPECTED_CONTEXT}" >/dev/null 2>&1

current_context=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    log_error "SAFETY CHECK FAILED! Wrong kubectl context."
    log_error "Expected: ${EXPECTED_CONTEXT}, Got: ${current_context}"
    exit 1
fi

echo "  Context: ${EXPECTED_CONTEXT}"
echo ""

# Node status
log_info "Node Status:"
kubectl get nodes -o wide
echo ""

# System pods
log_info "System Pods (kube-system):"
kubectl get pods -n kube-system -o wide
echo ""

# Infrastructure pods
log_info "Infrastructure Pods:"
kubectl get pods -n mirai-local -l 'app in (postgres,redis,minio,mailpit)' -o wide
echo ""

# Kratos pods
log_info "Authentication Pods (Kratos):"
kubectl get pods -n mirai-local -l 'app.kubernetes.io/name=kratos' -o wide
echo ""

# Application pods
log_info "Application Pods:"
kubectl get pods -n mirai-local -l 'app in (mirai-backend,mirai-frontend,mirai-marketing)' -o wide
echo ""

# Services
log_info "Services:"
kubectl get svc -n mirai-local
echo ""

# Ingress routes
log_info "Ingress Routes:"
kubectl get ingressroute -n mirai-local -o wide 2>/dev/null || log_warning "No IngressRoutes found (may still be deploying)"
echo ""

# Pod summary with color coding
log_info "Pod Status Summary:"

get_pod_count() {
    kubectl get pods -n mirai-local "$@" 2>/dev/null | grep -v NAME | wc -l | tr -d ' '
}

get_pod_status() {
    local selector="$1"
    local running=$(kubectl get pods -n mirai-local -l "${selector}" --field-selector=status.phase=Running 2>/dev/null | grep -v NAME | wc -l | tr -d ' ')
    local total=$(kubectl get pods -n mirai-local -l "${selector}" 2>/dev/null | grep -v NAME | wc -l | tr -d ' ')

    if [[ "${running}" == "${total}" ]] && [[ "${total}" != "0" ]]; then
        echo -e "  ${GREEN}✓${NC} ${selector}: ${running}/${total} running"
    elif [[ "${total}" == "0" ]]; then
        echo -e "  ${RED}✗${NC} ${selector}: No pods found"
    else
        echo -e "  ${YELLOW}⚠${NC} ${selector}: ${running}/${total} running"
    fi
}

get_pod_status "app=postgres"
get_pod_status "app=redis"
get_pod_status "app=minio"
get_pod_status "app=mailpit"
get_pod_status "app.kubernetes.io/name=kratos"
get_pod_status "app=mirai-backend"
get_pod_status "app=mirai-frontend"
get_pod_status "app=mirai-marketing"

echo ""

# Access URLs
log_info "Access URLs:"
echo ""
echo "  Add these entries to /etc/hosts:"
echo "  127.0.0.1 mirai.test get-mirai.test auth.mirai.test api.mirai.test minio.mirai.test mailpit.mirai.test traefik.mirai.test"
echo ""
echo "  Application URLs:"
echo "    Frontend:  https://mirai.test"
echo "    Marketing: https://get-mirai.test"
echo "    Auth:      https://auth.mirai.test"
echo "    API:       https://api.mirai.test"
echo "    Mailpit:   https://mailpit.mirai.test"
echo "    MinIO:     https://minio.mirai.test"
echo "    Traefik:   https://traefik.mirai.test/dashboard/"
echo ""

# Quick commands
log_info "Useful Commands:"
echo "  View logs:        ./logs.sh [service]"
echo "  Rebuild images:   ./build-local.sh [service]"
echo "  Stop cluster:     ./stop.sh"
echo "  Full reset:       ./reset.sh"
echo ""

# Check for issues
ISSUES_FOUND=false

# Check for pods not running
NOT_RUNNING=$(kubectl get pods -n mirai-local --field-selector=status.phase!=Running 2>/dev/null | grep -v NAME || true)
if [[ -n "${NOT_RUNNING}" ]]; then
    ISSUES_FOUND=true
    log_warning "Some pods are not running:"
    echo "${NOT_RUNNING}"
    echo ""
fi

# Check for recent pod restarts
RECENT_RESTARTS=$(kubectl get pods -n mirai-local -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' 2>/dev/null | awk '$2 > 0' || true)
if [[ -n "${RECENT_RESTARTS}" ]]; then
    ISSUES_FOUND=true
    log_warning "Pods with restarts detected:"
    echo "${RECENT_RESTARTS}"
    echo ""
    log_info "Check logs with: ./logs.sh <service> --previous"
    echo ""
fi

if [[ "${ISSUES_FOUND}" == "false" ]]; then
    log_success "All systems operational!"
fi

echo ""
