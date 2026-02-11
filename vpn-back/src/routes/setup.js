import { Router } from "express";
import prisma from "../lib/prisma.js";
import { loadPrivateKey, execSsh, execSshStream } from "../lib/ssh.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import fs from "fs";
import path from "path";

const router = Router();

// POST /run-automation - SSH and setup a new server (with real-time logs)
router.post("/run-automation", authenticateToken, isAdmin, async (req, res) => {
  const { host, username, password, sshKey, baseIp, regionId } = req.body;
  const userId = req.user.userId;

  if (!host || !username || !baseIp || !regionId) {
    return res.status(400).json({ error: "Missing required fields (host, username, baseIp, regionId)" });
  }

  try {
    let privateKey = null;

    // Priority: uploaded key > backend key > password
    if (sshKey) {
      privateKey = sshKey; // Use uploaded key from request
      console.log("Using uploaded SSH key");
    } else {
      try {
        privateKey = loadPrivateKey(); // Try backend's default key
        console.log("Using backend's default SSH key");
      } catch (e) {
        if (!password) {
          throw new Error("No SSH key or password provided. Upload a .pem file or provide a password.");
        }
        console.log("Using password authentication");
      }
    }

    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    const scriptPath = path.resolve(process.cwd(), "src", "scripts", "remote-install.sh");

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Setup script not found at ${scriptPath}`);
    }
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    console.log(`🚀 Starting automation for ${regionId} at ${host}...`);

    // Get Socket.io instance
    const io = req.app.get("io");

    // Return immediately - process will run in background
    res.json({ success: true, message: "Setup started. Watch logs in real-time." });

    // Emit initial log
    if (io) {
      io.to(`user:${userId}`).emit("setup:log", {
        type: "info",
        message: `🚀 Starting automation for ${regionId} at ${host}...`,
        regionId
      });
    }

    // Prepare the command to upload and run
    const remoteScriptPath = "/tmp/setup-vpn.sh";
    const scriptBase64 = Buffer.from(scriptContent).toString('base64');

    const commands = [
        `echo '${scriptBase64}' | base64 -d > ${remoteScriptPath}`,
        `chmod +x ${remoteScriptPath}`,
        `sudo bash ${remoteScriptPath} "${baseIp}" "${regionId}" "${backendUrl}" "${webhookSecret}"`,
        `rm ${remoteScriptPath}`
    ].join(" && ");

    // Execute SSH with streaming (in background)
    execSshStream(
      { host, username, privateKey, password },
      commands,
      // onData callback - emit logs in real-time
      (data) => {
        if (io) {
          io.to(`user:${userId}`).emit("setup:log", { ...data, regionId });
        }
      },
      // onError callback
      (error) => {
        if (io) {
          io.to(`user:${userId}`).emit("setup:error", {
            message: error.message,
            regionId
          });
        }
      }
    ).then(async (output) => {
      console.log(`✅ Automation finished for ${regionId}`);

      // Extract server public key from output if available
      const pubkeyMatch = output.match(/Server Pubkey:\s+([A-Za-z0-9+/=]+)/);
      const publicIpMatch = output.match(/Public IP:\s+([\d.]+)/);

      const serverPublicKey = pubkeyMatch ? pubkeyMatch[1] : null;
      const publicIp = publicIpMatch ? publicIpMatch[1] : null;

      // Register region with backend (from admin panel, not from droplet)
      if (serverPublicKey && publicIp) {
        try {
          const region = await prisma.region.upsert({
            where: { id: regionId },
            update: {
              name: regionId,
              host: publicIp,
              endpoint: `${publicIp}:51820`,
              serverPublicKey,
              baseIp,
              dns: "1.1.1.1",
              isActive: true,
            },
            create: {
              id: regionId,
              name: regionId,
              host: publicIp,
              endpoint: `${publicIp}:51820`,
              serverPublicKey,
              baseIp,
              dns: "1.1.1.1",
              isActive: true,
            },
          });

          console.log(`✅ Region '${regionId}' registered in database`);

          if (io) {
            io.to(`user:${userId}`).emit("setup:complete", {
              message: `✅ Setup completed and region registered! ${regionId} is ready.`,
              regionId,
              serverPublicKey,
              publicIp,
              registered: true
            });
          }
        } catch (regErr) {
          console.error("Failed to register region:", regErr);
          if (io) {
            io.to(`user:${userId}`).emit("setup:complete", {
              message: `✅ Setup completed but failed to register region. Please add manually.`,
              regionId,
              serverPublicKey,
              publicIp,
              registered: false,
              error: regErr.message
            });
          }
        }
      } else {
        if (io) {
          io.to(`user:${userId}`).emit("setup:complete", {
            message: `✅ Setup completed! Region ${regionId} is ready.`,
            regionId,
            serverPublicKey,
            publicIp,
            registered: false
          });
        }
      }
    }).catch((err) => {
      console.error("Automation error:", err);
      if (io) {
        io.to(`user:${userId}`).emit("setup:error", {
          message: err.message,
          regionId
        });
      }
    });

  } catch (err) {
    console.error("Automation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/setup/register-region
router.post("/register-region", async (req, res) => {
  try {
    const { id, name, host, endpoint, serverPublicKey, baseIp, dns, secret } = req.body;

    // Validate Secret
    // We reuse WEBHOOK_SECRET for simplicity, as it's already used for server-to-server trust
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
      console.warn(`Unauthorized registration attempt for region ${id}`);
      return res.status(403).json({ error: "Invalid registration secret" });
    }

    // Basic validation
    if (!id || !host || !endpoint || !serverPublicKey || !baseIp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const region = await prisma.region.upsert({
      where: { id },
      update: {
        name: name || id,
        host,
        endpoint,
        serverPublicKey,
        baseIp,
        dns: dns || "1.1.1.1",
        isActive: true,
      },
      create: {
        id,
        name: name || id,
        host,
        endpoint,
        serverPublicKey,
        baseIp,
        dns: dns || "1.1.1.1",
        isActive: true,
      },
    });
    
    console.log(`✅ Region '${id}' auto-registered via setup script.`);
    res.status(201).json({ success: true, region });
  } catch (err) {
    console.error("Auto-registration error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
