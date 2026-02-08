import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import jwt from "jsonwebtoken";

import regionsRoute from "./routes/regions.js";
import configRoute from "./routes/config.js";
import authRoute from "./routes/auth.js";
import webhookRoute from "./routes/webhook.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) ?? "*",
    credentials: true,
  },
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.userId}`);

  // Join user-specific room
  socket.join(`user:${socket.userId}`);

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Make io available to routes
app.set("io", io);

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
app.options(/.*/, cors(corsOptions)); // Handle preflight requests

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoute);
app.use("/api/regions", regionsRoute);
app.use("/api/config", configRoute);
app.use("/api/webhook", webhookRoute);

const port = process.env.PORT || 5050;
httpServer.listen(port, () => console.log(`vpn-back listening on :${port} with WebSocket support`));
