// SYSTEM SCAN: LoopEvent is the authoritative source for intervention outcomes.
// SYSTEM SCAN: User.recentlyPlayed embeds play history with song references for short-window behavior profiling.
// SYSTEM SCAN: adaptation must be additive and cannot alter existing recommendation logic.

import User from "../../models/userModel.js";
import LoopEvent from "../../models/LoopEvent.js";
import { getLoopDiagnosisConfig } from "../../config/loopDiagnosisConfig.js";
import { getFatigueLevel } from "./timeUtils.js";

const getTypeSuccessSummary = (events) => {
  const summary = new Map();

  for (const event of events) {
    const type = event?.interventionType || "unknown";
    const status = event?.interventionStatus || "triggered";

    const current = summary.get(type) || { type, total: 0, bridgePlayed: 0 };
    current.total += 1;
    if (status === "bridge_played") {
      current.bridgePlayed += 1;
    }
    summary.set(type, current);
  }

  return Array.from(summary.values());
};

const getPreferredStrategy = (events) => {
  const typeSummary = getTypeSuccessSummary(events);
  if (typeSummary.length === 0) return null;

  const ranked = typeSummary
    .map((entry) => ({
      ...entry,
      successRate: entry.total > 0 ? entry.bridgePlayed / entry.total : 0,
    }))
    .sort((a, b) => {
      if (b.bridgePlayed !== a.bridgePlayed) return b.bridgePlayed - a.bridgePlayed;
      return b.successRate - a.successRate;
    });

  if (!ranked[0] || ranked[0].bridgePlayed === 0) return null;
  return ranked[0].type;
};

/**
 * Build adaptive behavior profile used by engine and selectors.
 */
export async function buildBehaviorProfile({ userId, loopedSong, sessionDurationMinutes }) {
  const config = getLoopDiagnosisConfig();

  const defaultProfile = {
    fatigueLevel: getFatigueLevel(sessionDurationMinutes || 0, config),
    emotionalStagnationScore: 0,
    dismissalRate: 0,
    bridgePlayedRate: 0,
    reminderStyle: "balanced",
    remindersMuted: false,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    reminderCapPerDay: 4,
    preferredStrategy: null,
    shouldSkipLLM: false,
  };

  try {
    const lookbackStart = new Date(
      Date.now() - config.wellbeing.dismissalLookbackDays * 24 * 60 * 60 * 1000
    );

    const [events, userDoc] = await Promise.all([
      LoopEvent.find({
        userId,
        createdAt: { $gte: lookbackStart },
      })
        .select("interventionType interventionStatus createdAt")
        .lean(),
      User.findById(userId)
        .select("recentlyPlayed loopDiagnosisPrefs")
        .populate("recentlyPlayed.song", "genre")
        .lean(),
    ]);

    const total = events.length;
    const dismissedCount = events.filter((event) => event.interventionStatus === "dismissed").length;
    const ignoredCount = events.filter((event) => event.interventionStatus === "ignored").length;
    const bridgePlayedCount = events.filter((event) => event.interventionStatus === "bridge_played").length;

    const dismissalRate = total > 0 ? (dismissedCount + ignoredCount) / total : 0;
    const bridgePlayedRate = total > 0 ? bridgePlayedCount / total : 0;

    const preferredStrategy = getPreferredStrategy(events);

    const cutoff = new Date(
      Date.now() - config.wellbeing.stagnationWindowHours * 60 * 60 * 1000
    );

    const loopGenre = (loopedSong?.genre || "").trim().toLowerCase();

    const recentGenreSamples = (userDoc?.recentlyPlayed || [])
      .filter((entry) => entry?.playedAt && new Date(entry.playedAt) >= cutoff)
      .map((entry) => (entry?.song?.genre || "").trim().toLowerCase())
      .filter(Boolean);

    let emotionalStagnationScore = 0;
    if (recentGenreSamples.length > 0 && loopGenre) {
      const sameGenreCount = recentGenreSamples.filter((genre) => genre === loopGenre).length;
      emotionalStagnationScore = sameGenreCount / recentGenreSamples.length;
    }

    const fatigueLevel = getFatigueLevel(sessionDurationMinutes || 0, config);
    const prefs = userDoc?.loopDiagnosisPrefs || {};

    return {
      fatigueLevel,
      emotionalStagnationScore,
      dismissalRate,
      bridgePlayedRate,
      reminderStyle: prefs.reminderStyle || "balanced",
      remindersMuted: !!prefs.remindersMuted,
      quietHoursEnabled: !!prefs.quietHoursEnabled,
      quietHoursStart: Number.isFinite(prefs.quietHoursStart) ? prefs.quietHoursStart : null,
      quietHoursEnd: Number.isFinite(prefs.quietHoursEnd) ? prefs.quietHoursEnd : null,
      reminderCapPerDay: Number.isFinite(prefs.reminderCapPerDay) ? prefs.reminderCapPerDay : 4,
      preferredStrategy,
      shouldSkipLLM:
        !!preferredStrategy &&
        preferredStrategy !== "llm" &&
        dismissalRate >= 0.5 &&
        bridgePlayedRate < 0.35,
    };
  } catch (err) {
    console.error("[LD] adaptivePolicy buildBehaviorProfile failed:", err.message);
    return defaultProfile;
  }
}
