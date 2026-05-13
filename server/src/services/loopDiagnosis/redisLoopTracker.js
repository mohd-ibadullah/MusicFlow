// SYSTEM SCAN: Redis client is created in src/config/redis.js and can be unavailable by design.
// SYSTEM SCAN: this project tolerates Redis failure in production and continues serving requests.
// SYSTEM SCAN: all new Redis keys for this feature must remain under ld: namespace.

import { getLoopDiagnosisConfig } from "../../config/loopDiagnosisConfig.js";
import { logger } from "../../utils/logger.js";

const hasRedis = (redisClient) =>
  !!redisClient &&
  typeof redisClient.get === "function" &&
  typeof redisClient.set === "function" &&
  typeof redisClient.incr === "function" &&
  (typeof redisClient.isOpen === "boolean" ? redisClient.isOpen : true);

const memoryStore = new Map();

const memoryRead = (key) => {
  const record = memoryStore.get(key);
  if (!record) return null;

  if (record.expiresAt && Date.now() > record.expiresAt) {
    memoryStore.delete(key);
    return null;
  }

  return record.value;
};

const memoryWrite = (key, value, ttlSeconds) => {
  const expiresAt = Number.isFinite(ttlSeconds) && ttlSeconds > 0
    ? Date.now() + ttlSeconds * 1000
    : null;

  memoryStore.set(key, { value: String(value), expiresAt });
};

const memoryIncr = (key, ttlSeconds) => {
  const current = Number.parseInt(memoryRead(key) || "0", 10);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  memoryWrite(key, next, ttlSeconds);
  return next;
};

const memoryDel = (...keys) => {
  for (const key of keys) {
    memoryStore.delete(key);
  }
};

const getRedisMeta = () => {
  const config = getLoopDiagnosisConfig();
  return {
    keys: config.redis.keys,
    ttl: config.redis.ttl,
  };
};

/**
 * Increment replay counter for a user+song pair and initialize a window start.
 * Returns safe defaults on any failure.
 */
export async function incrementAndGet(redisClient, userId, songId) {
  const { keys, ttl } = getRedisMeta();
  const counterKey = keys.loopCounter(userId, songId);
  const windowKey = keys.sessionWindow(userId, songId);

  if (!hasRedis(redisClient)) {
    const existingWindow = memoryRead(windowKey);
    let windowStart = existingWindow ? new Date(existingWindow) : new Date();

    if (!existingWindow || Number.isNaN(windowStart.getTime())) {
      windowStart = new Date();
      memoryWrite(windowKey, windowStart.toISOString(), ttl.loopCounter);
    }

    const count = memoryIncr(counterKey, ttl.loopCounter);
    return { count, windowStart };
  }

  try {
    const existingWindow = await redisClient.get(windowKey);
    let windowStart = existingWindow ? new Date(existingWindow) : new Date();

    if (!existingWindow || Number.isNaN(windowStart.getTime())) {
      windowStart = new Date();
      await redisClient.set(windowKey, windowStart.toISOString(), { EX: ttl.loopCounter });
    }

    const count = await redisClient.incr(counterKey);
    if (count === 1) {
      await redisClient.expire(counterKey, ttl.loopCounter);
    }

    return { count, windowStart };
  } catch (err) {
    logger.error("[LD] Redis incrementAndGet failed", { error: err.message });
    const existingWindow = memoryRead(windowKey);
    let windowStart = existingWindow ? new Date(existingWindow) : new Date();

    if (!existingWindow || Number.isNaN(windowStart.getTime())) {
      windowStart = new Date();
      memoryWrite(windowKey, windowStart.toISOString(), ttl.loopCounter);
    }

    const count = memoryIncr(counterKey, ttl.loopCounter);
    return { count, windowStart };
  }
}

/**
 * True when user is in intervention cooldown.
 */
export async function isInCooldown(redisClient, userId) {
  const { keys } = getRedisMeta();

  if (!hasRedis(redisClient)) {
    return !!memoryRead(keys.cooldown(userId));
  }

  try {
    const value = await redisClient.get(keys.cooldown(userId));
    if (value) {
      logger.debug(`[LD] Cooldown active for user ${userId}. startedAt=${value}`);
    } else {
      logger.debug(`[LD] Cooldown clear for user ${userId}.`);
    }
    return !!value;
  } catch (err) {
    logger.error("[LD] Redis isInCooldown failed", { error: err.message });
    return !!memoryRead(keys.cooldown(userId));
  }
}

/**
 * Get or initialize continuous listening session start for a user.
 */
export async function getSessionStart(redisClient, userId) {
  const { keys, ttl } = getRedisMeta();
  const key = keys.sessionStart(userId);

  if (!hasRedis(redisClient)) {
    const existing = memoryRead(key);
    const parsed = existing ? new Date(existing) : null;

    if (parsed && !Number.isNaN(parsed.getTime())) {
      memoryWrite(key, parsed.toISOString(), ttl.sessionStart);
      return parsed;
    }

    const startedAt = new Date();
    memoryWrite(key, startedAt.toISOString(), ttl.sessionStart);
    return startedAt;
  }

  try {
    const existing = await redisClient.get(key);
    if (existing) {
      const parsed = new Date(existing);
      if (!Number.isNaN(parsed.getTime())) {
        if (typeof redisClient.expire === "function") {
          await redisClient.expire(key, ttl.sessionStart);
        }
        logger.debug(
          `[LD][SESSION] Reusing sessionStart for user ${userId}. sessionStart=${parsed.toISOString()} ttlSeconds=${ttl.sessionStart}`
        );
        return parsed;
      }

      logger.warn(
        `[LD][SESSION] Invalid sessionStart for user ${userId}. existing=${existing}. Reinitializing.`
      );
    }

    const startedAt = new Date();
    await redisClient.set(key, startedAt.toISOString(), { EX: ttl.sessionStart });
    logger.debug(
      `[LD][SESSION] Initialized sessionStart for user ${userId}. sessionStart=${startedAt.toISOString()} ttlSeconds=${ttl.sessionStart}`
    );
    return startedAt;
  } catch (err) {
    logger.error("[LD] Redis getSessionStart failed", { error: err.message });
    const existing = memoryRead(key);
    const parsed = existing ? new Date(existing) : null;

    if (parsed && !Number.isNaN(parsed.getTime())) {
      memoryWrite(key, parsed.toISOString(), ttl.sessionStart);
      return parsed;
    }

    const startedAt = new Date();
    memoryWrite(key, startedAt.toISOString(), ttl.sessionStart);
    return startedAt;
  }
}

/**
 * Reset session baseline to a provided time (defaults to now).
 */
export async function setSessionStart(redisClient, userId, { startAt = new Date() } = {}) {
  const { keys, ttl } = getRedisMeta();
  const key = keys.sessionStart(userId);
  const safeStart = startAt instanceof Date && !Number.isNaN(startAt.getTime())
    ? startAt
    : new Date();
  const startIso = safeStart.toISOString();

  if (!hasRedis(redisClient)) {
    memoryWrite(key, startIso, ttl.sessionStart);
    return safeStart;
  }

  try {
    await redisClient.set(key, startIso, { EX: ttl.sessionStart });
    return safeStart;
  } catch (err) {
    logger.error("[LD] Redis setSessionStart failed", { error: err.message });
    memoryWrite(key, startIso, ttl.sessionStart);
    return safeStart;
  }
}

/**
 * Put user in wellbeing snooze window.
 */
export async function setSnooze(redisClient, userId, snoozeMinutes) {
  const { keys, ttl } = getRedisMeta();
  const options =
    snoozeMinutes && typeof snoozeMinutes === "object"
      ? snoozeMinutes
      : { snoozeMinutes };

  const rawSeconds = Number(options?.snoozeSeconds);
  const rawMinutes = Number(options?.snoozeMinutes);
  const derivedSeconds = Number.isFinite(rawSeconds)
    ? Math.round(rawSeconds)
    : Number.isFinite(rawMinutes)
      ? Math.round(rawMinutes * 60)
      : ttl.snooze;
  const seconds = Math.max(5, derivedSeconds);

  if (!hasRedis(redisClient)) {
    memoryWrite(keys.snooze(userId), new Date().toISOString(), seconds);
    logger.debug(`[LD] Snooze set for user ${userId}. ttlSeconds=${seconds} (memory fallback)`);
    return;
  }

  try {
    await redisClient.set(keys.snooze(userId), new Date().toISOString(), { EX: seconds });
    logger.debug(`[LD] Snooze set for user ${userId}. ttlSeconds=${seconds}`);
  } catch (err) {
    logger.error("[LD] Redis setSnooze failed", { error: err.message });
    memoryWrite(keys.snooze(userId), new Date().toISOString(), seconds);
  }
}

/**
 * True when user has snoozed wellbeing reminders.
 */
export async function isSnoozed(redisClient, userId) {
  const { keys } = getRedisMeta();

  if (!hasRedis(redisClient)) return !!memoryRead(keys.snooze(userId));

  try {
    const value = await redisClient.get(keys.snooze(userId));
    return !!value;
  } catch (err) {
    logger.error("[LD] Redis isSnoozed failed", { error: err.message });
    return !!memoryRead(keys.snooze(userId));
  }
}

/**
 * Dismissals are tracked to reduce intervention frequency for users who opt out repeatedly.
 */
export async function recordDismissal(redisClient, userId) {
  const { keys, ttl } = getRedisMeta();
  const dismissalKey = keys.dismissalCount(userId);

  if (!hasRedis(redisClient)) {
    memoryIncr(dismissalKey, ttl.dismissalCount);
    return;
  }

  try {
    const current = await redisClient.incr(dismissalKey);
    if (current === 1) {
      await redisClient.expire(dismissalKey, ttl.dismissalCount);
    }
  } catch (err) {
    logger.error("[LD] Redis recordDismissal failed", { error: err.message });
    memoryIncr(dismissalKey, ttl.dismissalCount);
  }
}

export async function getDismissalCount(redisClient, userId) {
  const { keys } = getRedisMeta();

  if (!hasRedis(redisClient)) {
    const parsed = Number.parseInt(memoryRead(keys.dismissalCount(userId)) || "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  try {
    const raw = await redisClient.get(keys.dismissalCount(userId));
    const parsed = Number.parseInt(raw || "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    logger.error("[LD] Redis getDismissalCount failed", { error: err.message });
    const parsed = Number.parseInt(memoryRead(keys.dismissalCount(userId)) || "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

/**
 * Cooldown duration adapts upward when dismissal behavior is frequent.
 */
export async function setCooldown(redisClient, userId, { dismissalRate = 0 } = {}) {
  const { keys, ttl } = getRedisMeta();
  const config = getLoopDiagnosisConfig();
  const multiplier = config.testing?.ultraMinimalMode
    ? 1
    : dismissalRate >= 0.7
      ? 2
      : dismissalRate >= 0.4
        ? 1.5
        : 1;
  const cooldownSeconds = Math.round(ttl.cooldown * multiplier);
  const nowIso = new Date().toISOString();

  if (!hasRedis(redisClient)) {
    memoryWrite(keys.cooldown(userId), nowIso, cooldownSeconds);
    memoryWrite(keys.lastIntervention(userId), nowIso, cooldownSeconds * 4);
    return;
  }

  try {
    logger.debug(
      `[LD] Setting cooldown for user ${userId}. ttlSeconds=${cooldownSeconds} dismissalRate=${dismissalRate.toFixed(2)}`
    );

    await redisClient.set(keys.cooldown(userId), nowIso, { EX: cooldownSeconds });
    await redisClient.set(keys.lastIntervention(userId), nowIso, { EX: cooldownSeconds * 4 });
  } catch (err) {
    logger.error("[LD] Redis setCooldown failed", { error: err.message });
    memoryWrite(keys.cooldown(userId), nowIso, cooldownSeconds);
    memoryWrite(keys.lastIntervention(userId), nowIso, cooldownSeconds * 4);
  }
}

/**
 * Reset loop counter/window for a user+song pair.
 */
export async function resetLoop(redisClient, userId, songId) {
  const { keys } = getRedisMeta();

  if (!hasRedis(redisClient)) {
    memoryDel(keys.loopCounter(userId, songId), keys.sessionWindow(userId, songId));
    return;
  }

  try {
    await redisClient.del(keys.loopCounter(userId, songId));
    await redisClient.del(keys.sessionWindow(userId, songId));
  } catch (err) {
    logger.error("[LD] Redis resetLoop failed", { error: err.message });
    memoryDel(keys.loopCounter(userId, songId), keys.sessionWindow(userId, songId));
  }
}

/**
 * Remove cooldown for admin/testing use.
 */
export async function clearCooldown(redisClient, userId) {
  const { keys } = getRedisMeta();

  if (!hasRedis(redisClient)) {
    memoryDel(keys.cooldown(userId), keys.lastIntervention(userId), keys.snooze(userId));
    return;
  }

  try {
    await redisClient.del(keys.cooldown(userId));
    await redisClient.del(keys.lastIntervention(userId));
    await redisClient.del(keys.snooze(userId));
  } catch (err) {
    logger.error("[LD] Redis clearCooldown failed", { error: err.message });
    memoryDel(keys.cooldown(userId), keys.lastIntervention(userId), keys.snooze(userId));
  }
}
