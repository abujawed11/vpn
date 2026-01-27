import express from "express";
import { REGIONS } from "../data/regions.js";
import { genWgKeypair } from "../lib/wgKeys.js";
import { loadPrivateKey, execSsh } from "../lib/ssh.js";
import { pickFreeIpFromDump } from "../lib/ipAlloc.js";
import { authenticateToken } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

const router = express.Router();

// Protected route - requires JWT
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { regionId } = req.body;
    const userId = req.user.userId;

    const region = REGIONS.find((r) => r.id === regionId);
    if (!region) return res.status(400).json({ error: "Invalid regionId" });

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
      // Return existing config
      const conf = generateConfigFile(
        existingConfig.privateKey,
        existingConfig.ip,
        region
      );

      res.setHeader("Content-Type", "text/plain");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="myvpn-${regionId}.conf"`
      );
      return res.send(conf);
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
      },
      create: {
        userId,
        regionId,
        publicKey: pub,
        privateKey: priv,
        ip,
      },
    });

    // 5) return config file
    const conf = generateConfigFile(priv, ip, region);

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

// Get user's active configs
router.get("/my-configs", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

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
        expiresAt: true,
      },
    });

    // Enrich with region names
    const enrichedConfigs = configs.map((config) => {
      const region = REGIONS.find((r) => r.id === config.regionId);
      return {
        ...config,
        regionName: region?.name || config.regionId,
      };
    });

    res.json({ configs: enrichedConfigs });
  } catch (e) {
    console.error("GET CONFIGS ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

function generateConfigFile(privateKey, ip, region) {
  return `[Interface]
PrivateKey = ${privateKey}
Address = ${ip}/32
DNS = ${region.dns}

[Peer]
PublicKey = ${region.serverPublicKey}
Endpoint = ${region.endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
}

export default router;
