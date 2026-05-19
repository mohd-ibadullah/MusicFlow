import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Song from "../src/models/songModel.js";
import User from "../src/models/userModel.js";
import {
  computeOverlapScore,
  getCollaborativeFilteringRecommendations,
} from "../src/services/collaborativeFilteringService.js";

process.env.JWT_SECRET ||= "cf-deep-test-secret";
process.env.REDIS_ENABLED = "false";

const LIMIT = 10;

const seedSong = (overrides = {}) =>
  Song.create({
    name: overrides.name || "Seed Song",
    desc: overrides.desc || "Seed Desc",
    album: overrides.album || "Single",
    artist: overrides.artist || "Seed Artist",
    image: overrides.image || "http://example.com/image.jpg",
    file: overrides.file || "http://example.com/audio.mp3",
    duration: overrides.duration || "3:00",
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

async function seedCluster({ prefix, language, genre, artists, count, playStart }) {
  const songs = [];
  for (let index = 0; index < count; index += 1) {
    songs.push(
      await seedSong({
        name: `${prefix} ${index + 1}`,
        language,
        genre,
        artist: artists[index % artists.length],
        playCount: playStart - index,
      }),
    );
  }
  return songs;
}

async function seedScenario() {
  const hindi = await seedCluster({
    prefix: "Hindi Romantic",
    language: "Hindi",
    genre: "Romantic",
    artists: ["Arijit Singh", "KK", "Jubin Nautiyal"],
    count: 18,
    playStart: 300,
  });
  const telugu = await seedCluster({
    prefix: "Telugu Emotional",
    language: "Telugu",
    genre: "Melody",
    artists: ["Sid Sriram", "Anurag Kulkarni", "Chinmayi"],
    count: 18,
    playStart: 280,
  });
  const edm = await seedCluster({
    prefix: "English EDM",
    language: "English",
    genre: "EDM",
    artists: ["The Weeknd", "The Chainsmokers", "Sia"],
    count: 18,
    playStart: 260,
  });

  const hindiUser = await seedUser({
    name: "USER A - Hindi Romantic",
    email: "diag-hindi@example.com",
    likedSongs: hindi.slice(0, 6).map((song) => song._id),
    recentlyPlayed: [{ song: hindi[0]._id }, { song: hindi[1]._id }, { song: hindi[2]._id }],
  });
  const teluguUser = await seedUser({
    name: "USER B - Telugu Emotional",
    email: "diag-telugu@example.com",
    likedSongs: telugu.slice(0, 6).map((song) => song._id),
    recentlyPlayed: [{ song: telugu[0]._id }, { song: telugu[1]._id }, { song: telugu[2]._id }],
  });
  const edmUser = await seedUser({
    name: "USER C - English EDM/Pop",
    email: "diag-edm@example.com",
    likedSongs: edm.slice(0, 6).map((song) => song._id),
    recentlyPlayed: [{ song: edm[0]._id }, { song: edm[1]._id }, { song: edm[2]._id }],
  });

  for (const [index, start] of [
    [0, 6],
    [1, 9],
    [2, 12],
  ]) {
    await seedUser({
      name: `Hindi Neighbor ${index + 1}`,
      email: `diag-hindi-neighbor-${index}@example.com`,
      likedSongs: [hindi[index]._id, hindi[index + 1]._id, hindi[start]._id, hindi[start + 1]._id, hindi[start + 2]._id],
    });
    await seedUser({
      name: `Telugu Neighbor ${index + 1}`,
      email: `diag-telugu-neighbor-${index}@example.com`,
      likedSongs: [telugu[index]._id, telugu[index + 1]._id, telugu[start]._id, telugu[start + 1]._id, telugu[start + 2]._id],
    });
    await seedUser({
      name: `EDM Neighbor ${index + 1}`,
      email: `diag-edm-neighbor-${index}@example.com`,
      likedSongs: [edm[index]._id, edm[index + 1]._id, edm[start]._id, edm[start + 1]._id, edm[start + 2]._id],
    });
  }

  await seedUser({
    name: "Telugu Bridge With One Hindi Overlap",
    email: "diag-bridge-telugu@example.com",
    likedSongs: [hindi[0]._id, telugu[6]._id, telugu[7]._id, telugu[8]._id, telugu[9]._id],
  });
  await seedUser({
    name: "EDM Bridge With One Hindi Overlap",
    email: "diag-bridge-edm@example.com",
    likedSongs: [hindi[1]._id, edm[6]._id, edm[7]._id, edm[8]._id, edm[9]._id],
  });

  await Promise.all([
    seedSong({
      name: "Global Trending Hindi Trap",
      language: "Hindi",
      genre: "Romantic",
      artist: "Arijit Singh",
      playCount: 2000,
    }),
    seedSong({
      name: "Global Trending Telugu Trap",
      language: "Telugu",
      genre: "Melody",
      artist: "Sid Sriram",
      playCount: 1990,
    }),
    seedSong({
      name: "Global Trending EDM Trap",
      language: "English",
      genre: "EDM",
      artist: "The Chainsmokers",
      playCount: 1980,
    }),
  ]);

  return { hindiUser, teluguUser, edmUser };
}

const pct = (value) => `${Math.round(value * 100)}%`;

function dominantLanguageRatio(result, language) {
  if (!result.songs.length) return 0;
  return result.songs.filter((song) => song.language === language).length / result.songs.length;
}

function qualityRow(label, expectedLanguage, result) {
  return {
    user: label,
    source: result.source,
    dominantLanguage: result.debug.dominantLanguage?.label || "n/a",
    dominantGenre: result.debug.dominantGenre?.label || "n/a",
    tasteCluster: result.debug.dominantTasteCluster?.value || "n/a",
    purity: pct(dominantLanguageRatio(result, expectedLanguage)),
    cfCount: result.debug.cfSongCount,
    fallbackCount: result.debug.fallbackSongCount,
    neighbors: result.debug.similarUsersFound,
    personalization: result.debug.personalizationStrength,
    languages: JSON.stringify(result.debug.recommendationLanguageDistribution),
  };
}

function printRecommendations(label, result) {
  console.log(`\n${label}`);
  console.table(
    result.songs.map((song, index) => ({
      rank: index + 1,
      song: song.name,
      artist: song.artist,
      language: song.language,
      genre: song.genre,
    })),
  );
  console.log("Top neighbors:");
  console.table(
    result.debug.similarUsers.slice(0, 5).map((user) => ({
      name: user.name,
      similarity: user.similarity,
      exact: user.exactSongSimilarity,
      preference: user.preferenceSimilarity,
      sameLanguage: user.sameLanguage,
      sameCluster: user.sameCluster,
    })),
  );
}

const memoryServer = await MongoMemoryServer.create();

try {
  await mongoose.connect(memoryServer.getUri());
  const { hindiUser, teluguUser, edmUser } = await seedScenario();

  const hindiResult = await getCollaborativeFilteringRecommendations({
    userId: hindiUser._id.toString(),
    limit: LIMIT,
  });
  const teluguResult = await getCollaborativeFilteringRecommendations({
    userId: teluguUser._id.toString(),
    limit: LIMIT,
    compareToSongs: hindiResult.songs,
  });
  const edmResult = await getCollaborativeFilteringRecommendations({
    userId: edmUser._id.toString(),
    limit: LIMIT,
    compareToSongs: hindiResult.songs,
  });

  console.log("=== MusicFlow CF Deep Diagnostics ===");
  console.table([
    qualityRow("USER A - Hindi Romantic", "Hindi", hindiResult),
    qualityRow("USER B - Telugu Emotional", "Telugu", teluguResult),
    qualityRow("USER C - English EDM/Pop", "English", edmResult),
  ]);

  const overlapRows = [
    {
      pair: "Hindi vs Telugu",
      overlap: computeOverlapScore(hindiResult.songs, teluguResult.songs),
    },
    {
      pair: "Hindi vs EDM",
      overlap: computeOverlapScore(hindiResult.songs, edmResult.songs),
    },
    {
      pair: "Telugu vs EDM",
      overlap: computeOverlapScore(teluguResult.songs, edmResult.songs),
    },
  ];
  console.log("\nOverlap:");
  console.table(overlapRows);

  printRecommendations("USER A - Hindi Romantic Recommendations", hindiResult);
  printRecommendations("USER B - Telugu Emotional Recommendations", teluguResult);
  printRecommendations("USER C - English EDM/Pop Recommendations", edmResult);

  const checks = [
    dominantLanguageRatio(hindiResult, "Hindi") >= 0.8,
    dominantLanguageRatio(teluguResult, "Telugu") >= 0.8,
    dominantLanguageRatio(edmResult, "English") >= 0.8,
    overlapRows.every((row) => row.overlap <= 0.1),
    [hindiResult, teluguResult, edmResult].every((result) => result.debug.personalizationStrength >= 0.7),
  ];

  if (checks.every(Boolean)) {
    console.log("\nQUALITY GATE: PASS - recommendation identities are strongly separated.");
  } else {
    console.error("\nQUALITY GATE: FAIL - recommender still needs tuning.");
    process.exitCode = 1;
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
