// SYSTEM SCAN: backend uses ESM modules under server/src (package type=module).
// SYSTEM SCAN: Redis utilities are exported from src/config/redis.js and app stores io via app.set("io", io).
// SYSTEM SCAN: recently played data is embedded on User.recentlyPlayed, not a separate collection.

const parseIntSafe = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFloatSafe = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBooleanTrue = (value) => {
  if (typeof value !== "string") return false;
  return /^(true|1|yes|on)$/i.test(value.trim());
};

// Test mode must be explicitly enabled and is never on by default in production.
const ULTRA_MINIMAL_TEST_MODE =
  process.env.NODE_ENV !== "production" &&
  parseBooleanTrue(process.env.LOOP_ULTRA_MINIMAL_TEST_MODE);
const ULTRA_MINIMAL_TEST_CONFIG = {
  LOOP_REPLAY_THRESHOLD: 2,
  LOOP_TIME_WINDOW_MINUTES: 1,
  LOOP_SESSION_TRIGGER_MINUTES: 0.1,
  LOOP_LATE_NIGHT_SESSION_TRIGGER_MINUTES: 0.1,
  LOOP_COOLDOWN_SECONDS: 10,
  LOOP_SNOOZE_SECONDS: 20,
  LOOP_LATE_NIGHT_REPLAY_THRESHOLD: 2,
  LOOP_INTERVENTION_EXPIRY_SECONDS: 10,
};

const resolveCooldownMinutes = () => {
  const baseMinutes = parseFloatSafe(process.env.LOOP_COOLDOWN_MINUTES, 90);
  const devOverrideMinutes = parseFloatSafe(process.env.LOOP_COOLDOWN_MINUTES_DEV, baseMinutes);
  return process.env.NODE_ENV === "production" ? baseMinutes : devOverrideMinutes;
};

const buildLoopDiagnosisConfig = () => {
  const cooldownMinutes = ULTRA_MINIMAL_TEST_MODE
    ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_COOLDOWN_SECONDS / 60
    : resolveCooldownMinutes();

  const snoozeMinutes = parseIntSafe(process.env.LOOP_SNOOZE_MINUTES, 30);
  const snoozeSeconds = ULTRA_MINIMAL_TEST_MODE
    ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_SNOOZE_SECONDS
    : parseIntSafe(process.env.LOOP_SNOOZE_SECONDS, snoozeMinutes * 60);

  return {
    cooldownMinutes,
    enabled: parseBooleanTrue(process.env.LOOP_DIAGNOSIS_ENABLED),
    replayThreshold: ULTRA_MINIMAL_TEST_MODE
      ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_REPLAY_THRESHOLD
      : parseIntSafe(process.env.LOOP_REPLAY_THRESHOLD, 4),
    timeWindowMinutes: ULTRA_MINIMAL_TEST_MODE
      ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_TIME_WINDOW_MINUTES
      : parseIntSafe(process.env.LOOP_TIME_WINDOW_MINUTES, 45),
    interventionExpirySeconds: ULTRA_MINIMAL_TEST_MODE
      ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_INTERVENTION_EXPIRY_SECONDS
      : parseIntSafe(process.env.LOOP_INTERVENTION_EXPIRY_SECONDS, 120),
    lateNight: {
      start: parseIntSafe(process.env.LOOP_LATE_NIGHT_START, 22),
      end: parseIntSafe(process.env.LOOP_LATE_NIGHT_END, 5),
      threshold: ULTRA_MINIMAL_TEST_MODE
        ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_LATE_NIGHT_REPLAY_THRESHOLD
        : parseIntSafe(process.env.LOOP_LATE_NIGHT_THRESHOLD, 3),
    },
    wellbeing: {
      fatigueSoftMinutes: parseIntSafe(process.env.LOOP_FATIGUE_SOFT_MINUTES, 90),
      fatigueHardMinutes: parseIntSafe(process.env.LOOP_FATIGUE_HARD_MINUTES, 120),
      sessionTriggerMinutes: ULTRA_MINIMAL_TEST_MODE
        ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_SESSION_TRIGGER_MINUTES
        : parseFloatSafe(process.env.LOOP_SESSION_TRIGGER_MINUTES, 90),
      lateNightSessionTriggerMinutes: ULTRA_MINIMAL_TEST_MODE
        ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_LATE_NIGHT_SESSION_TRIGGER_MINUTES
        : parseFloatSafe(process.env.LOOP_LATE_NIGHT_SESSION_TRIGGER_MINUTES, 45),
      snoozeSeconds,
      snoozeMinutes,
      dismissalLookbackDays: parseIntSafe(process.env.LOOP_DISMISSAL_LOOKBACK_DAYS, 7),
      stagnationWindowHours: parseIntSafe(process.env.LOOP_STAGNATION_WINDOW_HOURS, 6),
      adaptiveLoopThresholdEnabled: !ULTRA_MINIMAL_TEST_MODE,
    },
    llm: {
      provider: process.env.LLM_PROVIDER || "openai",
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || "gpt-4o",
      timeoutMs: parseIntSafe(process.env.LLM_TIMEOUT_MS, 8000),
      maxCandidates: parseIntSafe(process.env.LLM_MAX_CANDIDATES, 10),
    },
    redis: {
      namespace: "ld:",
      keys: {
        loopCounter: (userId, songId) => `ld:loop:${userId}:${songId}`,
        sessionWindow: (userId, songId) => `ld:window:${userId}:${songId}`,
        sessionStart: (userId) => `ld:sessionstart:${userId}`,
        cooldown: (userId) => `ld:cooldown:${userId}`,
        snooze: (userId) => `ld:snooze:${userId}`,
        lastIntervention: (userId) => `ld:lastintervention:${userId}`,
        dismissalCount: (userId) => `ld:dismissals:${userId}`,
      },
      ttl: {
        loopCounter: ULTRA_MINIMAL_TEST_MODE
          ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_TIME_WINDOW_MINUTES * 60
          : 3600,
        sessionStart: 6 * 60 * 60,
        cooldown: ULTRA_MINIMAL_TEST_MODE
          ? ULTRA_MINIMAL_TEST_CONFIG.LOOP_COOLDOWN_SECONDS
          : Math.max(30, Math.round(cooldownMinutes * 60)),
        snooze: snoozeSeconds,
        dismissalCount: 7 * 24 * 60 * 60,
      },
    },
    testing: {
      ultraMinimalMode: ULTRA_MINIMAL_TEST_MODE,
    },
  };
};

const loopDiagnosisConfig = buildLoopDiagnosisConfig();

export const getLoopDiagnosisConfig = () => buildLoopDiagnosisConfig();
export default loopDiagnosisConfig;
