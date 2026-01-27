import express from "express";
import prisma from "../lib/prisma.js";

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your-webhook-secret";
const FREE_SESSION_MINUTES = parseInt(process.env.FREE_SESSION_MINUTES) || 5;

// POST /api/webhook/handshake
// Called by VPN servers when a new handshake is detected
router.post("/handshake", async (req, res) => {
  try {
    const { regionId, publicKey, timestamp, secret } = req.body;

    // Verify webhook secret
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    if (!regionId || !publicKey || !timestamp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the config by publicKey and regionId
    const config = await prisma.vpnConfig.findFirst({
      where: {
        publicKey,
        regionId,
        isActive: true,
      },
      include: {
        user: {
          select: { plan: true },
        },
      },
    });

    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }

    // If already has a handshake, ignore (timer already started)
    if (config.firstHandshakeAt) {
      return res.json({ message: "Already tracked", expiresAt: config.expiresAt });
    }

    // Calculate session duration based on user plan
    const sessionMinutes = config.user.plan === "paid" ? 60 : FREE_SESSION_MINUTES;

    // Set first handshake and expiry time
    const handshakeTime = new Date(timestamp * 1000);
    const expiresAt = new Date(handshakeTime.getTime() + sessionMinutes * 60 * 1000);

    await prisma.vpnConfig.update({
      where: { id: config.id },
      data: {
        firstHandshakeAt: handshakeTime,
        expiresAt,
      },
    });

    console.log(`Handshake tracked: ${publicKey.substring(0, 8)}... expires at ${expiresAt.toISOString()}`);

    res.json({
      message: "Handshake tracked",
      expiresAt: expiresAt.toISOString(),
      sessionMinutes,
    });
  } catch (err) {
    console.error("Webhook handshake error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/webhook/check-expiry
// Called by VPN servers to get list of expired peers to remove
router.post("/check-expiry", async (req, res) => {
  try {
    const { regionId, secret } = req.body;

    // Verify webhook secret
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    if (!regionId) {
      return res.status(400).json({ error: "Missing regionId" });
    }

    // Find expired configs for this region
    const expiredConfigs = await prisma.vpnConfig.findMany({
      where: {
        regionId,
        isActive: true,
        expiresAt: {
          lt: new Date(),
        },
      },
      select: {
        publicKey: true,
      },
    });

    const expiredPeers = expiredConfigs.map((c) => c.publicKey);

    res.json({ expiredPeers });
  } catch (err) {
    console.error("Webhook check-expiry error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/webhook/expired
// Called by VPN servers when a peer is removed due to expiry
router.post("/expired", async (req, res) => {
  try {
    const { regionId, publicKey, secret } = req.body;

    // Verify webhook secret
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    if (!regionId || !publicKey) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Mark config as inactive
    await prisma.vpnConfig.updateMany({
      where: {
        publicKey,
        regionId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    console.log(`Config expired: ${publicKey.substring(0, 8)}... in ${regionId}`);

    res.json({ message: "Config marked as expired" });
  } catch (err) {
    console.error("Webhook expired error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
