// SYSTEM SCAN: loopDiagnosisEngine supports dependency injection through createLoopDiagnosisEngine.
// SYSTEM SCAN: play route should remain non-blocking, so engine tests focus on safe early returns and side effects.
// SYSTEM SCAN: Redis and Socket can be unavailable; engine must not throw in those conditions.

import test from "node:test";
import assert from "node:assert/strict";

import { createLoopDiagnosisEngine } from "../../src/services/loopDiagnosis/loopDiagnosisEngine.js";

const validUserId = "507f191e810c19729de860ea";
const validSongId = "507f191e810c19729de860eb";

const makeConfig = (enabled = true) => ({
  enabled,
  timeWindowMinutes: 45,
  interventionExpirySeconds: 30,
  llm: {
    maxCandidates: 10,
  },
  lateNight: {
    start: 22,
    end: 5,
    threshold: 3,
  },
  replayThreshold: 4,
  wellbeing: {
    fatigueSoftMinutes: 90,
    fatigueHardMinutes: 120,
    sessionTriggerMinutes: 90,
    lateNightSessionTriggerMinutes: 45,
    dismissalLookbackDays: 7,
    stagnationWindowHours: 6,
  },
  redis: {
    namespace: "ld:",
    keys: {
      loopCounter: () => "ld:loop",
      sessionWindow: () => "ld:window",
      sessionStart: () => "ld:sessionstart",
      cooldown: () => "ld:cooldown",
      snooze: () => "ld:snooze",
      lastIntervention: () => "ld:last",
      dismissalCount: () => "ld:dismissals",
    },
    ttl: {
      loopCounter: 3600,
      sessionStart: 21600,
      cooldown: 5400,
      snooze: 1800,
      dismissalCount: 604800,
    },
  },
});

const makeIoMock = () => {
  const emitCalls = [];
  const io = {
    of: () => ({
      to: () => ({
        emit: (...args) => emitCalls.push(args),
      }),
    }),
  };
  return { io, emitCalls };
};

const makeDeps = (overrides = {}) => {
  const loopEventCreates = [];

  const base = {
    getLoopDiagnosisConfig: () => makeConfig(true),
    isInCooldown: async () => false,
    isSnoozed: async () => false,
    getSessionStart: async () => new Date(Date.now() - 20 * 60 * 1000),
    incrementAndGet: async () => ({ count: 4, windowStart: new Date(Date.now() - 20 * 60 * 1000) }),
    evaluateLoop: () => ({
      isLoop: true,
      reason: "threshold reached",
      severity: "low",
    }),
    getCandidates: async () => [
      { _id: "507f191e810c19729de86111", name: "Bridge 1", artist: "Artist A", genre: "Pop", image: "", file: "" },
      { _id: "507f191e810c19729de86112", name: "Bridge 2", artist: "Artist B", genre: "Rock", image: "", file: "" },
      { _id: "507f191e810c19729de86113", name: "Bridge 3", artist: "Artist C", genre: "Indie", image: "", file: "" },
      { _id: "507f191e810c19729de86114", name: "Bridge 4", artist: "Artist D", genre: "Soul", image: "", file: "" },
      { _id: "507f191e810c19729de86115", name: "Bridge 5", artist: "Artist E", genre: "Jazz", image: "", file: "" },
    ],
    selectBridgeTrack: async () => ({
      song: { _id: "507f191e810c19729de86111", name: "Bridge 1", artist: "Artist A", image: "", file: "" },
      reason: "best fit",
      source: "llm",
      prompt: "prompt",
      rawResponse: "{\"selectedSongId\":\"507f191e810c19729de86111\"}",
    }),
    fallbackRuleSelect: (candidates) => candidates[0],
    fallbackRandomSelect: (candidates) => candidates[1],
    setCooldown: async () => {},
    resetLoop: async () => {},
    buildBehaviorProfile: async () => ({
      fatigueLevel: "none",
      emotionalStagnationScore: 0.2,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursStart: 23,
      quietHoursEnd: 6,
      reminderCapPerDay: null,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
    getTimeOfDay: () => "afternoon",
    isLateNight: () => false,
    LoopEvent: {
      updateMany: async () => ({ modifiedCount: 0 }),
      countDocuments: async () => 0,
      create: async (doc) => {
        loopEventCreates.push(doc);
        return { _id: "507f191e810c19729de86222", ...doc };
      },
    },
    Song: {
      findById: () => ({
        lean: async () => ({
          _id: validSongId,
          name: "Loop Song",
          artist: "Loop Artist",
          genre: "Ambient",
          image: "",
          file: "",
        }),
      }),
    },
  };

  const deps = { ...base, ...overrides };
  return { deps, loopEventCreates };
};

test("CASE 1: Feature flag disabled", async () => {
  let redisCallCount = 0;
  const { deps } = makeDeps({
    getLoopDiagnosisConfig: () => makeConfig(false),
    isInCooldown: async () => {
      redisCallCount += 1;
      return false;
    },
  });

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io: null,
  });

  assert.equal(redisCallCount, 0);
});

test("CASE 2: User in cooldown", async () => {
  let evaluateCalled = false;
  const { deps } = makeDeps({
    isInCooldown: async () => true,
    evaluateLoop: () => {
      evaluateCalled = true;
      return { isLoop: false, reason: "n/a", severity: "none" };
    },
  });

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io: null,
  });

  assert.equal(evaluateCalled, false);
});

test("CASE 3: Redis failure increment count=0", async () => {
  const { deps, loopEventCreates } = makeDeps({
    incrementAndGet: async () => ({ count: 0, windowStart: null }),
  });

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await assert.doesNotReject(
    handlePlayEvent({
      userId: validUserId,
      songId: validSongId,
      redisClient: {},
      io: null,
    })
  );

  assert.equal(loopEventCreates.length, 0);
});

test("CASE 4: Replay count below threshold", async () => {
  const { deps, loopEventCreates } = makeDeps({
    evaluateLoop: () => ({ isLoop: false, reason: "below threshold", severity: "none" }),
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 0);
  assert.equal(emitCalls.length, 0);
});

test("CASE 5: Loop detected, LLM succeeds", async () => {
  const { deps, loopEventCreates } = makeDeps();
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].interventionType, "llm");
  assert.equal(emitCalls.length, 1);
  assert.equal(emitCalls[0][0], "ld:intervention");
});

test("CASE 6: Loop detected, LLM fails, fallback works", async () => {
  const { deps, loopEventCreates } = makeDeps({
    selectBridgeTrack: async () => ({ song: null, reason: "fail", source: "error" }),
  });

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io: makeIoMock().io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].interventionType, "fallback_rule");
});

test("CASE 7: Loop detected, no candidates", async () => {
  const { deps, loopEventCreates } = makeDeps({
    getCandidates: async () => [],
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].interventionType, "no_candidates");
  assert.equal(emitCalls.length, 0);
});

test("CASE 8: MongoDB create fails", async () => {
  const { deps } = makeDeps({
    LoopEvent: {
      updateMany: async () => ({ modifiedCount: 0 }),
      countDocuments: async () => 0,
      create: async () => {
        throw new Error("create failed");
      },
    },
  });

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await assert.doesNotReject(
    handlePlayEvent({
      userId: validUserId,
      songId: validSongId,
      redisClient: {},
      io: makeIoMock().io,
    })
  );
});

test("CASE 9: Session trigger emits health_nudge", async () => {
  const { deps, loopEventCreates } = makeDeps({
    incrementAndGet: async () => ({ count: 1, windowStart: new Date(Date.now() - 10 * 60 * 1000) }),
    getSessionStart: async () => new Date(Date.now() - 120 * 60 * 1000),
    evaluateLoop: () => ({ isLoop: false, reason: "below threshold", severity: "none" }),
    buildBehaviorProfile: async () => ({
      fatigueLevel: "soft",
      emotionalStagnationScore: 0.15,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      reminderCapPerDay: 4,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].interventionType, "health_nudge");
  assert.equal(loopEventCreates[0].triggerCategory, "session");
  assert.equal(emitCalls.length, 1);
  assert.equal(emitCalls[0][0], "ld:intervention");
  assert.equal(emitCalls[0][1].interventionType, "health_nudge");
});

test("CASE 9B: Combined trigger prioritizes loop intervention", async () => {
  const { deps, loopEventCreates } = makeDeps({
    incrementAndGet: async () => ({ count: 4, windowStart: new Date(Date.now() - 12 * 60 * 1000) }),
    getSessionStart: async () => new Date(Date.now() - 120 * 60 * 1000),
    evaluateLoop: () => ({ isLoop: true, reason: "threshold reached", severity: "low" }),
    buildBehaviorProfile: async () => ({
      fatigueLevel: "soft",
      emotionalStagnationScore: 0.3,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      reminderCapPerDay: 4,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].triggerCategory, "combined");
  assert.notEqual(loopEventCreates[0].interventionType, "health_nudge");
  assert.equal(emitCalls.length, 1);
  assert.equal(emitCalls[0][0], "ld:intervention");
  assert.equal(emitCalls[0][1].triggerCategory, "combined");
  assert.notEqual(emitCalls[0][1].interventionType, "health_nudge");
  assert.deepEqual(emitCalls[0][1].wellbeingActions, ["play_bridge", "dismiss"]);
  assert.ok(emitCalls[0][1].bridgeSong?._id);
});

test("CASE 9C: Session reminder triggers during quiet-hour window when quiet hours are disabled", async () => {
  const currentHour = new Date().getHours();
  const nextHour = (currentHour + 1) % 24;

  const { deps, loopEventCreates } = makeDeps({
    incrementAndGet: async () => ({ count: 1, windowStart: new Date(Date.now() - 10 * 60 * 1000) }),
    getSessionStart: async () => new Date(Date.now() - 120 * 60 * 1000),
    evaluateLoop: () => ({ isLoop: false, reason: "below threshold", severity: "none" }),
    buildBehaviorProfile: async () => ({
      fatigueLevel: "soft",
      emotionalStagnationScore: 0.15,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursEnabled: false,
      quietHoursStart: currentHour,
      quietHoursEnd: nextHour,
      reminderCapPerDay: 4,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 1);
  assert.equal(loopEventCreates[0].triggerCategory, "session");
  assert.equal(loopEventCreates[0].interventionType, "health_nudge");
  assert.equal(emitCalls.length, 1);
});

test("CASE 9D: Session reminder is suppressed during quiet hours when enabled", async () => {
  const currentHour = new Date().getHours();
  const nextHour = (currentHour + 1) % 24;

  const { deps, loopEventCreates } = makeDeps({
    incrementAndGet: async () => ({ count: 1, windowStart: new Date(Date.now() - 10 * 60 * 1000) }),
    getSessionStart: async () => new Date(Date.now() - 120 * 60 * 1000),
    evaluateLoop: () => ({ isLoop: false, reason: "below threshold", severity: "none" }),
    buildBehaviorProfile: async () => ({
      fatigueLevel: "soft",
      emotionalStagnationScore: 0.15,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursEnabled: true,
      quietHoursStart: currentHour,
      quietHoursEnd: nextHour,
      reminderCapPerDay: 4,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 0);
  assert.equal(emitCalls.length, 0);
});

test("CASE 10: Daily reminder cap blocks intervention", async () => {
  const { deps, loopEventCreates } = makeDeps({
    buildBehaviorProfile: async () => ({
      fatigueLevel: "none",
      emotionalStagnationScore: 0.1,
      dismissalRate: 0,
      reminderStyle: "balanced",
      remindersMuted: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      reminderCapPerDay: 1,
      preferredStrategy: null,
      shouldSkipLLM: false,
    }),
    LoopEvent: {
      updateMany: async () => ({ modifiedCount: 0 }),
      countDocuments: async () => 1,
      create: async (doc) => {
        loopEventCreates.push(doc);
        return { _id: "507f191e810c19729de86222", ...doc };
      },
    },
  });
  const { io, emitCalls } = makeIoMock();

  const handlePlayEvent = createLoopDiagnosisEngine(deps);

  await handlePlayEvent({
    userId: validUserId,
    songId: validSongId,
    redisClient: {},
    io,
  });

  assert.equal(loopEventCreates.length, 0);
  assert.equal(emitCalls.length, 0);
});
