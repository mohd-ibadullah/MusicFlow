// SYSTEM SCAN: primary hook point is incrementPlayCount in src/controllers/songController.js.
// SYSTEM SCAN: io is attached via app.set("io", io) in Backend/server.js and should be used additively.
// SYSTEM SCAN: Redis can be disabled/unavailable, so this engine must fail safe and return early.

import mongoose from "mongoose";
import LoopEvent from "../../models/LoopEvent.js";
import Song from "../../models/songModel.js";
import { getLoopDiagnosisConfig } from "../../config/loopDiagnosisConfig.js";
import { evaluateLoop } from "./loopDetector.js";
import { getTimeOfDay, isLateNight } from "./timeUtils.js";
import {
  incrementAndGet,
  isInCooldown,
  isSnoozed,
  getSessionStart,
  setCooldown,
  resetLoop,
} from "./redisLoopTracker.js";
import {
  getCandidates,
  fallbackRuleSelect,
  fallbackRandomSelect,
  getSongTitle,
} from "./candidateSelector.js";
import { selectBridgeTrack } from "./llmBridgeSelector.js";
import { buildBehaviorProfile } from "./adaptivePolicy.js";
import { logger } from "../../utils/logger.js";
import {
  emitRealtime,
  REALTIME_EVENTS,
} from "../../socket/realtimeEvents.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const UNKNOWN_TEXT_PATTERN = /^unknown(?:\s+\w+)?$/i;

const isMeaningfulText = (value) =>
  typeof value === "string" && value.trim().length > 0 && !UNKNOWN_TEXT_PATTERN.test(value.trim());

const formatDurationPhrase = (minutes) => {
  const numericValue = Number(minutes);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue < 1) {
    return "less than a minute";
  }

  const roundedMinutes = Math.round(numericValue);
  if (roundedMinutes <= 1) {
    return "about 1 minute";
  }

  return `about ${roundedMinutes} minutes`;
};

const toSongPayload = (song) => {
  if (!song || typeof song !== "object") return null;

  const songId = song?._id || song?.id || null;
  if (!songId) return null;

  const titleCandidate = getSongTitle(song);
  const artistCandidate = song?.artist;

  return {
    _id: songId,
    title: isMeaningfulText(titleCandidate) ? titleCandidate.trim() : null,
    artist: isMeaningfulText(artistCandidate) ? artistCandidate.trim() : null,
    coverImage: song?.coverImage || song?.image || null,
    audioUrl: song?.audioUrl || song?.file || song?.url || null,
  };
};

const getReminderStyleMultiplier = (style) => {
  if (style === "light") return 1.25;
  if (style === "strict") return 0.8;
  if (style === "never") return Number.POSITIVE_INFINITY;
  return 1;
};

const isWithinQuietHours = (hour, start, end) => {
  if (!Number.isFinite(hour) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
};

const pickHealthBridgeTrack = (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const calmingKeywords = ["chill", "ambient", "acoustic", "instrumental", "lofi", "soft", "soul"];
  const calmCandidate = candidates.find((song) => {
    const genre = `${song?.genre || ""}`.toLowerCase();
    return calmingKeywords.some((keyword) => genre.includes(keyword));
  });

  return calmCandidate || candidates[0] || null;
};

const resolveSupportiveMessage = ({
  profile,
  triggerCategory,
  interventionType,
  sessionDurationMinutes,
  replayCount,
  isLateNightContext,
}) => {
  const durationPhrase = formatDurationPhrase(sessionDurationMinutes);
  const safeReplayCount = Number.isFinite(replayCount) && replayCount > 0
    ? Math.round(replayCount)
    : 2;

  const isWellbeingReminder = interventionType === "health_nudge" || triggerCategory === "session";

  if (isWellbeingReminder) {
    if (triggerCategory === "combined") {
      return `You've been listening for ${durationPhrase} and replayed this track ${safeReplayCount} times. Want to take a short reset?`;
    }

    if (isLateNightContext) {
      return `It's getting late, and you've been listening for ${durationPhrase}. Want a short wind-down break?`;
    }
    return `You've been listening for ${durationPhrase}. Want to take a 2-minute stretch and water break?`;
  }

  if (triggerCategory === "combined") {
    return `You've played this track ${safeReplayCount} times in a row and listened for ${durationPhrase}. Want to switch it up?`;
  }

  if (profile?.fatigueLevel === "high") {
    return "Looks like this track is on repeat. Want a softer change of pace?";
  }
  if ((profile?.emotionalStagnationScore || 0) >= 0.7) {
    return "You might enjoy a fresh vibe right now. Want to try this track?";
  }
  return "Want to switch to a different track for a bit?";
};

const defaultDependencies = {
  getLoopDiagnosisConfig,
  evaluateLoop,
  getTimeOfDay,
  isLateNight,
  incrementAndGet,
  isInCooldown,
  isSnoozed,
  getSessionStart,
  setCooldown,
  resetLoop,
  getCandidates,
  fallbackRuleSelect,
  fallbackRandomSelect,
  selectBridgeTrack,
  buildBehaviorProfile,
  LoopEvent,
  Song,
};

const isDuplicateTriggeredInterventionError = (error) =>
  error?.code === 11000 || /E11000 duplicate key/i.test(error?.message || "");

const markIgnoredEvents = async (LoopEventModel, userId, expirySeconds) => {
  if (!expirySeconds || expirySeconds <= 0) return;

  const cutoff = new Date(Date.now() - expirySeconds * 1000);

  try {
    const result = await LoopEventModel.updateMany(
      {
        userId,
        interventionStatus: "triggered",
        createdAt: { $lt: cutoff },
      },
      {
        $set: {
          interventionStatus: "ignored",
          resolvedAt: new Date(),
        },
      }
    );

    if (result?.modifiedCount > 0) {
      logger.debug(`[LD] Marked ${result.modifiedCount} stale interventions as ignored for user ${userId}`);
    }
  } catch (err) {
    logger.error("[LD] Failed to mark ignored interventions", { error: err.message });
  }
};

export function createLoopDiagnosisEngine(overrides = {}) {
  const deps = { ...defaultDependencies, ...overrides };

  return async function handlePlayEvent({ userId, songId, redisClient, io }) {
    const config = deps.getLoopDiagnosisConfig();

    if (!config.enabled) return;

    // Only authenticated user IDs should be evaluated for behavior interventions.
    if (!isValidObjectId(userId) || !isValidObjectId(songId)) {
      logger.debug(`[LD] Skipping play event (non-user or invalid ids). userId=${userId} songId=${songId}`);
      return;
    }

    if (!redisClient) {
      logger.warn(`[LD] Redis unavailable. Using in-memory fallback tracker for user: ${userId}`);
    }

    try {
      await markIgnoredEvents(deps.LoopEvent, userId, config.interventionExpirySeconds);

      const currentlySnoozed = await deps.isSnoozed(redisClient, userId);
      if (currentlySnoozed) {
        logger.debug(`[LD] User ${userId} currently snoozed. Skipping intervention.`);
        return;
      }

      const inCooldown = await deps.isInCooldown(redisClient, userId);
      if (inCooldown) {
        logger.debug(`[LD] User ${userId} in cooldown. Skipping.`);
        return;
      }

      const { count, windowStart } = await deps.incrementAndGet(redisClient, userId, songId);
      if (count === 0 || !windowStart) {
        logger.warn(`[LD] Redis unavailable. Aborting detection for user: ${userId}`);
        return;
      }

      logger.debug(`[LD] User ${userId} | Song ${songId} | Count: ${count} | Window: ${windowStart.toISOString()}`);

      const now = new Date();
      const hour = now.getHours();
      const perSongWindowMinutes = Math.max(0, (now.getTime() - windowStart.getTime()) / 60000);
      const continuousSessionStart = await deps.getSessionStart(redisClient, userId);
      const continuousSessionMinutes = Math.max(
        0,
        (now.getTime() - continuousSessionStart.getTime()) / 60000
      );
      const sessionDurationMinutes = Math.max(
        perSongWindowMinutes,
        continuousSessionMinutes
      );

      logger.debug(
        `[LD][SESSION] user=${userId} sessionStart=${continuousSessionStart.toISOString()} now=${now.toISOString()} songWindowMinutes=${perSongWindowMinutes.toFixed(2)} continuousSessionMinutes=${continuousSessionMinutes.toFixed(2)} effectiveSessionMinutes=${sessionDurationMinutes.toFixed(2)}`
      );

      const loopedSong = await deps.Song.findById(songId).lean();
      if (!loopedSong) {
        logger.warn("[LD] Looped song not found in DB", { songId });
        return;
      }

      const behaviorProfile = await deps.buildBehaviorProfile({
        userId,
        loopedSong,
        sessionDurationMinutes,
      });

      const evaluation = deps.evaluateLoop({
        replayCount: count,
        windowStart,
        now,
        hour,
        dismissalRate: behaviorProfile.dismissalRate,
        sessionDurationMinutes,
      });

      const reminderStyle = behaviorProfile.reminderStyle || "balanced";
      if (behaviorProfile.remindersMuted || reminderStyle === "never") {
        logger.debug(`[LD] Wellbeing reminders muted/disabled for user ${userId}.`);
        return;
      }

      const reminderMultiplier = getReminderStyleMultiplier(reminderStyle);
      const isLateNightContext = deps.isLateNight(hour, config);
      const baseSessionThreshold = isLateNightContext
        ? config.wellbeing.lateNightSessionTriggerMinutes
        : config.wellbeing.sessionTriggerMinutes;
      const minimumSessionThreshold = config.testing?.ultraMinimalMode ? 0.1 : 1;
      const adjustedSessionThreshold = Math.max(
        minimumSessionThreshold,
        Number((baseSessionThreshold * reminderMultiplier).toFixed(2))
      );

      const inQuietHours = isWithinQuietHours(
        hour,
        behaviorProfile.quietHoursStart,
        behaviorProfile.quietHoursEnd
      );
      const shouldRespectQuietHours = !!behaviorProfile.quietHoursEnabled;

      const loopTriggered = !!evaluation.isLoop;
      const sessionTriggered =
        sessionDurationMinutes >= adjustedSessionThreshold &&
        (!shouldRespectQuietHours || !inQuietHours);

      logger.debug(
        `[LD][TRIGGER_CHECK] user=${userId} loopTriggered=${loopTriggered} sessionTriggered=${sessionTriggered} sessionMinutes=${sessionDurationMinutes.toFixed(2)} threshold=${adjustedSessionThreshold} baseThreshold=${baseSessionThreshold} inQuietHours=${inQuietHours} lateNight=${isLateNightContext} reminderStyle=${reminderStyle}`
      );

      if (
        !config.testing?.ultraMinimalMode &&
        Number.isFinite(behaviorProfile.reminderCapPerDay) &&
        behaviorProfile.reminderCapPerDay > 0
      ) {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const todayCount = await deps.LoopEvent.countDocuments({
          userId,
          createdAt: { $gte: startOfDay },
        });

        if (todayCount >= behaviorProfile.reminderCapPerDay) {
          logger.debug(
            `[LD] Daily reminder cap reached for user ${userId}. today=${todayCount} cap=${behaviorProfile.reminderCapPerDay}`
          );
          return;
        }
      }

      if (!loopTriggered && !sessionTriggered) {
        const skipReasons = [];
        if (!loopTriggered) {
          skipReasons.push(`loop=false (${evaluation.reason || "below loop criteria"})`);
        }
        if (!sessionTriggered) {
          if (inQuietHours) {
            skipReasons.push("session=false (quiet hours active)");
          }
          if (sessionDurationMinutes < adjustedSessionThreshold) {
            skipReasons.push(
              `session=false (${sessionDurationMinutes.toFixed(2)}m < ${adjustedSessionThreshold}m threshold)`
            );
          }
        }

        logger.debug(
          `[LD] No wellbeing trigger. loop=${loopTriggered} session=${sessionTriggered} sessionMinutes=${sessionDurationMinutes} reasons=${skipReasons.join("; ")}`
        );
        return;
      }

      const triggerCategory = loopTriggered && sessionTriggered
        ? "combined"
        : sessionTriggered
          ? "session"
          : "loop";

      logger.info(
        `[LD] INTERVENTION TRIGGERED user=${userId} category=${triggerCategory} reason=${evaluation.reason}`
      );

      const candidates = await deps.getCandidates({
        userId,
        loopedSong,
        maxCandidates: config.llm.maxCandidates,
        behaviorProfile,
      });

      if (candidates.length === 0 && triggerCategory === "loop") {
        logger.warn("[LD] No candidates available. Logging no-candidate event.");

        try {
          await deps.LoopEvent.create({
            userId,
            loopedSongId: songId,
            replayCount: count,
            timeOfDay: deps.getTimeOfDay(hour),
            isLateNight: deps.isLateNight(hour, config),
            sessionDurationMinutes,
            interventionType: "no_candidates",
            interventionStatus: "triggered",
            triggerCategory,
            adaptiveContext: {
              fatigueLevel: behaviorProfile.fatigueLevel,
              emotionalStagnationScore: behaviorProfile.emotionalStagnationScore,
              dismissalRate: behaviorProfile.dismissalRate,
              preferredStrategy: behaviorProfile.preferredStrategy,
            },
          });
        } catch (eventError) {
          if (isDuplicateTriggeredInterventionError(eventError)) {
            logger.debug(`[LD] Duplicate no-candidate trigger suppressed for user ${userId}.`);
            return;
          }
          throw eventError;
        }

        await deps.setCooldown(redisClient, userId, { dismissalRate: behaviorProfile.dismissalRate });
        await deps.resetLoop(redisClient, userId, songId);
        return;
      }

      const behaviorContext = {
        replayCount: count,
        timeOfDay: deps.getTimeOfDay(hour),
        isLateNight: deps.isLateNight(hour, config),
        sessionWindowMinutes: sessionDurationMinutes,
        fatigueLevel: behaviorProfile.fatigueLevel,
        emotionalStagnationScore: Number(behaviorProfile.emotionalStagnationScore || 0).toFixed(2),
      };

      let bridgeSong = null;
      let interventionType = triggerCategory === "session" ? "health_nudge" : "fallback_random";
      let llmReason = null;
      let promptSnapshot = null;
      let responseSnapshot = null;
      const isSessionOnlyTrigger = triggerCategory === "session";
      const needsBridgeRecommendation = !isSessionOnlyTrigger;

      const shouldAttemptLLM = !behaviorProfile.shouldSkipLLM && needsBridgeRecommendation;

      if (isSessionOnlyTrigger) {
        bridgeSong = pickHealthBridgeTrack(candidates);
        interventionType = "health_nudge";
      }

      if (shouldAttemptLLM) {
        const llmResult = await deps.selectBridgeTrack({
          loopedSong,
          candidates,
          behaviorContext,
        });

        if (llmResult?.song) {
          bridgeSong = llmResult.song;
          interventionType = "llm";
          llmReason = llmResult.reason;
          promptSnapshot = llmResult.prompt;
          responseSnapshot = llmResult.rawResponse;
        }
      } else {
        logger.debug(`[LD] Skipping LLM due to adaptive policy for user ${userId}.`);
      }

      if (!bridgeSong && needsBridgeRecommendation) {
        const ruleSong = deps.fallbackRuleSelect(candidates, {
          loopedSong,
          behaviorProfile,
        });

        if (ruleSong) {
          bridgeSong = ruleSong;
          interventionType = "fallback_rule";
        }
      }

      if (!bridgeSong && needsBridgeRecommendation) {
        const randomSong = deps.fallbackRandomSelect(candidates);
        if (randomSong) {
          bridgeSong = randomSong;
          interventionType = "fallback_random";
        }
      }

      if (!bridgeSong && needsBridgeRecommendation) {
        logger.warn("[LD] All selection strategies failed. Aborting intervention.");
        return;
      }

      if (bridgeSong) {
        logger.info(`[LD] Bridge track selected: "${getSongTitle(bridgeSong)}" via ${interventionType}`);
      }

      await deps.setCooldown(redisClient, userId, { dismissalRate: behaviorProfile.dismissalRate });
      await deps.resetLoop(redisClient, userId, songId);

      let loopEvent;
      try {
        loopEvent = await deps.LoopEvent.create({
          userId,
          loopedSongId: songId,
          bridgeSongId: bridgeSong?._id || null,
          replayCount: count,
          timeOfDay: deps.getTimeOfDay(hour),
          isLateNight: deps.isLateNight(hour, config),
          sessionDurationMinutes,
          interventionType,
          interventionStatus: "triggered",
          triggerCategory,
          llmPromptSnapshot: promptSnapshot,
          llmResponseSnapshot: responseSnapshot,
          llmSelectionReason: llmReason,
          adaptiveContext: {
            fatigueLevel: behaviorProfile.fatigueLevel,
            emotionalStagnationScore: behaviorProfile.emotionalStagnationScore,
            dismissalRate: behaviorProfile.dismissalRate,
            preferredStrategy: behaviorProfile.preferredStrategy,
          },
        });
      } catch (eventError) {
        if (isDuplicateTriggeredInterventionError(eventError)) {
          logger.debug(`[LD] Duplicate intervention suppressed for user ${userId}.`);
          return;
        }
        throw eventError;
      }

      if (io?.of) {
        try {
          const loopDiagnosisNamespace = io.of("/loopDiagnosis");
          const namespaceSocketCount = loopDiagnosisNamespace?.sockets?.size ?? "unknown";
          const loopedSongPayload =
            toSongPayload(loopedSong) ||
            {
              _id: loopedSong?._id || songId,
              title: getSongTitle(loopedSong),
              artist: isMeaningfulText(loopedSong?.artist) ? loopedSong.artist.trim() : null,
              coverImage: loopedSong?.coverImage || loopedSong?.image || null,
              audioUrl: loopedSong?.audioUrl || loopedSong?.file || loopedSong?.url || null,
            };
          const bridgeSongPayload = toSongPayload(bridgeSong);

          logger.debug(
            `[LD] Preparing emit to room user:${userId} | namespace=/loopDiagnosis | sockets=${namespaceSocketCount}`
          );
          const interventionPayload = {
            loopEventId: loopEvent._id,
            loopedSong: loopedSongPayload,
            bridgeSong: bridgeSongPayload,
            severity: evaluation.severity,
            replayCount: count,
            sessionDurationMinutes,
            triggerCategory,
            timeOfDay: behaviorContext.timeOfDay,
            isLateNight: behaviorContext.isLateNight,
            interventionType,
            fatigueLevel: behaviorProfile.fatigueLevel,
            wellbeingActions:
              interventionType === "health_nudge"
                ? ["break", "snooze", "switch_mix"]
                : bridgeSongPayload
                  ? ["play_bridge", "dismiss"]
                  : ["dismiss"],
            snoozeSeconds: config.wellbeing.snoozeSeconds,
            message: resolveSupportiveMessage({
              profile: behaviorProfile,
              triggerCategory,
              interventionType,
              sessionDurationMinutes,
              replayCount: count,
              isLateNightContext,
            }),
            disclaimer: "Wellbeing reminders are supportive and not medical advice.",
          };

          loopDiagnosisNamespace.to(`user:${userId}`).emit("ld:intervention", interventionPayload);

          const normalizedUserId = String(userId);
          emitRealtime(io, REALTIME_EVENTS.LOOP_TRIGGERED, {
            ...interventionPayload,
            loopEventId: loopEvent._id?.toString?.() || loopEvent._id,
            userId: normalizedUserId,
            interventionStatus: "triggered",
            createdAt: loopEvent.createdAt,
          }, {
            source: "loop_diagnosis_engine",
            audience: "user_admin",
            userId: normalizedUserId,
          });

          emitRealtime(io, REALTIME_EVENTS.LIVE_STREAM_ACTIVITY, {
            type: "loop_triggered",
            loopEventId: loopEvent._id?.toString?.() || loopEvent._id,
            userId: normalizedUserId,
            triggerCategory,
            interventionType,
            replayCount: count,
            createdAt: loopEvent.createdAt,
          }, {
            source: "loop_diagnosis_engine",
            audience: "admin",
          });

          logger.debug(`[LD] Intervention emitted to user:${userId}`);
        } catch (emitErr) {
          logger.warn("[LD] Socket.io namespace lost. Event persisted without emit", {
            error: emitErr.message,
          });
        }
      } else {
        logger.warn("[LD] Socket.io namespace lost. Event persisted without emit.");
      }
    } catch (err) {
      logger.error("[LD] handlePlayEvent critical error", {
        error: err.message,
      });
    }
  };
}

export const handlePlayEvent = createLoopDiagnosisEngine();
