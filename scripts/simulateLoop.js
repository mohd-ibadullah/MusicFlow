// SYSTEM SCAN: backend runtime is ESM under Backend/, while this root script runs as CommonJS.
// SYSTEM SCAN: loop diagnosis entry point is src/services/loopDiagnosis/loopDiagnosisEngine.js handlePlayEvent.
// SYSTEM SCAN: Redis may be unavailable in this project; simulation includes an in-memory fallback.

const path = require("path");
const { pathToFileURL } = require("url");
const { createRequire } = require("module");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.resolve(rootDir, "Backend");
const backendRequire = createRequire(path.join(backendDir, "package.json"));

const dotenv = backendRequire("dotenv");
dotenv.config({ path: path.join(rootDir, ".env") });

const mongoose = backendRequire("mongoose");

class InMemoryRedis {
  constructor() {
    this.store = new Map();
  }

  _isExpired(key) {
    const data = this.store.get(key);
    if (!data) return true;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get(key) {
    if (this._isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(key, value, options = {}) {
    const expiresAt = options.EX ? Date.now() + options.EX * 1000 : null;
    this.store.set(key, { value: String(value), expiresAt });
    return "OK";
  }

  async incr(key) {
    if (this._isExpired(key)) {
      this.store.delete(key);
    }
    const current = Number.parseInt(this.store.get(key)?.value || "0", 10);
    const next = current + 1;
    const expiresAt = this.store.get(key)?.expiresAt || null;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key, seconds) {
    if (this._isExpired(key)) return 0;
    const current = this.store.get(key);
    this.store.set(key, {
      value: current.value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return 1;
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }
}

const fileImport = async (relativePath) => {
  const absolute = path.join(backendDir, relativePath);
  return import(pathToFileURL(absolute).href);
};

(async () => {
  let createdEventId = null;
  let testUserCreated = false;
  let redisClient = null;

  try {
    console.log("[LD SIMULATION] Starting loop diagnosis simulation...");

    const [
      userModule,
      songModule,
      loopEventModule,
      redisModule,
      configModule,
      engineModule,
    ] = await Promise.all([
      fileImport("src/models/userModel.js"),
      fileImport("src/models/songModel.js"),
      fileImport("src/models/LoopEvent.js"),
      fileImport("src/config/redis.js"),
      fileImport("src/config/loopDiagnosisConfig.js"),
      fileImport("src/services/loopDiagnosis/loopDiagnosisEngine.js"),
    ]);

    const User = userModule.default;
    const Song = songModule.default;
    const LoopEvent = loopEventModule.default;
    const connectRedis = redisModule.default;
    const { getLoopDiagnosisConfig } = configModule;
    const { handlePlayEvent } = engineModule;

    const config = getLoopDiagnosisConfig();

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI missing in .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("[LD SIMULATION] MongoDB connected");

    try {
      redisClient = await connectRedis();
      if (redisClient) {
        console.log("[LD SIMULATION] Redis connected");
      } else {
        console.warn("[LD SIMULATION] Redis unavailable. Using in-memory Redis fallback.");
        redisClient = new InMemoryRedis();
      }
    } catch (err) {
      console.warn("[LD SIMULATION] Redis connection failed. Using in-memory fallback:", err.message);
      redisClient = new InMemoryRedis();
    }

    let testUser = await User.findOne({ email: "testloop@test.com" });
    if (!testUser) {
      testUser = await User.create({
        name: "Loop Test User",
        email: "testloop@test.com",
        password: "test12345",
      });
      testUserCreated = true;
      console.log("[LD SIMULATION] Created test user testloop@test.com");
    } else {
      console.log("[LD SIMULATION] Found existing test user testloop@test.com");
    }

    const songs = await Song.find({}).limit(2).lean();
    if (!songs || songs.length < 2) {
      throw new Error("Simulation requires at least 2 songs in database");
    }

    const loopSong = songs[0];
    const bridgeReferenceSong = songs[1];

    console.log(
      `[LD SIMULATION] Using loop song \"${loopSong.name}\" and bridge reference \"${bridgeReferenceSong.name}\"`
    );

    const ioMock = {
      of: () => ({
        to: () => ({
          emit: (eventName, payload) => {
            console.log(
              `[LD SIMULATION] Socket emit -> ${eventName} (loopEventId=${payload?.loopEventId || "n/a"})`
            );
          },
        }),
      }),
    };

    for (let i = 1; i <= 5; i += 1) {
      console.log(`[LD SIMULATION] Replay ${i}/5`);
      await handlePlayEvent({
        userId: testUser._id.toString(),
        songId: loopSong._id.toString(),
        redisClient,
        io: ioMock,
      });
    }

    const event = await LoopEvent.findOne({
      userId: testUser._id,
      loopedSongId: loopSong._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!event) {
      throw new Error("No LoopEvent created after replay simulation");
    }

    createdEventId = event._id.toString();
    console.log(
      `[LD SIMULATION] LoopEvent created with type=${event.interventionType} status=${event.interventionStatus}`
    );

    console.log("SIMULATION PASSED");

    // Cleanup
    await LoopEvent.deleteOne({ _id: createdEventId });

    const keys = config.redis.keys;
    await redisClient.del(keys.loopCounter(testUser._id.toString(), loopSong._id.toString()));
    await redisClient.del(keys.sessionWindow(testUser._id.toString(), loopSong._id.toString()));
    await redisClient.del(keys.cooldown(testUser._id.toString()));
    await redisClient.del(keys.lastIntervention(testUser._id.toString()));
    await redisClient.del(keys.dismissalCount(testUser._id.toString()));

    if (testUserCreated) {
      await User.deleteOne({ _id: testUser._id });
    }

    console.log("[LD SIMULATION] Cleanup complete");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("SIMULATION FAILED:", err.message);

    try {
      if (createdEventId) {
        const { default: LoopEvent } = await fileImport("src/models/LoopEvent.js");
        await LoopEvent.deleteOne({ _id: createdEventId });
      }
    } catch (_cleanupErr) {}

    try {
      await mongoose.disconnect();
    } catch (_dbCloseErr) {}

    console.log("[LD SIMULATION] Cleanup complete");
    process.exit(1);
  }
})();
