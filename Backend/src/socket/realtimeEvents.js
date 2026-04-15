import crypto from "crypto";
import { logger } from "../utils/logger.js";

export const REALTIME_EVENTS = {
  ACTIVITY_CREATED: "activity:created",
  PLAYLIST_CREATED: "playlist:created",
  PLAYLIST_UPDATED: "playlist:updated",
  PLAYLIST_DELETED: "playlist:deleted",
  SONG_CREATED: "song:created",
  SONG_UPDATED: "song:updated",
  SONG_DELETED: "song:deleted",
  SONG_PLAYED: "song:played",
  SONG_LIKED: "song:liked",
  SONG_UNLIKED: "song:unliked",
  ALBUM_CREATED: "album:created",
  ALBUM_UPDATED: "album:updated",
  ALBUM_DELETED: "album:deleted",
  AI_PLAYLIST_GENERATED: "ai:playlist:generated",
  LOOP_TRIGGERED: "loop:triggered",
  LOOP_UPDATED: "loop:updated",
  LIVE_STREAM_ACTIVITY: "live:stream:activity",
  LISTENERS_UPDATED: "listeners:updated",
};

const REALTIME_VERSION = 1;

const normalizeAudience = (audience) => {
  const value = `${audience || "all"}`.trim().toLowerCase();
  if (["all", "admin", "user", "user_admin"].includes(value)) return value;
  return "all";
};

const emitByAudience = (io, eventName, envelope, { audience, userId, rooms = [] }) => {
  const normalizedAudience = normalizeAudience(audience);
  const targetUserId = userId ? String(userId) : null;

  if (normalizedAudience === "all") {
    io.emit(eventName, envelope);
    return;
  }

  if (normalizedAudience === "admin") {
    io.to("admin").emit(eventName, envelope);
    return;
  }

  if (normalizedAudience === "user") {
    if (targetUserId) {
      io.to(`user:${targetUserId}`).emit(eventName, envelope);
    }
    return;
  }

  if (normalizedAudience === "user_admin") {
    if (targetUserId) {
      io.to(`user:${targetUserId}`).emit(eventName, envelope);
    }
    io.to("admin").emit(eventName, envelope);
    return;
  }

  for (const room of rooms) {
    if (!room) continue;
    io.to(room).emit(eventName, envelope);
  }
};

export const buildRealtimeEnvelope = ({ event, payload = {}, source = "backend", eventId = null }) => ({
  event,
  eventId: eventId || crypto.randomUUID(),
  emittedAt: new Date().toISOString(),
  version: REALTIME_VERSION,
  source,
  payload,
});

export const emitRealtime = (
  io,
  eventName,
  payload = {},
  {
    source = "backend",
    eventId = null,
    audience = "all",
    userId = null,
    rooms = [],
    legacy = [],
  } = {}
) => {
  if (!io || typeof io.emit !== "function") return null;

  const envelope = buildRealtimeEnvelope({
    event: eventName,
    payload,
    source,
    eventId,
  });

  try {
    emitByAudience(io, eventName, envelope, { audience, userId, rooms });

    if (Array.isArray(legacy)) {
      for (const legacyEvent of legacy) {
        if (!legacyEvent?.name) continue;
        const legacyPayload =
          legacyEvent.payload === undefined ? payload : legacyEvent.payload;
        emitByAudience(io, legacyEvent.name, legacyPayload, {
          audience: legacyEvent.audience || audience,
          userId: legacyEvent.userId || userId,
          rooms: legacyEvent.rooms || rooms,
        });
      }
    }

    return envelope;
  } catch (error) {
    logger.warn("Realtime emit failed", {
      event: eventName,
      audience,
      error: error.message,
    });
    return null;
  }
};

export const emitRealtimeFromReq = (
  req,
  eventName,
  payload = {},
  options = {}
) => {
  const io = req?.app?.get?.("io");
  if (!io) return null;
  return emitRealtime(io, eventName, payload, options);
};
