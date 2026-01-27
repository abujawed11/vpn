#!/bin/bash
#
# WireGuard Peer Expiry Handler
# Checks for expired peers and removes them
#
# Installation:
#   1. Copy to /usr/local/bin/wg-expiry.sh
#   2. chmod +x /usr/local/bin/wg-expiry.sh
#   3. Edit BACKEND_URL, REGION_ID, WEBHOOK_SECRET below
#   4. Install systemd service (see wg-expiry.service)
#

# === CONFIGURATION - EDIT THESE ===
BACKEND_URL="https://your-backend.com/api/webhook/expired"
REGION_ID="de-frankfurt"  # Change per server: de-frankfurt, jp-tokyo, etc.
WEBHOOK_SECRET="your-webhook-secret-change-in-production"
CHECK_EXPIRY_URL="https://your-backend.com/api/webhook/check-expiry"
# ==================================

WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=60  # seconds

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting WireGuard expiry handler for $REGION_ID ($WG_INTERFACE)"

while true; do
    # Get list of expired peers from backend
    response=$(curl -s -w "\n%{http_code}" -X POST "$CHECK_EXPIRY_URL" \
        -H "Content-Type: application/json" \
        -d "{\"regionId\":\"$REGION_ID\",\"secret\":\"$WEBHOOK_SECRET\"}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" = "200" ]; then
        # Parse expired public keys from JSON response
        # Expected format: {"expiredPeers": ["pubkey1", "pubkey2"]}
        expired_peers=$(echo "$body" | grep -oP '"expiredPeers":\s*\[\K[^\]]*' | tr -d '"' | tr ',' '\n')

        for pubkey in $expired_peers; do
            if [ -n "$pubkey" ]; then
                log "Removing expired peer: ${pubkey:0:8}..."

                # Remove peer from WireGuard
                wg set "$WG_INTERFACE" peer "$pubkey" remove

                if [ $? -eq 0 ]; then
                    log "Peer removed successfully"

                    # Notify backend
                    curl -s -X POST "$BACKEND_URL" \
                        -H "Content-Type: application/json" \
                        -d "{\"regionId\":\"$REGION_ID\",\"publicKey\":\"$pubkey\",\"secret\":\"$WEBHOOK_SECRET\"}"

                    # Remove from notified state file
                    sed -i "/^${pubkey}$/d" "$STATE_FILE" 2>/dev/null
                else
                    log "Failed to remove peer"
                fi
            fi
        done
    fi

    sleep "$CHECK_INTERVAL"
done
