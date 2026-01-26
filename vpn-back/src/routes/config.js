import express from "express";
import crypto from "crypto";
import { REGIONS } from "../data/regions.js";

const router = express.Router();

function fakeKey() {
  return crypto.randomBytes(32).toString("base64");
}

function allocateFakeIp(regionId) {
  const last = 10 + Math.floor(Math.random() * 240);
  const base =
    regionId === "in-mumbai" ? "10.66.10." :
    regionId === "sg-singapore" ? "10.66.20." :
    "10.66.30.";
  return `${base}${last}`;
}

router.post("/", (req, res) => {
  const { regionId } = req.body;
  const region = REGIONS.find(r => r.id === regionId);
  if (!region) return res.status(400).json({ error: "Invalid regionId" });

  const clientPrivateKey = fakeKey();
  const clientAddress = allocateFakeIp(regionId);

  const conf = `[Interface]
PrivateKey = ${clientPrivateKey}
Address = ${clientAddress}/32
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
});

export default router;
