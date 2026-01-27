#!/bin/bash
#
# WireGuard Handshake Monitor
# Detects new handshakes and notifies backend via webhook
#
# Installation:
#   1. Copy to /usr/local/bin/wg-monitor.sh
#   2. chmod +x /usr/local/bin/wg-monitor.sh
#   3. Edit BACKEND_URL, REGION_ID, WEBHOOK_SECRET below
#   4. Install systemd service (see wg-monitor.service)
#

# === CONFIGURATION - EDIT THESE ===
BACKEND_URL="https://your-backend.com/api/webhook/handshake"
REGION_ID="de-frankfurt"  # Change per server: de-frankfurt, jp-tokyo, etc.
WEBHOOK_SECRET="your-webhook-secret-change-in-production"
# ==================================

WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=15  # seconds

# Create state file if not exists
touch "$STATE_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting WireGuard monitor for $REGION_ID ($WG_INTERFACE)"

while true; do
    # Get current WireGuard dump
    # Format: public_key, preshared_key, endpoint, allowed_ips, latest_handshake, rx, tx, keepalive
    wg show "$WG_INTERFACE" dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pubkey preshared endpoint allowed_ips handshake rx tx keepalive; do
        # Skip if no handshake yet (handshake = 0)
        if [ "$handshake" = "0" ] || [ -z "$handshake" ]; then
            continue
        fi

        # Check if we already notified about this peer
        if grep -q "^${pubkey}$" "$STATE_FILE" 2>/dev/null; then
            continue
        fi

        # New handshake detected - notify backend
        log "New handshake detected for peer: ${pubkey:0:8}..."

        response=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL" \
            -H "Content-Type: application/json" \
            -d "{\"regionId\":\"$REGION_ID\",\"publicKey\":\"$pubkey\",\"timestamp\":$handshake,\"secret\":\"$WEBHOOK_SECRET\"}")

        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n -1)

        if [ "$http_code" = "200" ]; then
            log "Backend notified successfully: $body"
            # Mark as notified
            echo "$pubkey" >> "$STATE_FILE"
        else
            log "Failed to notify backend (HTTP $http_code): $body"
        fi
    done

    sleep "$CHECK_INTERVAL"
done
