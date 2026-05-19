import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Song from "../src/models/songModel.js";
import User from "../src/models/userModel.js";
import recommendationRouter from "../src/routes/recommendationRouter.js";
import songRouter from "../src/routes/songRouter.js";
import { computeOverlapScore } from "../src/services/collaborativeFilteringService.js";

process.env.JWT_SECRET ||= "live-recommender-diagnostics-secret";
process.env.REDIS_ENABLED = "false";

const LIMIT = 10;

const seedSong = (overrides = {}) =>
  Song.create({
    name: overrides.name || "Seed Song",
    desc: overrides.desc || "Seed Desc",
    album: overrides.album || "Single",
    artist: overrides.artist || "Seed Artist",
    image: "http://example.com/image.jpg",
    file: "http://example.com/audio.mp3",
    duration: "3:00",
    playCount: overrides.playCount ?? 0,
    likeCount: overrides.likeCount ?? 0,
    language: overrides.language || "English",
    genre: overrides.genre || "Pop",
  });

const seedUser = (overrides = {}) =>
  User.create({
    name: overrides.name,
    email: overrides.email,
    password: "password123",
    likedSongs: overrides.likedSongs || [],
    recentlyPlayed: overrides.recentlyPlayed || [],
    isActive: true,
    role: "user",
  });

async function seedCluster({ prefix, language, genre, artist, count, playStart }) {
  const songs = [];
  for (let index = 0; index < count; index += 1) {
    songs.push(
      await seedSong({
        name: `${prefix} ${index + 1}`,
        language,
        genre,
        artist: artist[index % artist.length],
        playCount: playStart - index,
      }),
    );
  }
  return songs;
}

async function seedLiveUsers() {
  const hindi = await seedCluster({
    prefix: "Live Hindi Romantic",
    language: "Hindi",
    genre: "Romantic",
    artist: ["Arijit Singh", "KK", "Jubin Nautiyal"],
    count: 18,
    playStart: 300,
  });
  const telugu = await seedCluster({
    prefix: "Live Telugu Emotional",
    language: "Telugu",
    genre: "Melody",
    artist: ["Sid Sriram", "Anurag Kulkarni", "Chinmayi"],
    count: 18,
    playStart: 280,
  });
  const edm = await seedCluster({
    prefix: "Live English EDM",
    language: "English",
    genre: "EDM",
    artist: ["The Weeknd", "The Chainsmokers", "Sia"],
    count: 18,
    playStart: 260,
  });

  const users = {
    hindi: await seedUser({
      name: "LIVE USER A - Hindi Romantic",
      email: "live-hindi@example.com",
      likedSongs: hindi.slice(0, 6).map((song) => song._id),
      recentlyPlayed: [{ song: hindi[0]._id }, { song: hindi[1]._id }, { song: hindi[2]._id }],
    }),
    telugu: await seedUser({
      name: "LIVE USER B - Telugu Emotional",
      email: "live-telugu@example.com",
      likedSongs: telugu.slice(0, 6).map((song) => song._id),
      recentlyPlayed: [{ song: telugu[0]._id }, { song: telugu[1]._id }, { song: telugu[2]._id }],
    }),
    edm: await seedUser({
      name: "LIVE USER C - English EDM",
      email: "live-edm@example.com",
      likedSongs: edm.slice(0, 6).map((song) => song._id),
      recentlyPlayed: [{ song: edm[0]._id }, { song: edm[1]._id }, { song: edm[2]._id }],
    }),
  };

  for (let index = 0; index < 3; index += 1) {
    const offset = 6 + index * 3;
    await seedUser({
      name: `Live Hindi Neighbor ${index + 1}`,
      email: `live-hindi-neighbor-${index}@example.com`,
      likedSongs: [hindi[index]._id, hindi[index + 1]._id, hindi[offset]._id, hindi[offset + 1]._id, hindi[offset + 2]._id],
    });
    await seedUser({
      name: `Live Telugu Neighbor ${index + 1}`,
      email: `live-telugu-neighbor-${index}@example.com`,
      likedSongs: [telugu[index]._id, telugu[index + 1]._id, telugu[offset]._id, telugu[offset + 1]._id, telugu[offset + 2]._id],
    });
    await seedUser({
      name: `Live EDM Neighbor ${index + 1}`,
      email: `live-edm-neighbor-${index}@example.com`,
      likedSongs: [edm[index]._id, edm[index + 1]._id, edm[offset]._id, edm[offset + 1]._id, edm[offset + 2]._id],
    });
  }

  await Promise.all([
    seedSong({
      name: "Live Global Hindi Trap",
      language: "Hindi",
      genre: "Romantic",
      artist: "Arijit Singh",
      playCount: 2000,
    }),
    seedSong({
      name: "Live Global Telugu Trap",
      language: "Telugu",
      genre: "Melody",
      artist: "Sid Sriram",
      playCount: 1990,
    }),
    seedSong({
      name: "Live Global EDM Trap",
      language: "English",
      genre: "EDM",
      artist: "The Chainsmokers",
      playCount: 1980,
    }),
  ]);

  return users;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/recommendations", recommendationRouter);
  app.use("/api/song", songRouter);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

async function callJson(server, path, userId) {
  const token = jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache",
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

const ratio = (songs, language) =>
  songs.length ? songs.filter((song) => song.language === language).length / songs.length : 0;

const pct = (value) => `${Math.round(value * 100)}%`;

const memoryServer = await MongoMemoryServer.create();

try {
  await mongoose.connect(memoryServer.getUri());
  const users = await seedLiveUsers();
  const app = createApp();
  const server = await listen(app);

  try {
    const endpointRows = [];
    const results = {};

    for (const [key, user] of Object.entries(users)) {
      const expectedLanguage = key === "hindi" ? "Hindi" : key === "telugu" ? "Telugu" : "English";
      const cf = await callJson(server, `/api/recommendations/cf/${user._id.toString()}?limit=${LIMIT}&refresh=1`, user._id);
      const legacy = await callJson(server, `/api/song/recommendations?limit=${LIMIT}&refresh=1`, user._id);
      const cfSongs = cf.body.songs || [];
      const legacySongs = legacy.body.recommendations || [];
      results[key] = cfSongs;

      endpointRows.push({
        user: user.name,
        endpoint: "/api/recommendations/cf/:userId",
        status: cf.status,
        source: cf.body.source,
        purity: pct(ratio(cfSongs, expectedLanguage)),
        cfCount: cf.body.debug?.cfSongCount,
        fallbackCount: cf.body.debug?.fallbackSongCount,
        dominantLanguage: cf.body.debug?.dominantLanguage?.label,
        personalization: cf.body.debug?.personalizationStrength,
        languages: JSON.stringify(cf.body.debug?.recommendationLanguageDistribution || {}),
      });

      endpointRows.push({
        user: user.name,
        endpoint: "/api/song/recommendations",
        status: legacy.status,
        source: legacy.body.source,
        purity: pct(ratio(legacySongs, expectedLanguage)),
        cfCount: legacy.body.debug?.cfSongCount,
        fallbackCount: legacy.body.debug?.fallbackSongCount,
        dominantLanguage: legacy.body.debug?.dominantLanguage?.label,
        personalization: legacy.body.debug?.personalizationStrength,
        languages: JSON.stringify(legacy.body.debug?.recommendationLanguageDistribution || {}),
      });
    }

    console.log("=== Live Recommendation Route Diagnostics ===");
    console.table(endpointRows);
    console.log("\nOverlap:");
    console.table([
      { pair: "Hindi vs Telugu", overlap: computeOverlapScore(results.hindi, results.telugu) },
      { pair: "Hindi vs EDM", overlap: computeOverlapScore(results.hindi, results.edm) },
      { pair: "Telugu vs EDM", overlap: computeOverlapScore(results.telugu, results.edm) },
    ]);

    const passed = endpointRows.every((row) => row.status === 200 && row.purity === "100%" && row.personalization >= 0.7);
    const overlapPassed =
      computeOverlapScore(results.hindi, results.telugu) <= 0.1 &&
      computeOverlapScore(results.hindi, results.edm) <= 0.1 &&
      computeOverlapScore(results.telugu, results.edm) <= 0.1;

    if (passed && overlapPassed) {
      console.log("\nLIVE FLOW QUALITY GATE: PASS - active API routes are aligned with CF diagnostics.");
    } else {
      console.error("\nLIVE FLOW QUALITY GATE: FAIL - route integration still leaks mixed recommendations.");
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  await memoryServer.stop().catch(() => {});
}
