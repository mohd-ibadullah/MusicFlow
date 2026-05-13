import { createClient } from "redis";
import { logger } from "../utils/logger.js";

let redisClient = null;
let redisAvailable = false;
let hasLoggedError = false;

const getRedisUrl = () => {
  // If no explicit configuration is provided, we don't try to connect
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  if (process.env.REDIS_HOST) {
    const port = process.env.REDIS_PORT || 6379;
    const password = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : "";
    return `redis://${password}${process.env.REDIS_HOST}:${port}`;
  }
  // default is not returned automatically; caller will short‑circuit
  return null;
};

/**
 * Connect to Redis. Graceful fallback: if Redis is unavailable or disabled, the app continues
 * without cache.  REDIS_ENABLED=false will disable the client even if other variables exist.
 */
const connectRedis = async () => {
  if (redisClient) return redisClient;

  if (process.env.REDIS_ENABLED === 'false') {
    // Redis caching explicitly disabled
    return null;
  }

  const url = getRedisUrl();
  if (!url) {
    // No Redis URL configured; running without cache
    return null;
  }

  try {
    redisClient = createClient({
      url,
      socket: {
        // do not endlessly retry when the server is down
        reconnectStrategy: (retries) => {
          if (retries > 2) return new Error('too many attempts');
          return 1000; // retry after 1s
        }
      }
    });

    redisClient.on("error", (err) => {
      if (!hasLoggedError) {
        logger.warn("Redis client error", { error: err.message });
        hasLoggedError = true;
      }
      redisAvailable = false;
    });
    redisClient.on("connect", () => {
      logger.info("Redis connected");
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch (error) {
    logger.warn("Redis connection failed, running without cache", {
      error: error.message,
    });
    redisAvailable = false;
    redisClient = null;
    return null;
  }
};

const isRedisAvailable = () => redisAvailable && redisClient;

const getRedisClient = () => (redisAvailable ? redisClient : null);

export default connectRedis;
export { isRedisAvailable, getRedisClient };
