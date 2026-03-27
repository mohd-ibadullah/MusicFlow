import Song from "../models/songModel.js";
import Album from "../models/albumModel.js";

/**
 * GET /api/admin/analytics
 * Returns: totalSongs, totalAlbums, totalStreams, activeUsers (realtime), topSongs (top 10 by playCount).
 */
export const getAnalytics = async (req, res) => {
  try {
    const activeListenersMap = req.app.get("activeListeners");
    const activeUsers = activeListenersMap ? activeListenersMap.size : 0;

    const [totalSongs, totalAlbums, streamAgg, topSongs] = await Promise.all([
      Song.countDocuments(),
      Album.countDocuments(),
      Song.aggregate([
        { $group: { _id: null, total: { $sum: { $ifNull: ["$playCount", 0] } } } },
      ]),
      Song.find().sort({ playCount: -1 }).limit(10).lean(),
    ]);

    const totalStreams = streamAgg.length ? streamAgg[0].total : 0;

    const data = {
      totalSongs,
      totalAlbums,
      totalStreams,
      activeUsers,
      topSongs,
    };

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
