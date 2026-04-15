import Song from "../models/songModel.js";

export function mixPopularAndRandom(songs, limit) {
  if (!Array.isArray(songs) || songs.length === 0) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

  const popularCount = Math.min(safeLimit, Math.max(1, Math.ceil(safeLimit * 0.7)));
  const picked = songs.slice(0, popularCount);
  const remaining = songs.slice(popularCount, safeLimit);

  return [...picked, ...remaining].slice(0, safeLimit);
}

export async function getColdStartRecommendations({ limit = 10, excludeSongIds = new Set() } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const fetchLimit = Math.max(50, safeLimit * 8);

  const pool = await Song.find({})
    .sort({ playCount: -1, likeCount: -1, createdAt: -1 })
    .limit(fetchLimit)
    .lean();

  const filtered = pool.filter((song) => !excludeSongIds.has(song._id?.toString?.()?.toLowerCase?.()));
  return mixPopularAndRandom(filtered, safeLimit);
}
