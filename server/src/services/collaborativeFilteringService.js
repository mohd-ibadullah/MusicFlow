import mongoose from "mongoose";

import Song from "../models/songModel.js";
import User from "../models/userModel.js";
import { cacheGet, cacheSet } from "./cacheService.js";

const DEFAULT_LIMIT = 10;
const CF_CACHE_VERSION = "v2";
const TOP_SIMILAR_USERS = 12;
const CF_CACHE_TTL_SECONDS = 30 * 60;
const HYBRID_INTERACTION_THRESHOLD = 2;
const MIN_SIMILARITY_THRESHOLD = 0.15;
const SIMILAR_USER_RECENT_WEIGHT = 0.65;
const TARGET_RECENT_WEIGHT = 1.45;
const TARGET_LIKE_WEIGHT = 1.15;
const DOMINANT_MIN_WEIGHT = 2.1;
const DOMINANT_RATIO_THRESHOLD = 0.52;
const DOMINANT_LANGUAGE_BOOST = 3.0;
const SECONDARY_LANGUAGE_BOOST = 1.2;
const NON_DOMINANT_LANGUAGE_PENALTY = 0.18;
const SAME_CLUSTER_BOOST = 2.15;
const DIFFERENT_CLUSTER_PENALTY = 0.22;
const DOMINANT_CLUSTER_TARGET = 0.78;
const EPSILON = 1e-12;

const TASTE_CLUSTERS = {
  HINDI_ROMANTIC: "hindi_romantic",
  TELUGU_EMOTIONAL: "telugu_emotional",
  ENGLISH_EDM_POP: "english_edm_pop",
};

const CLUSTER_TERMS = {
  [TASTE_CLUSTERS.HINDI_ROMANTIC]: [
    "hindi",
    "romantic",
    "romance",
    "love",
    "arijit",
    "jubin",
    "kk",
  ],
  [TASTE_CLUSTERS.TELUGU_EMOTIONAL]: [
    "telugu",
    "emotional",
    "melody",
    "melodic",
    "sad",
    "sid sriram",
  ],
  [TASTE_CLUSTERS.ENGLISH_EDM_POP]: [
    "english",
    "edm",
    "pop",
    "dance",
    "electronic",
    "weeknd",
    "chainsmokers",
    "sia",
  ],
};

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return value._id.toString();
  if (typeof value.toString === "function") return value.toString();
  return null;
};

const toLeanSong = (song) => {
  if (!song) return null;
  if (typeof song.toObject === "function") return song.toObject();
  return song;
};

const normalizeLabel = (value) => {
  if (value === null || value === undefined) return null;
  const text = value.toString().trim();
  if (!text) return null;
  return text.toLowerCase();
};

const canonicalLanguage = (value) => {
  const normalized = normalizeLabel(value);
  if (!normalized) return null;
  if (normalized.includes("hindi")) return "hindi";
  if (normalized.includes("telugu")) return "telugu";
  if (normalized.includes("english")) return "english";
  return normalized;
};

const addWeighted = (map, key, weight, label = key) => {
  if (!key || !Number.isFinite(weight) || weight <= 0) return;
  const current = map.get(key) || { weight: 0, label };
  current.weight += weight;
  if (!current.label && label) current.label = label;
  map.set(key, current);
};

const weightedEntries = (map) =>
  [...map.entries()]
    .map(([value, entry]) => ({
      value,
      label: entry.label,
      weight: Number(entry.weight.toFixed(3)),
    }))
    .sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));

const resolveDominantFromWeights = (map) => {
  const entries = weightedEntries(map);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const best = entries[0];
  if (!best || totalWeight < DOMINANT_MIN_WEIGHT) return null;

  const ratio = best.weight / (totalWeight || 1);
  if (ratio < DOMINANT_RATIO_THRESHOLD) return null;

  return {
    value: best.value,
    label: best.label,
    weight: best.weight,
    ratio: Number(ratio.toFixed(3)),
  };
};

const detectTasteClusterForSong = (song) => {
  const language = canonicalLanguage(song?.language);
  const text = [
    song?.language,
    song?.genre,
    song?.artist,
    song?.name,
    song?.album,
    song?.desc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const scoreCluster = (cluster) =>
    CLUSTER_TERMS[cluster].reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);

  const scores = {
    [TASTE_CLUSTERS.HINDI_ROMANTIC]: (language === "hindi" ? 3 : 0) + scoreCluster(TASTE_CLUSTERS.HINDI_ROMANTIC),
    [TASTE_CLUSTERS.TELUGU_EMOTIONAL]: (language === "telugu" ? 3 : 0) + scoreCluster(TASTE_CLUSTERS.TELUGU_EMOTIONAL),
    [TASTE_CLUSTERS.ENGLISH_EDM_POP]: (language === "english" ? 2 : 0) + scoreCluster(TASTE_CLUSTERS.ENGLISH_EDM_POP),
  };

  const [cluster, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || [];
  if (cluster === TASTE_CLUSTERS.ENGLISH_EDM_POP) {
    const hasModernPopSignal = /\b(edm|dance|electronic|weeknd|chainsmokers|sia)\b/.test(text);
    return score >= 4 && hasModernPopSignal ? cluster : null;
  }
  return score >= 3 ? cluster : null;
};

const summarizeDistribution = (songs, field) => {
  const counts = {};
  for (const song of songs || []) {
    const label = song?.[field] || "Unknown";
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
};

const computeOverlapScore = (songsA, songsB) => {
  const idsA = new Set((songsA || []).map((song) => toIdString(song?._id || song)).filter(Boolean));
  const idsB = new Set((songsB || []).map((song) => toIdString(song?._id || song)).filter(Boolean));
  if (!idsA.size || !idsB.size) return 0;
  let overlap = 0;
  for (const id of idsA) {
    if (idsB.has(id)) overlap += 1;
  }
  return Number((overlap / Math.min(idsA.size, idsB.size)).toFixed(3));
};

const buildPreferenceProfile = (user) => {
  const languages = new Map();
  const genres = new Map();
  const artists = new Map();
  const clusters = new Map();
  const songs = [];

  const addSong = (song, weight) => {
    const leanSong = toLeanSong(song);
    if (!leanSong) return;
    songs.push(leanSong);

    const language = canonicalLanguage(leanSong.language);
    const genre = normalizeLabel(leanSong.genre);
    const artist = normalizeLabel(leanSong.artist);
    const cluster = detectTasteClusterForSong(leanSong);

    addWeighted(languages, language, weight, leanSong.language);
    addWeighted(genres, genre, weight, leanSong.genre);
    addWeighted(artists, artist, weight * 0.75, leanSong.artist);
    addWeighted(clusters, cluster, weight * 1.2, cluster);
  };

  for (const song of user?.likedSongs || []) addSong(song, TARGET_LIKE_WEIGHT);
  (user?.recentlyPlayed || []).forEach((entry, index) => {
    addSong(entry?.song, TARGET_RECENT_WEIGHT * Math.max(0.65, 1 - index * 0.08));
  });

  const dominantLanguage = resolveDominantFromWeights(languages);
  const dominantGenre = resolveDominantFromWeights(genres);
  const dominantTasteCluster = resolveDominantFromWeights(clusters);

  return {
    songs,
    languages,
    genres,
    artists,
    clusters,
    dominantLanguage,
    dominantGenre,
    dominantTasteCluster,
    secondaryLanguages: weightedEntries(languages)
      .filter((entry) => entry.value !== dominantLanguage?.value)
      .slice(0, 2),
    languageDistribution: weightedEntries(languages),
    genreDistribution: weightedEntries(genres),
    artistDistribution: weightedEntries(artists).slice(0, 6),
    tasteClusterDistribution: weightedEntries(clusters),
  };
};

const buildVector = (preference) => {
  const vector = new Map();
  for (const [key, entry] of preference.languages.entries()) addWeighted(vector, `lang:${key}`, entry.weight * 2.4);
  for (const [key, entry] of preference.genres.entries()) addWeighted(vector, `genre:${key}`, entry.weight * 1.5);
  for (const [key, entry] of preference.artists.entries()) addWeighted(vector, `artist:${key}`, entry.weight * 0.8);
  for (const [key, entry] of preference.clusters.entries()) addWeighted(vector, `cluster:${key}`, entry.weight * 2.0);
  return new Map([...vector.entries()].map(([key, entry]) => [key, entry.weight]));
};

const extractUserProfile = (user) => {
  const profile = new Map();
  const likedIds = new Set();
  const heardIds = new Set();

  for (const song of user?.likedSongs || []) {
    const songId = toIdString(song?._id || song);
    if (!songId) continue;
    likedIds.add(songId);
    heardIds.add(songId);
    profile.set(songId, (profile.get(songId) || 0) + TARGET_LIKE_WEIGHT);
  }

  for (const item of user?.recentlyPlayed || []) {
    const song = item?.song;
    const songId = toIdString(song?._id || song);
    if (!songId) continue;
    heardIds.add(songId);
    profile.set(songId, (profile.get(songId) || 0) + TARGET_RECENT_WEIGHT);
  }

  return {
    profile,
    likedIds,
    heardIds,
    interactionCount: profile.size,
  };
};

const computeCosineFromProfiles = (profileA, profileB) => {
  if (!profileA.size || !profileB.size) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of profileA.values()) normA += value * value;
  for (const value of profileB.values()) normB += value * value;

  const smaller = profileA.size <= profileB.size ? profileA : profileB;
  const larger = smaller === profileA ? profileB : profileA;

  for (const [songId, value] of smaller.entries()) {
    if (larger.has(songId)) dot += value * larger.get(songId);
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + EPSILON);
};

export const cosineSimilarity = (vectorA, vectorB) => {
  const length = Math.max(vectorA?.length || 0, vectorB?.length || 0);
  if (!length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = Number(vectorA?.[index] || 0);
    const valueB = Number(vectorB?.[index] || 0);
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getTrendingSongs = async (limit = DEFAULT_LIMIT, excludeIds = new Set(), filters = {}) => {
  const query = { ...filters };
  if (excludeIds.size) {
    query._id = { $nin: [...excludeIds].filter(mongoose.Types.ObjectId.isValid).map((id) => new mongoose.Types.ObjectId(id)) };
  }

  return Song.find(query)
    .sort({ playCount: -1, likeCount: -1, createdAt: -1 })
    .limit(limit)
    .lean();
};

const languageAffinity = (song, preference) => {
  const songLanguage = canonicalLanguage(song?.language);
  const dominant = preference.dominantLanguage?.value;
  if (!dominant || !songLanguage) return 1;
  if (songLanguage === dominant) return DOMINANT_LANGUAGE_BOOST;
  if (preference.secondaryLanguages.some((entry) => entry.value === songLanguage)) {
    return SECONDARY_LANGUAGE_BOOST;
  }
  return NON_DOMINANT_LANGUAGE_PENALTY;
};

const clusterAffinity = (song, preference) => {
  const songCluster = detectTasteClusterForSong(song);
  const dominantCluster = preference.dominantTasteCluster?.value;
  if (!dominantCluster || !songCluster) return 1;
  return songCluster === dominantCluster ? SAME_CLUSTER_BOOST : DIFFERENT_CLUSTER_PENALTY;
};

const genreAffinity = (song, preference) => {
  const songGenre = normalizeLabel(song?.genre);
  if (!songGenre || !preference.dominantGenre?.value) return 1;
  return songGenre === preference.dominantGenre.value ? 1.55 : 0.78;
};

const scoreCandidate = (song, baseScore, preference) => {
  const popularitySignal = Math.log10(Math.max(0, Number(song?.playCount) || 0) + 10) / 8;
  return (baseScore + popularitySignal) * languageAffinity(song, preference) * clusterAffinity(song, preference) * genreAffinity(song, preference);
};

const hydrateScoredCandidates = async (candidateScores, excludeIds, preference) => {
  const candidateIds = [...candidateScores.keys()].filter((songId) => !excludeIds.has(songId));
  if (candidateIds.length === 0) return [];

  const songs = await Song.find({ _id: { $in: candidateIds } }).lean();
  const songsById = new Map(songs.map((song) => [song._id.toString(), song]));

  return candidateIds
    .map((songId) => {
      const song = songsById.get(songId);
      if (!song) return null;
      const baseScore = candidateScores.get(songId) || 0;
      const score = scoreCandidate(song, baseScore, preference);
      return {
        song,
        score,
        baseScore,
        language: song.language,
        tasteCluster: detectTasteClusterForSong(song),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const playDiff = (Number(b.song?.playCount) || 0) - (Number(a.song?.playCount) || 0);
      if (playDiff !== 0) return playDiff;
      return a.song._id.toString().localeCompare(b.song._id.toString());
    });
};

const isDominantIdentitySong = (song, preference) => {
  const dominantLanguage = preference.dominantLanguage?.value;
  const dominantCluster = preference.dominantTasteCluster?.value;
  const songLanguage = canonicalLanguage(song?.language);
  const songCluster = detectTasteClusterForSong(song);
  if (dominantCluster) return songCluster === dominantCluster;
  if (dominantLanguage) return songLanguage === dominantLanguage;
  return true;
};

const composeRecommendations = (entries, limit, preference) => {
  const primaryTarget = Math.ceil(limit * DOMINANT_CLUSTER_TARGET);
  const primary = entries.filter((entry) => isDominantIdentitySong(entry.song, preference));
  const diversity = entries.filter((entry) => !isDominantIdentitySong(entry.song, preference));
  const selected = [];
  const seen = new Set();

  const add = (entry) => {
    if (!entry || selected.length >= limit) return;
    const id = entry.song._id.toString();
    if (seen.has(id)) return;
    selected.push(entry);
    seen.add(id);
  };

  for (const entry of primary) {
    if (selected.length >= primaryTarget) break;
    add(entry);
  }
  for (const entry of diversity) {
    if (selected.length >= limit || selected.length >= primaryTarget + Math.floor(limit * (1 - DOMINANT_CLUSTER_TARGET))) break;
    add(entry);
  }
  for (const entry of primary) add(entry);
  for (const entry of diversity) add(entry);

  return selected.slice(0, limit);
};

const computePersonalizationStrength = ({ songs, preference, cfSongCount, fallbackSongCount, similarUsers }) => {
  if (!songs.length) return 0;
  const dominantCount = songs.filter((song) => isDominantIdentitySong(song, preference)).length;
  const dominantRatio = dominantCount / songs.length;
  const cfRatio = cfSongCount / songs.length;
  const avgSimilarity = similarUsers.length
    ? similarUsers.reduce((sum, user) => sum + user.similarity, 0) / similarUsers.length
    : 0;
  const fallbackPenalty = fallbackSongCount / songs.length;
  const score = dominantRatio * 0.5 + cfRatio * 0.3 + Math.min(avgSimilarity, 1) * 0.25 - fallbackPenalty * 0.2;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
};

const scoreUserSimilarity = (targetProfile, targetPreference, otherUser) => {
  const otherProfile = extractUserProfile(otherUser);
  if (otherProfile.interactionCount === 0) return null;

  const otherPreference = buildPreferenceProfile(otherUser);
  const exactSongSimilarity = computeCosineFromProfiles(targetProfile.profile, otherProfile.profile);
  const preferenceSimilarity = computeCosineFromProfiles(buildVector(targetPreference), buildVector(otherPreference));
  const sameCluster =
    targetPreference.dominantTasteCluster?.value &&
    targetPreference.dominantTasteCluster.value === otherPreference.dominantTasteCluster?.value;
  const sameLanguage =
    targetPreference.dominantLanguage?.value &&
    targetPreference.dominantLanguage.value === otherPreference.dominantLanguage?.value;
  const hardMismatch =
    targetPreference.dominantLanguage?.value &&
    otherPreference.dominantLanguage?.value &&
    targetPreference.dominantLanguage.value !== otherPreference.dominantLanguage.value;

  let similarity = exactSongSimilarity * 0.58 + preferenceSimilarity * 0.28 + (sameCluster ? 0.18 : 0) + (sameLanguage ? 0.06 : 0);
  if (targetProfile.interactionCount >= 5 && exactSongSimilarity < 0.12) {
    similarity *= 0.35;
  }
  if (hardMismatch) similarity *= 0.18;
  if (targetPreference.dominantTasteCluster?.value && otherPreference.dominantTasteCluster?.value && !sameCluster) {
    similarity *= 0.35;
  }

  return {
    userId: otherUser._id?.toString?.(),
    name: otherUser?.name || null,
    similarity,
    exactSongSimilarity,
    preferenceSimilarity,
    sameLanguage: Boolean(sameLanguage),
    sameCluster: Boolean(sameCluster),
    dominantLanguage: otherPreference.dominantLanguage,
    dominantTasteCluster: otherPreference.dominantTasteCluster,
    profile: otherProfile,
  };
};

const buildCandidateScores = (similarUsers, heardIds) => {
  const candidateScores = new Map();
  const candidateSupport = new Map();

  const addCandidate = (songId, increment, similarUser, interactionType) => {
    if (!songId || heardIds.has(songId)) return;
    candidateScores.set(songId, (candidateScores.get(songId) || 0) + increment);
    const support = candidateSupport.get(songId) || [];
    support.push({
      userId: similarUser.userId,
      name: similarUser.name,
      similarity: Number(similarUser.similarity.toFixed(4)),
      interactionType,
    });
    candidateSupport.set(songId, support);
  };

  for (const similarUser of similarUsers) {
    const neighborBoost = similarUser.sameCluster ? 1.45 : 1;
    for (const song of similarUser.profile.likedIds) {
      addCandidate(song, similarUser.similarity * 1.25 * neighborBoost, similarUser, "liked");
    }

    for (const song of similarUser.profile.heardIds) {
      if (similarUser.profile.likedIds.has(song)) continue;
      addCandidate(song, similarUser.similarity * SIMILAR_USER_RECENT_WEIGHT * neighborBoost, similarUser, "recently_played");
    }
  }

  return { candidateScores, candidateSupport };
};

const getFallbackEntries = async ({ limit, excludeIds, preference }) => {
  const needed = limit;
  const pools = [];
  const dominantLanguage = preference.dominantLanguage?.label;
  const dominantGenre = preference.dominantGenre?.label;

  if (dominantLanguage && dominantGenre) {
    pools.push(await getTrendingSongs(needed * 4, excludeIds, { language: dominantLanguage, genre: dominantGenre }));
  }
  if (dominantLanguage) {
    pools.push(await getTrendingSongs(needed * 4, excludeIds, { language: dominantLanguage }));
  }
  if (!dominantLanguage && dominantGenre) {
    pools.push(await getTrendingSongs(needed * 3, excludeIds, { genre: dominantGenre }));
  }
  if (!dominantLanguage && !dominantGenre) {
    pools.push(await getTrendingSongs(needed, excludeIds));
  }

  const seen = new Set();
  return pools
    .flat()
    .filter((song) => {
      const id = song._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((song) => ({
      song,
      score: scoreCandidate(song, 0.2, preference),
      baseScore: 0.2,
      fallback: true,
      tasteCluster: detectTasteClusterForSong(song),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, needed);
};

const emptyDebug = (overrides = {}) => ({
  similarUsersFound: 0,
  userInteractionCount: 0,
  similarityThreshold: MIN_SIMILARITY_THRESHOLD,
  similarUsers: [],
  cfSongCount: 0,
  fallbackSongCount: 0,
  dominantLanguage: null,
  dominantGenre: null,
  dominantTasteCluster: null,
  secondaryLanguages: [],
  recommendationLanguageDistribution: {},
  recommendationGenreDistribution: {},
  personalizationStrength: 0,
  overlapScore: 0,
  cacheHit: false,
  ...overrides,
});

export async function getCollaborativeFilteringRecommendations(options = {}) {
  const { userId, limit = DEFAULT_LIMIT, compareToSongs = [], forceRefresh = false } = options;

  if (!userId) {
    return {
      source: "trending_fallback",
      count: 0,
      songs: [],
      debug: emptyDebug(),
    };
  }

  const cacheKey = `cf:${CF_CACHE_VERSION}:${userId}:${limit}`;
  const cached = forceRefresh ? null : await cacheGet(cacheKey);
  if (cached?.songs) {
    return {
      ...cached,
      debug: {
        ...(cached.debug || {}),
        cacheHit: true,
      },
    };
  }

  const targetUser = await User.findById(userId)
    .populate("likedSongs")
    .populate("recentlyPlayed.song")
    .lean();

  if (!targetUser) {
    return {
      source: "trending_fallback",
      count: 0,
      songs: [],
      debug: emptyDebug(),
    };
  }

  const targetProfile = extractUserProfile(targetUser);
  const targetPreference = buildPreferenceProfile(targetUser);
  const heardIds = new Set(targetProfile.heardIds);

  if (targetProfile.interactionCount === 0) {
    const songs = await getTrendingSongs(limit, heardIds);
    const response = {
      source: "trending_fallback",
      count: songs.length,
      songs,
      debug: emptyDebug({
        fallbackSongCount: songs.length,
        recommendationLanguageDistribution: summarizeDistribution(songs, "language"),
        recommendationGenreDistribution: summarizeDistribution(songs, "genre"),
        overlapScore: computeOverlapScore(songs, compareToSongs),
      }),
    };

    await cacheSet(cacheKey, response, CF_CACHE_TTL_SECONDS);
    return response;
  }

  const otherUsers = await User.find({ _id: { $ne: userId } })
    .select("name likedSongs recentlyPlayed")
    .populate("likedSongs")
    .populate("recentlyPlayed.song")
    .lean();

  const scoredSimilarities = otherUsers
    .map((otherUser) => scoreUserSimilarity(targetProfile, targetPreference, otherUser))
    .filter(Boolean);

  const candidateThreshold = targetProfile.interactionCount >= 5 ? Math.max(MIN_SIMILARITY_THRESHOLD, 0.18) : MIN_SIMILARITY_THRESHOLD;
  const similarities = scoredSimilarities
    .filter((entry) => entry.similarity >= candidateThreshold)
    .sort((a, b) => b.similarity - a.similarity || (b.preferenceSimilarity - a.preferenceSimilarity) || (a.name || "").localeCompare(b.name || ""));

  const topSimilarUsers = similarities.slice(0, TOP_SIMILAR_USERS);
  const { candidateScores, candidateSupport } = buildCandidateScores(topSimilarUsers, heardIds);

  const hydratedCandidates = await hydrateScoredCandidates(candidateScores, heardIds, targetPreference);
  const composedCfEntries = composeRecommendations(hydratedCandidates, limit, targetPreference);
  const cfSongCountBeforeFallback = Math.min(composedCfEntries.length, limit);

  let selectedEntries = [...composedCfEntries];
  let fallbackSongCount = 0;
  if (selectedEntries.length < limit) {
    const excludedIds = new Set([...heardIds, ...selectedEntries.map((entry) => entry.song._id.toString())]);
    const fallbackEntries = await getFallbackEntries({
      limit: limit - selectedEntries.length,
      excludeIds: excludedIds,
      preference: targetPreference,
    });
    selectedEntries = composeRecommendations([...selectedEntries, ...fallbackEntries], limit, targetPreference);
    fallbackSongCount = selectedEntries.filter((entry) => entry.fallback).length;
  }

  const songs = selectedEntries.map((entry) => entry.song).slice(0, limit);
  let source = "collaborative_filtering";
  if (targetProfile.interactionCount < HYBRID_INTERACTION_THRESHOLD) {
    source = songs.length > fallbackSongCount ? "hybrid" : "trending_fallback";
  } else if (cfSongCountBeforeFallback === 0) {
    source = fallbackSongCount > 0 ? "trending_fallback" : "collaborative_filtering";
  } else if (fallbackSongCount > 0) {
    source = "hybrid";
  }

  const personalizationStrength = computePersonalizationStrength({
    songs,
    preference: targetPreference,
    cfSongCount: songs.length - fallbackSongCount,
    fallbackSongCount,
    similarUsers: topSimilarUsers,
  });

  const response = {
    source,
    count: songs.length,
    songs,
    debug: {
      similarUsersFound: topSimilarUsers.length,
      userInteractionCount: targetProfile.interactionCount,
      similarityThreshold: candidateThreshold,
      similarUsers: topSimilarUsers.map((entry) => ({
        userId: entry.userId,
        name: entry.name,
        similarity: Number(entry.similarity.toFixed(4)),
        exactSongSimilarity: Number(entry.exactSongSimilarity.toFixed(4)),
        preferenceSimilarity: Number(entry.preferenceSimilarity.toFixed(4)),
        sameLanguage: entry.sameLanguage,
        sameCluster: entry.sameCluster,
        interactionCount: entry.profile.interactionCount,
        dominantLanguage: entry.dominantLanguage,
        dominantTasteCluster: entry.dominantTasteCluster,
      })),
      cfSongCount: songs.length - fallbackSongCount,
      rawCfCandidateCount: hydratedCandidates.length,
      fallbackSongCount,
      dominantLanguage: targetPreference.dominantLanguage,
      dominantGenre: targetPreference.dominantGenre,
      dominantTasteCluster: targetPreference.dominantTasteCluster,
      secondaryLanguages: targetPreference.secondaryLanguages,
      preferenceProfile: {
        languages: targetPreference.languageDistribution,
        genres: targetPreference.genreDistribution,
        artists: targetPreference.artistDistribution,
        tasteClusters: targetPreference.tasteClusterDistribution,
      },
      recommendationLanguageDistribution: summarizeDistribution(songs, "language"),
      recommendationGenreDistribution: summarizeDistribution(songs, "genre"),
      personalizationStrength,
      overlapScore: computeOverlapScore(songs, compareToSongs),
      candidateSupport: selectedEntries.map((entry) => ({
        songId: entry.song._id.toString(),
        name: entry.song.name,
        score: Number(entry.score.toFixed(4)),
        baseScore: Number(entry.baseScore.toFixed(4)),
        fallback: Boolean(entry.fallback),
        language: entry.song.language,
        tasteCluster: entry.tasteCluster,
        supporters: candidateSupport.get(entry.song._id.toString()) || [],
      })),
      cacheHit: false,
    },
  };

  await cacheSet(cacheKey, response, CF_CACHE_TTL_SECONDS);
  return response;
}

export {
  buildPreferenceProfile,
  computeCosineFromProfiles,
  computeOverlapScore,
  detectTasteClusterForSong,
  extractUserProfile,
};
