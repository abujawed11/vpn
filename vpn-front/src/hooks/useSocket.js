import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:5050";

export function useSocket(token, callbacks = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    // Connect to WebSocket
    const socket = io(API, {
      auth: {
        token,
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ WebSocket connected");
      callbacks.onConnect?.();
    });

    socket.on("disconnect", () => {
      console.log("❌ WebSocket disconnected");
      callbacks.onDisconnect?.();
    });

    socket.on("connect_error", (error) => {
      console.error("WebSocket connection error:", error);
    });

    // Timer events
    socket.on("timer:started", (data) => {
      console.log("⏱️ Timer started:", data);
      callbacks.onTimerStarted?.(data);
    });

    socket.on("timer:expired", (data) => {
      console.log("⏰ Timer expired:", data);
      callbacks.onTimerExpired?.(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return socketRef;
}
