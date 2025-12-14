#!/bin/bash
# Verification script for Traefik ingress setup
# Run this after deploying all resources

set -e

echo "=========================================="
echo "Mirai Traefik Ingress Verification"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
    else
        echo -e "${RED}✗${NC} $1 is not installed"
        return 1
    fi
}

check_namespace() {
    if kubectl get namespace $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} Namespace $1 exists"
    else
        echo -e "${RED}✗${NC} Namespace $1 does not exist"
        return 1
    fi
}

check_pod() {
    if kubectl get pods -n $1 -l $2 2>/dev/null | grep -q Running; then
        echo -e "${GREEN}✓${NC} Pods with label $2 are running in namespace $1"
    else
        echo -e "${RED}✗${NC} No running pods found with label $2 in namespace $1"
        return 1
    fi
}

check_service() {
    if kubectl get svc -n $1 $2 &> /dev/null; then
        echo -e "${GREEN}✓${NC} Service $2 exists in namespace $1"
    else
        echo -e "${RED}✗${NC} Service $2 does not exist in namespace $1"
        return 1
    fi
}

check_ingressroute() {
    if kubectl get ingressroute -n $1 $2 &> /dev/null; then
        echo -e "${GREEN}✓${NC} IngressRoute $2 exists in namespace $1"
    else
        echo -e "${RED}✗${NC} IngressRoute $2 does not exist in namespace $1"
        return 1
    fi
}

check_middleware() {
    if kubectl get middleware -n $1 $2 &> /dev/null; then
        echo -e "${GREEN}✓${NC} Middleware $2 exists in namespace $1"
    else
        echo -e "${RED}✗${NC} Middleware $2 does not exist in namespace $1"
        return 1
    fi
}

check_secret() {
    if kubectl get secret -n $1 $2 &> /dev/null; then
        echo -e "${GREEN}✓${NC} Secret $2 exists in namespace $1"
    else
        echo -e "${RED}✗${NC} Secret $2 does not exist in namespace $1"
        return 1
    fi
}

check_hosts_file() {
    if grep -q "$1" /etc/hosts; then
        echo -e "${GREEN}✓${NC} $1 is in /etc/hosts"
    else
        echo -e "${YELLOW}⚠${NC} $1 is not in /etc/hosts"
        echo "  Add with: echo '127.0.0.1 $1' | sudo tee -a /etc/hosts"
        return 1
    fi
}

echo "1. Prerequisites"
echo "----------------"
check_command kubectl
check_command helm
check_command mkcert || echo "  Install with: brew install mkcert"
echo ""

echo "2. Namespaces"
echo "-------------"
check_namespace kube-system
check_namespace mirai
check_namespace kratos || echo -e "${YELLOW}⚠${NC} Kratos namespace not found (will be needed for auth.mirai.dev)"
echo ""

echo "3. Traefik Installation"
echo "-----------------------"
check_pod kube-system "app.kubernetes.io/name=traefik"
check_service kube-system traefik
TRAEFIK_IP=$(kubectl get svc traefik -n kube-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
if [ -n "$TRAEFIK_IP" ]; then
    echo -e "${GREEN}✓${NC} Traefik LoadBalancer IP: $TRAEFIK_IP"
else
    echo -e "${YELLOW}⚠${NC} Traefik LoadBalancer IP not assigned yet"
fi
echo ""

echo "4. TLS Certificate"
echo "------------------"
check_secret mirai mirai-local-tls
if kubectl get secret mirai-local-tls -n mirai &> /dev/null; then
    CERT_DATA=$(kubectl get secret mirai-local-tls -n mirai -o jsonpath='{.data.tls\.crt}' | base64 -d)
    echo "$CERT_DATA" | openssl x509 -noout -subject 2>/dev/null && echo -e "${GREEN}✓${NC} Certificate is valid"
    echo "$CERT_DATA" | openssl x509 -noout -issuer 2>/dev/null | grep -q "mkcert" && echo -e "${GREEN}✓${NC} Certificate issued by mkcert"
fi
echo ""

echo "5. Middlewares"
echo "--------------"
check_middleware mirai https-redirect
check_middleware mirai security-headers
check_middleware mirai api-cors
check_middleware mirai kratos-cors
echo ""

echo "6. IngressRoutes"
echo "----------------"
check_ingressroute mirai mirai-frontend
check_ingressroute mirai mirai-marketing
check_ingressroute mirai mirai-backend
check_ingressroute mirai kratos-public
check_ingressroute mirai http-redirect
echo ""

echo "7. Backend Services"
echo "-------------------"
check_service mirai mirai-frontend || echo -e "${YELLOW}⚠${NC} Frontend service not deployed yet"
check_service mirai mirai-marketing || echo -e "${YELLOW}⚠${NC} Marketing service not deployed yet"
check_service mirai mirai-backend || echo -e "${YELLOW}⚠${NC} Backend service not deployed yet"
check_service kratos kratos-public || echo -e "${YELLOW}⚠${NC} Kratos service not deployed yet"
echo ""

echo "8. DNS Configuration (/etc/hosts)"
echo "----------------------------------"
check_hosts_file "mirai.dev"
check_hosts_file "api.mirai.dev"
check_hosts_file "auth.mirai.dev"
check_hosts_file "get-mirai.dev"
echo ""

echo "9. Connectivity Tests"
echo "---------------------"
if command -v curl &> /dev/null; then
    for host in mirai.dev get-mirai.dev api.mirai.dev auth.mirai.dev; do
        if timeout 2 curl -ksI https://$host &> /dev/null; then
            echo -e "${GREEN}✓${NC} https://$host is reachable"
        else
            echo -e "${YELLOW}⚠${NC} https://$host is not reachable (service may not be running)"
        fi
    done
else
    echo -e "${YELLOW}⚠${NC} curl not installed, skipping connectivity tests"
fi
echo ""

echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "- View Traefik dashboard: kubectl port-forward -n kube-system svc/traefik 9000:9000"
echo "- Check Traefik logs: kubectl logs -n kube-system -l app.kubernetes.io/name=traefik -f"
echo "- Deploy application services to test routing"
echo ""
