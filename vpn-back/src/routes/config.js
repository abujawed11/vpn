import express from "express";
import { genWgKeypair } from "../lib/wgKeys.js";
import { loadPrivateKey, execSsh } from "../lib/ssh.js";
import { pickFreeIpFromDump } from "../lib/ipAlloc.js";
import { authenticateToken } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

const router = express.Router();

const FREE_MAX_REGIONS = parseInt(process.env.FREE_MAX_REGIONS) || 2;

// Helper to calculate config status
function getConfigStatus(config) {
  const now = new Date();

  if (!config.firstHandshakeAt) {
    return {
      status: "pending",
      remainingMinutes: null,
      message: "Connect VPN to start timer",
      isUnlimited: config.customDuration === 0,
    };
  }

  // Check if unlimited session (expiresAt is null)
  if (!config.expiresAt) {
    return {
      status: "active",
      remainingMinutes: null,
      message: "Unlimited session",
      isUnlimited: true,
    };
  }

  if (new Date(config.expiresAt) > now) {
    const remaining = Math.ceil((new Date(config.expiresAt) - now) / 60000);
    return {
      status: "active",
      remainingMinutes: remaining,
      message: `${remaining} min remaining`,
      isUnlimited: false,
    };
  }

  return {
    status: "expired",
    remainingMinutes: 0,
    message: "Expired",
    isUnlimited: false,
  };
}

// Protected route - requires JWT
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { regionId, customDuration, adBlockEnabled } = req.body; // admin only features
    const userId = req.user.userId;

    // Load region from database
    const region = await prisma.region.findUnique({
      where: { id: regionId, isActive: true },
    });
    if (!region) return res.status(400).json({ error: "Invalid regionId" });

    // Get user with plan info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    // Check if user already has a config for this region
    const existingConfig = await prisma.vpnConfig.findUnique({
      where: {
        userId_regionId: {
          userId,
          regionId,
        },
      },
    });

    if (existingConfig && existingConfig.isActive) {
      // Check if expired
      const status = getConfigStatus(existingConfig);
      if (status.status === "expired") {
        // Mark as inactive so user can generate new one
        await prisma.vpnConfig.update({
          where: { id: existingConfig.id },
          data: { isActive: false },
        });
      } else {
        // Return existing config
        const conf = generateConfigFile(
          existingConfig.privateKey,
          existingConfig.ip,
          region,
          existingConfig.adBlockEnabled
        );

        res.setHeader("Content-Type", "text/plain");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="myvpn-${regionId}.conf"`
        );
        return res.send(conf);
      }
    }

    // Check region limit for free users
    if (user.plan === "free") {
      const activeConfigsCount = await prisma.vpnConfig.count({
        where: {
          userId,
          isActive: true,
        },
      });

      if (activeConfigsCount >= FREE_MAX_REGIONS) {
        return res.status(403).json({
          error: `Free plan allows max ${FREE_MAX_REGIONS} regions. Upgrade to add more.`,
        });
      }
    }

    // Generate new config
    const username = process.env.SSH_USER || "vpnctl";
    const privateKey = loadPrivateKey();

    // 1) client keypair
    const { priv, pub } = await genWgKeypair();

    // 2) dump to allocate IP
    const dump = await execSsh(
      { host: region.host, username, privateKey },
      `sudo /usr/local/bin/vpnctl-wg.sh dump`
    );

    const ip = pickFreeIpFromDump(region.baseIp, dump);

    // 3) add peer on WireGuard server
    await execSsh(
      { host: region.host, username, privateKey },
      `sudo /usr/local/bin/vpnctl-wg.sh add-peer ${pub} ${ip}/32`
    );

    // 4) Save config to database
    // Get user info to check if admin
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    // Only admins can set custom duration and ad-blocking
    const durationToSet = (currentUser?.role === 'admin' && customDuration) ? customDuration : null;
    const adBlockToSet = (currentUser?.role === 'admin' && adBlockEnabled) ? true : false;

    await prisma.vpnConfig.upsert({
      where: {
        userId_regionId: {
          userId,
          regionId,
        },
      },
      update: {
        publicKey: pub,
        privateKey: priv,
        ip,
        isActive: true,
        firstHandshakeAt: null,
        expiresAt: null,
        customDuration: durationToSet,
        adBlockEnabled: adBlockToSet,
      },
      create: {
        userId,
        regionId,
        publicKey: pub,
        privateKey: priv,
        ip,
        customDuration: durationToSet,
        adBlockEnabled: adBlockToSet,
      },
    });

    // 5) return config file
    const conf = generateConfigFile(priv, ip, region, adBlockToSet);

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="myvpn-${regionId}.conf"`
    );
    res.send(conf);
  } catch (e) {
    console.error("CONFIG ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get user's active configs with status
router.get("/my-configs", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user plan
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const configs = await prisma.vpnConfig.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        regionId: true,
        ip: true,
        createdAt: true,
        firstHandshakeAt: true,
        expiresAt: true,
        customDuration: true,
        adBlockEnabled: true,
      },
    });

    // Load all active regions
    const regions = await prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const regionMap = Object.fromEntries(
      regions.map(r => [r.id, r.name])
    );

    // Enrich with region names and status
    const enrichedConfigs = configs.map((config) => {
      const statusInfo = getConfigStatus(config);

      return {
        ...config,
        regionName: regionMap[config.regionId] || config.regionId,
        ...statusInfo,
      };
    });

    res.json({
      configs: enrichedConfigs,
      plan: user.plan,
      maxRegions: user.plan === "free" ? FREE_MAX_REGIONS : null,
    });
  } catch (e) {
    console.error("GET CONFIGS ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/config/:regionId - Delete a user's config for a region
router.delete("/:regionId", authenticateToken, async (req, res) => {
  try {
    const { regionId } = req.params;
    const userId = req.user.userId;

    // Find the config
    const config = await prisma.vpnConfig.findUnique({
      where: {
        userId_regionId: {
          userId,
          regionId,
        },
      },
    });

    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }

    // Delete from database
    await prisma.vpnConfig.delete({
      where: {
        userId_regionId: {
          userId,
          regionId,
        },
      },
    });

    console.log(`Config deleted: user=${userId}, region=${regionId}`);
    res.json({ success: true, message: "Config deleted successfully" });
  } catch (e) {
    console.error("DELETE CONFIG ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

function generateConfigFile(privateKey, ip, region, adBlockEnabled = false) {
  // Use AdGuard DNS for ad-blocking, otherwise use region's default DNS
  const dns = adBlockEnabled ? '94.140.14.14' : region.dns;

  return `[Interface]
PrivateKey = ${privateKey}
Address = ${ip}/32
DNS = ${dns}

[Peer]
PublicKey = ${region.serverPublicKey}
Endpoint = ${region.endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
}

export default router;
