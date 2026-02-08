#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# EC2 VPN Region Setup
#
# This script sets up a NEW EC2 instance to work with your VPN backend
#
# Usage: ./ec2-vpn-setup.sh <BASE_IP> <SERVER_PUBLIC_KEY>
# Example: ./ec2-vpn-setup.sh 10.40.0 "AbCdEfGh...="
#
# What it does:
# 1. Installs WireGuard
# 2. Creates vpnctl user
# 3. Sets up SSH key authentication
# 4. Creates /usr/local/bin/vpnctl-wg.sh control script
# 5. Configures WireGuard interface
# 6. Enables NAT and IP forwarding
# 7. Sets up firewall
###############################################################################

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <BASE_IP> <SERVER_PUBLIC_KEY>"
    echo "Example: $0 10.40.0 'AbCdEfGh1234567890...='"
    exit 1
fi

BASE_IP="$1"
SERVER_PUB_KEY="$2"

WG_IFACE="wg0"
WG_PORT="51820"
SERVER_ADDR="${BASE_IP}.1/24"
VPN_CIDR="${BASE_IP}.0/24"

echo "========================================"
echo "   EC2 VPN Region Setup"
echo "========================================"
echo "BASE_IP: ${BASE_IP}"
echo "WireGuard Interface: ${WG_IFACE}"
echo "Server Address: ${SERVER_ADDR}"
echo "========================================"
echo

# Detect outbound interface
OUT_IFACE="$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}' || true)"
OUT_IFACE="${OUT_IFACE:-$(ip route show default | awk '{print $5; exit}' || true)}"
OUT_IFACE="${OUT_IFACE:-eth0}"
echo "✔ Outbound interface: $OUT_IFACE"

# Detect public IP
PUBLIC_IP="$(curl -fs --connect-timeout 1 http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -fs --connect-timeout 3 https://icanhazip.com | tr -d '\n' || true)"
fi
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "❌ Unable to detect public IP"
  exit 1
fi
echo "✔ Detected public IPv4: $PUBLIC_IP"
echo

echo "[1/8] Installing WireGuard..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1
apt-get install -y wireguard wireguard-tools iptables ufw curl >/dev/null 2>&1
echo "✔ WireGuard installed"

echo
echo "[2/8] Creating vpnctl user..."
if id "vpnctl" &>/dev/null; then
    echo "✔ User vpnctl already exists"
else
    useradd -m -s /bin/bash vpnctl
    echo "✔ User vpnctl created"
fi

echo
echo "[3/8] Setting up SSH keys..."
mkdir -p /home/vpnctl/.ssh
chmod 700 /home/vpnctl/.ssh

# Your vpnctl SSH public key
cat > /home/vpnctl/.ssh/authorized_keys << 'SSHKEY'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMlm4GQDbRABbpWoJp8tlYbnuglXUPOyo//kd5iLHi03 najam jawed@DESKTOP-NESSSNL
SSHKEY

chmod 600 /home/vpnctl/.ssh/authorized_keys
chown -R vpnctl:vpnctl /home/vpnctl/.ssh
echo "✔ SSH keys configured"

echo
echo "[4/8] Enabling IPv4 forwarding..."
cat <<EOF >/etc/sysctl.d/99-wireguard.conf
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=0
net.ipv4.conf.default.rp_filter=0
net.ipv4.conf.${OUT_IFACE}.rp_filter=0
net.ipv4.conf.${WG_IFACE}.rp_filter=0
EOF
sysctl --system >/dev/null 2>&1
echo "✔ IPv4 forwarding enabled"

echo
echo "[5/8] Creating vpnctl-wg.sh control script..."
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
echo "✔ vpnctl-wg.sh created"

echo
echo "[6/8] Configuring sudoers for vpnctl..."
echo 'vpnctl ALL=(root) NOPASSWD: /usr/local/bin/vpnctl-wg.sh' > /etc/sudoers.d/vpnctl
chmod 440 /etc/sudoers.d/vpnctl
echo "✔ Sudoers configured"

echo
echo "[7/8] Preparing WireGuard directory..."
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

# Generate server keys if they don't exist
SERVER_KEY_FILE="/etc/wireguard/server.key"
SERVER_PUB_FILE="/etc/wireguard/server.pub"

if [[ -f "$SERVER_KEY_FILE" ]]; then
  echo "⚠️  Server keys already exist, reusing them"
  SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"
else
  echo "Generating new server keys..."
  umask 077
  wg genkey | tee "$SERVER_KEY_FILE" | wg pubkey > "$SERVER_PUB_FILE"
  SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"

  if [ -n "$SERVER_PUB_KEY" ] && [ "$SERVER_PUB_KEY" != "$(cat "$SERVER_PUB_FILE")" ]; then
    echo "⚠️  WARNING: Provided public key doesn't match generated key!"
    echo "   Provided: $SERVER_PUB_KEY"
    echo "   Generated: $(cat "$SERVER_PUB_FILE")"
    echo "   Using the generated key..."
  fi
fi

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
echo "✔ WireGuard config created"

echo
echo "[8/8] Starting WireGuard and firewall..."
systemctl enable wg-quick@${WG_IFACE} >/dev/null 2>&1
systemctl restart wg-quick@${WG_IFACE}

ufw allow ${WG_PORT}/udp >/dev/null 2>&1
ufw allow OpenSSH >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1
ufw reload >/dev/null 2>&1

# Wait a moment for interface to come up
sleep 2

# Verify WireGuard is running
if wg show "$WG_IFACE" >/dev/null 2>&1; then
  echo "✔ WireGuard is running"
else
  echo "❌ WireGuard failed to start!"
  exit 1
fi

echo
echo "========================================"
echo "   ✅ Setup Complete!"
echo "========================================"
echo
echo "Server Public Key: $(cat "$SERVER_PUB_FILE")"
echo "Public IP: ${PUBLIC_IP}"
echo "Endpoint: ${PUBLIC_IP}:${WG_PORT}"
echo "Base IP: ${BASE_IP}"
echo
echo "WireGuard Status:"
wg show "$WG_IFACE"
echo
echo "========================================"
echo "📋 ADD THESE TO YOUR .env FILE:"
echo "========================================"
echo "REGION_XX_ID=<your-region-id>"
echo "REGION_XX_NAME=<Your Region Name>"
echo "REGION_XX_HOST=${PUBLIC_IP}"
echo "REGION_XX_ENDPOINT=${PUBLIC_IP}:${WG_PORT}"
echo "REGION_XX_SERVER_PUBLIC_KEY=$(cat "$SERVER_PUB_FILE")"
echo "REGION_XX_BASE_IP=${BASE_IP}"
echo "========================================"
echo
echo "Test SSH access from backend:"
echo "ssh -i vpnctl_ed25519 vpnctl@${PUBLIC_IP} 'sudo /usr/local/bin/vpnctl-wg.sh dump'"
echo
