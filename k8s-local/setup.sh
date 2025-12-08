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

MISSING_DEPS=()

if ! command -v docker >/dev/null 2>&1; then
    MISSING_DEPS+=("docker - Install Docker Desktop from https://docker.com/products/docker-desktop")
fi

if ! command -v k3d >/dev/null 2>&1; then
    MISSING_DEPS+=("k3d - Run: brew install k3d")
fi

if ! command -v kubectl >/dev/null 2>&1; then
    MISSING_DEPS+=("kubectl - Run: brew install kubectl")
fi

if ! command -v helm >/dev/null 2>&1; then
    MISSING_DEPS+=("helm - Run: brew install helm")
fi

if ! command -v mkcert >/dev/null 2>&1; then
    MISSING_DEPS+=("mkcert - Run: brew install mkcert")
fi

if ! command -v jq >/dev/null 2>&1; then
    MISSING_DEPS+=("jq - Run: brew install jq")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    log_error "Missing required dependencies:"
    echo ""
    for dep in "${MISSING_DEPS[@]}"; do
        echo -e "  ${RED}✗${NC} $dep"
    done
    echo ""
    log_info "Install all missing dependencies with:"
    echo -e "  ${YELLOW}brew install k3d kubectl helm mkcert jq${NC}"
    echo ""
    exit 1
fi

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running."
    log_info "Please start Docker Desktop and try again."
    exit 1
fi

log_success "All prerequisites satisfied"

# =============================================================================
# SAFETY: Context verification
# =============================================================================
EXPECTED_CONTEXT="k3d-mirai-local"

# Function to verify we're in the correct kubectl context
verify_context() {
    local current_context
    current_context=$(kubectl config current-context 2>/dev/null || echo "none")

    if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
        log_error "SAFETY CHECK FAILED!"
        log_error "Expected context: ${EXPECTED_CONTEXT}"
        log_error "Current context:  ${current_context}"
        log_error ""
        log_error "This script should ONLY run against the local k3d cluster."
        log_error "Aborting to prevent accidental changes to production."
        exit 1
    fi
}

# Check if current context looks like production (safety warning)
current_ctx=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${current_ctx}" == *"prod"* ]] || [[ "${current_ctx}" == *"sogos"* ]] || [[ "${current_ctx}" == *"gke"* ]] || [[ "${current_ctx}" == *"eks"* ]] || [[ "${current_ctx}" == *"aks"* ]]; then
    log_error "DANGER: Current kubectl context appears to be production!"
    log_error "Context: ${current_ctx}"
    log_error ""
    log_error "This script is for LOCAL DEVELOPMENT ONLY."
    log_error "Aborting for safety."
    exit 1
fi

# Step 2: Create k3d cluster
log_info "Step 2/17: Creating k3d cluster 'mirai-local'..."

if k3d cluster list | grep -q mirai-local; then
    log_warning "Cluster 'mirai-local' already exists. Deleting it first..."
    k3d cluster delete mirai-local
fi

k3d cluster create --config "${SCRIPT_DIR}/cluster-config.yaml"
log_success "k3d cluster created"

# Step 2.5: Explicitly set and verify kubectl context
log_info "Setting kubectl context to ${EXPECTED_CONTEXT}..."
kubectl config use-context "${EXPECTED_CONTEXT}"
verify_context
log_success "kubectl context verified: ${EXPECTED_CONTEXT}"

# Step 3: Wait for cluster to be ready
log_info "Step 3/17: Waiting for cluster nodes to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s
log_success "Cluster nodes ready"

# Step 4: Create mirai-local namespace
log_info "Step 4/17: Creating 'mirai-local' namespace..."
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

# Step 6b: Configure CoreDNS for .test domain resolution inside pods
# This allows backend pods to reach auth.mirai.test, api.mirai.test, etc.
log_info "Step 6b/17: Configuring CoreDNS for internal .test domain resolution..."

# Get Traefik service cluster IP
TRAEFIK_IP=$(kubectl get svc -n kube-system traefik -o jsonpath='{.spec.clusterIP}')
log_info "  Traefik ClusterIP: ${TRAEFIK_IP}"

# Get current NodeHosts from CoreDNS
CURRENT_NODEHOSTS=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.NodeHosts}')

# Add .test domains pointing to Traefik (only if not already present)
if echo "${CURRENT_NODEHOSTS}" | grep -q "mirai.test"; then
    log_info "  CoreDNS already configured for .test domains"
else
    # Append .test domain entries
    NEW_NODEHOSTS="${CURRENT_NODEHOSTS}
${TRAEFIK_IP} mirai.test
${TRAEFIK_IP} api.mirai.test
${TRAEFIK_IP} auth.mirai.test
${TRAEFIK_IP} get-mirai.test
${TRAEFIK_IP} mailpit.mirai.test
${TRAEFIK_IP} minio.mirai.test"

    # Patch CoreDNS configmap
    kubectl patch configmap coredns -n kube-system --type merge -p "{\"data\":{\"NodeHosts\":$(echo "${NEW_NODEHOSTS}" | jq -Rs .)}}"

    # Restart CoreDNS to pick up changes
    kubectl rollout restart deployment/coredns -n kube-system
    kubectl rollout status deployment/coredns -n kube-system --timeout=60s

    log_success "CoreDNS configured for .test domain resolution"
fi

# Step 7: Generate mkcert certificates
log_info "Step 7/17: Generating TLS certificates with mkcert..."

# Ensure mkcert CA is installed in system trust store
mkcert -install

# Use persistent certs directory (not temp - keeps certs for debugging)
CERT_DIR="${SCRIPT_DIR}/certs"
mkdir -p "${CERT_DIR}"

# Generate certificate with explicit SANs for all domains
# (Avoiding wildcards - they can be problematic with .test TLD)
cd "${CERT_DIR}"

# Only regenerate if cert doesn't exist or is older than 30 days
CERT_FILE="${CERT_DIR}/mirai-local.pem"
KEY_FILE="${CERT_DIR}/mirai-local-key.pem"

if [[ ! -f "${CERT_FILE}" ]] || [[ $(find "${CERT_FILE}" -mtime +30 2>/dev/null) ]]; then
    log_info "  Generating new certificate with all domain SANs..."
    mkcert \
        -cert-file "${CERT_FILE}" \
        -key-file "${KEY_FILE}" \
        "mirai.test" \
        "api.mirai.test" \
        "auth.mirai.test" \
        "mailpit.mirai.test" \
        "minio.mirai.test" \
        "traefik.mirai.test" \
        "get-mirai.test"
else
    log_info "  Using existing certificate (less than 30 days old)"
fi

# Create TLS secret in mirai-local namespace
kubectl create secret tls mirai-tls \
    --cert="${CERT_FILE}" \
    --key="${KEY_FILE}" \
    --namespace=mirai-local \
    --dry-run=client -o yaml | kubectl apply -f -

# Create TLS secret in kube-system namespace (for Traefik dashboard IngressRoute)
kubectl create secret tls mirai-tls \
    --cert="${CERT_FILE}" \
    --key="${KEY_FILE}" \
    --namespace=kube-system \
    --dry-run=client -o yaml | kubectl apply -f -

log_success "TLS certificates generated and secrets created"

# Step 7b: Create mkcert CA ConfigMap for backend TLS trust
# This allows the backend to trust internal HTTPS calls to *.mirai.test
log_info "Step 7b/17: Creating mkcert CA ConfigMap for backend..."
MKCERT_CAROOT=$(mkcert -CAROOT)
kubectl create configmap mkcert-ca \
    --from-file=rootCA.pem="${MKCERT_CAROOT}/rootCA.pem" \
    -n mirai-local \
    --dry-run=client -o yaml | kubectl apply -f -
log_success "mkcert CA ConfigMap created"

# Step 8: Deploy infrastructure
log_info "Step 8/17: Deploying infrastructure (PostgreSQL, Redis, MinIO)..."
kubectl apply -k "${SCRIPT_DIR}/infrastructure"
log_success "Infrastructure deployed"

# Step 8b: Apply Stripe secrets from .env if available
if [ -f "${SCRIPT_DIR}/.env" ]; then
    log_info "  Found .env file, loading Stripe secrets..."
    # Source the .env file
    set -a
    source "${SCRIPT_DIR}/.env"
    set +a

    # Patch the Stripe secret with real values
    if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
        kubectl patch secret mirai-stripe-secret -n mirai-local -p "{
            \"stringData\": {
                \"secret-key\": \"${STRIPE_SECRET_KEY}\",
                \"webhook-secret\": \"${STRIPE_WEBHOOK_SECRET:-}\",
                \"starter-price-id\": \"${STRIPE_STARTER_PRICE_ID:-}\",
                \"pro-price-id\": \"${STRIPE_PRO_PRICE_ID:-}\"
            }
        }" 2>/dev/null && log_success "Stripe secrets applied from .env" || log_warning "Failed to patch Stripe secret"
    else
        log_warning "STRIPE_SECRET_KEY not found in .env"
    fi
else
    log_warning "No .env file found - Stripe will use placeholder secrets"
    log_warning "Copy .env.example to .env and add your Stripe test keys"
fi

# Step 9: Wait for infrastructure to be ready
log_info "Step 9/17: Waiting for infrastructure to be ready..."

log_info "  Waiting for PostgreSQL..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=postgres -n mirai-local --timeout=180s

log_info "  Waiting for Redis..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis -n mirai-local --timeout=120s

log_info "  Waiting for MinIO..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=minio -n mirai-local --timeout=120s

log_success "Infrastructure ready"

# Step 10: Create Kratos database
log_info "Step 10/17: Creating Kratos database in PostgreSQL..."

# Wait a bit for PostgreSQL to be fully ready
sleep 5

# Create kratos database
kubectl exec -n mirai-local deployment/postgres -- \
    psql -U postgres -c "CREATE DATABASE kratos;" 2>/dev/null || log_warning "Kratos database may already exist"

log_success "Kratos database created"

# Step 11: Deploy Kratos prerequisites
log_info "Step 11/17: Deploying Kratos prerequisites (mailpit, secrets)..."
kubectl apply -k "${SCRIPT_DIR}/kratos"
log_success "Kratos prerequisites deployed"

# Wait for mailpit
log_info "  Waiting for Mailpit..."
kubectl wait --for=condition=Ready pod -l app=mailpit -n mirai-local --timeout=60s

# Step 12: Install Kratos via Helm
log_info "Step 12/17: Installing Ory Kratos..."

# Install Kratos - DSN and secrets come from kratos-secret via environment variables
# defined in values-local.yaml (deployment.extraEnv)
helm upgrade --install kratos ory/kratos \
    --namespace mirai-local \
    --values "${SCRIPT_DIR}/kratos/values-local.yaml" \
    --wait \
    --timeout 5m

log_success "Kratos installed"

# Step 13: Wait for Kratos to be ready
log_info "Step 13/17: Waiting for Kratos to be ready..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=kratos -n mirai-local --timeout=180s
log_success "Kratos ready"

# Step 14: Deploy ingress routes
log_info "Step 14/17: Deploying ingress routes and middleware..."
kubectl apply -k "${SCRIPT_DIR}/ingress"
# Deploy Traefik dashboard IngressRoute separately (it's in kube-system namespace)
kubectl apply -f "${SCRIPT_DIR}/ingress/traefik-dashboard.yaml"
log_success "Ingress routes deployed"

# Step 15: Build local Docker images
log_info "Step 15/17: Building local Docker images..."

log_info "  Building backend image..."
docker build -t mirai-backend:local -f "${PROJECT_ROOT}/backend/Dockerfile" "${PROJECT_ROOT}/backend"

log_info "  Building frontend image..."
docker build -t mirai-frontend:local \
    --build-arg NEXT_PUBLIC_APP_URL=https://mirai.test \
    --build-arg NEXT_PUBLIC_API_URL=https://api.mirai.test \
    --build-arg NEXT_PUBLIC_LANDING_URL=https://get-mirai.test \
    --build-arg NEXT_PUBLIC_KRATOS_BROWSER_URL=https://auth.mirai.test \
    -f "${PROJECT_ROOT}/frontend/Dockerfile" "${PROJECT_ROOT}/frontend"

log_info "  Building marketing image..."
docker build -t mirai-marketing:local \
    --build-arg NEXT_PUBLIC_APP_URL=https://mirai.test \
    -f "${PROJECT_ROOT}/frontend/Dockerfile.marketing" "${PROJECT_ROOT}/frontend"

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
kubectl wait --for=condition=Ready pod -l app=mirai-backend -n mirai-local --timeout=120s 2>/dev/null || log_warning "Backend may still be starting"

log_info "  Waiting for frontend..."
kubectl wait --for=condition=Ready pod -l app=mirai-frontend -n mirai-local --timeout=120s 2>/dev/null || log_warning "Frontend may still be starting"

log_info "  Waiting for marketing..."
kubectl wait --for=condition=Ready pod -l app=mirai-marketing -n mirai-local --timeout=120s 2>/dev/null || log_warning "Marketing may still be starting"

# Configure /etc/hosts automatically
log_info "Configuring /etc/hosts..."
REQUIRED_HOSTS="mirai.test get-mirai.test auth.mirai.test api.mirai.test minio.mirai.test mailpit.mirai.test traefik.mirai.test"
HOSTS_ENTRY="127.0.0.1 ${REQUIRED_HOSTS}"

# Check if all required hosts are present
MISSING_HOSTS=()
for host in ${REQUIRED_HOSTS}; do
    if ! grep -q "${host}" /etc/hosts; then
        MISSING_HOSTS+=("${host}")
    fi
done

if [ ${#MISSING_HOSTS[@]} -eq 0 ]; then
    log_success "/etc/hosts already configured with all required domains"
else
    log_info "Missing hosts in /etc/hosts: ${MISSING_HOSTS[*]}"

    # Remove any existing partial mirai.test line and add complete one
    if grep -q "mirai.test" /etc/hosts; then
        log_info "Updating existing /etc/hosts entry (requires sudo)..."
        sudo sed -i '' '/mirai\.test/d' /etc/hosts
    else
        log_info "Adding mirai.test entries to /etc/hosts (requires sudo)..."
    fi

    echo "$HOSTS_ENTRY" | sudo tee -a /etc/hosts > /dev/null
    log_success "/etc/hosts configured"
fi

# Final success message
echo ""
log_success "======================================"
log_success "Mirai k3d cluster setup complete!"
log_success "======================================"
echo ""

# Show cluster status
log_info "Cluster Status:"
echo ""
kubectl get pods -n mirai-local -o wide
echo ""

log_info "Application URLs:"
echo "  Frontend:   https://mirai.test"
echo "  Marketing:  https://get-mirai.test"
echo "  Auth:       https://auth.mirai.test"
echo "  API:        https://api.mirai.test"
echo "  Mailpit:    https://mailpit.mirai.test (email testing)"
echo "  MinIO:      https://minio.mirai.test (storage console)"
echo "  Traefik:    https://traefik.mirai.test/dashboard/ (ingress dashboard)"
echo ""

# Open Traefik dashboard in browser
if command -v open >/dev/null 2>&1; then
    log_info "Opening Traefik dashboard in browser..."
    sleep 2
    open "https://traefik.mirai.test/dashboard/"
fi

# k9s recommendation
echo ""
if command -v k9s >/dev/null 2>&1; then
    log_success "k9s is installed! Launch with:"
    echo -e "  ${GREEN}k9s --context k3d-mirai-local -n mirai-local${NC}"
else
    log_info "Recommended: Install k9s for a better cluster UI"
    echo -e "  ${YELLOW}brew install k9s${NC}"
    echo "  Then run: k9s --context k3d-mirai-local -n mirai-local"
fi

echo ""
log_warning "IMPORTANT: Stripe Webhook Setup (required for registration/payments):"
echo "  1. In a new terminal: stripe listen --forward-to https://api.mirai.test/api/v1/billing/webhook"
echo "  2. Copy the webhook secret (whsec_...)"
echo "  3. Run: ./stripe-webhook.sh whsec_your_secret_here"
echo ""
log_info "Quick commands:"
echo "  ./status.sh            - View cluster status"
echo "  ./logs.sh backend      - View backend logs"
echo "  ./stripe-webhook.sh    - Update Stripe webhook secret"
echo "  ./build-local.sh       - Rebuild and deploy images"
echo "  ./stop.sh              - Stop cluster"
echo "  ./reset.sh             - Full reset"
echo ""
