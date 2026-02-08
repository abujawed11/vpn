# 🌍 New VPN Region Setup Guide

**Complete guide for adding new EC2/VPS regions to your VPN service**

---

## Table of Contents

1. [Quick Start](#-quick-start)
2. [Prerequisites](#-prerequisites)
3. [Step-by-Step Setup](#-step-by-step-setup)
4. [Backend Configuration](#-backend-configuration)
5. [Verification & Testing](#-verification--testing)
6. [Troubleshooting](#-troubleshooting)
7. [Region Planning](#-region-planning)

---

## 🚀 Quick Start

**TL;DR:** Run one command on your new EC2, copy output to `.env`, restart backend, done!

```bash
# On new EC2/VPS (as root)
sudo ./setup-vpn-region.sh 10.40.0 ca-toronto https://vpn.engageswap.in your-webhook-secret
```

**Time Required:** ~5 minutes

---

## 📋 Prerequisites

### 1. AWS EC2 Instance (or any VPS)

**Minimum Requirements:**
- OS: Ubuntu 20.04+ / Debian 11+
- RAM: 512 MB (1 GB recommended)
- CPU: 1 vCPU
- Storage: 10 GB
- Network: **Real public IPv4** (NOT CGNAT!)

**Recommended Instance Types:**
- AWS: `t3.micro` or `t3.small`
- DigitalOcean: Basic Droplet ($6/mo)
- Linode: Nanode 1GB
- Vultr: $5/mo plan

### 2. Network Requirements

**✅ MUST HAVE:**
- Real public IPv4 address
- Port 51820/UDP open (WireGuard)
- Port 22/TCP open (SSH)

**❌ WILL NOT WORK:**
- CGNAT IP (100.64.0.0/10)
- IPv6-only instance
- Blocked UDP ports

**AWS Security Group:**
```
Inbound Rules:
- SSH (22/TCP)     - Your IP
- WireGuard (51820/UDP) - 0.0.0.0/0
```

### 3. Files You Need

From your local machine:
- `scripts/setup-vpn-region.sh` (master setup script)
- `vpnctl_ed25519` (SSH private key - stays local)
- `vpnctl_ed25519.pub` (SSH public key - embedded in script)

### 4. Information You Need

Before starting, gather:
- ✅ Backend URL (e.g., `https://vpn.engageswap.in`)
- ✅ Webhook secret (from your `.env` file)
- ✅ Unique BASE_IP (e.g., `10.40.0`, `10.50.0`)
- ✅ Region ID (e.g., `ca-toronto`, `sg-singapore`)

---

## 📝 Step-by-Step Setup

### Step 1: Launch EC2 Instance

**AWS Console:**
1. Go to EC2 → Launch Instance
2. Choose Ubuntu 22.04 LTS
3. Select instance type (t3.micro for testing)
4. Configure security group (ports 22, 51820)
5. **Important:** Enable "Auto-assign public IPv4"
6. Download SSH key pair
7. Launch instance

**Get Public IP:**
```bash
# Find it in AWS Console or:
aws ec2 describe-instances --instance-ids i-xxxxx --query 'Reservations[0].Instances[0].PublicIpAddress'
```

---

### Step 2: Upload Setup Script to EC2

From your **local machine**:

```bash
# Upload script
scp -i your-ec2-key.pem scripts/setup-vpn-region.sh ubuntu@<EC2-PUBLIC-IP>:~/

# SSH into EC2
ssh -i your-ec2-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

### Step 3: Run Master Setup Script

**On the EC2 instance:**

```bash
# Make script executable
chmod +x setup-vpn-region.sh

# Run as root
sudo ./setup-vpn-region.sh <BASE_IP> <REGION_ID> <BACKEND_URL> <WEBHOOK_SECRET>
```

**Example:**
```bash
sudo ./setup-vpn-region.sh 10.40.0 ca-toronto https://vpn.engageswap.in your-webhook-secret
```

**Parameters Explained:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `BASE_IP` | VPN subnet (must be unique per region) | `10.40.0` |
| `REGION_ID` | Unique region identifier | `ca-toronto` |
| `BACKEND_URL` | Your backend API URL | `https://vpn.engageswap.in` |
| `WEBHOOK_SECRET` | From your `.env` file | (your secret) |

---

### Step 4: Script Output

The script will:

**✅ Install & Configure:**
1. WireGuard + tools
2. `vpnctl` user with SSH access
3. WireGuard interface (`wg0`)
4. NAT and IP forwarding
5. Control script (`vpnctl-wg.sh`)
6. Monitoring services (`wg-monitor`, `wg-expiry`)
7. Firewall rules (UFW)

**📊 Output:**
```
========================================
   ✅ Setup Complete!
========================================

📊 Region Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Region ID:       ca-toronto
Public IP:       35.183.23.201
Endpoint:        35.183.23.201:51820
Server Pubkey:   AbCdEfGh1234567890ABCDEFGHIJ1234567890ABCD=
Base IP:         10.40.0
VPN Subnet:      10.40.0.0/24
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

========================================
📋 ADD TO YOUR .env FILE:
========================================
REGION_CA_TORONTO_ID=ca-toronto
REGION_CA_TORONTO_NAME=Canada (Toronto)
REGION_CA_TORONTO_HOST=35.183.23.201
REGION_CA_TORONTO_ENDPOINT=35.183.23.201:51820
REGION_CA_TORONTO_SERVER_PUBLIC_KEY=AbCdEfGh1234567890ABCDEFGHIJ1234567890ABCD=
REGION_CA_TORONTO_BASE_IP=10.40.0
========================================
```

**⚠️ IMPORTANT:** Copy this output! You'll need it for the next step.

---

## ⚙️ Backend Configuration

### Step 5: Update `.env` File on VPS

**SSH into your VPS** (where backend is running):

```bash
ssh your-vps

# Edit .env file
cd /home/ubuntu/vpn/vpn-back
nano .env
```

**Add the variables** from Step 4 output:

```bash
# Canada Toronto Region
REGION_CA_TORONTO_ID=ca-toronto
REGION_CA_TORONTO_NAME=Canada (Toronto)
REGION_CA_TORONTO_HOST=35.183.23.201
REGION_CA_TORONTO_ENDPOINT=35.183.23.201:51820
REGION_CA_TORONTO_SERVER_PUBLIC_KEY=AbCdEfGh1234567890ABCDEFGHIJ1234567890ABCD=
REGION_CA_TORONTO_BASE_IP=10.40.0
```

**Save and exit** (`Ctrl+X`, `Y`, `Enter`)

---

### Step 6: Update `regions.js`

**Edit the regions file:**

```bash
cd /home/ubuntu/vpn/vpn-back
nano src/data/regions.js
```

**Add the new region:**

```javascript
export const REGIONS = [
  {
    id: process.env.REGION_TOKYO_ID,
    name: process.env.REGION_TOKYO_NAME,
    host: process.env.REGION_TOKYO_HOST,
    endpoint: process.env.REGION_TOKYO_ENDPOINT,
    serverPublicKey: process.env.REGION_TOKYO_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_TOKYO_BASE_IP,
    dns: "1.1.1.1",
  },
  // ADD THIS NEW REGION
  {
    id: process.env.REGION_CA_TORONTO_ID,
    name: process.env.REGION_CA_TORONTO_NAME,
    host: process.env.REGION_CA_TORONTO_HOST,
    endpoint: process.env.REGION_CA_TORONTO_ENDPOINT,
    serverPublicKey: process.env.REGION_CA_TORONTO_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_CA_TORONTO_BASE_IP,
    dns: "1.1.1.1",
  },
].filter(r => r.id);
```

**Save and exit**

---

### Step 7: Restart Backend

```bash
cd /home/ubuntu/vpn
docker-compose restart vpn-back

# Check logs
docker logs vpn-vpn-back-1 --tail 50
```

**Look for:**
```
vpn-back listening on :5060 with WebSocket support
```

---

## ✅ Verification & Testing

### Test 1: SSH Access

**From your VPS (where backend runs):**

```bash
ssh -i /home/ubuntu/vpn/vpnctl_ed25519 vpnctl@35.183.23.201 'sudo /usr/local/bin/vpnctl-wg.sh dump'
```

**Expected output:**
```
private_key	public_key	listen_port	fwmark
(Shows WireGuard interface info)
```

**If this fails:**
- Check SSH key is correct
- Check EC2 security group allows port 22
- Check vpnctl user exists on EC2

---

### Test 2: Check Monitoring Services

**On the new EC2:**

```bash
# Check service status
sudo systemctl status wg-monitor
sudo systemctl status wg-expiry

# View logs
sudo journalctl -u wg-monitor -f
sudo journalctl -u wg-expiry -f
```

**Should see:**
```
Starting WireGuard monitor for ca-toronto (wg0)
Starting WireGuard expiry handler for ca-toronto (wg0)
```

---

### Test 3: Dashboard Shows New Region

1. Open your VPN dashboard
2. Go to "Generate VPN Config"
3. **Region dropdown should show** "Canada (Toronto)"
4. Select it and click "Download Config"

**Expected:**
- Config downloads successfully
- No errors in console
- Timer starts when you connect

---

### Test 4: Full End-to-End Test

**Complete flow:**

1. **Download config** from dashboard
2. **Import into WireGuard app**
3. **Connect to VPN**
4. **Check monitoring:**

```bash
# On EC2, watch logs
sudo journalctl -u wg-monitor -f
```

**Should see:**
```
[2026-02-08 15:30:45] New handshake detected for peer: AbCdEfGh...
[2026-02-08 15:30:45] Backend notified successfully: {"message":"Handshake tracked"...}
```

5. **Check dashboard:**
   - Status changes: Pending → Active
   - Timer appears
   - Countdown starts

6. **Wait for timer expiry:**

```bash
# On EC2
sudo journalctl -u wg-expiry -f
```

**Should see:**
```
[2026-02-08 15:35:45] Removing expired peer: AbCdEfGh...
[2026-02-08 15:35:45] Peer removed successfully
```

7. **Dashboard updates:**
   - Status changes: Active → Expired
   - Can generate new config

✅ **If all of the above works, setup is complete!**

---

## 🐛 Troubleshooting

### Problem: Script fails at "Installing packages"

**Cause:** Package repository issues

**Fix:**
```bash
sudo apt-get update
sudo apt-get upgrade -y
# Then re-run script
```

---

### Problem: "Unable to detect public IP"

**Cause:** No internet connectivity

**Fix:**
```bash
# Check internet
ping 8.8.8.8

# Check DNS
nslookup google.com

# Check AWS metadata (if on AWS)
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

---

### Problem: WireGuard fails to start

**Symptoms:**
```
[ERROR] WireGuard failed to start!
```

**Debug:**
```bash
# Check status
sudo systemctl status wg-quick@wg0

# View logs
sudo journalctl -u wg-quick@wg0 -n 50

# Check config
sudo wg-quick down wg0
sudo wg-quick up wg0
```

**Common causes:**
- Port 51820 already in use
- Invalid config syntax
- Kernel module not loaded

---

### Problem: Timer doesn't start

**Symptoms:** Config generated, VPN connects, but dashboard shows "Pending"

**Debug Steps:**

**1. Check monitoring service:**
```bash
sudo systemctl status wg-monitor
sudo journalctl -u wg-monitor -f
```

**2. Check if handshake detected:**
```bash
sudo wg show wg0
```
Look for `latest handshake: X seconds ago`

**3. Check webhook is reaching backend:**
```bash
# On backend VPS
docker logs vpn-vpn-back-1 --tail 100 | grep handshake
```

**4. Test webhook manually:**
```bash
curl -X POST https://vpn.engageswap.in/api/webhook/handshake \
  -H "Content-Type: application/json" \
  -d '{"regionId":"ca-toronto","publicKey":"test","timestamp":1234567890,"secret":"your-webhook-secret"}'
```

**Expected:** `{"message":"Handshake tracked"...}` or `{"error":"Config not found"}` (normal if test key)

**5. Common fixes:**
- Wrong WEBHOOK_SECRET in script
- Backend URL unreachable from EC2
- Firewall blocking outbound HTTPS
- Backend not restarted after config changes

---

### Problem: SSH access fails

**Error:**
```
Permission denied (publickey)
```

**Fix:**
```bash
# On EC2, check authorized_keys
sudo cat /home/vpnctl/.ssh/authorized_keys

# Check permissions
sudo ls -la /home/vpnctl/.ssh/

# Should be:
# drwx------ vpnctl vpnctl .ssh
# -rw------- vpnctl vpnctl authorized_keys

# Fix if wrong:
sudo chown -R vpnctl:vpnctl /home/vpnctl/.ssh
sudo chmod 700 /home/vpnctl/.ssh
sudo chmod 600 /home/vpnctl/.ssh/authorized_keys
```

---

### Problem: Config generation fails with 500 error

**Browser console shows:**
```
POST /api/config 500 (Internal Server Error)
```

**Debug:**
```bash
# Check backend logs
docker logs vpn-vpn-back-1 --tail 50

# Look for:
# - SSH connection errors
# - "Command failed" errors
# - Database errors
```

**Common causes:**
1. SSH key mismatch
2. EC2 not reachable from backend
3. `vpnctl-wg.sh` script missing or not executable
4. Database connection issues

---

## 📍 Region Planning

### BASE_IP Allocation

**Plan your subnets carefully!**

Each region needs a **unique** BASE_IP:

| Region | BASE_IP | Subnet | Status |
|--------|---------|--------|--------|
| Tokyo | 10.30.0 | 10.30.0.0/24 | ✅ Active |
| Canada | 10.40.0 | 10.40.0.0/24 | ✅ Active |
| Singapore | 10.50.0 | 10.50.0.0/24 | 🔜 Planned |
| Germany | 10.60.0 | 10.60.0.0/24 | 🔜 Planned |
| USA East | 10.70.0 | 10.70.0.0/24 | 🔜 Planned |
| UK | 10.80.0 | 10.80.0.0/24 | 🔜 Planned |

**Rules:**
- ✅ Use private IP ranges (10.x.x.x)
- ✅ Each region gets /24 (254 usable IPs)
- ✅ Never reuse BASE_IP from deleted regions (causes conflicts)
- ❌ Don't skip numbers (keep sequential for easier management)

---

### Region ID Naming Convention

**Best Practices:**

```
Format: <country-code>-<city>

Examples:
us-newyork    (USA, New York)
ca-toronto    (Canada, Toronto)
uk-london     (UK, London)
de-frankfurt  (Germany, Frankfurt)
sg-singapore  (Singapore)
jp-tokyo      (Japan, Tokyo)
au-sydney     (Australia, Sydney)
in-mumbai     (India, Mumbai)
```

**Rules:**
- Lowercase only
- Use hyphens (not underscores)
- Keep it short (under 20 chars)
- Use ISO country codes (us, ca, uk, etc.)

---

## 🚀 Quick Reference Checklist

### For Each New Region:

- [ ] Launch EC2 with real public IPv4
- [ ] Open ports 22 (SSH) and 51820 (WireGuard)
- [ ] Choose unique BASE_IP
- [ ] Choose unique REGION_ID
- [ ] Upload `setup-vpn-region.sh` to EC2
- [ ] Run script with correct parameters
- [ ] Copy output variables
- [ ] Add variables to VPS `.env` file
- [ ] Update `src/data/regions.js`
- [ ] Restart backend container
- [ ] Test SSH access from backend
- [ ] Test VPN connection end-to-end
- [ ] Verify timer starts and expires correctly
- [ ] Monitor logs for any errors

**Time per region:** ~10 minutes (after first one)

---

## 📞 Support Commands

### On EC2 (Region Server)

```bash
# Check WireGuard status
sudo wg show wg0

# Check services
sudo systemctl status wg-quick@wg0
sudo systemctl status wg-monitor
sudo systemctl status wg-expiry

# View logs
sudo journalctl -u wg-monitor -f
sudo journalctl -u wg-expiry -f

# Manual peer management
sudo /usr/local/bin/vpnctl-wg.sh dump
sudo /usr/local/bin/vpnctl-wg.sh add-peer <pubkey> <ip>/32
sudo /usr/local/bin/vpnctl-wg.sh remove-peer <pubkey>

# Restart services
sudo systemctl restart wg-quick@wg0
sudo systemctl restart wg-monitor wg-expiry
```

### On Backend VPS

```bash
# View backend logs
docker logs vpn-vpn-back-1 -f

# Restart backend
docker-compose restart vpn-back

# Test SSH to region
ssh -i vpnctl_ed25519 vpnctl@<REGION-IP> 'sudo /usr/local/bin/vpnctl-wg.sh dump'

# Check database
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db
```

---

## 🎯 Next Steps

After setting up your first few regions:

1. **Monitor costs** (AWS billing dashboard)
2. **Set up CloudWatch alarms** (CPU, bandwidth)
3. **Document your regions** (spreadsheet of IPs, IDs, costs)
4. **Plan capacity** (how many users per region?)
5. **Consider auto-scaling** (spin up regions on demand)

---

## 📚 Additional Resources

- **WireGuard Docs:** https://www.wireguard.com/
- **AWS EC2 Pricing:** https://aws.amazon.com/ec2/pricing/
- **DigitalOcean Droplets:** https://www.digitalocean.com/pricing
- **Linode Pricing:** https://www.linode.com/pricing/

---

**Last Updated:** February 8, 2026
**Version:** 1.0

**Questions?** Check the troubleshooting section or review backend logs!

🎉 **Happy Region Building!**
