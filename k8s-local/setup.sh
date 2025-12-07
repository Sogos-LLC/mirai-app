#!/usr/bin/env bash
set -e

# Mirai k3d Local Development Setup Script
# This script performs complete one-time setup of the local k3d cluster

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
    echo "Mirai k3d Local Development Setup"
    echo ""
    echo "Usage: ./setup.sh"
    echo ""
    echo "This script performs a complete one-time setup of the local k3d cluster:"
    echo "  - Checks prerequisites (k3d, kubectl, helm, mkcert, docker)"
    echo "  - Creates k3d cluster"
    echo "  - Installs Traefik ingress controller"
    echo "  - Generates TLS certificates with mkcert"
    echo "  - Deploys infrastructure (PostgreSQL, Redis, MinIO)"
    echo "  - Deploys Kratos authentication"
    echo "  - Builds and imports local Docker images"
    echo "  - Deploys Mirai applications"
    echo ""
    echo "Prerequisites:"
    echo "  - Docker Desktop running"
    echo "  - k3d installed (brew install k3d)"
    echo "  - kubectl installed (brew install kubectl)"
    echo "  - helm installed (brew install helm)"
    echo "  - mkcert installed (brew install mkcert)"
    exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info "Starting Mirai k3d local development setup..."
log_info "Script directory: ${SCRIPT_DIR}"
log_info "Project root: ${PROJECT_ROOT}"

# Step 1: Check prerequisites
log_info "Step 1/17: Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { log_error "docker is required but not installed. Install Docker Desktop."; exit 1; }
command -v k3d >/dev/null 2>&1 || { log_error "k3d is required but not installed. Run: brew install k3d"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { log_error "kubectl is required but not installed. Run: brew install kubectl"; exit 1; }
command -v helm >/dev/null 2>&1 || { log_error "helm is required but not installed. Run: brew install helm"; exit 1; }
command -v mkcert >/dev/null 2>&1 || { log_error "mkcert is required but not installed. Run: brew install mkcert"; exit 1; }

# Check Docker is running
docker info >/dev/null 2>&1 || { log_error "Docker daemon is not running. Please start Docker Desktop."; exit 1; }

log_success "All prerequisites satisfied"

# Step 2: Create k3d cluster
log_info "Step 2/17: Creating k3d cluster 'mirai-local'..."

if k3d cluster list | grep -q mirai-local; then
    log_warning "Cluster 'mirai-local' already exists. Deleting it first..."
    k3d cluster delete mirai-local
fi

k3d cluster create --config "${SCRIPT_DIR}/cluster-config.yaml"
log_success "k3d cluster created"

# Step 3: Wait for cluster to be ready
log_info "Step 3/17: Waiting for cluster nodes to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s
log_success "Cluster nodes ready"

# Step 4: Create mirai namespace
log_info "Step 4/17: Creating 'mirai' namespace..."
kubectl apply -f "${SCRIPT_DIR}/namespaces.yaml"
log_success "Namespace created"

# Step 5: Add Helm repositories
log_info "Step 5/17: Adding Helm repositories..."
helm repo add traefik https://traefik.github.io/charts
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update
log_success "Helm repositories added and updated"

# Step 6: Install Traefik via Helm
log_info "Step 6/17: Installing Traefik ingress controller..."
helm upgrade --install traefik traefik/traefik \
    --namespace kube-system \
    --values "${SCRIPT_DIR}/ingress/traefik-values.yaml" \
    --wait \
    --timeout 5m
log_success "Traefik installed"

# Step 7: Generate mkcert certificates
log_info "Step 7/17: Generating TLS certificates with mkcert..."

# Ensure mkcert is initialized
mkcert -install

# Create temp directory for certificates
CERT_DIR=$(mktemp -d)
trap "rm -rf ${CERT_DIR}" EXIT

# Generate certificates for all Mirai domains
cd "${CERT_DIR}"
mkcert \
    "mirai.local" \
    "*.mirai.local" \
    "auth.mirai.local" \
    "api.mirai.local" \
    "minio.mirai.local" \
    "mailpit.mirai.local"

# Find the generated certificate files
TLS_CERT=$(ls -1 *.pem | grep -v key | head -n 1)
TLS_KEY=$(ls -1 *-key.pem | head -n 1)

# Create TLS secret in mirai namespace
kubectl create secret tls mirai-tls \
    --cert="${TLS_CERT}" \
    --key="${TLS_KEY}" \
    --namespace=mirai \
    --dry-run=client -o yaml | kubectl apply -f -

log_success "TLS certificates generated and secret created"

# Step 8: Deploy infrastructure
log_info "Step 8/17: Deploying infrastructure (PostgreSQL, Redis, MinIO)..."
kubectl apply -k "${SCRIPT_DIR}/infrastructure"
log_success "Infrastructure deployed"

# Step 9: Wait for infrastructure to be ready
log_info "Step 9/17: Waiting for infrastructure to be ready..."

log_info "  Waiting for PostgreSQL..."
kubectl wait --for=condition=Ready pod -l app=postgres -n mirai --timeout=180s

log_info "  Waiting for Redis..."
kubectl wait --for=condition=Ready pod -l app=redis -n mirai --timeout=120s

log_info "  Waiting for MinIO..."
kubectl wait --for=condition=Ready pod -l app=minio -n mirai --timeout=120s

log_success "Infrastructure ready"

# Step 10: Create Kratos database
log_info "Step 10/17: Creating Kratos database in PostgreSQL..."

# Wait a bit for PostgreSQL to be fully ready
sleep 5

# Create kratos database
kubectl exec -n mirai deployment/postgres -- \
    psql -U postgres -c "CREATE DATABASE kratos;" 2>/dev/null || log_warning "Kratos database may already exist"

log_success "Kratos database created"

# Step 11: Deploy Kratos prerequisites
log_info "Step 11/17: Deploying Kratos prerequisites (mailpit, secrets)..."
kubectl apply -k "${SCRIPT_DIR}/kratos"
log_success "Kratos prerequisites deployed"

# Wait for mailpit
log_info "  Waiting for Mailpit..."
kubectl wait --for=condition=Ready pod -l app=mailpit -n mirai --timeout=60s

# Step 12: Install Kratos via Helm
log_info "Step 12/17: Installing Ory Kratos..."

# Update DSN in values file with actual connection details
helm upgrade --install kratos ory/kratos \
    --namespace mirai \
    --values "${SCRIPT_DIR}/kratos/values-local.yaml" \
    --set-string 'kratos.config.dsn=postgres://postgres:$PASSWORD@postgres:5432/kratos?sslmode=disable' \
    --set-string 'kratos.config.secrets.default[0]=PLEASE_CHANGE_THIS_TO_A_SECURE_SECRET_IN_PRODUCTION' \
    --wait \
    --timeout 5m

log_success "Kratos installed"

# Step 13: Wait for Kratos to be ready
log_info "Step 13/17: Waiting for Kratos to be ready..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=kratos -n mirai --timeout=180s
log_success "Kratos ready"

# Step 14: Deploy ingress routes
log_info "Step 14/17: Deploying ingress routes and middleware..."
kubectl apply -k "${SCRIPT_DIR}/ingress"
log_success "Ingress routes deployed"

# Step 15: Build local Docker images
log_info "Step 15/17: Building local Docker images..."

log_info "  Building backend image..."
docker build -t mirai-backend:local -f "${PROJECT_ROOT}/backend/Dockerfile" "${PROJECT_ROOT}/backend"

log_info "  Building frontend image..."
docker build -t mirai-frontend:local -f "${PROJECT_ROOT}/frontend/Dockerfile" "${PROJECT_ROOT}/frontend"

log_info "  Building marketing image..."
docker build -t mirai-marketing:local -f "${PROJECT_ROOT}/frontend/Dockerfile.marketing" "${PROJECT_ROOT}/frontend"

log_success "Docker images built"

# Step 16: Import images into k3d
log_info "Step 16/17: Importing images into k3d cluster..."
k3d image import mirai-backend:local -c mirai-local
k3d image import mirai-frontend:local -c mirai-local
k3d image import mirai-marketing:local -c mirai-local
log_success "Images imported"

# Step 17: Deploy applications
log_info "Step 17/17: Deploying Mirai applications..."
kubectl apply -k "${SCRIPT_DIR}/apps"
log_success "Applications deployed"

# Wait for applications to be ready
log_info "Waiting for applications to be ready..."
sleep 10

log_info "  Waiting for backend..."
kubectl wait --for=condition=Ready pod -l app=mirai-backend -n mirai --timeout=120s 2>/dev/null || log_warning "Backend may still be starting"

log_info "  Waiting for frontend..."
kubectl wait --for=condition=Ready pod -l app=mirai-frontend -n mirai --timeout=120s 2>/dev/null || log_warning "Frontend may still be starting"

log_info "  Waiting for marketing..."
kubectl wait --for=condition=Ready pod -l app=mirai-marketing -n mirai --timeout=120s 2>/dev/null || log_warning "Marketing may still be starting"

# Final success message
echo ""
log_success "======================================"
log_success "Mirai k3d cluster setup complete!"
log_success "======================================"
echo ""
log_info "Cluster details:"
echo "  Cluster name: mirai-local"
echo "  Namespace: mirai"
echo "  Context: k3d-mirai-local"
echo ""
log_info "Access URLs (add to /etc/hosts):"
echo "  127.0.0.1 mirai.local"
echo "  127.0.0.1 auth.mirai.local"
echo "  127.0.0.1 api.mirai.local"
echo "  127.0.0.1 minio.mirai.local"
echo "  127.0.0.1 mailpit.mirai.local"
echo ""
log_info "Application URLs:"
echo "  Frontend:  https://mirai.local"
echo "  Auth:      https://auth.mirai.local"
echo "  API:       https://api.mirai.local"
echo "  MinIO:     https://minio.mirai.local"
echo "  Mailpit:   https://mailpit.mirai.local"
echo ""
log_info "Next steps:"
echo "  1. Add the hosts entries above to your /etc/hosts file"
echo "  2. Visit https://mirai.local in your browser"
echo "  3. Use ./status.sh to check cluster status"
echo "  4. Use ./logs.sh to view application logs"
echo ""
log_info "Useful commands:"
echo "  Stop cluster:     ./stop.sh"
echo "  Start cluster:    ./start.sh"
echo "  View status:      ./status.sh"
echo "  View logs:        ./logs.sh [service]"
echo "  Rebuild images:   ./build-local.sh [service]"
echo "  Full reset:       ./reset.sh"
echo ""
