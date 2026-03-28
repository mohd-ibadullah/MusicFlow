import Song from "../models/songModel.js";
import Album from "../models/albumModel.js";
import Activity from "../models/activityModel.js";
import { isRedisAvailable, getRedisClient } from "../config/redis.js";

export const getAnalytics = async (req, res) => {
  try {
    // Get active user count (Redis-aware for distributed scaling, fallback to local map)
    let activeUsers = 0;
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        activeUsers = await client.sCard("active_users");
      } catch (redisError) {
        console.warn("Redis error in analytics:", redisError.message);
        const map = req.app.get("activeUsersMap");
        activeUsers = map ? map.size : 0;
      }
    } else {
      const map = req.app.get("activeUsersMap");
      activeUsers = map ? map.size : 0;
    }
    
    // Total stats and aggregations
    const [totalSongs, totalAlbums, streamAgg, topSongs, topArtistsAgg] = await Promise.all([
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
    ]);

    const totalStreams = streamAgg.length ? streamAgg[0].total : 0;

    const topArtists = topArtistsAgg.map((a) => ({
      _id: a._id,
      name: a.name,
      totalSongs: a.totalSongs,
      totalPlays: a.totalPlays,
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

export const getRecentActivity = async (req, res) => {
  try {
    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recent activity",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
