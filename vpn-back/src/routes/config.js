import express from "express";
import { REGIONS } from "../data/regions.js";
import { genWgKeypair } from "../lib/wgKeys.js";
import { loadPrivateKey, execSsh } from "../lib/ssh.js";
import { pickFreeIpFromDump } from "../lib/ipAlloc.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { regionId } = req.body;
        const region = REGIONS.find(r => r.id === regionId);
        if (!region) return res.status(400).json({ error: "Invalid regionId" });

        const username = process.env.SSH_USER || "vpnctl";
        const privateKey = loadPrivateKey();
        const wgIface = process.env.WG_IFACE || "wg0";

        // 1) client keypair
        const { priv, pub } = await genWgKeypair();

        // 2) dump to allocate IP
        const dump = await execSsh(
            { host: region.host, username, privateKey },
            `sudo /usr/local/bin/vpnctl-wg.sh dump`
        );

        const ip = pickFreeIpFromDump(region.baseIp, dump);

        // 3) add peer
        await execSsh(
            { host: region.host, username, privateKey },
            `sudo /usr/local/bin/vpnctl-wg.sh add-peer ${pub} ${ip}/32`
        );

        // 4) return config file
        const conf = `[Interface]
PrivateKey = ${priv}
Address = ${ip}/32
DNS = ${region.dns}

[Peer]
PublicKey = ${region.serverPublicKey}
Endpoint = ${region.endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="myvpn-${regionId}.conf"`);
        res.send(conf);
    } catch (e) {
        console.error("CONFIG ERROR:", e);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

export default router;
