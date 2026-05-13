// SYSTEM SCAN: llmBridgeSelector exports pure helpers safeParseJSON/buildPrompt/validateSelection.
// SYSTEM SCAN: LLM provider SDKs are dynamically imported, so helper tests can run offline.
// SYSTEM SCAN: Song field naming in this project is name/artist/genre/duration.

import test from "node:test";
import assert from "node:assert/strict";

import {
  safeParseJSON,
  buildPrompt,
  validateSelection,
} from "../../src/services/loopDiagnosis/llmBridgeSelector.js";

const loopedSong = {
  _id: "507f191e810c19729de86001",
  name: "Night Drift",
  artist: "Echo Lane",
  genre: "Ambient",
  duration: "3:22",
};

const candidates = [
  {
    _id: "507f191e810c19729de86011",
    name: "Soft Horizon",
    artist: "Cloudline",
    genre: "Indie",
    duration: "3:55",
  },
  {
    _id: "507f191e810c19729de86012",
    name: "New Morning",
    artist: "North Tide",
    genre: "Pop",
    duration: "3:18",
  },
];

test("safeParseJSON CASE 1: valid JSON", () => {
  const parsed = safeParseJSON('{"selectedSongId":"507f191e810c19729de86011","reason":"good"}');
  assert.equal(parsed.selectedSongId, "507f191e810c19729de86011");
});

test("safeParseJSON CASE 2: markdown wrapped JSON", () => {
  const parsed = safeParseJSON("```json\n{\"selectedSongId\":\"507f191e810c19729de86011\"}\n```");
  assert.equal(parsed.selectedSongId, "507f191e810c19729de86011");
});

test("safeParseJSON CASE 3: invalid JSON", () => {
  const parsed = safeParseJSON("{not valid}");
  assert.equal(parsed, null);
});

test("safeParseJSON CASE 4: missing selectedSongId", () => {
  const parsed = safeParseJSON('{"reason":"missing id"}');
  assert.equal(parsed, null);
});

test("safeParseJSON CASE 5: empty string", () => {
  const parsed = safeParseJSON("");
  assert.equal(parsed, null);
});

test("buildPrompt CASE 1: prompt contains looped song title", () => {
  const prompt = buildPrompt({
    loopedSong,
    candidates,
    behaviorContext: {
      replayCount: 4,
      timeOfDay: "evening",
      isLateNight: false,
      sessionWindowMinutes: 22,
      fatigueLevel: "none",
      emotionalStagnationScore: 0.4,
    },
  });

  assert.match(prompt, /Night Drift/);
});

test("buildPrompt CASE 2: prompt contains all candidate IDs", () => {
  const prompt = buildPrompt({
    loopedSong,
    candidates,
    behaviorContext: {
      replayCount: 4,
      timeOfDay: "evening",
      isLateNight: false,
      sessionWindowMinutes: 22,
      fatigueLevel: "none",
      emotionalStagnationScore: 0.4,
    },
  });

  assert.match(prompt, /507f191e810c19729de86011/);
  assert.match(prompt, /507f191e810c19729de86012/);
});

test("buildPrompt CASE 3: prompt contains behaviorContext.timeOfDay", () => {
  const prompt = buildPrompt({
    loopedSong,
    candidates,
    behaviorContext: {
      replayCount: 4,
      timeOfDay: "deepnight",
      isLateNight: true,
      sessionWindowMinutes: 22,
      fatigueLevel: "soft",
      emotionalStagnationScore: 0.8,
    },
  });

  assert.match(prompt, /deepnight/);
});

test("validateSelection CASE 1: selectedSongId exists", () => {
  const selected = validateSelection(
    { selectedSongId: "507f191e810c19729de86012" },
    candidates
  );

  assert.equal(selected?._id?.toString(), "507f191e810c19729de86012");
});

test("validateSelection CASE 2: selectedSongId not in candidates", () => {
  const selected = validateSelection(
    { selectedSongId: "507f191e810c19729de86999" },
    candidates
  );

  assert.equal(selected, null);
});
