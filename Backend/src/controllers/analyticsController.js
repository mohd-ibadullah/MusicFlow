import Song from "../models/songModel.js";
import Album from "../models/albumModel.js";

export const getAnalytics = async (req, res) => {
  try {
    const activeSockets = req.app.get("activeSockets");
    const activeUsers = activeSockets ? activeSockets.size : 0;

    const [totalSongs, totalAlbums, streamAgg, topSongs, topArtistsAgg, recentSongs] = await Promise.all([
      Song.countDocuments(),
      Album.countDocuments(),
      Song.aggregate([
        { $group: { _id: null, total: { $sum: { $ifNull: ["$playCount", 0] } } } },
      ]),
      Song.find().sort({ playCount: -1 }).limit(10).lean(),
      Song.aggregate([
        { $match: { artist: { $ne: "" } } },
        {
          $group: {
            _id: "$artist",
            totalSongs: { $sum: 1 },
            totalPlays: { $sum: { $ifNull: ["$playCount", 0] } },
          },
        },
        { $sort: { totalPlays: -1 } },
        { $limit: 10 },
        { $project: { _id: 1, name: "$_id", totalSongs: 1, totalPlays: 1 } },
      ]),
      Song.find().sort({ createdAt: -1 }).limit(15).lean(),
    ]);

    const totalStreams = streamAgg.length ? streamAgg[0].total : 0;

    const topArtists = topArtistsAgg.map((a) => ({
      _id: a._id,
      name: a.name,
      totalSongs: a.totalSongs,
      totalPlays: a.totalPlays,
    }));

    const recentActivity = recentSongs.map((song) => ({
      description: `"${song.name}" by ${song.artist || "Unknown"} was added${song.playCount ? ` — ${song.playCount} plays` : ""}`,
      timestamp: song.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        totalSongs,
        totalAlbums,
        totalStreams,
        activeUsers,
        topSongs,
        topArtists,
        recentActivity,
      },
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
