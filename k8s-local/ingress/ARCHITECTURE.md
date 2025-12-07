# Traefik Ingress Architecture

## Traffic Flow

```
Browser
   |
   | HTTPS (443)
   v
/etc/hosts (127.0.0.1)
   |
   v
k3d LoadBalancer (127.0.0.1:443)
   |
   v
Traefik (kube-system namespace)
   |
   +-- TLS Termination (mirai-local-tls secret)
   |
   +-- Middleware Chain:
   |     |
   |     +-- https-redirect (HTTP → HTTPS)
   |     +-- security-headers (XSS, frame options, etc.)
   |     +-- api-cors (CORS for Connect-RPC)
   |     +-- kratos-cors (CORS for auth + cookies)
   |
   +-- IngressRoute Matching:
         |
         +-- Host: mirai.local
         |     → Service: mirai-frontend.mirai:80 → Pod (Next.js frontend)
         |
         +-- Host: get-mirai.local
         |     → Service: mirai-marketing.mirai:80 → Pod (Next.js marketing)
         |
         +-- Host: api.mirai.local
         |     → Service: mirai-backend.mirai:8080 → Pod (Connect-RPC)
         |
         +-- Host: auth.mirai.local
               → Service: kratos-public.kratos:80 → Pod (Ory Kratos)
                         ^
                         |
                   Cross-namespace routing
```

## Namespace Layout

```
kube-system/
└── Traefik
    ├── Deployment (traefik pod)
    ├── Service (LoadBalancer)
    └── Dashboard (port 9000)

mirai/
├── Services:
│   ├── mirai-frontend:80
│   ├── mirai-marketing:80
│   └── mirai-backend:8080
│
├── IngressRoutes:
│   ├── mirai-frontend
│   ├── mirai-marketing
│   ├── mirai-backend
│   ├── kratos-public
│   └── http-redirect
│
├── Middlewares:
│   ├── https-redirect
│   ├── security-headers
│   ├── api-cors
│   └── kratos-cors
│
└── Secret:
    └── mirai-local-tls (TLS certificate)

kratos/
└── Service:
    └── kratos-public:80
```

## TLS Certificate Coverage

mkcert generates a certificate with these SANs (Subject Alternative Names):

- `mirai.local`
- `*.mirai.local` (covers api.mirai.local, auth.mirai.local, etc.)
- `get-mirai.local`
- `*.get-mirai.local`

## Middleware Application

| Route | Security Headers | CORS | HTTPS Redirect |
|-------|-----------------|------|----------------|
| mirai.local | Yes | No | Yes |
| get-mirai.local | Yes | No | Yes |
| api.mirai.local | Yes | api-cors | Yes |
| auth.mirai.local | Yes | kratos-cors | Yes |

## CORS Configuration

### api-cors (Connect-RPC Backend)
- **Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization, Connect-*
- **Origins**: https://mirai.local, https://get-mirai.local
- **Credentials**: true

### kratos-cors (Authentication)
- **Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization, Cookie, X-Session-Token
- **Origins**: https://mirai.local, https://get-mirai.local
- **Credentials**: true
- **Exposed**: Set-Cookie

## Request Path Examples

### Frontend Request
```
User → https://mirai.local
  → Traefik (TLS termination, security headers)
  → mirai-frontend.mirai:80
  → Pod: mirai-frontend-xxx
  → Next.js server :3000
```

### API Request
```
User → https://api.mirai.local/mirai.v1.CourseService/ListCourses
  → Traefik (TLS termination, CORS, security headers)
  → mirai-backend.mirai:8080
  → Pod: mirai-backend-xxx
  → Connect-RPC server :8080
```

### Auth Request
```
User → https://auth.mirai.local/sessions/whoami
  → Traefik (TLS termination, CORS with cookies, security headers)
  → kratos-public.kratos:80 (cross-namespace)
  → Pod: kratos-xxx
  → Ory Kratos :4433
```

## Entrypoints

| Name | Port | Protocol | Usage |
|------|------|----------|-------|
| web | 80 | HTTP | Redirects to websecure |
| websecure | 443 | HTTPS | All application traffic |
| traefik | 9000 | HTTP | Dashboard (port-forward only) |

## Health Checks

```bash
# Traefik health
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# Service endpoints
kubectl get endpoints -n mirai

# IngressRoute status
kubectl get ingressroute -n mirai

# Test TLS handshake
openssl s_client -connect mirai.local:443 -servername mirai.local

# Test routing
curl -v https://mirai.local
curl -v https://api.mirai.local
```

## Scaling Considerations

For local development:
- **Traefik**: 1 replica (sufficient for dev)
- **Resources**: 100m CPU, 128Mi RAM
- **LoadBalancer**: Single IP (127.0.0.1)

For production, see `/Users/john/homelab-cluster/apps/mirai/k8s/` for Cloudflare Tunnel setup.

## Security Notes

### Local Development Only
- TLS certificate is self-signed (mkcert local CA)
- No HSTS enforcement (sts: 0)
- Insecure dashboard access enabled
- Relaxed CORS origins (*.local)
- Skip TLS verification for backends

### Production Differences
- Cloudflare managed certificates
- HSTS with preload
- Restricted CORS to sogos.io domains
- No dashboard exposure
- Full TLS verification

## Debugging

### View Traefik Configuration
```bash
kubectl port-forward -n kube-system svc/traefik 9000:9000
open http://localhost:9000/dashboard/
```

### Check Routing Rules
Navigate to:
- HTTP → Routers (shows all IngressRoutes)
- HTTP → Middlewares (shows CORS, headers, etc.)
- HTTP → Services (shows backend services)

### Enable Debug Logging
Edit traefik-values.yaml:
```yaml
logs:
  general:
    level: DEBUG  # Change from INFO to DEBUG
```
Then:
```bash
helm upgrade traefik traefik/traefik -f traefik-values.yaml -n kube-system
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik -f
```

## Certificate Details

View certificate information:
```bash
# Extract certificate from secret
kubectl get secret mirai-local-tls -n mirai -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/cert.pem

# View certificate details
openssl x509 -in /tmp/cert.pem -text -noout

# Check SAN entries
openssl x509 -in /tmp/cert.pem -text -noout | grep -A1 "Subject Alternative Name"

# Clean up
rm /tmp/cert.pem
```

Expected output shows:
- Issuer: mkcert development CA
- Subject: mirai.local
- SANs: mirai.local, *.mirai.local, get-mirai.local, *.get-mirai.local
