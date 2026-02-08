import express from "express";
import prisma from "../lib/prisma.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const regions = await prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
    res.json(regions);
  } catch (error) {
    console.error("Error fetching regions:", error);
    res.status(500).json({ error: "Failed to fetch regions" });
  }
});

export default router;
