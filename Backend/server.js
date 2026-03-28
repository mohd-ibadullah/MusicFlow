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
dotenv.config({ path: envPath });

// Fail fast if required secrets are missing
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import "./src/models/activityModel.js";

// App config
const app = express();
const port = parseInt(process.env.PORT) || 4000; // FIX: Parse as integer

// Connect to databases
connectDB();
connectCloudinary();
connectRedis().catch((err) => console.warn("Redis init:", err.message));

// Middlewares
app.use(helmet()); // Secure HTTP headers
app.use(express.json());

// Strict CORS domain matching
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ["http://localhost:5000", "http://localhost:5173", "http://localhost:5174"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Apply rate limiting to all /api routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

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
  } catch { }
}

if (resolvedFrontendPath) {
  app.use(express.static(resolvedFrontendPath));
  // SPA fallback (after API routes) using regex to exclude /api (Express 5 safe)
  app.get(/^\/(?!api)(.*)/, (req, res) => {
    res.sendFile(path.join(resolvedFrontendPath, "index.html"));
  });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ Frontend build not found. Set FRONTEND_DIST or run 'npm run build:client' from the Backend folder to copy the client dist.",
  );
} // End of static serving logic

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
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  pingTimeout: 60000,
});
app.set("io", io);

const activeUsersMap = new Map();
const socketToUserMap = new Map();

// Optional: you can still set maps to app if needed elsewhere
app.set("activeUsersMap", activeUsersMap);

import { isRedisAvailable, getRedisClient } from "./src/config/redis.js";
import { cacheGetLiveEvents } from "./src/services/cacheService.js";

// Clean up stale listener keys on fresh boot if Redis is available
setTimeout(async () => {
  if (isRedisAvailable()) {
    try {
      const client = getRedisClient();
      const keys = await client.keys('user_sockets:*');
      if (keys.length > 0) await client.del(keys);
      await client.del('active_users');
    } catch (e) {
      console.warn("Failed to clean Redis socket keys:", e.message);
    }
  }
}, 3000);

const broadcastListenerCount = async () => {
  let count = activeUsersMap.size;
  if (isRedisAvailable()) {
    try {
      const client = getRedisClient();
      count = await client.sCard("active_users");
    } catch {}
  }
  io.emit("users_listening", count);
};

io.on("connection", (socket) => {
  socket.on("user_started_listening", async (data) => {
    // Rely on provided userId, fallback to socket id for anon sessions
    const userId = data?.userId || socket.id;
    socketToUserMap.set(socket.id, userId);

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        await client.sAdd(`user_sockets:${userId}`, socket.id);
        await client.sAdd("active_users", userId);
      } catch (err) {
        console.warn("Redis socket error:", err.message);
      }
    } else {
      if (!activeUsersMap.has(userId)) {
        activeUsersMap.set(userId, new Set());
      }
      activeUsersMap.get(userId).add(socket.id);
    }

    broadcastListenerCount();
  });

  const handleDisconnect = async () => {
    const userId = socketToUserMap.get(socket.id);
    if (!userId) return;

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        await client.sRem(`user_sockets:${userId}`, socket.id);
        const socketCount = await client.sCard(`user_sockets:${userId}`);
        if (socketCount === 0) {
          await client.sRem("active_users", userId);
          await client.del(`user_sockets:${userId}`);
        }
      } catch (err) {
        console.warn("Redis disconnect error:", err.message);
      }
    } else {
      if (activeUsersMap.has(userId)) {
        const userSockets = activeUsersMap.get(userId);
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUsersMap.delete(userId);
        }
      }
    }
    
    socketToUserMap.delete(socket.id);
    broadcastListenerCount();
  };

  socket.on("user_stopped_listening", handleDisconnect);
  socket.on("disconnect", handleDisconnect);

  // Handle request for current listener count
  socket.on("get_listeners", async () => {
    broadcastListenerCount();
    
    // Also push historical cache of live listening
    const recentEvents = await cacheGetLiveEvents();
    if (recentEvents && recentEvents.length > 0) {
      socket.emit("recent_live_events", recentEvents);
    }
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
