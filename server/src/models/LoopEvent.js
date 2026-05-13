// SYSTEM SCAN: User and Song models are registered as "User" and "Song" in server/src/models.
// SYSTEM SCAN: play events are tracked from incrementPlayCount in songController and can be correlated by userId/songId.
// SYSTEM SCAN: backend is ESM; new model must export default with mongoose.model.

import mongoose from "mongoose";

const loopEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  loopedSongId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Song",
    required: true,
  },
  bridgeSongId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Song",
    default: null,
  },
  replayCount: {
    type: Number,
    required: true,
  },
  timeOfDay: {
    type: String,
    enum: ["morning", "afternoon", "evening", "latenight", "deepnight"],
    required: true,
  },
  isLateNight: {
    type: Boolean,
    default: false,
  },
  sessionDurationMinutes: {
    type: Number,
    default: 0,
  },
  interventionType: {
    type: String,
    enum: ["llm", "fallback_rule", "fallback_random", "no_candidates", "health_nudge"],
    required: true,
  },
  interventionStatus: {
    type: String,
    enum: [
      "triggered",
      "dismissed",
      "bridge_played",
      "break_taken",
      "snoozed",
      "switched_mix",
      "ignored",
      "expired",
    ],
    default: "triggered",
  },
  triggerCategory: {
    type: String,
    enum: ["loop", "session", "combined"],
    default: "loop",
  },
  llmPromptSnapshot: {
    type: String,
    default: null,
  },
  llmResponseSnapshot: {
    type: String,
    default: null,
  },
  llmSelectionReason: {
    type: String,
    default: null,
  },
  adaptiveContext: {
    fatigueLevel: { type: String, enum: ["none", "soft", "high"], default: "none" },
    emotionalStagnationScore: { type: Number, default: 0 },
    dismissalRate: { type: Number, default: 0 },
    preferredStrategy: { type: String, default: null },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
});

loopEventSchema.index({ userId: 1, createdAt: -1 });
loopEventSchema.index({ interventionStatus: 1, createdAt: -1 });
// Ensure only one active triggered intervention exists per user at any time.
loopEventSchema.index(
  { userId: 1, interventionStatus: 1 },
  {
    unique: true,
    partialFilterExpression: { interventionStatus: "triggered" },
  }
);
// Keep collection bounded to support production stability.
loopEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

const LoopEvent = mongoose.model("LoopEvent", loopEventSchema);

export default LoopEvent;
