#!/usr/bin/env bash
# Erzeugt das selbstsignierte TLS-Zertifikat fuer den lokalen E2E-Proxy.
# Die Zertifikate sind gitignored und nur fuer lokale Tests gedacht.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${E2E_CERT_DIR:-$HIER/.certs}"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  >/dev/null 2>&1

echo "Zertifikate erzeugt: $CERT_DIR/cert.pem, $CERT_DIR/key.pem"
