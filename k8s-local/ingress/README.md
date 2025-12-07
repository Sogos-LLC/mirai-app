# Traefik Ingress for Mirai k3d Local Development

This directory contains the Traefik ingress configuration for routing local traffic to Mirai services.

## Architecture

### Routing Table

| Hostname | Service | Port | Description |
|----------|---------|------|-------------|
| `mirai.local` | `mirai-frontend` | 80 | Main application (Next.js frontend) |
| `get-mirai.local` | `mirai-marketing` | 80 | Marketing/landing page |
| `api.mirai.local` | `mirai-backend` | 8080 | Connect-RPC API backend |
| `auth.mirai.local` | `kratos-public` (kratos ns) | 80 | Ory Kratos authentication |

### Features

- TLS with trusted local certificates (via mkcert)
- HTTP to HTTPS automatic redirect
- CORS middleware for API and auth endpoints
- Security headers
- Cross-namespace routing (Kratos in separate namespace)

## Quick Start

### 1. Install Traefik

```bash
# Add Traefik Helm repository
helm repo add traefik https://traefik.github.io/charts
helm repo update

# Install Traefik in kube-system namespace
helm install traefik traefik/traefik \
  -f traefik-values.yaml \
  -n kube-system
```

### 2. Generate TLS Certificates

```bash
# Install mkcert (macOS)
brew install mkcert

# Install local CA
mkcert -install

# Generate certificates for all domains
cd /tmp
mkcert \
  "mirai.local" \
  "*.mirai.local" \
  "get-mirai.local" \
  "*.get-mirai.local"

# Create Kubernetes secret
kubectl create secret tls mirai-local-tls \
  --cert=mirai.local+3.pem \
  --key=mirai.local+3-key.pem \
  -n mirai

# Clean up
rm mirai.local+3*.pem
```

### 3. Configure /etc/hosts

```bash
# Add local domain entries
echo "127.0.0.1 mirai.local api.mirai.local auth.mirai.local get-mirai.local" | sudo tee -a /etc/hosts
```

### 4. Deploy Ingress Resources

```bash
cd /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress
kubectl apply -k .
```

### 5. Verify Setup

```bash
# Check Traefik is running
kubectl get pods -n kube-system | grep traefik

# Check LoadBalancer IP assignment (should be 127.0.0.1 or similar)
kubectl get svc traefik -n kube-system

# Check IngressRoutes
kubectl get ingressroute -n mirai

# Check Middlewares
kubectl get middleware -n mirai

# Check TLS secret
kubectl get secret mirai-local-tls -n mirai
```

## Files

### traefik-values.yaml
Helm values for Traefik installation:
- Configures web (80) and websecure (443) entrypoints
- Enables Traefik CRDs (IngressRoute, Middleware)
- Enables dashboard for debugging
- Sets service type to LoadBalancer for k3d
- Enables access logs for troubleshooting

### middleware.yaml
Traefik middleware definitions:
- `https-redirect`: Redirects HTTP to HTTPS
- `api-cors`: CORS headers for Connect-RPC backend
- `kratos-cors`: CORS headers for Kratos auth (includes Cookie handling)
- `security-headers`: Common security headers (XSS, frame options, etc.)

### ingressroutes.yaml
Traefik IngressRoute CRDs:
- `mirai-frontend`: Routes mirai.local to frontend service
- `mirai-marketing`: Routes get-mirai.local to marketing service
- `mirai-backend`: Routes api.mirai.local to backend service with CORS
- `kratos-public`: Routes auth.mirai.local to Kratos (cross-namespace)
- `http-redirect`: Catches all HTTP traffic and redirects to HTTPS

### tls-secret.yaml.template
Template and instructions for creating TLS certificates with mkcert.
**Do not apply directly** - follow the instructions to create the secret manually.

### kustomization.yaml
Kustomize configuration that includes middleware and IngressRoutes.
Does not include the Helm values file or TLS secret template.

## Accessing Services

Once everything is deployed:

```bash
# Frontend application
open https://mirai.local

# Marketing site
open https://get-mirai.local

# Backend API (health check)
curl https://api.mirai.local/grpc.health.v1.Health/Check

# Kratos (whoami endpoint)
curl https://auth.mirai.local/sessions/whoami
```

## Traefik Dashboard

Access the Traefik dashboard for debugging:

```bash
# Port forward to Traefik dashboard
kubectl port-forward -n kube-system svc/traefik 9000:9000

# Open in browser
open http://localhost:9000/dashboard/
```

The dashboard shows:
- Active IngressRoutes
- Middleware configuration
- Backend service health
- Request metrics

## Troubleshooting

### Certificate Not Trusted

```bash
# Reinstall mkcert CA
mkcert -install

# Check CA root location
mkcert -CAROOT

# Restart browser
```

### Connection Refused

```bash
# Check Traefik pod status
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# Check Traefik logs
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik

# Verify LoadBalancer service
kubectl get svc traefik -n kube-system

# Check IngressRoute status
kubectl describe ingressroute -n mirai
```

### 404 Not Found

```bash
# Verify services exist
kubectl get svc -n mirai

# Check service endpoints
kubectl get endpoints -n mirai

# Verify IngressRoute matches hostname
kubectl get ingressroute mirai-frontend -n mirai -o yaml

# Check Traefik routing
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik | grep mirai.local
```

### CORS Errors

```bash
# Check middleware is applied
kubectl get middleware -n mirai

# Verify IngressRoute references middleware
kubectl describe ingressroute mirai-backend -n mirai

# Test CORS headers
curl -H "Origin: https://mirai.local" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  -v https://api.mirai.local
```

### Kratos Not Accessible

```bash
# Check Kratos namespace exists
kubectl get namespace kratos

# Verify Kratos service exists
kubectl get svc -n kratos

# Check Kratos pods
kubectl get pods -n kratos

# Test cross-namespace routing
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://kratos-public.kratos.svc.cluster.local/health/ready
```

## Local vs Production

| Feature | Local (k3d) | Production (Talos) |
|---------|-------------|-------------------|
| **Ingress** | Traefik (this config) | Cloudflare Tunnel |
| **TLS** | mkcert (local CA) | Cloudflare managed |
| **DNS** | /etc/hosts | Real DNS (sogos.io) |
| **LoadBalancer** | k3d (127.0.0.1) | MetalLB |
| **CORS Origins** | *.local domains | sogos.io domains |

## Integration with k3d

The k3d cluster must be created with Traefik disabled:

```yaml
# In cluster-config.yaml
options:
  k3d:
    disableLoadbalancer: false
  k3s:
    extraArgs:
      - arg: --disable=traefik
        nodeFilters:
          - server:*
```

We install our own Traefik via Helm for better control over:
- CRD versions
- Middleware configuration
- Cross-namespace routing
- Dashboard access

## Clean Up

```bash
# Delete ingress resources
kubectl delete -k .

# Uninstall Traefik
helm uninstall traefik -n kube-system

# Delete TLS secret
kubectl delete secret mirai-local-tls -n mirai

# Remove /etc/hosts entries
sudo sed -i.bak '/mirai.local/d' /etc/hosts
```

## Next Steps

1. Deploy Mirai application services (frontend, backend, marketing)
2. Deploy Ory Kratos in `kratos` namespace
3. Test end-to-end authentication flow
4. Configure hot-reload for frontend development
5. Set up port-forwards for direct service access (debugging)
