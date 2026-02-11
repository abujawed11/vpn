#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Complete VPN Region Setup Script
#
# This script combines ec2-vpn-setup.sh + install-monitor.sh
# Run this ONCE on each new EC2/VPS to set up a complete VPN region
#
# Usage: ./setup-vpn-region.sh <BASE_IP> <REGION_ID> <BACKEND_URL> <WEBHOOK_SECRET>
# Example: ./setup-vpn-region.sh 10.40.0 ca-toronto https://vpn.engageswap.in your-webhook-secret
#
# What it does:
# 1. Installs WireGuard
# 2. Creates vpnctl user with SSH access
# 3. Sets up WireGuard interface
# 4. Configures NAT and IP forwarding
# 5. Creates vpnctl-wg.sh control script
# 6. Installs monitoring services (wg-monitor, wg-expiry)
# 7. Starts everything automatically
###############################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Check arguments
if [ "$#" -ne 4 ]; then
    log_error "Invalid arguments"
    echo "Usage: $0 <BASE_IP> <REGION_ID> <BACKEND_URL> <WEBHOOK_SECRET>"
    echo ""
    echo "Example:"
    echo "  $0 10.40.0 ca-toronto https://vpn.engageswap.in your-webhook-secret"
    echo ""
    echo "Parameters:"
    echo "  BASE_IP         - VPN subnet (e.g., 10.40.0 for 10.40.0.0/24)"
    echo "  REGION_ID       - Unique region identifier (e.g., ca-toronto)"
    echo "  BACKEND_URL     - Your backend API URL"
    echo "  WEBHOOK_SECRET  - Webhook secret from your .env file"
    exit 1
fi

BASE_IP="$1"
REGION_ID="$2"
BACKEND_URL="$3"
WEBHOOK_SECRET="$4"

WG_IFACE="wg0"
WG_PORT="51820"
SERVER_ADDR="${BASE_IP}.1/24"
VPN_CIDR="${BASE_IP}.0/24"

echo ""
echo "========================================"
echo "   VPN Region Setup"
echo "========================================"
echo "Region ID:      ${REGION_ID}"
echo "BASE IP:        ${BASE_IP}.0/24"
echo "Server Address: ${SERVER_ADDR}"
echo "WireGuard Port: ${WG_PORT}"
echo "Backend URL:    ${BACKEND_URL}"
echo "========================================"
echo ""

# Detect environment
log_info "Detecting environment..."
OUT_IFACE="$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}' || true)"
OUT_IFACE="${OUT_IFACE:-$(ip route show default | awk '{print $5; exit}' || true)}"
OUT_IFACE="${OUT_IFACE:-eth0}"
log_success "Outbound interface: $OUT_IFACE"

PUBLIC_IP="$(curl -fs --connect-timeout 1 http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -fs --connect-timeout 3 https://icanhazip.com | tr -d '
' || true)"
fi
if [[ -z "${PUBLIC_IP}" ]]; then
  log_error "Unable to detect public IP"
  exit 1
fi
log_success "Detected public IPv4: $PUBLIC_IP"

# Warn about CGNAT
if [[ "$PUBLIC_IP" =~ ^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\. ]]; then
  log_warning "Your public IP is in 100.64.0.0/10 (CGNAT)"
  log_warning "WireGuard may NOT work properly. Consider using an Elastic IP."
fi

echo ""
log_info "[1/10] Installing packages..."
export DEBIAN_FRONTEND=noninteractive

# Wait for any existing apt processes to finish
log_info "Waiting for apt locks to clear..."
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
    sleep 2
done

log_info "Running apt-get update..."
apt-get update -y || {
    log_warning "First apt-get update failed, retrying..."
    sleep 5
    apt-get update -y
}

log_info "Installing WireGuard and dependencies..."
apt-get install -y wireguard wireguard-tools iptables ufw curl qrencode || {
    log_error "Package installation failed"
    exit 1
}
log_success "Packages installed"

echo ""
log_info "[2/10] Creating vpnctl user..."
if id "vpnctl" >/dev/null 2>&1; then
    log_success "User vpnctl already exists"
else
    useradd -m -s /bin/bash vpnctl
    log_success "User vpnctl created"
fi

echo ""
log_info "[3/10] Setting up SSH keys..."
mkdir -p /home/vpnctl/.ssh
chmod 700 /home/vpnctl/.ssh

cat > /home/vpnctl/.ssh/authorized_keys << 'SSHKEY'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMlm4GQDbRABbpWoJp8tlYbnuglXUPOyo//kd5iLHi03 najam jawed@DESKTOP-NESSSNL
SSHKEY

chmod 600 /home/vpnctl/.ssh/authorized_keys
chown -R vpnctl:vpnctl /home/vpnctl/.ssh
log_success "SSH keys configured"

echo ""
log_info "[4/10] Enabling IPv4 forwarding..."
cat <<EOF >/etc/sysctl.d/99-wireguard.conf
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=0
net.ipv4.conf.default.rp_filter=0
net.ipv4.conf.${OUT_IFACE}.rp_filter=0
net.ipv4.conf.${WG_IFACE}.rp_filter=0
EOF
sysctl --system 2>&1 | grep -v "permission denied" || true
log_success "IPv4 forwarding enabled"

echo ""
log_info "[5/10] Creating vpnctl-wg.sh control script..."
cat > /usr/local/bin/vpnctl-wg.sh << 'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

WG_IFACE="wg0"

case "${1:-}" in
  dump)
    wg show "$WG_IFACE" dump
    ;;

  add-peer)
    if [ "$#" -ne 3 ]; then
      echo "Usage: $0 add-peer <pubkey> <allowed-ip>"
      exit 1
    fi
    PUBKEY="$2"
    ALLOWED_IP="$3"
    wg set "$WG_IFACE" peer "$PUBKEY" allowed-ips "$ALLOWED_IP"
    ;;

  remove-peer)
    if [ "$#" -ne 2 ]; then
      echo "Usage: $0 remove-peer <pubkey>"
      exit 1
    fi
    PUBKEY="$2"
    wg set "$WG_IFACE" peer "$PUBKEY" remove
    ;;

  *)
    echo "Usage: $0 {dump|add-peer|remove-peer}"
    exit 1
    ;;
esac
SCRIPT

chmod +x /usr/local/bin/vpnctl-wg.sh
log_success "vpnctl-wg.sh created"

echo ""
log_info "[6/10] Configuring sudoers..."
echo 'vpnctl ALL=(root) NOPASSWD: /usr/local/bin/vpnctl-wg.sh' > /etc/sudoers.d/vpnctl
chmod 440 /etc/sudoers.d/vpnctl
log_success "Sudoers configured"

echo ""
log_info "[7/10] Setting up WireGuard..."
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

SERVER_KEY_FILE="/etc/wireguard/server.key"
SERVER_PUB_FILE="/etc/wireguard/server.pub"

# Check if keys exist AND are not empty
if [[ -f "$SERVER_KEY_FILE" ]] && [[ -s "$SERVER_KEY_FILE" ]] && [[ -f "$SERVER_PUB_FILE" ]] && [[ -s "$SERVER_PUB_FILE" ]]; then
  log_warning "Server keys already exist, reusing them"
  SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"
  SERVER_PUB="$(cat "$SERVER_PUB_FILE")"

  # Verify keys are not empty
  if [[ -z "$SERVER_PRIV" ]] || [[ -z "$SERVER_PUB" ]]; then
    log_warning "Keys exist but are empty! Regenerating..."
    rm -f "$SERVER_KEY_FILE" "$SERVER_PUB_FILE"
    umask 077
    wg genkey | tee "$SERVER_KEY_FILE" | wg pubkey > "$SERVER_PUB_FILE"
    SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"
    SERVER_PUB="$(cat "$SERVER_PUB_FILE")"
    log_success "Server keys regenerated"
  fi
else
  log_info "Generating new server keys..."
  umask 077
  wg genkey | tee "$SERVER_KEY_FILE" | wg pubkey > "$SERVER_PUB_FILE"
  SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"
  SERVER_PUB="$(cat "$SERVER_PUB_FILE")"
  log_success "Server keys generated"
fi

# Final verification
if [[ -z "$SERVER_PRIV" ]] || [[ -z "$SERVER_PUB" ]]; then
  log_error "Failed to generate/load server keys!"
  exit 1
fi

log_info "Server public key: ${SERVER_PUB}"

# Create WireGuard config
cat <<EOF >/etc/wireguard/${WG_IFACE}.conf
[Interface]
Address = ${SERVER_ADDR}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}

# NAT + forwarding
PostUp = iptables -A FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -A FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${OUT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -D FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${OUT_IFACE} -j MASQUERADE

# Peers will be added dynamically via vpnctl-wg.sh
EOF

chmod 600 /etc/wireguard/${WG_IFACE}.conf
log_success "WireGuard config created"

echo ""
log_info "[8/10] Starting WireGuard..."

# Stop existing WireGuard if running
if systemctl is-active --quiet wg-quick@${WG_IFACE}; then
    log_info "Stopping existing WireGuard service..."
    systemctl stop wg-quick@${WG_IFACE} || true
fi

# Bring down existing interface if it exists
if ip link show ${WG_IFACE} >/dev/null 2>&1; then
    log_info "Removing existing ${WG_IFACE} interface..."
    ip link delete ${WG_IFACE} 2>/dev/null || true
fi

# Enable and start WireGuard
log_info "Starting WireGuard service..."
systemctl enable wg-quick@${WG_IFACE}
systemctl start wg-quick@${WG_IFACE}

# Check if it started successfully
if ! systemctl is-active --quiet wg-quick@${WG_IFACE}; then
    log_error "WireGuard service failed to start. Checking logs..."
    systemctl status wg-quick@${WG_IFACE} --no-pager || true
    journalctl -u wg-quick@${WG_IFACE} -n 20 --no-pager || true
    log_error "Attempting to start manually for debugging..."
    wg-quick up ${WG_IFACE} || true
    exit 1
fi

log_info "Configuring firewall..."
ufw allow ${WG_PORT}/udp 2>&1 | grep -v "Skipping" || true
ufw allow OpenSSH 2>&1 | grep -v "Skipping" || true
ufw --force enable 2>&1 | grep -v "Skipping" || true
ufw reload 2>&1 | grep -v "Skipping" || true

sleep 2

if wg show "$WG_IFACE" >/dev/null 2>&1; then
  log_success "WireGuard is running"
else
  log_error "WireGuard interface not found!"
  exit 1
fi

echo ""
log_info "[9/10] Installing monitoring services..."

# Create wg-monitor.sh
cat > /usr/local/bin/wg-monitor.sh << EOF
#!/bin/bash
BACKEND_URL="${BACKEND_URL}/api/webhook/handshake"
REGION_ID="${REGION_ID}"
WEBHOOK_SECRET="${WEBHOOK_SECRET}"
WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=15

touch "\$STATE_FILE"

log() {
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$1"
}

log "Starting WireGuard monitor for \$REGION_ID (\$WG_INTERFACE)"

while true; do
    wg show "\$WG_INTERFACE" dump 2>/dev/null | tail -n +2 | while IFS=\$'	' read -r pubkey preshared endpoint allowed_ips handshake rx tx keepalive; do
        if [ "\$handshake" = "0" ] || [ -z "\$handshake" ]; then
            continue
        fi

        if grep -q "^\${pubkey}\$" "\$STATE_FILE" 2>/dev/null; then
            continue
        fi

        log "New handshake detected for peer: \${pubkey:0:8}..."

        response=\$(curl -s -w "\n%{http_code}" -X POST "\$BACKEND_URL" -H "Content-Type: application/json" -d "{\"regionId\":\"\$REGION_ID\",\"publicKey\":\"\$pubkey\",\"timestamp\":\$handshake,\"secret\":\"\$WEBHOOK_SECRET\"}")

        http_code=\$(echo "\$response" | tail -n1)
        body=\$(echo "\$response" | head -n -1)

        if [ "\$http_code" = "200" ]; then
            log "Backend notified successfully: \$body"
            echo "\$pubkey" >> "\$STATE_FILE"
        else
            log "Failed to notify backend (HTTP \$http_code): \$body"
        fi
    done

    sleep "\$CHECK_INTERVAL"
done
EOF

chmod +x /usr/local/bin/wg-monitor.sh

# Create wg-expiry.sh
cat > /usr/local/bin/wg-expiry.sh << EOF
#!/bin/bash
BACKEND_URL="${BACKEND_URL}/api/webhook/expired"
CHECK_EXPIRY_URL="${BACKEND_URL}/api/webhook/check-expiry"
REGION_ID="${REGION_ID}"
WEBHOOK_SECRET="${WEBHOOK_SECRET}"
WG_INTERFACE="wg0"
STATE_FILE="/tmp/wg-handshakes-notified"
CHECK_INTERVAL=60

log() {
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$1"
}

log "Starting WireGuard expiry handler for \$REGION_ID (\$WG_INTERFACE)"

while true; do
    response=\$(curl -s -w "\n%{http_code}" -X POST "\$CHECK_EXPIRY_URL" -H "Content-Type: application/json" -d "{\"regionId\":\"\$REGION_ID\",\"secret\":\"\$WEBHOOK_SECRET\"}")

    http_code=\$(echo "\$response" | tail -n1)
    body=\$(echo "\$response" | head -n -1)

    if [ "\$http_code" = "200" ]; then
        expired_peers=\$(echo "\$body" | grep -oP '"expiredPeers":\s*\[\K[^\]]*' | tr -d '"' | tr ',' '
')

        for pubkey in \$expired_peers; do
            if [ -n "\$pubkey" ]; then
                log "Removing expired peer: \${pubkey:0:8}..."

                wg set "\$WG_INTERFACE" peer "\$pubkey" remove

                if [ \$? -eq 0 ]; then
                    log "Peer removed successfully"

                    curl -s -X POST "\$BACKEND_URL" -H "Content-Type: application/json" -d "{\"regionId\":\"\$REGION_ID\",\"publicKey\":\"\$pubkey\",\"secret\":\"\$WEBHOOK_SECRET\"}"

                    sed -i "/^\${pubkey}\$/d" "\$STATE_FILE" 2>/dev/null
                else
                    log "Failed to remove peer"
                fi
            fi
        done
    fi

    sleep "\$CHECK_INTERVAL"
done
EOF

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

log_info "Starting monitoring services..."
systemctl daemon-reload
systemctl enable wg-monitor wg-expiry
systemctl restart wg-monitor wg-expiry

log_success "Monitoring services installed and started"

echo ""
log_info "[10/10] Verifying installation..."

# Check WireGuard status
if systemctl is-active --quiet wg-quick@${WG_IFACE}; then
    log_success "WireGuard service: ✓ Running"
else
    log_error "WireGuard service: ✗ Not running"
fi

# Check monitoring services
if systemctl is-active --quiet wg-monitor; then
    log_success "Handshake monitor: ✓ Running"
else
    log_warning "Handshake monitor: ✗ Not running"
fi

if systemctl is-active --quiet wg-expiry; then
    log_success "Expiry handler: ✓ Running"
else
    log_warning "Expiry handler: ✗ Not running"
fi

echo ""
echo "========================================"
echo "   ✅ Setup Complete!"
echo "========================================"
echo ""
echo "📊 Region Information:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Region ID:       ${REGION_ID}"
echo "Public IP:       ${PUBLIC_IP}"
echo "Endpoint:        ${PUBLIC_IP}:${WG_PORT}"
echo "Server Pubkey:   ${SERVER_PUB}"
echo "Base IP:         ${BASE_IP}"
echo "VPN Subnet:      ${VPN_CIDR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔧 WireGuard Status:"
wg show "$WG_IFACE" 2>/dev/null || echo "  (No peers yet)"
echo ""
echo "========================================"
echo "📋 ADD TO YOUR .env FILE:"
echo "========================================"
echo "REGION_${REGION_ID^^}_ID=${REGION_ID}"
echo "REGION_${REGION_ID^^}_NAME=<Region Name (e.g., Canada Toronto)>"
echo "REGION_${REGION_ID^^}_HOST=${PUBLIC_IP}"
echo "REGION_${REGION_ID^^}_ENDPOINT=${PUBLIC_IP}:${WG_PORT}"
echo "REGION_${REGION_ID^^}_SERVER_PUBLIC_KEY=${SERVER_PUB}"
echo "REGION_${REGION_ID^^}_BASE_IP=${BASE_IP}"
echo "========================================"
echo ""
echo "✅ Next steps:"
echo "1. Restart your backend: docker-compose restart vpn-back"
echo "2. Test in dashboard"
echo ""
echo "🔍 Monitor logs:"
echo "  journalctl -u wg-monitor -f"
echo "  journalctl -u wg-expiry -f"
echo ""
echo "🧪 Test SSH access from backend:"
echo "  ssh -i vpnctl_ed25519 vpnctl@${PUBLIC_IP} 'sudo /usr/local/bin/vpnctl-wg.sh dump'"
echo ""
log_success "Region ${REGION_ID} is ready! 🎉"
