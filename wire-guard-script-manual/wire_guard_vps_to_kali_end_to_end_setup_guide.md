# WireGuard VPS → Kali (End‑to‑End Setup)

This document explains **everything we did**, step by step, to set up a **WireGuard VPN server on AWS EC2** and use the generated `kali.conf` file on your **Kali Linux machine**, using **WSL Ubuntu** as the bridge.

It is written so that you can **reproduce the setup from scratch** without guessing.

---

## 1. Architecture Overview

```
Kali Linux  ── WireGuard ──▶  AWS EC2 (VPS)
                                ▲
                                │
                         WSL Ubuntu (SSH + SCP)
```

- **AWS EC2** hosts the WireGuard **server**
- **Kali Linux** is the WireGuard **client**
- **WSL Ubuntu** is used to:
  - SSH into EC2
  - Download the client `.conf`
  - Copy it into Windows / Kali

---

## 2. Critical Requirement: Real Public IPv4

WireGuard **requires inbound UDP**.

If your EC2 public IP looks like this:
```
100.x.x.x
```

That is **CGNAT (100.64.0.0/10)** and **WireGuard will NOT work**.

### ✅ You MUST have one of the following:
- Elastic IP attached to EC2 (**recommended**)
- OR EC2 launched with **Auto‑assign public IPv4 = ENABLED**

Verify on EC2:
```bash
curl -4 icanhazip.com
```

Valid public IP examples:
```
3.x.x.x
13.x.x.x
18.x.x.x
34.x.x.x
52.x.x.x
54.x.x.x
```

---

## 3. Files & Paths Used

### On EC2 (VPS)

| Purpose | Path |
|------|-----|
| Server config | `/etc/wireguard/wg0.conf` |
| Server private key | `/etc/wireguard/server.key` |
| Server public key | `/etc/wireguard/server.pub` |
| Client config (root) | `/etc/wireguard/clients/kali.conf` |
| Client config (export) | `/home/ubuntu/kali.conf` |

### On Local / WSL

| Purpose | Path |
|------|-----|
| Downloaded client config | `~/kali.conf` |

### On Kali

| Purpose | Path |
|------|-----|
| WireGuard client config | `/etc/wireguard/wg0.conf` |

---

## 4. WireGuard Auto Setup Script (What It Does)

Your final `wg-auto-setup.sh` script:

- Detects outbound network interface
- Detects public IPv4 (AWS metadata → fallback)
- Installs WireGuard, iptables, ufw
- Enables IPv4 forwarding
- Generates **server keys**
- Generates **client keys (kali)**
- Writes:
  - `/etc/wireguard/wg0.conf`
  - `/etc/wireguard/clients/kali.conf`
- Starts WireGuard (`wg-quick@wg0`)
- Enables firewall rules
- **Exports client config to `/home/ubuntu/kali.conf`**

This makes the file downloadable **without sudo**.

---

## 5. Run the Script on EC2

SSH into EC2 from WSL:
```bash
ssh -i ~/.ssh/us-east-key.pem ubuntu@<EC2_PUBLIC_IP>
```

Run the script:
```bash
sudo ./wg-auto-setup.sh
```

Verify files exist:
```bash
sudo ls -l /etc/wireguard
sudo ls -l /etc/wireguard/clients
ls -l /home/ubuntu/kali.conf
```

---

## 6. Download `kali.conf` to WSL

From **WSL Ubuntu (local machine)**:

```bash
scp -i ~/.ssh/us-east-key.pem ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/kali.conf .
```

You should now have:
```bash
ls
kali.conf
```

---

## 7. Copy `kali.conf` from WSL → Windows

From WSL:

```bash
cp ~/kali.conf /mnt/d/aws
```

Now the file is available in **Windows Explorer → Downloads**.

---

## 8. Use `kali.conf` on Kali Linux

### Step 1: Move config into place

On Kali:
```bash
sudo mv kali.conf /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf
```

### Step 2: Bring VPN up

```bash
sudo wg-quick up wg0
```

### Step 3: Verify

```bash
wg
curl ifconfig.me
```

Expected:
- `latest handshake: X seconds ago`
- Public IP = **EC2 public IP**

---

## 9. Common Errors & Fixes

### ❌ `Operation not permitted` when running `wg`

Run with sudo:
```bash
sudo wg
```

---

### ❌ `scp: No such file or directory`

Cause:
- File is root‑owned and unreadable by `ubuntu`

Fix (already automated):
- Exported to `/home/ubuntu/kali.conf`

---

### ❌ WireGuard connects but no internet

Check:
- `AllowedIPs = 0.0.0.0/0`
- NAT rules exist
- `net.ipv4.ip_forward = 1`

---

### ❌ No handshake at all

Almost always means:
- EC2 has **CGNAT IP (100.x)**
- No Elastic IP attached

---

## 10. Security Notes (Important)

- Client private keys are **never world-readable**
- Exported config is permission‑restricted (`600`)
- Do NOT `chmod 644` WireGuard configs
- Delete `/home/ubuntu/kali.conf` after downloading if desired

---

## 11. What You Can Add Next (Optional)

- Multiple clients (`phone`, `laptop`, `tablet`)
- Client revocation
- Split tunnel mode
- IPv6 WireGuard (no Elastic IP required)
- QR code generation

---

## 12. Final Summary

✔ Server setup automated
✔ Client config generated automatically
✔ Safe export for SCP
✔ Works with WSL → Windows → Kali
✔ Only external requirement: **real public IPv4**

This is a **production‑grade WireGuard bootstrap workflow**.

---

**End of document.**

