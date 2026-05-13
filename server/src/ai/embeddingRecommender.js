import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import User from "../models/userModel.js";
import Song from "../models/songModel.js";
import AIInteraction from "../models/aiInteractionModel.js";
import { getRecommendations as getFallbackRecommendations } from "../services/songService.js";
import { loadNpyFloat32 } from "./npyLoader.js";
import { diversifyRankedRecommendations } from "./diversity.js";
import { getColdStartRecommendations } from "./coldStart.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_EMB_PATH = path.join(__dirname, "user_emb.npy");
const ITEM_EMB_PATH = path.join(__dirname, "item_emb.npy");
const MODEL_PATH = path.join(__dirname, "model.pth");
const ROOT_DATA_PATH = path.resolve(__dirname, "../../../", "data", "data.json");
const ADAPTIVE_PROFILE_PATH = path.join(__dirname, "runtime", "adaptive_user_profiles.json");

const DEFAULT_LIMIT = 10;
const EPS = 1e-12;
const FEEDBACK_TTL_MS = 60 * 1000;
const FEEDBACK_CACHE_MAX_SIZE = 2000;
const FEEDBACK_LOOKBACK_DAYS = 14;
const FEEDBACK_VECTOR_SCALE = 0.25;
const ADAPTIVE_VECTOR_SCALE = 0.35;
const EMBEDDING_SCORE_WEIGHT = 0.3;
const FEEDBACK_SCORE_WEIGHT = 0.7;
const NEW_USER_INTERACTION_THRESHOLD = 5;
const NEW_USER_LIKE_SCORE_BOOST = 10;
const NEW_USER_SKIP_SCORE_PENALTY = 10;
const NEW_USER_EMBEDDING_SCORE_WEIGHT = 0.1;
const NEW_USER_FEEDBACK_SCORE_WEIGHT = 0.9;
const DOMINANT_CATEGORY_BOOST = 1.5;
const AI_TOP_SEGMENT_RATIO = 0.7;
const NEW_USER_TOP_SEGMENT_RATIO = 0.9;
const NEW_USER_DIVERSITY_TAIL_CAP = 1;
const LAST_SESSION_WINDOW_HOURS = 6;
const LAST_SESSION_INTERACTION_BOOST = 2.0;
const SCORE_DEBUG_TOP_K = 8;
const FEEDBACK_ACTION_SCORES = Object.freeze({
  like: 5.0,
  play: 2.0,
  skip: -5.0,
  click: 0.0,
});

const state = {
  initialized: false,
  initError: null,
  initPromise: null,
  modelFilePresent: false,
  userEmbedding: null,
  itemEmbedding: null,
  userCount: 0,
  itemCount: 0,
  embeddingDim: 0,
  userIdToIndex: new Map(),
  itemIndexToSongId: [],
  itemIndexBySongId: new Map(),
  itemNorms: null,
  adaptiveProfiles: new Map(),
  feedbackCache: new Map(),
};

const pruneFeedbackCache = () => {
  const now = Date.now();

  for (const [userId, entry] of state.feedbackCache.entries()) {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
      state.feedbackCache.delete(userId);
    }
  }

  while (state.feedbackCache.size > FEEDBACK_CACHE_MAX_SIZE) {
    const oldestKey = state.feedbackCache.keys().next().value;
    if (!oldestKey) break;
    state.feedbackCache.delete(oldestKey);
  }
};

const isValidObjectIdString = (value) =>
  typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);

const normalizeId = (value) => {
  if (value == null) return null;
  const asString = value.toString().trim();
  return isValidObjectIdString(asString) ? asString.toLowerCase() : null;
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const buildZeroVector = (dim) => new Float32Array(dim);

const addScaledVector = (target, source, scale) => {
  for (let i = 0; i < target.length; i += 1) {
    target[i] += source[i] * scale;
  }
};

const computeVectorNorm = (vector) => {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i];
    sum += value * value;
  }
  return Math.sqrt(sum) || EPS;
};

const clampScore = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));

const roundScore = (value) => Number(value.toFixed(4));

const normalizeCategory = (value) =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "";

const toTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const compareScoredEntriesDesc = (a, b) => {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;

  const songIdA = (a.songId || "").toString();
  const songIdB = (b.songId || "").toString();
  return songIdA.localeCompare(songIdB);
};

const compareScoredEntriesAsc = (a, b) => compareScoredEntriesDesc(b, a);

const compareHydratedEntriesDesc = (a, b) => {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;

  const playDiff = (Number(b.song?.playCount) || 0) - (Number(a.song?.playCount) || 0);
  if (playDiff !== 0) return playDiff;

  const createdAtDiff = toTimestamp(b.song?.createdAt) - toTimestamp(a.song?.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;

  const songIdA = (a.songId || "").toString();
  const songIdB = (b.songId || "").toString();
  return songIdA.localeCompare(songIdB);
};

const getDominantCategoryBoost = ({ song, dominantProfile }) => {
  if (!dominantProfile || !song) return 0;

  const songLanguage = normalizeCategory(song.language);
  const songGenre = normalizeCategory(song.genre);
  const topLanguage = normalizeCategory(dominantProfile.language);
  const topGenre = normalizeCategory(dominantProfile.genre);

  if (topLanguage && songLanguage && songLanguage === topLanguage) {
    return DOMINANT_CATEGORY_BOOST;
  }

  if (topGenre && songGenre && songGenre === topGenre) {
    return DOMINANT_CATEGORY_BOOST;
  }

  return 0;
};

const getDominantCategory = (weightMap) => {
  let selected = "";
  let best = Number.NEGATIVE_INFINITY;

  for (const [category, weight] of weightMap.entries()) {
    if (weight > best) {
      selected = category;
      best = weight;
      continue;
    }

    if (weight === best && category.localeCompare(selected) < 0) {
      selected = category;
    }
  }

  return selected || null;
};

const logScoreTransitions = ({ userId, scoreSamples, ranked }) => {
  if (!Array.isArray(scoreSamples) || scoreSamples.length === 0) return;

  const preRank = [...scoreSamples]
    .sort((a, b) => b.embeddingScore - a.embeddingScore)
    .slice(0, SCORE_DEBUG_TOP_K)
    .map(({ songId, embeddingScore, feedbackScore, finalScore }) => ({
      songId,
      embeddingScore: roundScore(embeddingScore),
      feedbackScore: roundScore(feedbackScore),
      finalScore: roundScore(finalScore),
    }));

  const postRank = [...ranked]
    .slice(0, SCORE_DEBUG_TOP_K)
    .map(({ songId, embeddingScore, feedbackScore, score }) => ({
      songId,
      embeddingScore: roundScore(embeddingScore),
      feedbackScore: roundScore(feedbackScore),
      finalScore: roundScore(score),
    }));

  logger.debug("[AI][SCORING]", {
    userId,
    preRank,
    postRank,
  });
};

const normalizeVector = (vector) => {
  const norm = computeVectorNorm(vector);
  if (!norm) return vector;
  for (let i = 0; i < vector.length; i += 1) {
    vector[i] = vector[i] / norm;
  }
  return vector;
};

const uniqueByFirstAppearance = (values) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const buildMaps = (userIds, songIds) => {
  const userIdToIndex = new Map();
  userIds.forEach((userId, index) => {
    userIdToIndex.set(userId, index);
  });

  const itemIndexBySongId = new Map();
  songIds.forEach((songId, index) => {
    itemIndexBySongId.set(songId, index);
  });

  return {
    userIdToIndex,
    itemIndexToSongId: songIds,
    itemIndexBySongId,
  };
};

const loadAdaptiveProfilesFromDisk = async () => {
  if (!(await fileExists(ADAPTIVE_PROFILE_PATH))) {
    return {};
  }

  try {
    const raw = await fs.readFile(ADAPTIVE_PROFILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    logger.warn("[AI] Unable to read adaptive profile file", { error: error.message });
    return {};
  }
};

export function applyAdaptiveProfiles(serializedProfiles = {}) {
  const nextProfiles = new Map();
  const dim = state.embeddingDim;

  for (const [userIdRaw, vectorRaw] of Object.entries(serializedProfiles || {})) {
    const userId = normalizeId(userIdRaw);
    if (!userId || !Array.isArray(vectorRaw) || vectorRaw.length !== dim) continue;

    const vec = new Float32Array(dim);
    let valid = true;
    for (let i = 0; i < dim; i += 1) {
      const value = Number(vectorRaw[i]);
      if (!Number.isFinite(value)) {
        valid = false;
        break;
      }
      vec[i] = value;
    }

    if (valid) {
      normalizeVector(vec);
      nextProfiles.set(userId, vec);
    }
  }

  state.adaptiveProfiles = nextProfiles;
  state.feedbackCache.clear();
}

export function invalidateFeedbackCacheForUser(userIdRaw) {
  const userId = normalizeId(userIdRaw);
  if (!userId) return;
  state.feedbackCache.delete(userId);
}

const loadMappingsFromRootData = async (expectedUsers, expectedItems) => {
  if (!(await fileExists(ROOT_DATA_PATH))) {
    return null;
  }

  try {
    const raw = await fs.readFile(ROOT_DATA_PATH, "utf8");
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;

    const orderedUsers = [];
    const orderedSongs = [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const userId = normalizeId(row.user);
      const songId = normalizeId(row.song);
      if (userId) orderedUsers.push(userId);
      if (songId) orderedSongs.push(songId);
    }

    const userIds = uniqueByFirstAppearance(orderedUsers);
    const songIds = uniqueByFirstAppearance(orderedSongs);

    if (userIds.length !== expectedUsers || songIds.length !== expectedItems) {
      return null;
    }

    return buildMaps(userIds, songIds);
  } catch (error) {
    logger.warn("[AI] Failed to load interaction mappings file", { error: error.message });
    return null;
  }
};

const loadMappingsFromDatabase = async (expectedUsers, expectedItems) => {
  const interactedUsers = await User.find(
    {
      $or: [{ "likedSongs.0": { $exists: true } }, { "recentlyPlayed.0": { $exists: true } }],
    },
    { _id: 1 }
  )
    .sort({ _id: 1 })
    .lean();

  const userIds = interactedUsers
    .map((doc) => normalizeId(doc?._id))
    .filter(Boolean);

  const songUnion = await User.aggregate([
    {
      $project: {
        likedSongs: 1,
        recentSongs: "$recentlyPlayed.song",
      },
    },
    {
      $project: {
        songIds: { $setUnion: ["$likedSongs", "$recentSongs"] },
      },
    },
    { $unwind: "$songIds" },
    { $group: { _id: null, songIds: { $addToSet: "$songIds" } } },
  ]);

  const songIds = (songUnion[0]?.songIds || [])
    .map((value) => normalizeId(value))
    .filter(Boolean)
    .sort();

  if (userIds.length !== expectedUsers || songIds.length !== expectedItems) {
    return null;
  }

  return buildMaps(userIds, songIds);
};

const computeItemNorms = (itemEmbedding, itemCount, dim) => {
  const norms = new Float32Array(itemCount);
  for (let i = 0; i < itemCount; i += 1) {
    let sum = 0;
    const offset = i * dim;
    for (let j = 0; j < dim; j += 1) {
      const value = itemEmbedding[offset + j];
      sum += value * value;
    }
    norms[i] = Math.sqrt(sum) || EPS;
  }
  return norms;
};

const ensureInitialized = async () => {
  if (state.initialized) return;
  if (state.initPromise) return state.initPromise;

  state.initPromise = (async () => {
    try {
      const [userEmb, itemEmb] = await Promise.all([
        loadNpyFloat32(USER_EMB_PATH),
        loadNpyFloat32(ITEM_EMB_PATH),
      ]);

      if (userEmb.shape.length !== 2 || itemEmb.shape.length !== 2) {
        throw new Error("Embeddings must be 2D matrices.");
      }

      const [userCount, userDim] = userEmb.shape;
      const [itemCount, itemDim] = itemEmb.shape;

      if (userDim !== itemDim) {
        throw new Error(`Embedding dimension mismatch: users=${userDim}, items=${itemDim}`);
      }

      let mapping = await loadMappingsFromRootData(userCount, itemCount);
      if (!mapping) {
        mapping = await loadMappingsFromDatabase(userCount, itemCount);
      }

      if (!mapping) {
        throw new Error(
          `Unable to map embedding rows to IDs (expected users=${userCount}, items=${itemCount}).`
        );
      }

      state.modelFilePresent = await fileExists(MODEL_PATH);
      state.userEmbedding = userEmb.data;
      state.itemEmbedding = itemEmb.data;
      state.userCount = userCount;
      state.itemCount = itemCount;
      state.embeddingDim = userDim;
      state.userIdToIndex = mapping.userIdToIndex;
      state.itemIndexToSongId = mapping.itemIndexToSongId;
      state.itemIndexBySongId = mapping.itemIndexBySongId;
      state.itemNorms = computeItemNorms(state.itemEmbedding, state.itemCount, state.embeddingDim);
      const adaptiveProfiles = await loadAdaptiveProfilesFromDisk();
      applyAdaptiveProfiles(adaptiveProfiles);
      state.initialized = true;
      state.initError = null;

      logger.info(
        `[AI] Embeddings loaded: users=${state.userCount}, items=${state.itemCount}, dim=${state.embeddingDim}, adaptiveProfiles=${state.adaptiveProfiles.size}, modelFile=${state.modelFilePresent ? "present" : "missing"}`
      );
    } catch (error) {
      state.initialized = false;
      state.initError = error;
      logger.warn("[AI] Embedding initialization failed. Fallback mode enabled", {
        error: error.message,
      });
    }
  })();

  await state.initPromise;
};

const getFeedbackWindowStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - FEEDBACK_LOOKBACK_DAYS);
  return d;
};

const getLastSessionInteractionBoost = (createdAt) => {
  if (!createdAt) return 1;

  const ageHours = Math.max(
    0,
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
  );

  return ageHours <= LAST_SESSION_WINDOW_HOURS ? LAST_SESSION_INTERACTION_BOOST : 1;
};

const getUserFeedbackSignals = async (userId) => {
  pruneFeedbackCache();

  const cached = state.feedbackCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const interactions = await AIInteraction.find(
    {
      userId,
      interactionType: { $in: ["play", "like", "skip", "click"] },
      createdAt: { $gte: getFeedbackWindowStart() },
    },
    { songId: 1, interactionType: 1, createdAt: 1, weight: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  const vec = buildZeroVector(state.embeddingDim);
  const feedbackBySong = new Map();
  const skippedSongIds = new Set();
  const likedSongIds = new Set();
  const positiveWeightBySong = new Map();

  for (const event of interactions) {
    const songId = normalizeId(event.songId);
    if (!songId) continue;

    const itemIndex = state.itemIndexBySongId.get(songId);
    if (itemIndex == null) continue;

    const fallbackScore = FEEDBACK_ACTION_SCORES[event.interactionType] ?? 0;
    const explicitWeight = Number(event.weight);
    const interactionScore = Number.isFinite(explicitWeight)
      ? Math.sign(explicitWeight || fallbackScore) * Math.max(Math.abs(explicitWeight), Math.abs(fallbackScore))
      : fallbackScore;
    if (interactionScore === 0) continue;

    const contribution = interactionScore * getLastSessionInteractionBoost(event.createdAt);

    feedbackBySong.set(songId, (feedbackBySong.get(songId) || 0) + contribution);

    if (event.interactionType === "skip") {
      skippedSongIds.add(songId);
    }

    if (event.interactionType === "like") {
      likedSongIds.add(songId);
    }

    const positiveContribution = Math.max(contribution, 0);
    if (positiveContribution > 0) {
      positiveWeightBySong.set(
        songId,
        (positiveWeightBySong.get(songId) || 0) + positiveContribution
      );
    }

    const offset = itemIndex * state.embeddingDim;
    const itemVec = state.itemEmbedding.subarray(offset, offset + state.embeddingDim);
    addScaledVector(vec, itemVec, contribution);
  }

  const dominantProfile = {
    language: null,
    genre: null,
  };

  if (positiveWeightBySong.size > 0) {
    const candidateSongIds = [...positiveWeightBySong.keys()].map(
      (songId) => new mongoose.Types.ObjectId(songId)
    );

    const songDocs = await Song.find(
      { _id: { $in: candidateSongIds } },
      { _id: 1, language: 1, genre: 1 }
    ).lean();

    const languageWeights = new Map();
    const genreWeights = new Map();

    for (const song of songDocs) {
      const songId = normalizeId(song?._id);
      if (!songId) continue;

      const weight = positiveWeightBySong.get(songId) || 0;
      if (weight <= 0) continue;

      const language = normalizeCategory(song.language);
      const genre = normalizeCategory(song.genre);

      if (language) {
        languageWeights.set(language, (languageWeights.get(language) || 0) + weight);
      }

      if (genre) {
        genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight);
      }
    }

    dominantProfile.language = getDominantCategory(languageWeights);
    dominantProfile.genre = getDominantCategory(genreWeights);
  }

  const norm = computeVectorNorm(vec);
  const value = {
    vector: vec,
    norm,
    feedbackBySong,
    skippedSongIds,
    likedSongIds,
    dominantProfile,
    eventCount: interactions.length,
  };

  state.feedbackCache.set(userId, {
    expiresAt: Date.now() + FEEDBACK_TTL_MS,
    value,
  });
  pruneFeedbackCache();

  return value;
};

const getSeenSongIds = async (userId) => {
  const userDoc = await User.findById(userId, { likedSongs: 1, recentlyPlayed: 1 }).lean();
  if (!userDoc) return { exists: false, seen: new Set() };

  const seen = new Set();

  for (const songId of userDoc.likedSongs || []) {
    const normalized = normalizeId(songId);
    if (normalized) seen.add(normalized);
  }

  for (const entry of userDoc.recentlyPlayed || []) {
    const normalized = normalizeId(entry?.song);
    if (normalized) seen.add(normalized);
  }

  return { exists: true, seen };
};

const buildEffectiveUserVector = ({ userIndex, userId, feedback }) => {
  const dim = state.embeddingDim;
  const baseOffset = userIndex * dim;
  const combined = buildZeroVector(dim);

  for (let j = 0; j < dim; j += 1) {
    combined[j] = state.userEmbedding[baseOffset + j];
  }

  const adaptive = state.adaptiveProfiles.get(userId);
  if (adaptive) {
    addScaledVector(combined, adaptive, ADAPTIVE_VECTOR_SCALE);
  }

  if (feedback?.vector && feedback.norm > EPS) {
    addScaledVector(combined, feedback.vector, FEEDBACK_VECTOR_SCALE);
  }

  const norm = computeVectorNorm(combined);

  return { vector: combined, norm };
};

const scoreAndSelectTopN = ({
  userId,
  userVector,
  userNorm,
  seenSongIds,
  limit,
  feedback,
  isNewUser = false,
}) => {
  const top = [];
  const scoreSamples = [];
  const dim = state.embeddingDim;
  const feedbackNorm = feedback?.norm ?? 0;

  const poolSize = Math.min(state.itemCount, Math.max(limit * 12, limit));

  for (let itemIndex = 0; itemIndex < state.itemCount; itemIndex += 1) {
    const songId = state.itemIndexToSongId[itemIndex];
    if (!songId) continue;

    const directFeedbackScore = feedback?.feedbackBySong?.get(songId) ?? 0;
    const isPositivelyReinforced = directFeedbackScore > 0;
    const isSkipped = feedback?.skippedSongIds?.has(songId);
    const isLiked = feedback?.likedSongIds?.has(songId);

    // Preserve existing behavior for mature profiles while allowing new users to re-rank from tiny feedback sets.
    if (!isNewUser && isSkipped) {
      continue;
    }

    // Avoid over-filtering for cold-start users so first interactions have visible impact.
    if (!isNewUser && seenSongIds.has(songId) && !isPositivelyReinforced) {
      continue;
    }

    let dot = 0;
    let feedbackDot = 0;
    const itemOffset = itemIndex * dim;

    for (let j = 0; j < dim; j += 1) {
      const itemValue = state.itemEmbedding[itemOffset + j];
      dot += userVector[j] * itemValue;
      if (feedbackNorm > EPS) {
        feedbackDot += feedback.vector[j] * itemValue;
      }
    }

    const denom = userNorm * state.itemNorms[itemIndex] + EPS;
    const embeddingScore = clampScore(dot / denom);
    const vectorFeedbackScore =
      feedbackNorm > EPS
        ? clampScore(feedbackDot / (feedbackNorm * state.itemNorms[itemIndex] + EPS))
        : 0;
    let feedbackScore = directFeedbackScore + vectorFeedbackScore * 0.5;

    if (isNewUser && isLiked) {
      feedbackScore += NEW_USER_LIKE_SCORE_BOOST;
    }

    if (isNewUser && isSkipped) {
      feedbackScore -= NEW_USER_SKIP_SCORE_PENALTY;
    }

    feedbackScore = Math.max(-40, Math.min(40, feedbackScore));
    const score = isNewUser
      ? embeddingScore * NEW_USER_EMBEDDING_SCORE_WEIGHT + feedbackScore * NEW_USER_FEEDBACK_SCORE_WEIGHT
      : embeddingScore * EMBEDDING_SCORE_WEIGHT + feedbackScore * FEEDBACK_SCORE_WEIGHT;

    scoreSamples.push({ songId, embeddingScore, feedbackScore, finalScore: score });

    if (!Number.isFinite(score)) continue;

    const candidate = { songId, score, embeddingScore, feedbackScore };

    if (top.length < poolSize) {
      top.push(candidate);
      if (top.length === poolSize) {
        top.sort(compareScoredEntriesAsc);
      }
      continue;
    }

    if (compareScoredEntriesDesc(candidate, top[0]) <= 0) continue;
    top[0] = candidate;
    top.sort(compareScoredEntriesAsc);
  }

  const ranked = top.sort(compareScoredEntriesDesc);
  logScoreTransitions({ userId, scoreSamples, ranked });

  return ranked;
};

const getFeedbackBootstrapRecommendations = async ({
  userId,
  feedback,
  seenSongIds,
  limit,
  isNewUser = false,
}) => {
  const hasFeedbackBySong = (feedback?.feedbackBySong?.size || 0) > 0;
  const hasFeedbackVector = (feedback?.norm || 0) > EPS;

  if (!hasFeedbackBySong && !hasFeedbackVector) {
    return {
      recommendations: [],
      candidateCount: 0,
    };
  }

  const scored = scoreAndSelectTopN({
    userId,
    userVector: feedback.vector,
    userNorm: Math.max(feedback.norm || 0, EPS),
    seenSongIds,
    limit,
    feedback,
    isNewUser,
  });

  if (scored.length === 0) {
    return {
      recommendations: [],
      candidateCount: 0,
    };
  }

  const recommendations = await hydrateAndDiversify({
    scored,
    limit,
    dominantProfile: feedback?.dominantProfile || null,
    isNewUser,
  });

  return {
    recommendations,
    candidateCount: scored.length,
  };
};

const fallbackRecommendations = async ({ userId, limit, reason, excludeSongIds = new Set() }) => {
  let fallback = [];

  if (reason === "user_embedding_not_found" || reason === "user_not_found") {
    fallback = await getColdStartRecommendations({ limit, excludeSongIds });
  }

  if (!Array.isArray(fallback) || fallback.length === 0) {
    fallback = await getFallbackRecommendations({ userId });
  }

  return {
    recommendations: fallback.slice(0, limit),
    source: "fallback",
    reason,
  };
};

const hydrateAndDiversify = async ({
  scored,
  limit,
  dominantProfile = null,
  isNewUser = false,
}) => {
  if (!Array.isArray(scored) || scored.length === 0) return [];

  const orderedPoolIds = scored.map((entry) => entry.songId);
  const songDocs = await Song.find(
    { _id: { $in: orderedPoolIds } },
    {
      name: 1,
      artist: 1,
      genre: 1,
      image: 1,
      file: 1,
      desc: 1,
      album: 1,
      language: 1,
      duration: 1,
      playCount: 1,
      likeCount: 1,
      createdAt: 1,
    }
  ).lean();

  const songMap = new Map(songDocs.map((song) => [normalizeId(song._id), song]));
  const rankedCandidates = scored
    .map((entry) => ({
      ...entry,
      song: songMap.get(entry.songId),
    }))
    .filter((entry) => !!entry.song)
    .map((entry) => {
      const dominanceBoost = getDominantCategoryBoost({
        song: entry.song,
        dominantProfile,
      });

      return {
        ...entry,
        score: entry.score + dominanceBoost,
      };
    })
    .sort(compareHydratedEntriesDesc);

  const topCount = Math.min(
    limit,
    Math.max(1, Math.ceil(limit * (isNewUser ? NEW_USER_TOP_SEGMENT_RATIO : AI_TOP_SEGMENT_RATIO)))
  );
  const topK = rankedCandidates.slice(0, topCount);
  const tailLimit = Math.max(0, limit - topK.length);
  const tailCandidates = rankedCandidates.slice(topCount);
  const diversifyTailLimit = isNewUser
    ? Math.min(tailLimit, NEW_USER_DIVERSITY_TAIL_CAP)
    : tailLimit;
  const diversifiedTail =
    diversifyTailLimit > 0
      ? diversifyRankedRecommendations(tailCandidates, diversifyTailLimit)
      : [];

  const diversified = [...topK, ...diversifiedTail];
  const selectedIds = new Set(diversified.map((entry) => entry.songId));

  // Fill leftovers from remaining pool to always try returning up to N.
  for (const entry of tailCandidates) {
    if (diversified.length >= limit) break;
    if (selectedIds.has(entry.songId)) continue;
    diversified.push(entry);
    selectedIds.add(entry.songId);
  }

  const finalRanked = diversified.slice(0, limit);

  return finalRanked.map((entry) => {
    const song = entry.song;
    const embeddingScore = roundScore(entry.embeddingScore ?? 0);
    const feedbackScore = roundScore(entry.feedbackScore ?? 0);
    const finalScore = roundScore(entry.score ?? 0);

    logger.debug("[AI][SCORE]", {
      song: song.name,
      embeddingScore,
      feedbackScore,
      finalScore,
    });

    return {
      ...song,
      embeddingScore,
      feedbackScore,
      finalScore,
    };
  });
};

export async function getEmbeddingSnapshot() {
  await ensureInitialized();

  return {
    initialized: state.initialized,
    dim: state.embeddingDim,
    userCount: state.userCount,
    itemCount: state.itemCount,
    itemEmbedding: state.itemEmbedding,
    itemIndexBySongId: state.itemIndexBySongId,
  };
}

export async function getAIRecommendations({ userId, limit = DEFAULT_LIMIT }) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 100);
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId || !mongoose.Types.ObjectId.isValid(normalizedUserId)) {
    return fallbackRecommendations({
      userId: undefined,
      limit: safeLimit,
      reason: "invalid_user_id",
    });
  }

  await ensureInitialized();

  if (!state.initialized) {
    return fallbackRecommendations({
      userId: normalizedUserId,
      limit: safeLimit,
      reason: state.initError?.message || "embedding_init_failed",
    });
  }

  const userIndex = state.userIdToIndex.get(normalizedUserId);
  const { exists, seen } = await getSeenSongIds(normalizedUserId);
  const feedback = await getUserFeedbackSignals(normalizedUserId);
  const userInteractionCount = Math.max(Number(feedback?.eventCount) || 0, seen.size);
  const isNewUser = userInteractionCount < NEW_USER_INTERACTION_THRESHOLD;
  const skippedOnlyExcludeSongIds = new Set(
    feedback?.skippedSongIds ? Array.from(feedback.skippedSongIds) : []
  );
  const fallbackExcludeSongIds = isNewUser
    ? skippedOnlyExcludeSongIds
    : new Set([...seen, ...skippedOnlyExcludeSongIds]);

  if (userIndex == null) {
    const bootstrap = await getFeedbackBootstrapRecommendations({
      userId: normalizedUserId,
      feedback,
      seenSongIds: seen,
      limit: safeLimit,
      isNewUser,
    });

    if (bootstrap.recommendations.length > 0) {
      return {
        recommendations: bootstrap.recommendations,
        source: "ai-feedback-bootstrap",
        reason: null,
        metadata: {
          embeddingDim: state.embeddingDim,
          userCount: state.userCount,
          itemCount: state.itemCount,
          modelFilePresent: state.modelFilePresent,
          adaptiveProfileCount: state.adaptiveProfiles.size,
          requestedUserId: normalizedUserId,
          filteredSeenSongs: seen.size,
          candidateCount: bootstrap.candidateCount,
          feedbackEventsUsed: feedback.eventCount,
          userInteractionCount,
          isNewUser,
        },
      };
    }

    return fallbackRecommendations({
      userId: normalizedUserId,
      limit: safeLimit,
      reason: "user_embedding_not_found",
      excludeSongIds: fallbackExcludeSongIds,
    });
  }

  if (!exists) {
    return fallbackRecommendations({
      userId: normalizedUserId,
      limit: safeLimit,
      reason: "user_not_found",
      excludeSongIds: fallbackExcludeSongIds,
    });
  }

  const { vector: userVector, norm: userNorm } = buildEffectiveUserVector({
    userIndex,
    userId: normalizedUserId,
    feedback,
  });

  const scored = scoreAndSelectTopN({
    userId: normalizedUserId,
    userVector,
    userNorm,
    seenSongIds: seen,
    limit: safeLimit,
    feedback,
    isNewUser,
  });

  if (scored.length === 0) {
    return fallbackRecommendations({
      userId: normalizedUserId,
      limit: safeLimit,
      reason: "no_ai_candidates_after_seen_filter",
      excludeSongIds: fallbackExcludeSongIds,
    });
  }

  const recommendations = await hydrateAndDiversify({
    scored,
    limit: safeLimit,
    dominantProfile: feedback?.dominantProfile,
    isNewUser,
  });

  if (recommendations.length === 0) {
    return fallbackRecommendations({
      userId: normalizedUserId,
      limit: safeLimit,
      reason: "mapped_song_docs_missing",
      excludeSongIds: fallbackExcludeSongIds,
    });
  }

  return {
    recommendations,
    source: "ai-embedding",
    reason: null,
    metadata: {
      embeddingDim: state.embeddingDim,
      userCount: state.userCount,
      itemCount: state.itemCount,
      modelFilePresent: state.modelFilePresent,
      adaptiveProfileCount: state.adaptiveProfiles.size,
      requestedUserId: normalizedUserId,
      filteredSeenSongs: seen.size,
      candidateCount: scored.length,
      feedbackEventsUsed: feedback.eventCount,
      userInteractionCount,
      isNewUser,
    },
  };
}
