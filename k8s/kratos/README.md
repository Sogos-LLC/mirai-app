# Ory Kratos Deployment

## Prerequisites

1. PostgreSQL must be deployed and running
2. MailHog must be deployed for email testing
3. Secrets must be created before installing Kratos

## Installation Steps

### 1. Create the namespace

```bash
kubectl create namespace kratos
```

### 2. Create the secret

Copy the template and fill in actual values:

```bash
cp kratos-secret.yaml.template kratos-secret.yaml
# Edit kratos-secret.yaml with actual values
kubectl apply -f kratos-secret.yaml
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

### 3. Add Helm repository

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update
```

### 4. Install Kratos

```bash
helm install kratos ory/kratos \
  -f values.yaml \
  -n kratos
```

### 5. Verify installation

```bash
kubectl get pods -n kratos
kubectl logs -n kratos -l app.kubernetes.io/name=kratos
```

## Upgrade

```bash
helm upgrade kratos ory/kratos \
  -f values.yaml \
  -n kratos
```

## Uninstall

```bash
helm uninstall kratos -n kratos
```

## Identity Schema

The identity schema defines user traits:
- **email**: Login identifier, used for recovery and verification
- **name**: First and last name
- **company**: Company name and user role (owner/admin/member)

## Endpoints

- **Public API**: `http://kratos-public.kratos.svc.cluster.local:80`
- **Admin API**: `http://kratos-admin.kratos.svc.cluster.local:80`
- **Browser URL**: `https://auth.sogos.io` (via Cloudflare tunnel)

## Self-Service Flows

| Flow | URL |
|------|-----|
| Login | https://mirai.sogos.io/auth/login |
| Registration | https://mirai.sogos.io/auth/registration |
| Recovery | https://mirai.sogos.io/auth/recovery |
| Verification | https://mirai.sogos.io/auth/verification |
| Settings | https://mirai.sogos.io/auth/settings |
