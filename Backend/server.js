import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";

// load environment variables from workspace root if present
import dotenv from "dotenv";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
console.log("ℹ️ loading env from", envPath);
dotenv.config({ path: envPath });

// Fail fast if required secrets are missing
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

import { Server } from "socket.io";
import songRouter from "./src/routes/songRouter.js";
import connectDB from "./src/config/mongodb.js";
import connectCloudinary from "./src/config/cloudinary.js";
import connectRedis from "./src/config/redis.js";
import albumRouter from "./src/routes/albumRouter.js";
import playlistRouter from "./src/routes/playlistRouter.js";
import authRouter from "./src/routes/authRoutes.js";
import adminRouter from "./src/routes/adminRouter.js";

// Import models to ensure they're registered before routes
import "./src/models/songModel.js";
import "./src/models/albumModel.js";
import "./src/models/playlistModel.js";
import "./src/models/userModel.js";

// App config
const app = express();
const port = parseInt(process.env.PORT) || 4000; // FIX: Parse as integer

// Connect to databases
connectDB();
connectCloudinary();
connectRedis().catch((err) => console.warn("Redis init:", err.message));

// Middlewares
app.use(express.json());
app.use(cors());

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const mongoose = await import("mongoose");
    const dbStatus =
      mongoose.default.connection.readyState === 1
        ? "Connected"
        : "Disconnected";

    res.json({
      status: "OK",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      models: Object.keys(mongoose.default.models),
    });
  } catch (error) {
    res.status(500).json({
      status: "Error",
      error: error.message,
    });
  }
});

// API routes
app.use("/api/auth", authRouter);
app.use("/api/song", songRouter);
app.use("/api/album", albumRouter);
app.use("/api/playlist", playlistRouter);
app.use("/api/admin", adminRouter);

// Serve frontend (SPA) from built dist folder

// Resolve a usable frontend path in this priority order:
// 1) FRONTEND_DIST env var
// 2) Backend/client-dist (copied during build)
// 3) ../Music Web Application/dist (monorepo sibling)
const CANDIDATE_FRONTEND_PATHS = [
  process.env.FRONTEND_DIST && path.resolve(process.env.FRONTEND_DIST),
  path.resolve(__dirname, "client-dist"),
  path.resolve(__dirname, "../Music Web Application/dist"),
].filter(Boolean);

let resolvedFrontendPath = null;
for (const p of CANDIDATE_FRONTEND_PATHS) {
  try {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      resolvedFrontendPath = p;
      break;
    }
  } catch {}
}

if (resolvedFrontendPath) {
  console.log("🗂️ Serving static frontend from:", resolvedFrontendPath);
  app.use(express.static(resolvedFrontendPath));
  // SPA fallback (after API routes) using regex to exclude /api (Express 5 safe)
  app.get(/^\/(?!api)(.*)/, (req, res) => {
    res.sendFile(path.join(resolvedFrontendPath, "index.html"));
  });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ Frontend build not found. Set FRONTEND_DIST or run 'npm run build:client' from the Backend folder to copy the client dist.",
  );
} else {
  // in development we don't require a build, frontend runs separately
  console.log(
    "ℹ️ Frontend static not configured; run the React dev server instead.",
  );
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
  pingTimeout: 60000,
});
app.set("io", io);

const activeSockets = new Set();
app.set("activeSockets", activeSockets);

io.on("connection", (socket) => {
  socket.on("user_started_listening", () => {
    activeSockets.add(socket.id);
    io.emit("users_listening", activeSockets.size);
  });

  socket.on("user_stopped_listening", () => {
    activeSockets.delete(socket.id);
    io.emit("users_listening", activeSockets.size);
  });

  socket.on("disconnect", () => {
    activeSockets.delete(socket.id);
    io.emit("users_listening", activeSockets.size);
  });
});

// Start server on the configured port — fail fast if port is already in use
server.listen(port, () => {
  console.log(`✅ Server listening on localhost:${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use. Set a different PORT env var or free the port.`);
  } else {
    console.error("❌ Server error:", err);
  }
  process.exit(1);
});
