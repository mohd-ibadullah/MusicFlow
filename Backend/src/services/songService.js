import mongoose from "mongoose";
import Song from "../models/songModel.js";
import User from "../models/userModel.js";

const DEFAULT_LIMIT = 10;

/**
 * Business logic: compute personalized song recommendations.
 * Uses recentlyPlayed, likedSongs, similar language/artist, playCount ranking.
 * @param {{ userId?: string }} options
 * @returns {Promise<import("../models/songModel.js").Song[]>}
 */
export async function getRecommendations(options = {}) {
  const { userId } = options;
  const limit = DEFAULT_LIMIT;
  const excludeIds = new Set();
  let candidates = [];

  if (userId) {
    const user = await User.findById(userId)
      .populate("recentlyPlayed.song")
      .populate("likedSongs");
    if (user) {
      const recentIds = (user.recentlyPlayed || [])
        .map((item) => item.song?._id?.toString())
        .filter(Boolean);
      const likedIds = (user.likedSongs || []).map((s) => s._id?.toString()).filter(Boolean);
      recentIds.forEach((id) => excludeIds.add(id));
      likedIds.forEach((id) => excludeIds.add(id));

      const recentSongs = (user.recentlyPlayed || []).map((item) => item.song).filter(Boolean);
      const languages = [...new Set(recentSongs.map((s) => s.language).filter(Boolean))];
      const artists = [...new Set(recentSongs.map((s) => s.artist).filter(Boolean))];
      const likedSongs = user.likedSongs || [];
      languages.push(...likedSongs.map((s) => s.language).filter(Boolean));
      artists.push(...likedSongs.map((s) => s.artist).filter(Boolean));
      const languageSet = new Set(languages.filter(Boolean));
      const artistSet = new Set(artists.filter(Boolean));

      if (languageSet.size || artistSet.size) {
        const orConditions = [];
        if (languageSet.size) orConditions.push({ language: { $in: [...languageSet] } });
        if (artistSet.size) orConditions.push({ artist: { $in: [...artistSet] } });
        const similar = await Song.find({
          _id: { $nin: [...excludeIds].map((id) => new mongoose.Types.ObjectId(id)) },
          $or: orConditions,
        })
          // Rank by popularity and recency
          .sort({ playCount: -1, createdAt: -1 })
          .limit(limit * 2)
          .lean();
        candidates = similar;
      }
    }
  }

  if (candidates.length < limit) {
    const excludeList = [...excludeIds].map((id) => new mongoose.Types.ObjectId(id));
    const trending = await Song.find(excludeList.length ? { _id: { $nin: excludeList } } : {})
      .sort({ playCount: -1, likeCount: -1 })
      .limit(limit * 2)
      .lean();
    const seen = new Set(candidates.map((c) => c._id.toString()));
    for (const s of trending) {
      if (!seen.has(s._id.toString())) {
        candidates.push(s);
        seen.add(s._id.toString());
      }
    }
  }

  return candidates.slice(0, limit);
}

/**
 * Get trending songs by playCount.
 * @param {{ limit?: number }} options
 */
export async function getTrendingSongsList(options = {}) {
  const limit = Math.min(Number(options.limit) || 10, 50);
  return Song.find({}).sort({ playCount: -1 }).limit(limit).lean();
}
