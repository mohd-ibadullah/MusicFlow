import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const DEFAULT_TTL = 600; // seconds (~10 minutes)

/**
 * Get cached JSON value. Returns null on cache miss or Redis unavailable.
 */
export const cacheGet = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    const client = getRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Cache get error:", err.message);
    return null;
  }
};

/**
 * Set cache with TTL (seconds). No-op if Redis unavailable.
 */
export const cacheSet = async (key, value, ttlSeconds = DEFAULT_TTL) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    if (!client) return;
    const serialized = JSON.stringify(value);
    await client.setEx(key, ttlSeconds, serialized);
  } catch (err) {
    console.warn("Cache set error:", err.message);
  }
};

/**
 * Invalidate keys by pattern (e.g. "songs:*"). Use sparingly.
 */
export const cacheDel = async (key) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    if (!client) return;
    await client.del(key);
  } catch (err) {
    console.warn("Cache del error:", err.message);
  }
};

export const CACHE_KEYS = {
  SONGS_LIST: "songs:list",
  ALBUMS_LIST: "albums:list",
  TRENDING: "songs:trending",
  RECOMMENDATIONS: (userId) => `songs:recommendations:${userId || "anon"}`,
};
