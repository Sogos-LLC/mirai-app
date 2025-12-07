#!/bin/bash
# Generate self-signed certificates for HAProxy local development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/certs"

mkdir -p "$CERTS_DIR"

# Generate private key
openssl genrsa -out "$CERTS_DIR/server.key" 2048

# Generate self-signed certificate
openssl req -new -x509 -key "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.crt" -days 365 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# HAProxy requires combined PEM file (cert + key)
cat "$CERTS_DIR/server.crt" "$CERTS_DIR/server.key" > "$CERTS_DIR/server.pem"

echo "Certificates generated in $CERTS_DIR"
echo "  - server.key (private key)"
echo "  - server.crt (certificate)"
echo "  - server.pem (combined for HAProxy)"
