import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const DEFAULT_TTL = 300; // 5 minutes

export const CACHE_KEYS = {
  SONGS_LIST: "songs:list",
  ALBUMS_LIST: "albums:list",
  TRENDING: (limit) => `songs:trending:${limit}`,
  RECOMMENDATIONS: (userId) => `songs:recommendations:${userId || "anon"}`,
  RECENT_LIVE_EVENTS: "recent_live_events",
  SONG_DETAIL: (id) => `song:detail:${id}`
};

/**
 * Invalidate specifically structural song caches (lists, trending) 
 * called only on add/remove/update, not on every play/like.
 */
export const invalidateSongStructuralCaches = async () => {
  const client = getRedisClient();
  if (!isRedisAvailable()) return;
  try {
    const keys = await client.keys("songs:*");
    if (keys.length > 0) await client.del(keys);
  } catch (err) {
    console.warn("[CACHE] Structural invalidation error:", err.message);
  }
};

/**
 * Get cached JSON value. Fallback to null on miss or error.
 */
export const cacheGet = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (raw) return JSON.parse(raw);
    return null;
  } catch (err) {
    console.warn(`[CACHE] Read error for ${key}:`, err.message);
    return null;
  }
};

/**
 * Set cache with proper TTL.
 */
export const cacheSet = async (key, value, ttlSeconds = DEFAULT_TTL) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    const serialized = JSON.stringify(value);
    await client.setEx(key, ttlSeconds, serialized);
  } catch (err) {
    console.warn(`[CACHE] Write error for ${key}:`, err.message);
  }
};

/**
 * Invalidate a specific exact key.
 */
export const cacheDel = async (key) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err) {
    console.warn(`[CACHE] Delete error for ${key}:`, err.message);
  }
};

/**
 * Invalidate multiple keys by wildcard pattern safely using Redis Keys (for our scale)
 */
export const cacheInvalidatePattern = async (pattern) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys && keys.length > 0) {
      await client.del(keys);
    }
  } catch (err) {
    console.warn(`[CACHE] Pattern invalidation error for ${pattern}:`, err.message);
  }
};

/**
 * Fully purge all cached song queries. Use strictly after mutations.
 */
export const clearSongCaches = async () => {
  await cacheInvalidatePattern("songs:*");
};

/**
 * Fully purge all cached album queries. Use strictly after mutations.
 */
export const clearAlbumCaches = async () => {
  await cacheInvalidatePattern("albums:*");
};

/**
 * Persist and cap a list array. Used for live ticker state across refreshes.
 */
export const cachePushLiveEvent = async (eventPayload) => {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    const serialized = JSON.stringify(eventPayload);
    await client.lPush(CACHE_KEYS.RECENT_LIVE_EVENTS, serialized);
    await client.lTrim(CACHE_KEYS.RECENT_LIVE_EVENTS, 0, 4); // Keep last 5 globally
  } catch (err) {
    console.warn("[CACHE] Live event push error:", err.message);
  }
};

/**
 * Fetch the bounded capped list of recent live activity.
 */
export const cacheGetLiveEvents = async () => {
  if (!isRedisAvailable()) return [];
  try {
    const client = getRedisClient();
    const rawList = await client.lRange(CACHE_KEYS.RECENT_LIVE_EVENTS, 0, 4);
    return rawList.map(item => JSON.parse(item));
  } catch (err) {
    console.warn("[CACHE] Live events read error:", err.message);
    return [];
  }
};
