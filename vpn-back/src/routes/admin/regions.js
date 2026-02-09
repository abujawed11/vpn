import { Router } from "express";
import prisma from "../../lib/prisma.js";

const router = Router();

// GET / - List all regions (including disabled ones)
router.get("/", async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - Create a new region
router.post("/", async (req, res) => {
  try {
    const { id, name, host, endpoint, serverPublicKey, baseIp, dns, isActive } = req.body;
    
    // Basic validation
    if (!id || !name || !host || !endpoint || !serverPublicKey || !baseIp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const region = await prisma.region.create({
      data: { 
        id, 
        name, 
        host, 
        endpoint, 
        serverPublicKey, 
        baseIp, 
        dns: dns || "1.1.1.1", 
        isActive: isActive !== undefined ? isActive : true 
      },
    });
    res.status(201).json(region);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: "Region ID already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - Update a region
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, host, endpoint, serverPublicKey, baseIp, dns, isActive } = req.body;
    
    const region = await prisma.region.update({
      where: { id },
      data: {
        name,
        host,
        endpoint,
        serverPublicKey,
        baseIp,
        dns,
        isActive
      },
    });
    res.json(region);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - Delete a region
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.region.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
