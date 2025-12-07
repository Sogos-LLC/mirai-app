# Traefik Ingress Quick Start

Complete setup in 5 commands:

## 1. Install Traefik

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm install traefik traefik/traefik -f traefik-values.yaml -n kube-system
```

## 2. Generate TLS Certificates

```bash
brew install mkcert
mkcert -install
cd /tmp && mkcert "mirai.local" "*.mirai.local" "get-mirai.local" "*.get-mirai.local"
kubectl create secret tls mirai-local-tls --cert=mirai.local+3.pem --key=mirai.local+3-key.pem -n mirai
rm mirai.local+3*.pem
```

## 3. Configure DNS

```bash
echo "127.0.0.1 mirai.local api.mirai.local auth.mirai.local get-mirai.local" | sudo tee -a /etc/hosts
```

## 4. Deploy Ingress

```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/
```

## 5. Verify

```bash
# Check all components
kubectl get pods -n kube-system | grep traefik
kubectl get ingressroute -n mirai
kubectl get middleware -n mirai
kubectl get secret mirai-local-tls -n mirai

# Test routing (once apps are deployed)
curl -k https://mirai.local
curl -k https://get-mirai.local
curl -k https://api.mirai.local
curl -k https://auth.mirai.local/health/ready
```

## Traefik Dashboard

```bash
kubectl port-forward -n kube-system svc/traefik 9000:9000
open http://localhost:9000/dashboard/
```

## URLs

- Frontend: https://mirai.local
- Marketing: https://get-mirai.local
- API: https://api.mirai.local
- Auth: https://auth.mirai.local

## Troubleshooting

```bash
# Traefik logs
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik -f

# Check service routing
kubectl get svc -n mirai
kubectl get endpoints -n mirai

# Restart Traefik
kubectl rollout restart deployment traefik -n kube-system
```

## Clean Up

```bash
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/
helm uninstall traefik -n kube-system
kubectl delete secret mirai-local-tls -n mirai
sudo sed -i.bak '/mirai.local/d' /etc/hosts
```
