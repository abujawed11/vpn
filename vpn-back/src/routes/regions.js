import express from "express";
import { REGIONS } from "../data/regions.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(REGIONS.map(({ id, name }) => ({ id, name })));
});

export default router;
