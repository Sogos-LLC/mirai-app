#!/bin/bash
# Setup script for mirai-loc-dev environment secrets
# This script creates all required secrets for the dev environment
set -euo pipefail

CONTEXT="admin@macmini-cluster"
KUBECTL="kubectl --context ${CONTEXT}"

echo "========================================="
echo "  Mirai Dev Environment Setup"
echo "========================================="
echo ""

# Step 1: Create namespaces (if not already created by ArgoCD)
echo "[1/8] Creating namespaces..."
${KUBECTL} create namespace mirai-loc-dev --dry-run=client -o yaml | ${KUBECTL} apply -f -
${KUBECTL} create namespace kratos-loc-dev --dry-run=client -o yaml | ${KUBECTL} apply -f -
${KUBECTL} create namespace redis-loc-dev --dry-run=client -o yaml | ${KUBECTL} apply -f -
echo "  Namespaces ready."

# Step 2: Generate random passwords
echo "[2/8] Generating database passwords..."
MIRAI_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
KRATOS_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
TEMPORAL_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
KRATOS_SECRET=$(openssl rand -base64 32)
echo "  Passwords generated."

# Step 3: Prompt for external service credentials
echo ""
echo "[3/8] External service credentials required:"
echo ""

read -rp "Stripe Secret Key (test mode, or press Enter to skip): " STRIPE_SECRET_KEY
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-"sk_test_placeholder"}

read -rp "Stripe Webhook Secret (or press Enter to skip): " STRIPE_WEBHOOK_SECRET
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-"whsec_placeholder"}

read -rp "Stripe Starter Price ID (or press Enter to skip): " STRIPE_STARTER_PRICE_ID
STRIPE_STARTER_PRICE_ID=${STRIPE_STARTER_PRICE_ID:-"price_placeholder_starter"}

read -rp "Stripe Pro Price ID (or press Enter to skip): " STRIPE_PRO_PRICE_ID
STRIPE_PRO_PRICE_ID=${STRIPE_PRO_PRICE_ID:-"price_placeholder_pro"}

read -rp "MinIO Endpoint (e.g. http://192.168.1.x:9768): " MINIO_ENDPOINT
read -rp "MinIO Region (e.g. us-east-1): " MINIO_REGION
MINIO_REGION=${MINIO_REGION:-"us-east-1"}
read -rp "MinIO Access Key: " MINIO_ACCESS_KEY
read -rsp "MinIO Secret Key: " MINIO_SECRET_KEY
echo ""

read -rp "Twenty CRM API Key (or press Enter to skip): " TWENTY_API_KEY
TWENTY_API_KEY=${TWENTY_API_KEY:-"placeholder"}

echo ""

# Step 4: Create all secrets
echo "[4/8] Creating secrets in mirai-loc-dev namespace..."

# Mirai DB credentials
${KUBECTL} create secret generic mirai-loc-dev-db-credentials \
  --namespace mirai-loc-dev \
  --from-literal=username=mirai \
  --from-literal=password="${MIRAI_DB_PASSWORD}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# Mirai DB DSN secret
${KUBECTL} create secret generic mirai-loc-dev-db-secret \
  --namespace mirai-loc-dev \
  --from-literal=dsn="postgres://mirai:${MIRAI_DB_PASSWORD}@mirai-loc-dev-db-rw.mirai-loc-dev.svc.cluster.local:5432/mirai?sslmode=disable" \
  --from-literal=password="${MIRAI_DB_PASSWORD}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# Temporal DB credentials (uses same DB cluster, separate user)
${KUBECTL} create secret generic temporal-db-credentials \
  --namespace mirai-loc-dev \
  --from-literal=username=mirai \
  --from-literal=password="${MIRAI_DB_PASSWORD}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# Stripe secret
${KUBECTL} create secret generic mirai-loc-dev-stripe-secret \
  --namespace mirai-loc-dev \
  --from-literal=secret-key="${STRIPE_SECRET_KEY}" \
  --from-literal=webhook-secret="${STRIPE_WEBHOOK_SECRET}" \
  --from-literal=starter-price-id="${STRIPE_STARTER_PRICE_ID}" \
  --from-literal=pro-price-id="${STRIPE_PRO_PRICE_ID}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# Encryption secret
${KUBECTL} create secret generic mirai-loc-dev-encryption-secret \
  --namespace mirai-loc-dev \
  --from-literal=encryption-key="${ENCRYPTION_KEY}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# MinIO secret
${KUBECTL} create secret generic minio-secret \
  --namespace mirai-loc-dev \
  --from-literal=endpoint="${MINIO_ENDPOINT}" \
  --from-literal=region="${MINIO_REGION}" \
  --from-literal=accesskey="${MINIO_ACCESS_KEY}" \
  --from-literal=secretkey="${MINIO_SECRET_KEY}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

# Twenty CRM credentials
${KUBECTL} create secret generic twenty-credentials \
  --namespace mirai-loc-dev \
  --from-literal=api-key="${TWENTY_API_KEY}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

echo "  mirai-loc-dev secrets created."

# Step 5: Create Kratos secrets
echo "[5/8] Creating secrets in kratos-loc-dev namespace..."

${KUBECTL} create secret generic kratos-loc-dev-db-credentials \
  --namespace kratos-loc-dev \
  --from-literal=username=kratos \
  --from-literal=password="${KRATOS_DB_PASSWORD}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

${KUBECTL} create secret generic kratos-secret \
  --namespace kratos-loc-dev \
  --from-literal=dsn="postgres://kratos:${KRATOS_DB_PASSWORD}@kratos-loc-dev-db-rw.kratos-loc-dev.svc.cluster.local:5432/kratos?sslmode=disable" \
  --from-literal=secretsDefault="${KRATOS_SECRET}" \
  --dry-run=client -o yaml | ${KUBECTL} apply -f -

echo "  kratos-loc-dev secrets created."

# Step 6: Apply CloudNativePG database clusters
echo "[6/8] Applying database clusters..."
${KUBECTL} apply -f "$(dirname "$0")/database/mirai-loc-dev-db-cluster.yaml"
${KUBECTL} apply -f "$(dirname "$0")/database/kratos-loc-dev-db-cluster.yaml"

echo "  Waiting for Mirai DB to be ready..."
${KUBECTL} wait --for=condition=Ready cluster/mirai-loc-dev-db \
  --namespace mirai-loc-dev --timeout=300s 2>/dev/null || \
  echo "  (DB cluster may take a few minutes to initialize)"

echo "  Waiting for Kratos DB to be ready..."
${KUBECTL} wait --for=condition=Ready cluster/kratos-loc-dev-db \
  --namespace kratos-loc-dev --timeout=300s 2>/dev/null || \
  echo "  (DB cluster may take a few minutes to initialize)"

# Step 7: Install Kratos via Helm
echo "[7/8] Installing Ory Kratos..."
helm install kratos ory/kratos \
  -f "$(dirname "$0")/kratos-loc-dev/values-dev.yaml" \
  -n kratos-loc-dev \
  --create-namespace \
  --wait --timeout 5m || \
  echo "  Kratos installation may need manual attention"

# Step 8: Create MinIO bucket
echo "[8/8] Creating MinIO bucket 'mirai-dev'..."
echo "  NOTE: You may need to create the 'mirai-dev' bucket manually in MinIO console"
echo "  or use: mc mb minio/mirai-dev"

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Add Cloudflare DNS CNAME records for:"
echo "     - mirai-dev.sogos.io"
echo "     - get-mirai-dev.sogos.io"
echo "     - mirai-api-dev.sogos.io"
echo "     - mirai-auth-dev.sogos.io"
echo "  2. Apply ArgoCD application manifests"
echo "  3. Push to 'dev' branch to trigger CI/CD builds"
echo ""
echo "Verify with:"
echo "  ${KUBECTL} get pods -n mirai-loc-dev"
echo "  ${KUBECTL} get pods -n kratos-loc-dev"
echo "  ${KUBECTL} get pods -n redis-loc-dev"
