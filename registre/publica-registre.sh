#!/bin/bash
# Publishes this server in the official MCP Registry under the domain namespace studio.crida (DNS authentication).
# Step 1 (once):  ./registre/publica-registre.sh clau      -> creates the key and prints the TXT record to add in DNS
# Step 2:         ./registre/publica-registre.sh publica   -> logs in with that key and publishes server.json
# The private key stays in ~/.config/crida/mcp-registry-key.pem and is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl   # macOS LibreSSL cannot create Ed25519 keys
KEY="$HOME/.config/crida/mcp-registry-key.pem"
DOMAIN="crida.studio"
command -v mcp-publisher >/dev/null || { echo "Install the publisher first: brew install mcp-publisher"; exit 1; }
[ -x "$OPENSSL" ] || { echo "Install OpenSSL 3 first: brew install openssl@3"; exit 1; }
case "${1:-}" in
  clau)
    if [ -e "$KEY" ]; then echo "A key already exists at $KEY; using it."; else mkdir -p "$(dirname "$KEY")"; umask 077; "$OPENSSL" genpkey -algorithm Ed25519 -out "$KEY"; fi
    PUB="$("$OPENSSL" pkey -in "$KEY" -pubout -outform DER | tail -c 32 | base64)"
    echo; echo "Add this TXT record at the apex of $DOMAIN (Cloudflare > DNS > Add record):"
    echo "  Type: TXT   Name: @   Content: v=MCPv1; k=ed25519; p=$PUB"
    echo; echo "Then wait a few minutes and run: ./registre/publica-registre.sh publica" ;;
  publica)
    [ -e "$KEY" ] || { echo "No key: run step 1 first."; exit 1; }
    dig +short TXT "$DOMAIN" | grep -q 'v=MCPv1' || { echo "The TXT record is not visible yet. Wait and try again."; exit 1; }
    MCP_PRIVATE_KEY="$("$OPENSSL" pkey -in "$KEY" -noout -text | sed -n '/priv:/,/pub:/p' | sed '1d;$d' | tr -d ' :\n')" \
      mcp-publisher login dns --domain "$DOMAIN"
    mcp-publisher publish
    echo "Check: https://registry.modelcontextprotocol.io/v0/servers?search=studio.crida" ;;
  *) echo "Usage: $0 clau | publica"; exit 1 ;;
esac
