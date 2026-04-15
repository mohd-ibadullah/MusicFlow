import test from "node:test";
import assert from "node:assert/strict";

import { diversifyRankedRecommendations } from "../../src/ai/diversity.js";

const buildCandidate = (id, artist, genre, score) => ({
  songId: id,
  score,
  song: {
    _id: id,
    artist,
    genre,
  },
});

test("diversifyRankedRecommendations enforces max two songs per artist", () => {
  const ranked = [
    buildCandidate("1", "Artist A", "Pop", 0.99),
    buildCandidate("2", "Artist A", "Pop", 0.98),
    buildCandidate("3", "Artist A", "Pop", 0.97),
    buildCandidate("4", "Artist B", "Pop", 0.96),
    buildCandidate("5", "Artist C", "Rock", 0.95),
    buildCandidate("6", "Artist D", "Jazz", 0.94),
  ];

  const selected = diversifyRankedRecommendations(ranked, 5);
  const artistCounts = new Map();

  for (const candidate of selected) {
    const artist = candidate.song.artist;
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
  }

  assert.equal(selected.length, 5);
  assert.ok((artistCounts.get("Artist A") || 0) <= 2);
});

test("diversifyRankedRecommendations keeps output bounded and deterministic by ranking passes", () => {
  const ranked = [
    buildCandidate("1", "Artist A", "Pop", 0.9),
    buildCandidate("2", "Artist B", "Pop", 0.8),
    buildCandidate("3", "Artist C", "Pop", 0.7),
    buildCandidate("4", "Artist D", "Rock", 0.6),
  ];

  const selected = diversifyRankedRecommendations(ranked, 3);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].songId, "1");
});
