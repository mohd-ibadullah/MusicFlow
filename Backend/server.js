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

// Test routes
app.get("/api/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Backend is working!",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/test-upload", (req, res) => {
  console.log("Test upload received:", req.body);
  res.json({ 
    success: true, 
    message: "Upload endpoint is reachable",
    received: req.body 
  });
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const mongoose = await import("mongoose");
    const dbStatus = mongoose.default.connection.readyState === 1 ? "Connected" : "Disconnected";
    
    res.json({ 
      status: "OK", 
      database: dbStatus,
      timestamp: new Date().toISOString(),
      models: Object.keys(mongoose.default.models)
    });
  } catch (error) {
    res.status(500).json({ 
      status: "Error", 
      error: error.message 
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
} else if (process.env.NODE_ENV === 'production') {
  console.warn("⚠️ Frontend build not found. Set FRONTEND_DIST or run 'npm run build:client' from the Backend folder to copy the client dist.");
} else {
  // in development we don't require a build, frontend runs separately
  console.log("ℹ️ Frontend static not configured; run the React dev server instead.");
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: "Route not found" 
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
  pingTimeout: 60000,
});
app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join_listening", (data) => {
    if (data?.room) socket.join(data.room);
  });
  socket.on("disconnect", () => {});
});

// Function to find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
};

// Start server with automatic port selection
findAvailablePort(port)
  .then((availablePort) => {
    server.listen(availablePort, () => {
      console.log(`✅ Server listening on localhost:${availablePort}`);
      if (availablePort !== port) {
        console.log(`ℹ️ Port ${port} was in use, using ${availablePort} instead`);
      }
    });
  })
  .catch((err) => {
    console.error('❌ Failed to find available port:', err);
    process.exit(1);
  });