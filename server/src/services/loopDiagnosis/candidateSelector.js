// SYSTEM SCAN: Song documents use name/image/file fields; title/audioUrl aliases are not primary.
// SYSTEM SCAN: recently played data is embedded in User.recentlyPlayed with song ObjectId + playedAt.
// SYSTEM SCAN: LoopEvent is a new collection and can be used for behavioral exclusion/lookback.

import Song from "../../models/songModel.js";
import User from "../../models/userModel.js";
import LoopEvent from "../../models/LoopEvent.js";
import { parseDurationToSeconds } from "./timeUtils.js";

const getSongTitle = (song) => song?.name || song?.title || "Unknown";

const scoreCandidate = ({
  candidate,
  loopedSong,
  likedSet,
  emotionalStagnationScore,
  fatigueLevel,
}) => {
  let score = 0;

  const candidateId = candidate?._id?.toString();
  const loopGenre = (loopedSong?.genre || "").trim().toLowerCase();
  const candidateGenre = (candidate?.genre || "").trim().toLowerCase();

  if (likedSet.has(candidateId)) {
    score += 1.5;
  }

  if (loopGenre && candidateGenre) {
    if (loopGenre !== candidateGenre) {
      score += 2;
      if (emotionalStagnationScore >= 0.7) {
        score += 1;
      }
    } else {
      score -= 0.5;
    }
  }

  const loopSeconds = parseDurationToSeconds(loopedSong?.duration);
  const candidateSeconds = parseDurationToSeconds(candidate?.duration);

  if (loopSeconds && candidateSeconds) {
    const delta = Math.abs(loopSeconds - candidateSeconds);
    // Gentle shift in pacing helps progression without being jarring.
    if (delta >= 20 && delta <= 120) {
      score += 1;
    } else if (delta > 240) {
      score -= 0.4;
    }

    if (fatigueLevel === "high" && delta > 150) {
      score -= 0.6;
    }
  }

  score += Math.random() * 0.2;
  return score;
};

/**
 * Fetch bridge-track candidates with strict exclusions and wellbeing-aware ranking.
 */
export async function getCandidates({
  userId,
  loopedSong,
  maxCandidates = 10,
  behaviorProfile = {},
}) {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const userDoc = await User.findById(userId)
      .select("recentlyPlayed likedSongs")
      .populate("recentlyPlayed.song", "_id")
      .lean();

    const recentSongIds = (userDoc?.recentlyPlayed || [])
      .filter((entry) => entry?.playedAt && new Date(entry.playedAt) >= twoHoursAgo)
      .map((entry) => entry?.song?._id?.toString?.() || entry?.song?.toString?.())
      .filter(Boolean);

    const likedSet = new Set((userDoc?.likedSongs || []).map((id) => id.toString()));

    const pastLoopEvents = await LoopEvent.find({
      userId,
      createdAt: { $gte: sevenDaysAgo },
    })
      .select("loopedSongId")
      .lean();

    const pastLoopedIds = pastLoopEvents
      .map((event) => event?.loopedSongId?.toString())
      .filter(Boolean);

    const excludeIds = [
      loopedSong?._id?.toString(),
      ...recentSongIds,
      ...pastLoopedIds,
    ].filter(Boolean);

    const baseQuery = {
      _id: { $nin: excludeIds },
    };

    let candidates = [];

    if (loopedSong?.artist) {
      candidates = await Song.find({
        ...baseQuery,
        artist: { $ne: loopedSong.artist },
      })
        .limit(maxCandidates * 6)
        .lean();
    }

    if (!candidates || candidates.length < 3) {
      candidates = await Song.find(baseQuery).limit(maxCandidates * 4).lean();
    }

    if (!candidates || candidates.length === 0) {
      console.warn("[LD] No bridge candidates found for user:", userId);
      return [];
    }

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate({
          candidate,
          loopedSong,
          likedSet,
          emotionalStagnationScore: behaviorProfile.emotionalStagnationScore || 0,
          fatigueLevel: behaviorProfile.fatigueLevel || "none",
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.candidate);

    return ranked.slice(0, maxCandidates);
  } catch (err) {
    console.error("[LD] candidateSelector error:", err.message);
    return [];
  }
}

/**
 * Rule-based fallback selector with gentle progression preference.
 */
export function fallbackRuleSelect(candidates, { loopedSong } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const loopGenre = (loopedSong?.genre || "").trim().toLowerCase();
  if (loopGenre) {
    const genreShift = candidates.find((song) => {
      const genre = (song?.genre || "").trim().toLowerCase();
      return genre && genre !== loopGenre;
    });
    if (genreShift) return genreShift;
  }

  return candidates[0] || null;
}

export function fallbackRandomSelect(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex] || null;
}

export { getSongTitle };
