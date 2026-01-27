#!/bin/bash
#
# Install WireGuard Monitor Scripts
# Run this on each VPN server
#
# Usage: ./install-monitor.sh <region_id> <backend_url> <webhook_secret>
# Example: ./install-monitor.sh de-frankfurt https://api.yourvpn.com your-secret-key
#

set -e

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <region_id> <backend_url> <webhook_secret>"
    echo "Example: $0 de-frankfurt https://api.yourvpn.com your-secret-key"
    exit 1
fi

REGION_ID="$1"
BACKEND_URL="$2"
WEBHOOK_SECRET="$3"

echo "Installing WireGuard monitor for region: $REGION_ID"
echo "Backend URL: $BACKEND_URL"

# Create wg-monitor.sh
cat > /usr/local/bin/wg-monitor.sh << 'SCRIPT'
#!/bin/bash
BACKEND_URL="__BACKEND_URL__"
REGION_ID="__REGION_ID__"
WEBHOOK_SECRET="__WEBHOOK_SECRET__"
WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=15

touch "$STATE_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting WireGuard monitor for $REGION_ID ($WG_INTERFACE)"

while true; do
    wg show "$WG_INTERFACE" dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pubkey preshared endpoint allowed_ips handshake rx tx keepalive; do
        if [ "$handshake" = "0" ] || [ -z "$handshake" ]; then
            continue
        fi
        if grep -q "^${pubkey}$" "$STATE_FILE" 2>/dev/null; then
            continue
        fi
        log "New handshake detected for peer: ${pubkey:0:8}..."
        response=$(curl -s -w "\n%{http_code}" -X POST "${BACKEND_URL}/api/webhook/handshake" \
            -H "Content-Type: application/json" \
            -d "{\"regionId\":\"$REGION_ID\",\"publicKey\":\"$pubkey\",\"timestamp\":$handshake,\"secret\":\"$WEBHOOK_SECRET\"}")
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n -1)
        if [ "$http_code" = "200" ]; then
            log "Backend notified successfully"
            echo "$pubkey" >> "$STATE_FILE"
        else
            log "Failed to notify backend (HTTP $http_code): $body"
        fi
    done
    sleep "$CHECK_INTERVAL"
done
SCRIPT

# Create wg-expiry.sh
cat > /usr/local/bin/wg-expiry.sh << 'SCRIPT'
#!/bin/bash
BACKEND_URL="__BACKEND_URL__"
REGION_ID="__REGION_ID__"
WEBHOOK_SECRET="__WEBHOOK_SECRET__"
WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=60

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting WireGuard expiry handler for $REGION_ID ($WG_INTERFACE)"

while true; do
    response=$(curl -s -w "\n%{http_code}" -X POST "${BACKEND_URL}/api/webhook/check-expiry" \
        -H "Content-Type: application/json" \
        -d "{\"regionId\":\"$REGION_ID\",\"secret\":\"$WEBHOOK_SECRET\"}")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    if [ "$http_code" = "200" ]; then
        expired_peers=$(echo "$body" | grep -oP '"expiredPeers":\s*\[\K[^\]]*' | tr -d '"' | tr ',' '\n')
        for pubkey in $expired_peers; do
            if [ -n "$pubkey" ]; then
                log "Removing expired peer: ${pubkey:0:8}..."
                wg set "$WG_INTERFACE" peer "$pubkey" remove
                if [ $? -eq 0 ]; then
                    log "Peer removed successfully"
                    curl -s -X POST "${BACKEND_URL}/api/webhook/expired" \
                        -H "Content-Type: application/json" \
                        -d "{\"regionId\":\"$REGION_ID\",\"publicKey\":\"$pubkey\",\"secret\":\"$WEBHOOK_SECRET\"}"
                    sed -i "/^${pubkey}$/d" "$STATE_FILE" 2>/dev/null
                fi
            fi
        done
    fi
    sleep "$CHECK_INTERVAL"
done
SCRIPT

# Replace placeholders
sed -i "s|__BACKEND_URL__|$BACKEND_URL|g" /usr/local/bin/wg-monitor.sh
sed -i "s|__REGION_ID__|$REGION_ID|g" /usr/local/bin/wg-monitor.sh
sed -i "s|__WEBHOOK_SECRET__|$WEBHOOK_SECRET|g" /usr/local/bin/wg-monitor.sh

sed -i "s|__BACKEND_URL__|$BACKEND_URL|g" /usr/local/bin/wg-expiry.sh
sed -i "s|__REGION_ID__|$REGION_ID|g" /usr/local/bin/wg-expiry.sh
sed -i "s|__WEBHOOK_SECRET__|$WEBHOOK_SECRET|g" /usr/local/bin/wg-expiry.sh

# Make executable
chmod +x /usr/local/bin/wg-monitor.sh
chmod +x /usr/local/bin/wg-expiry.sh

# Create systemd services
cat > /etc/systemd/system/wg-monitor.service << 'SERVICE'
[Unit]
Description=WireGuard Handshake Monitor
After=network.target wg-quick@wg0.service
Wants=wg-quick@wg0.service

[Service]
Type=simple
ExecStart=/usr/local/bin/wg-monitor.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/systemd/system/wg-expiry.service << 'SERVICE'
[Unit]
Description=WireGuard Peer Expiry Handler
After=network.target wg-quick@wg0.service
Wants=wg-quick@wg0.service

[Service]
Type=simple
ExecStart=/usr/local/bin/wg-expiry.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# Reload and enable services
systemctl daemon-reload
systemctl enable wg-monitor wg-expiry
systemctl start wg-monitor wg-expiry

echo ""
echo "Installation complete!"
echo ""
echo "Check status with:"
echo "  systemctl status wg-monitor"
echo "  systemctl status wg-expiry"
echo ""
echo "View logs with:"
echo "  journalctl -u wg-monitor -f"
echo "  journalctl -u wg-expiry -f"
