import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";

import regionsRoute from "./routes/regions.js";
import configRoute from "./routes/config.js";
import authRoute from "./routes/auth.js";
import webhookRoute from "./routes/webhook.js";

dotenv.config();

const app = express();
app.use(morgan("dev"));
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) ?? "*" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoute);
app.use("/api/regions", regionsRoute);
app.use("/api/config", configRoute);
app.use("/api/webhook", webhookRoute);

const port = process.env.PORT || 5050;
app.listen(port, () => console.log(`vpn-back listening on :${port}`));
