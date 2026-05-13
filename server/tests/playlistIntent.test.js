import test from "node:test";
import assert from "node:assert/strict";

import { __playlistIntentTestables } from "../src/controllers/playlistController.js";

const {
  extractKeywords,
  sanitizeLLMIntentPayload,
  buildSongQueryFromIntent,
  getHeuristicTermsFromPrompt,
  normalizeProvider,
  resolveLLMModel,
  deriveIntentLabel,
  generateAIPlaylistName,
} = __playlistIntentTestables;

test("normalizeProvider supports openrouter aliases", () => {
  assert.equal(normalizeProvider("openrouter"), "openrouter");
  assert.equal(normalizeProvider("open-router"), "openrouter");
  assert.equal(normalizeProvider("or"), "openrouter");
});

test("resolveLLMModel applies provider-safe defaults", () => {
  assert.equal(resolveLLMModel("openrouter", ""), "openrouter/auto");
  assert.equal(resolveLLMModel("openrouter", "gpt-4o"), "openrouter/auto");
  assert.equal(resolveLLMModel("openrouter", "openai/gpt-4o-mini"), "openai/gpt-4o-mini");
  assert.equal(resolveLLMModel("google", "gpt-4o"), "gemini-2.0-flash");
});

test("sanitizeLLMIntentPayload keeps only intent fields and ignores song-level fields", () => {
  const sanitized = sanitizeLLMIntentPayload(
    {
      mood: "Happy",
      energy: "High",
      vibe: "Roadtrip",
      genres: ["Pop", "Rock"],
      keywords: ["upbeat", "sunny"],
      artists: ["weeknd"],
      songTitles: ["Never Gonna Give You Up"],
      tracks: ["Random Track"],
    },
    "upbeat sunny roadtrip playlist"
  );

  assert.equal(sanitized.mood, "happy");
  assert.equal(sanitized.energy, "high");
  assert.equal(sanitized.vibe, "roadtrip");
  assert.ok(Array.isArray(sanitized.genres));
  assert.ok(Array.isArray(sanitized.keywords));
  assert.ok(Array.isArray(sanitized.artists));
  assert.equal("songTitles" in sanitized, false);
  assert.equal("tracks" in sanitized, false);
});

test("buildSongQueryFromIntent creates $or regex query for genre/artist/description matching", () => {
  const intent = {
    mood: "chill",
    energy: "low",
    vibe: "night",
    genres: ["ambient", "lofi"],
    keywords: ["study", "focus"],
    artists: ["nujabes"],
  };

  const query = buildSongQueryFromIntent(intent, "late night focus lofi music");

  assert.ok(query.$or);
  assert.ok(Array.isArray(query.$or));
  assert.ok(query.$or.length > 0);

  const hasGenreIn = query.$or.some((clause) => clause.genre && clause.genre.$in);
  const hasArtistIn = query.$or.some((clause) => clause.artist && clause.artist.$in);
  const hasDescRegex = query.$or.some((clause) => clause.desc instanceof RegExp);

  assert.equal(hasGenreIn, true);
  assert.equal(hasArtistIn, true);
  assert.equal(hasDescRegex, true);
});

test("getHeuristicTermsFromPrompt includes mapped criteria and extracted keywords", () => {
  const terms = getHeuristicTermsFromPrompt("Need a relaxing focus study playlist for deep work");

  assert.ok(terms.includes("ambient") || terms.includes("classical") || terms.includes("instrumental"));
  assert.ok(terms.includes("study") || extractKeywords("Need a relaxing focus study playlist for deep work").includes("study"));
});

test("deriveIntentLabel prefers concise extracted mood/intent", () => {
  const label = deriveIntentLabel(
    {
      mood: "Sad",
      vibe: "Late Night",
      keywords: ["heartbreak", "slow"],
      genres: ["ballad"],
    },
    "Create me a deeply emotional breakup playlist for tonight"
  );

  assert.equal(label, "sad");
});

test("deriveIntentLabel falls back to personalized when candidates are too broad", () => {
  const label = deriveIntentLabel(
    {
      mood: "",
      vibe: "",
      keywords: [],
      genres: [],
    },
    "create a playlist with songs for my long morning commute and work break"
  );

  assert.equal(label, "personalized");
});

test("generateAIPlaylistName maps happy/sad/romance/workout to user-friendly names", () => {
  assert.equal(generateAIPlaylistName("happy"), "Happy Vibes");
  assert.equal(generateAIPlaylistName("sad"), "Sad Nights");
  assert.equal(generateAIPlaylistName("romance"), "Romantic Mix");
  assert.equal(generateAIPlaylistName("workout"), "Workout Energy");
});

test("generateAIPlaylistName returns My Mix when mood is unclear", () => {
  assert.equal(generateAIPlaylistName(""), "My Mix");
  assert.equal(generateAIPlaylistName("personalized"), "My Mix");
});

test("generateAIPlaylistName keeps fallback names short and natural", () => {
  assert.equal(generateAIPlaylistName("late night"), "Late Night Mix");
  assert.equal(generateAIPlaylistName("deep focus"), "Focus Flow");
});
