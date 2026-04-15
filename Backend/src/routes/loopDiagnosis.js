// SYSTEM SCAN: auth middleware sets req.user.userId and req.user.role in authMiddleware.
// SYSTEM SCAN: io is available through req.app.get("io"); Redis may be null and must be handled safely.
// SYSTEM SCAN: admin endpoints in this codebase use authenticateToken + authorizeAdmin.

import express from "express";
import mongoose from "mongoose";
import LoopEvent from "../models/LoopEvent.js";
import User from "../models/userModel.js";
import {
  clearCooldown,
  recordDismissal,
  setSessionStart,
  setSnooze,
} from "../services/loopDiagnosis/redisLoopTracker.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";
import { getLoopDiagnosisConfig } from "../config/loopDiagnosisConfig.js";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import {
  emitRealtimeFromReq,
  REALTIME_EVENTS,
} from "../socket/realtimeEvents.js";

const router = express.Router();

const getEffectiveRedisClient = (req) => req.app.get("redisClient") || getRedisClient();
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const emitLoopStatusUpdate = (req, event, userId, sourceAction) => {
  if (!event || !userId) return;

  const normalizedUserId = String(userId);
  const loopPayload = {
    loopEventId: event._id?.toString?.() || event._id,
    userId: normalizedUserId,
    interventionStatus: event.interventionStatus,
    interventionType: event.interventionType,
    triggerCategory: event.triggerCategory,
    replayCount: event.replayCount,
    resolvedAt: event.resolvedAt,
    updatedAt: new Date().toISOString(),
  };

  emitRealtimeFromReq(req, REALTIME_EVENTS.LOOP_UPDATED, loopPayload, {
    source: `loop_diagnosis_route:${sourceAction}`,
    audience: "user_admin",
    userId: normalizedUserId,
  });

  emitRealtimeFromReq(req, REALTIME_EVENTS.LIVE_STREAM_ACTIVITY, {
    type: "loop_updated",
    ...loopPayload,
  }, {
    source: `loop_diagnosis_route:${sourceAction}`,
    audience: "admin",
  });
};

router.use((req, res, next) => {
  const config = getLoopDiagnosisConfig();
  if (!config.enabled) {
    return res.status(503).json({ success: false, message: "Loop Diagnosis is disabled." });
  }
  return next();
});

/**
 * POST /api/loop-diagnosis/event/:id/dismiss
 */
router.post("/event/:id/dismiss", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const redisClient = getEffectiveRedisClient(req);
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const event = await LoopEvent.findOne({ _id: req.params.id, userId });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    if (event.interventionStatus === "triggered") {
      event.interventionStatus = "dismissed";
      event.resolvedAt = new Date();
      await event.save();
      await recordDismissal(redisClient, userId.toString());
      await setSessionStart(redisClient, userId.toString(), { startAt: new Date() });
      emitLoopStatusUpdate(req, event, userId, "dismiss");
    }

    return res.json({ success: true, event });
  } catch (err) {
    console.error("[LD] dismiss error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/event/:id/bridge-played
 */
router.post("/event/:id/bridge-played", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const redisClient = getEffectiveRedisClient(req);
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const event = await LoopEvent.findOne({ _id: req.params.id, userId });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    if (event.interventionStatus === "triggered") {
      event.interventionStatus = "bridge_played";
      event.resolvedAt = new Date();
      await event.save();
      await setSessionStart(redisClient, userId.toString(), { startAt: new Date() });
      emitLoopStatusUpdate(req, event, userId, "bridge_played");
    }

    return res.json({ success: true, event });
  } catch (err) {
    console.error("[LD] bridge-played error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/event/:id/break
 */
router.post("/event/:id/break", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const updatedEvent = await LoopEvent.findOneAndUpdate(
      { _id: req.params.id, userId, interventionStatus: "triggered" },
      { interventionStatus: "break_taken", resolvedAt: new Date() },
      { new: true }
    );

    let event = updatedEvent;
    if (!event) {
      event = await LoopEvent.findOne({ _id: req.params.id, userId });
    }

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    if (updatedEvent) {
      logger.debug(`[LD] Break taken (HTTP): userId=${userId} loopEventId=${updatedEvent._id}`);

      // Treat break as a fresh session baseline for predictable retest timing.
      await setSessionStart(getEffectiveRedisClient(req), userId.toString(), {
        startAt: new Date(),
      });

      // In test/retry loops, break should not be blocked by previous intervention cooldown.
      await clearCooldown(getEffectiveRedisClient(req), userId.toString());
      emitLoopStatusUpdate(req, updatedEvent, userId, "break");
    }

    return res.json({ success: true, event });
  } catch (err) {
    console.error("[LD] break action error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/event/:id/snooze
 */
router.post("/event/:id/snooze", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const updatedEvent = await LoopEvent.findOneAndUpdate(
      { _id: req.params.id, userId, interventionStatus: "triggered" },
      { interventionStatus: "snoozed", resolvedAt: new Date() },
      { new: true }
    );

    let event = updatedEvent;
    if (!event) {
      event = await LoopEvent.findOne({ _id: req.params.id, userId });
    }

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    const config = getLoopDiagnosisConfig();
    const snoozeSeconds =
      config.wellbeing.snoozeSeconds || (config.wellbeing.snoozeMinutes || 0) * 60;

    if (updatedEvent) {
      logger.debug(`[LD] Snoozed (HTTP): userId=${userId} loopEventId=${updatedEvent._id}`);

      await setSnooze(getEffectiveRedisClient(req), userId.toString(), {
        snoozeSeconds,
        snoozeMinutes: config.wellbeing.snoozeMinutes,
      });

      // Reset session baseline so post-snooze timing starts from the snooze action.
      await setSessionStart(getEffectiveRedisClient(req), userId.toString(), {
        startAt: new Date(),
      });
      emitLoopStatusUpdate(req, updatedEvent, userId, "snooze");
    }

    return res.json({
      success: true,
      event,
      message: `Reminders snoozed for ${snoozeSeconds} seconds.`,
    });
  } catch (err) {
    console.error("[LD] snooze action error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/event/:id/switch-mix
 */
router.post("/event/:id/switch-mix", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const redisClient = getEffectiveRedisClient(req);
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const event = await LoopEvent.findOne({ _id: req.params.id, userId });
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    if (event.interventionStatus === "triggered") {
      event.interventionStatus = "switched_mix";
      event.resolvedAt = new Date();
      await event.save();
      await setSessionStart(redisClient, userId.toString(), { startAt: new Date() });
      emitLoopStatusUpdate(req, event, userId, "switch_mix");
    }

    return res.json({ success: true, event });
  } catch (err) {
    console.error("[LD] switch-mix action error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * GET /api/loop-diagnosis/preferences
 */
router.get("/preferences", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user?.userId).select("loopDiagnosisPrefs").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.json({ success: true, preferences: user.loopDiagnosisPrefs || {} });
  } catch (err) {
    console.error("[LD] get preferences error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * PUT /api/loop-diagnosis/preferences
 */
router.put("/preferences", authenticateToken, async (req, res) => {
  try {
    const allowedStyles = ["never", "light", "balanced", "strict"];
    const style = `${req.body?.reminderStyle || ""}`.toLowerCase();
    const remindersMuted = req.body?.remindersMuted;
    const quietHoursEnabled = req.body?.quietHoursEnabled;
    const quietHoursStart = req.body?.quietHoursStart;
    const quietHoursEnd = req.body?.quietHoursEnd;
    const reminderCapPerDay = req.body?.reminderCapPerDay;

    const update = {};
    if (allowedStyles.includes(style)) update["loopDiagnosisPrefs.reminderStyle"] = style;
    if (typeof remindersMuted === "boolean") {
      update["loopDiagnosisPrefs.remindersMuted"] = remindersMuted;
    }
    if (typeof quietHoursEnabled === "boolean") {
      update["loopDiagnosisPrefs.quietHoursEnabled"] = quietHoursEnabled;
    }
    if (Number.isFinite(quietHoursStart)) {
      update["loopDiagnosisPrefs.quietHoursStart"] = Math.max(0, Math.min(23, quietHoursStart));
    }
    if (Number.isFinite(quietHoursEnd)) {
      update["loopDiagnosisPrefs.quietHoursEnd"] = Math.max(0, Math.min(23, quietHoursEnd));
    }
    if (Number.isFinite(reminderCapPerDay)) {
      update["loopDiagnosisPrefs.reminderCapPerDay"] = Math.max(1, Math.min(12, reminderCapPerDay));
    }

    const user = await User.findByIdAndUpdate(
      req.user?.userId,
      { $set: update },
      { new: true, runValidators: true }
    ).select("loopDiagnosisPrefs");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.json({ success: true, preferences: user.loopDiagnosisPrefs || {} });
  } catch (err) {
    console.error("[LD] update preferences error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/event/:id/ignored
 */
router.post("/event/:id/ignored", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid event id." });
    }

    const event = await LoopEvent.findOne({ _id: req.params.id, userId });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    if (event.interventionStatus === "triggered") {
      event.interventionStatus = "ignored";
      event.resolvedAt = new Date();
      await event.save();
      await recordDismissal(getEffectiveRedisClient(req), userId.toString());
      emitLoopStatusUpdate(req, event, userId, "ignored");
    }

    return res.json({ success: true, event });
  } catch (err) {
    console.error("[LD] ignored error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/cooldown/clear-self
 * Development helper to unblock repeated local tests.
 */
router.post("/cooldown/clear-self", authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ success: false, message: "Not available in production." });
  }

  try {
    const userId = req.user?.userId?.toString();
    await clearCooldown(getEffectiveRedisClient(req), userId);
    logger.debug(`[LD] Development self cooldown clear executed for user ${userId}`);
    return res.json({ success: true, message: "Cooldown cleared for current user." });
  } catch (err) {
    console.error("[LD] clear-self cooldown error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * GET /api/loop-diagnosis/history
 */
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;

    const events = await LoopEvent.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("loopedSongId", "name artist")
      .populate("bridgeSongId", "name artist")
      .lean();

    return res.json({ success: true, events });
  } catch (err) {
    console.error("[LD] history error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * GET /api/loop-diagnosis/admin/stats
 */
router.get("/admin/stats", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const [
      totals,
      statusBreakdown,
      typeBreakdown,
      recentEvents,
      chronologicalEvents,
    ] = await Promise.all([
      LoopEvent.countDocuments(),
      LoopEvent.aggregate([
        { $group: { _id: "$interventionStatus", count: { $sum: 1 } } },
      ]),
      LoopEvent.aggregate([
        { $group: { _id: "$interventionType", count: { $sum: 1 } } },
      ]),
      LoopEvent.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("userId", "name email")
        .populate("loopedSongId", "name artist")
        .populate("bridgeSongId", "name artist")
        .lean(),
      LoopEvent.find({})
        .sort({ userId: 1, createdAt: 1 })
        .select("userId triggerCategory")
        .lean(),
    ]);

    const bridgePlayedCount =
      statusBreakdown.find((status) => status._id === "bridge_played")?.count || 0;
    const breakTakenCount =
      statusBreakdown.find((status) => status._id === "break_taken")?.count || 0;
    const switchedMixCount =
      statusBreakdown.find((status) => status._id === "switched_mix")?.count || 0;
    const snoozedCount =
      statusBreakdown.find((status) => status._id === "snoozed")?.count || 0;
    const dismissedCount =
      statusBreakdown.find((status) => status._id === "dismissed")?.count || 0;
    const ignoredCount =
      statusBreakdown.find((status) => status._id === "ignored")?.count || 0;

    const acceptedCount = bridgePlayedCount + breakTakenCount + switchedMixCount;
    const successRate = totals > 0 ? ((acceptedCount / totals) * 100).toFixed(1) : "0.0";

    const usersWithPriorIntervention = new Set();
    let loopAfterInterventionCount = 0;

    for (const event of chronologicalEvents) {
      const userKey = event?.userId?.toString?.();
      if (!userKey) continue;

      const isLoopRelapse = event.triggerCategory === "loop" || event.triggerCategory === "combined";
      if (isLoopRelapse && usersWithPriorIntervention.has(userKey)) {
        loopAfterInterventionCount += 1;
      }

      usersWithPriorIntervention.add(userKey);
    }

    return res.json({
      success: true,
      totals,
      accepted: acceptedCount,
      bridgePlayed: bridgePlayedCount,
      breakTaken: breakTakenCount,
      switchedMix: switchedMixCount,
      snoozed: snoozedCount,
      dismissed: dismissedCount,
      ignored: ignoredCount,
      loopAfterIntervention: loopAfterInterventionCount,
      successRate: `${successRate}%`,
      statusBreakdown,
      typeBreakdown,
      recentEvents,
    });
  } catch (err) {
    console.error("[LD] admin stats error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

/**
 * POST /api/loop-diagnosis/admin/clear-cooldown/:userId
 */
router.post(
  "/admin/clear-cooldown/:userId",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.userId)) {
        return res.status(400).json({ success: false, message: "Invalid user id." });
      }

      await clearCooldown(getEffectiveRedisClient(req), req.params.userId);
      return res.json({ success: true, message: "Cooldown cleared." });
    } catch (err) {
      console.error("[LD] clear-cooldown error:", err.message);
      return res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

export default router;
