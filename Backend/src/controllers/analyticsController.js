import Song from "../models/songModel.js";

/**
 * GET /api/admin/analytics
 * Returns: totalSongs, totalStreams, activeListeners (realtime), topSongs (top 10 by playCount).
 */
export const getAnalytics = async (req, res) => {
  try {
    const activeListenersMap = req.app.get("activeListeners");
    const activeListeners = activeListenersMap ? activeListenersMap.size : 0;

    const totalSongs = await Song.countDocuments();
    const streamAgg = await Song.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ["$playCount", 0] } } } },
    ]);
    const totalStreams = streamAgg.length ? streamAgg[0].total : 0;

    const topSongs = await Song.find()
      .sort({ playCount: -1 })
      .limit(10)
      .lean();

    const data = {
      totalSongs,
      totalStreams,
      activeListeners,
      topSongs,
    };

    const dbName = Song.db?.databaseName || "unknown";
    console.log("[Analytics] db:", dbName, "totalSongs:", totalSongs, "totalStreams:", totalStreams, "activeListeners:", activeListeners, "topSongs:", topSongs.length);

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
