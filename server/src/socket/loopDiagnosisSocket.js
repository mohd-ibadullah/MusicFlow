// SYSTEM SCAN: default socket server is initialized in server/server.js and attached via app.set("io", io).
// SYSTEM SCAN: JWT payload includes userId (from authController generateToken).
// SYSTEM SCAN: LoopEvent status updates must be additive and resilient to socket disconnects/errors.

import jwt from "jsonwebtoken";
import LoopEvent from "../models/LoopEvent.js";
import { getRedisClient } from "../config/redis.js";
import {
  clearCooldown,
  recordDismissal,
  setSessionStart,
  setSnooze,
} from "../services/loopDiagnosis/redisLoopTracker.js";
import { getLoopDiagnosisConfig } from "../config/loopDiagnosisConfig.js";
import { logger } from "../utils/logger.js";
import {
  emitRealtime,
  REALTIME_EVENTS,
} from "./realtimeEvents.js";

export function initLoopDiagnosisSocket(io) {
  const ldNamespace = io.of("/loopDiagnosis");
  if (ldNamespace.__ldInitialized) {
    return ldNamespace;
  }
  ldNamespace.__ldInitialized = true;
  logger.info("[LD] Socket namespace initialized: /loopDiagnosis");

  ldNamespace.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      logger.warn("[LD] /loopDiagnosis auth failed: missing token.");
      return next(new Error("[LD] Authentication required."));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded?.userId || decoded?.id || decoded?._id;

      if (!socket.userId) {
        logger.warn("[LD] /loopDiagnosis auth failed: token payload missing user id.");
        return next(new Error("[LD] Invalid token payload."));
      }

      return next();
    } catch (_err) {
      logger.warn("[LD] /loopDiagnosis auth failed: invalid token.");
      return next(new Error("[LD] Invalid token."));
    }
  });

  ldNamespace.on("connection", (socket) => {
    const userId = String(socket.userId);
    logger.debug(
      `[LD] Socket connected: userId=${userId} | socketId=${socket.id} | namespaceSockets=${ldNamespace.sockets.size}`
    );

    socket.join(`user:${userId}`);

    const emitLoopSocketStatus = (loopEventId, interventionStatus, sourceAction) => {
      emitRealtime(io, REALTIME_EVENTS.LOOP_UPDATED, {
        loopEventId,
        userId,
        interventionStatus,
        updatedAt: new Date().toISOString(),
      }, {
        source: `loop_diagnosis_socket:${sourceAction}`,
        audience: "user_admin",
        userId,
      });

      emitRealtime(io, REALTIME_EVENTS.LIVE_STREAM_ACTIVITY, {
        type: "loop_updated",
        loopEventId,
        userId,
        interventionStatus,
        updatedAt: new Date().toISOString(),
      }, {
        source: `loop_diagnosis_socket:${sourceAction}`,
        audience: "admin",
      });
    };

    socket.on("ld:dismissed", async ({ loopEventId }) => {
      logger.debug(`[LD] Dismissed: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "dismissed", resolvedAt: new Date() }
        );
        if (updatedEvent) {
          await recordDismissal(getRedisClient(), userId);
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          emitLoopSocketStatus(loopEventId, "dismissed", "dismissed");
        }
      } catch (err) {
        logger.error("[LD] ld:dismissed DB error", { error: err.message });
      }
    });

    socket.on("ld:bridgePlayed", async ({ loopEventId }) => {
      logger.debug(`[LD] Bridge played: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "bridge_played", resolvedAt: new Date() }
        );

        if (updatedEvent) {
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          emitLoopSocketStatus(loopEventId, "bridge_played", "bridgePlayed");
        }
      } catch (err) {
        logger.error("[LD] ld:bridgePlayed DB error", { error: err.message });
      }
    });

    socket.on("ld:breakTaken", async ({ loopEventId }) => {
      logger.debug(`[LD] Break taken: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "break_taken", resolvedAt: new Date() },
          { new: true }
        );

        if (updatedEvent) {
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          await clearCooldown(getRedisClient(), userId);
          emitLoopSocketStatus(loopEventId, "break_taken", "breakTaken");
        }
      } catch (err) {
        logger.error("[LD] ld:breakTaken DB error", { error: err.message });
      }
    });

    socket.on("ld:snoozed", async ({ loopEventId }) => {
      logger.debug(`[LD] Snoozed: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "snoozed", resolvedAt: new Date() },
          { new: true }
        );

        if (updatedEvent) {
          const config = getLoopDiagnosisConfig();
          const snoozeSeconds =
            config.wellbeing.snoozeSeconds || (config.wellbeing.snoozeMinutes || 0) * 60;
          await setSnooze(getRedisClient(), userId, {
            snoozeSeconds,
            snoozeMinutes: config.wellbeing.snoozeMinutes,
          });
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          emitLoopSocketStatus(loopEventId, "snoozed", "snoozed");
        }
      } catch (err) {
        logger.error("[LD] ld:snoozed DB error", { error: err.message });
      }
    });

    socket.on("ld:switchMix", async ({ loopEventId }) => {
      logger.debug(`[LD] Switch mix: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "switched_mix", resolvedAt: new Date() }
        );

        if (updatedEvent) {
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          emitLoopSocketStatus(loopEventId, "switched_mix", "switchMix");
        }
      } catch (err) {
        logger.error("[LD] ld:switchMix DB error", { error: err.message });
      }
    });

    socket.on("ld:ignored", async ({ loopEventId }) => {
      logger.debug(`[LD] Ignored: userId=${userId} loopEventId=${loopEventId}`);
      try {
        const updatedEvent = await LoopEvent.findOneAndUpdate(
          { _id: loopEventId, userId, interventionStatus: "triggered" },
          { interventionStatus: "ignored", resolvedAt: new Date() },
          { new: true }
        );
        if (updatedEvent) {
          await recordDismissal(getRedisClient(), userId);
          await setSessionStart(getRedisClient(), userId, { startAt: new Date() });
          emitLoopSocketStatus(loopEventId, "ignored", "ignored");
        }
      } catch (err) {
        logger.error("[LD] ld:ignored DB error", { error: err.message });
      }
    });

    socket.on("disconnect", (reason) => {
      logger.debug(
        `[LD] Socket disconnected: userId=${userId} | reason=${reason} | namespaceSockets=${ldNamespace.sockets.size}`
      );
    });
  });

  return ldNamespace;
}
