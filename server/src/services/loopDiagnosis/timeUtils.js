// SYSTEM SCAN: play events arrive continuously from PlayerContext audio onplay in the client app.
// SYSTEM SCAN: loop detection must be pure and reusable without direct DB/Redis dependencies.
// SYSTEM SCAN: late-night sensitivity is controlled by env-backed loopDiagnosisConfig.

/**
 * Returns the named time-of-day period for a given hour (0-23).
 * morning:   5-11
 * afternoon: 12-17
 * evening:   18-21
 * latenight: 22-23
 * deepnight: 0-4
 */
export function getTimeOfDay(hour) {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 21) return "evening";
  if (hour >= 22) return "latenight";
  return "deepnight";
}

/**
 * Returns true if the given hour falls in the configured late-night window.
 */
export function isLateNight(hour, config) {
  const { start, end } = config.lateNight;
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/**
 * Base replay threshold with late-night sensitivity.
 */
export function getEffectiveThreshold(hour, config) {
  return isLateNight(hour, config)
    ? config.lateNight.threshold
    : config.replayThreshold;
}

/**
 * Fatigue level from session duration.
 */
export function getFatigueLevel(sessionDurationMinutes, config) {
  const minutes = Number.isFinite(sessionDurationMinutes) ? sessionDurationMinutes : 0;
  if (minutes >= config.wellbeing.fatigueHardMinutes) return "high";
  if (minutes >= config.wellbeing.fatigueSoftMinutes) return "soft";
  return "none";
}

/**
 * Parse song duration in seconds from "m:ss" strings.
 */
export function parseDurationToSeconds(duration) {
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return duration;
  }

  if (typeof duration !== "string") return null;
  const parts = duration.split(":");
  if (parts.length !== 2) return null;

  const mins = Number.parseInt(parts[0], 10);
  const secs = Number.parseInt(parts[1], 10);

  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
  return mins * 60 + secs;
}
