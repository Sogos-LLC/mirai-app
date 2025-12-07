#!/bin/bash
# Generate self-signed TLS certificates for local development
# These certificates are NOT trusted by browsers by default.
# You may need to accept the security warning or add them to your system trust store.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/certs"

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Check if certs already exist
if [ -f "$CERTS_DIR/server.crt" ] && [ -f "$CERTS_DIR/server.key" ]; then
    echo "Certificates already exist in $CERTS_DIR"
    echo "Delete them to regenerate."
    exit 0
fi

echo "Generating self-signed TLS certificates for local development..."

# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Certificates generated successfully!"
echo ""
echo "Certificate: $CERTS_DIR/server.crt"
echo "Private Key: $CERTS_DIR/server.key"
echo ""
echo "NOTE: Your browser will show a security warning for self-signed certificates."
echo "You can proceed through the warning, or add the certificate to your system trust store."
