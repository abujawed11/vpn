import { Router } from "express";
import prisma from "../lib/prisma.js";
import { loadPrivateKey, execSsh } from "../lib/ssh.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import fs from "fs";
import path from "path";

const router = Router();

// POST /run-automation - SSH and setup a new server
router.post("/run-automation", authenticateToken, isAdmin, async (req, res) => {
  const { host, username, password, baseIp, regionId } = req.body;

  if (!host || !username || !baseIp || !regionId) {
    return res.status(400).json({ error: "Missing required fields (host, username, baseIp, regionId)" });
  }

  try {
    let privateKey = null;
    try {
        privateKey = loadPrivateKey();
    } catch (e) {
        if (!password) throw new Error("Neither SSH Key nor Password provided");
    }

    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // Define __dirname for ES modules
    const __filename = new URL(import.meta.url).pathname;
    const __dirname = path.dirname(__filename);

    // 1. Read the setup script from the src/scripts folder
    // Since this file is in src/routes, we go up one level to src, then to scripts
    // Wait, import.meta.url returns file:///... so pathname might have leading slash issues on Windows?
    // A safer way in Node 20+ / ES Modules:
    
    // Let's use process.cwd() as a reliable anchor if we assume standard structure
    // Inside Docker /app is workdir. So /app/src/scripts/remote-install.sh
    // Locally (if run from vpn-back): src/scripts/remote-install.sh
    
    const scriptPath = path.resolve(process.cwd(), "src", "scripts", "remote-install.sh");
    
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Setup script not found at ${scriptPath}`);
    }
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    console.log(`🚀 Starting automation for ${regionId} at ${host}...`);

    // 2. Prepare the command to upload and run
    // Use base64 encoding to safely transfer the script without heredoc issues
    const remoteScriptPath = "/tmp/setup-vpn.sh";
    const scriptBase64 = Buffer.from(scriptContent).toString('base64');

    const commands = [
        `echo '${scriptBase64}' | base64 -d > ${remoteScriptPath}`,
        `chmod +x ${remoteScriptPath}`,
        `sudo bash ${remoteScriptPath} "${baseIp}" "${regionId}" "${backendUrl}" "${webhookSecret}"`,
        `rm ${remoteScriptPath}`
    ].join(" && ");

    // 3. Execute SSH (Wait for it to finish)
    const output = await execSsh({ host, username, privateKey, password }, commands);

    console.log(`✅ Automation finished for ${regionId}`);
    res.json({ success: true, output });

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
