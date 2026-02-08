#!/usr/bin/env bash
set -euo pipefail

### =========================
### WireGuard Auto Setup VPS
### - Creates server config /etc/wireguard/wg0.conf
### - Creates client config /etc/wireguard/clients/kali.conf
### - Enables NAT + forwarding + UFW
### - Prints scp command to download client config
###
### Usage: ./wg-setup.sh [BASE_IP]
### Example: ./wg-setup.sh 10.40.0
### Default: 10.30.0
### =========================

# Accept BASE_IP as first argument, default to 10.30.0
BASE_IP="${1:-10.30.0}"

WG_IFACE="wg0"
WG_PORT="51820"
VPN_CIDR="${BASE_IP}.0/24"
SERVER_ADDR="${BASE_IP}.1/24"

CLIENT_NAME=""
CLIENT_ADDR="${BASE_IP}.2/24"
CLIENT_ALLOWED_IP="${BASE_IP}.2/32"
CLIENT_DNS="1.1.1.1"
CLIENT_ALLOWEDIPS_TUNNEL="0.0.0.0/0"
KEEPALIVE="25"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1"; exit 1; }; }

need ip
need awk
need curl

echo "=== WireGuard VPS Auto Setup ==="
echo "Using BASE_IP: ${BASE_IP}"
echo

# Outbound iface
OUT_IFACE="$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}' || true)"
OUT_IFACE="${OUT_IFACE:-$(ip route show default | awk '{print $5; exit}' || true)}"
OUT_IFACE="${OUT_IFACE:-eth0}"
echo "✔ Outbound interface: $OUT_IFACE"

# Public IP detection: AWS metadata -> fallback
PUBLIC_IP="$(curl -fs --connect-timeout 1 http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -fs --connect-timeout 3 https://icanhazip.com | tr -d '\n' || true)"
fi
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "❌ Unable to detect public IP"
  exit 1
fi
echo "✔ Detected public IPv4: $PUBLIC_IP"

# Make a filename-safe version of the public IP (dots -> dashes)
SAFE_PUBLIC_IP="${PUBLIC_IP//./-}"

# Unique client name per VPS
CLIENT_NAME="vpn-${SAFE_PUBLIC_IP}"

# Warn if CGNAT (100.64.0.0/10) — will break inbound WireGuard from internet
if [[ "$PUBLIC_IP" =~ ^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\. ]]; then
  echo
  echo "⚠️ WARNING: Your 'public' IP is in 100.64.0.0/10 (CGNAT)."
  echo "   Inbound UDP from the internet will NOT reach this instance."
  echo "   Fix: attach an Elastic IP or ensure real public IPv4 assignment."
  echo
fi

echo
echo "[1/6] Installing packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard wireguard-tools iptables ufw curl

# Optional QR output
apt-get install -y qrencode >/dev/null 2>&1 || true

echo
echo "[2/6] Enabling IPv4 forwarding..."
cat <<EOF >/etc/sysctl.d/99-wireguard.conf
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=0
net.ipv4.conf.default.rp_filter=0
net.ipv4.conf.${OUT_IFACE}.rp_filter=0
EOF
sysctl --system >/dev/null

echo
echo "[3/6] Preparing directories..."
mkdir -p /etc/wireguard/clients
chmod 700 /etc/wireguard
chmod 700 /etc/wireguard/clients

# Server keys (persist on disk so re-run doesn't rotate unexpectedly unless you delete them)
SERVER_KEY_FILE="/etc/wireguard/server.key"
SERVER_PUB_FILE="/etc/wireguard/server.pub"

if [[ ! -f "$SERVER_KEY_FILE" ]]; then
  echo "Generating server keys..."
  umask 077
  wg genkey | tee "$SERVER_KEY_FILE" | wg pubkey > "$SERVER_PUB_FILE"
else
  echo "Server keys already exist, reusing them."
fi

SERVER_PRIV="$(cat "$SERVER_KEY_FILE")"
SERVER_PUB="$(cat "$SERVER_PUB_FILE")"

# Client keys
CLIENT_KEY_FILE="/etc/wireguard/clients/${CLIENT_NAME}.key"
CLIENT_PUB_FILE="/etc/wireguard/clients/${CLIENT_NAME}.pub"
CLIENT_CONF_FILE="/etc/wireguard/clients/${CLIENT_NAME}.conf"

if [[ ! -f "$CLIENT_KEY_FILE" ]]; then
  echo "Generating client keys for '${CLIENT_NAME}'..."
  umask 077
  wg genkey | tee "$CLIENT_KEY_FILE" | wg pubkey > "$CLIENT_PUB_FILE"
else
  echo "Client keys for '${CLIENT_NAME}' already exist, reusing them."
fi

CLIENT_PRIV="$(cat "$CLIENT_KEY_FILE")"
CLIENT_PUB="$(cat "$CLIENT_PUB_FILE")"

echo
echo "[4/6] Writing server config /etc/wireguard/${WG_IFACE}.conf ..."
cat <<EOF >/etc/wireguard/${WG_IFACE}.conf
[Interface]
Address = ${SERVER_ADDR}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}

# NAT + forwarding so VPN clients can reach the internet via ${OUT_IFACE}
PostUp = iptables -A FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -A FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${OUT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -D FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${OUT_IFACE} -j MASQUERADE

[Peer]
PublicKey = ${CLIENT_PUB}
AllowedIPs = ${CLIENT_ALLOWED_IP}
EOF
chmod 600 /etc/wireguard/${WG_IFACE}.conf

echo
echo "[5/6] Writing client config ${CLIENT_CONF_FILE} ..."
cat <<EOF >"${CLIENT_CONF_FILE}"
[Interface]
PrivateKey = ${CLIENT_PRIV}
Address = ${CLIENT_ADDR}
DNS = ${CLIENT_DNS}

[Peer]
PublicKey = ${SERVER_PUB}
Endpoint = ${PUBLIC_IP}:${WG_PORT}
AllowedIPs = ${CLIENT_ALLOWEDIPS_TUNNEL}
PersistentKeepalive = ${KEEPALIVE}
EOF
chmod 600 "${CLIENT_CONF_FILE}"

echo
echo "[6/6] Starting WireGuard + firewall..."
systemctl enable wg-quick@${WG_IFACE} >/dev/null
systemctl restart wg-quick@${WG_IFACE}

ufw allow ${WG_PORT}/udp >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
ufw reload >/dev/null

echo
echo "=== DONE ==="
echo "BASE_IP used: ${BASE_IP}"
echo "Server public key: ${SERVER_PUB}"
echo "Client config saved at: ${CLIENT_CONF_FILE}"
echo
echo "To view client config on VPS:"
echo "  sudo cat ${CLIENT_CONF_FILE}"
echo
echo "To download to your local machine (run this on YOUR PC):"
echo "  scp -i <your-key.pem> ubuntu@${PUBLIC_IP}:${CLIENT_CONF_FILE} ."
echo
if command -v qrencode >/dev/null 2>&1; then
  echo "QR for mobile import (run on VPS):"
  echo "  sudo qrencode -t ansiutf8 < ${CLIENT_CONF_FILE}"
fi
echo


echo
echo "[EXPORT] Making client config available for download..."

EXPORT_USER="ubuntu"
EXPORT_PATH="/home/${EXPORT_USER}"
EXPORT_FILE="${EXPORT_PATH}/${CLIENT_NAME}.conf"

# Copy the generated client config to ubuntu's home
cp "${CLIENT_CONF_FILE}" "${EXPORT_FILE}"
chown "${EXPORT_USER}:${EXPORT_USER}" "${EXPORT_FILE}"
chmod 600 "${EXPORT_FILE}"

echo "✔ Client config exported to ${EXPORT_FILE}"
echo
echo "Download it from your local machine with:"
echo "scp -i ~/.ssh/your-key.pem ${EXPORT_USER}@${PUBLIC_IP}:${EXPORT_FILE} ."
echo
echo "================================================"
echo "📋 COPY THESE VALUES TO YOUR .env FILE:"
echo "================================================"
echo "REGION_XX_ID=<your-region-id>"
echo "REGION_XX_NAME=<Your Region Name>"
echo "REGION_XX_HOST=${PUBLIC_IP}"
echo "REGION_XX_ENDPOINT=${PUBLIC_IP}:${WG_PORT}"
echo "REGION_XX_SERVER_PUBLIC_KEY=${SERVER_PUB}"
echo "REGION_XX_BASE_IP=${BASE_IP}"
echo "================================================"
echo
