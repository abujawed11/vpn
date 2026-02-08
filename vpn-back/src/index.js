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

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) ?? "*",
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoute);
app.use("/api/regions", regionsRoute);
app.use("/api/config", configRoute);
app.use("/api/webhook", webhookRoute);

const port = process.env.PORT || 5050;
app.listen(port, () => console.log(`vpn-back listening on :${port}`));
