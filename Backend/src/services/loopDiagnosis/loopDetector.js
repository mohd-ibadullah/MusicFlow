// SYSTEM SCAN: play counter data is produced in songController incrementPlayCount and forwarded as userId/songId events.
// SYSTEM SCAN: detection must remain additive and should never read Redis/Mongo directly.
// SYSTEM SCAN: runtime feature toggles come from src/config/loopDiagnosisConfig.js.

import { getLoopDiagnosisConfig } from "../../config/loopDiagnosisConfig.js";
import {
  getTimeOfDay,
  getFatigueLevel,
  isLateNight,
  getEffectiveThreshold,
} from "./timeUtils.js";

/**
 * LOOP DETECTION LOGIC
 *
 * A "stuck loop" differs from healthy replay behavior.
 * This function consumes pre-fetched inputs and returns a pure decision.
 */
export function evaluateLoop({
  replayCount,
  windowStart,
  now,
  hour,
  dismissalRate = 0,
  sessionDurationMinutes,
}) {
  const config = getLoopDiagnosisConfig();
  const safeNow = now instanceof Date ? now : new Date();
  const safeHour = Number.isFinite(hour) ? hour : safeNow.getHours();

  if (!(windowStart instanceof Date) || Number.isNaN(windowStart.getTime())) {
    return {
      isLoop: false,
      reason: "window start missing or invalid",
      severity: "none",
      isLateNight: isLateNight(safeHour, config),
    };
  }

  const lateNight = isLateNight(safeHour, config);
  const baseThreshold = getEffectiveThreshold(safeHour, config);
  const adaptiveThresholdEnabled = config?.wellbeing?.adaptiveLoopThresholdEnabled !== false;

  // Respect repeated dismissals by requiring a stronger signal before intervening.
  const adaptiveThreshold =
    adaptiveThresholdEnabled && dismissalRate >= 0.6 ? baseThreshold + 1 : baseThreshold;
  const windowMinutes = (safeNow.getTime() - windowStart.getTime()) / 60000;

  if (replayCount < adaptiveThreshold) {
    return {
      isLoop: false,
      reason: `replay count ${replayCount} below threshold ${adaptiveThreshold}`,
      severity: "none",
      isLateNight: lateNight,
    };
  }

  if (windowMinutes > config.timeWindowMinutes) {
    return {
      isLoop: false,
      reason: `window expired (${Math.round(windowMinutes)} min > ${config.timeWindowMinutes} min)`,
      severity: "none",
      isLateNight: lateNight,
    };
  }

  const derivedSessionMinutes = Number.isFinite(sessionDurationMinutes)
    ? sessionDurationMinutes
    : Math.max(0, Math.round(windowMinutes));
  const fatigueLevel = getFatigueLevel(derivedSessionMinutes, config);

  let severity = "low";
  if (lateNight) {
    severity = "high";
  } else if (replayCount >= adaptiveThreshold + 2) {
    severity = "medium";
  }

  // Fatigue calls for gentler nudges, but still marks urgency for wellbeing-aware selection.
  if (fatigueLevel === "high" && severity === "low") {
    severity = "medium";
  }

  return {
    isLoop: true,
    reason: `${replayCount} replays in ${Math.round(windowMinutes)} min (threshold: ${adaptiveThreshold}, lateNight: ${lateNight})`,
    severity,
    replayCount,
    windowMinutes: Math.round(windowMinutes),
    lateNight,
    isLateNight: lateNight,
    timeOfDay: getTimeOfDay(safeHour),
    effectiveThreshold: adaptiveThreshold,
    fatigueLevel,
  };
}
