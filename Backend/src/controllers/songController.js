import mongoose from "mongoose";
import Song from "../models/songModel.js";
import User from "../models/userModel.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { cacheGet, cacheSet, CACHE_KEYS, invalidateSongStructuralCaches, cachePushLiveEvent } from "../services/cacheService.js";
import * as songService from "../services/songService.js";
import logActivity from "../utils/logActivity.js";

// Write-Through Cache Builder mechanism to eliminate null window after valid invalidation
const rebuildSongCaches = async () => {
  try {
    // 1. Rebuild the master song list
    const songs = await Song.find({}).sort({ createdAt: -1 }).lean();
    await cacheSet(CACHE_KEYS.SONGS_LIST, { data: songs, count: songs.length }, 300);
    
    // 2. Rebuild the trending list (limit 10 for dashboard)
    const limit = 10;
    const trendingSongs = await songService.getTrendingSongsList({ limit });
    await cacheSet(CACHE_KEYS.TRENDING(limit), { data: trendingSongs, count: trendingSongs.length }, 60);

    // 3. User personalized recommendations are inherently cleared and lazily loaded on exact request
    console.log(`[CACHE] Background write-through rebuilt global master lists ⚡`);
  } catch (err) {
    console.warn(`[CACHE] Rebuild error:`, err.message);
  }
};

// In-memory guard to prevent duplicate playCount increments and socket emits
// Key: `${listenerId}-${songId}`, Value: timestamp of last play
const lastPlayMap = new Map();
// Set of keys currently being processed to prevent race conditions
const processingPlays = new Set();

// Deduplication map for like activity logs
const lastLikeLogMap = new Map();
const canProcessLikeLog = (userId, songId) => {
  const key = `${userId}-${songId}`;
  const now = Date.now();
  // If liked within last 2 minutes, don't spam activity logs again
  if (lastLikeLogMap.has(key) && now - lastLikeLogMap.get(key) < 120000) {
    return false;
  }
  lastLikeLogMap.set(key, now);
  // Optional cleanup
  if (Math.random() < 0.05) {
    const cutoff = now - 300000;
    for (const [k, ts] of lastLikeLogMap.entries()) {
      if (ts < cutoff) lastLikeLogMap.delete(k);
    }
  }
  return true;
};

// Check if a play can be processed (not duplicate and not already processing)
const canProcessPlay = (listenerId, songId) => {
  const key = `${listenerId}-${songId}`;
  const now = Date.now();

  // If already processing, reject duplicate
  if (processingPlays.has(key)) {
    return false;
  }

  // If played within last 10 seconds, reject duplicate
  if (lastPlayMap.has(key) && now - lastPlayMap.get(key) < 10000) {
    return false;
  }

  // Reserve this key for processing
  processingPlays.add(key);
  return true;
};

// Record that a play has been processed (call after successful increment)
const recordPlayProcessed = (listenerId, songId, success = true) => {
  const key = `${listenerId}-${songId}`;
  processingPlays.delete(key);
  if (success) {
    lastPlayMap.set(key, Date.now());
  }
  // Clean up old entries periodically (optional, but good for memory)
  if (Math.random() < 0.01) {
    const cutoff = Date.now() - 30000;
    for (const [k, timestamp] of lastPlayMap.entries()) {
      if (timestamp < cutoff) {
        lastPlayMap.delete(k);
      }
    }
  }
};

export const addSong = async (req, res) => {
  try {
    const { name, description, album, artist, genre } = req.body;

    if (
      !req.files ||
      !req.files["image"] ||
      req.files["image"].length === 0 ||
      !req.files["audio"] ||
      req.files["audio"].length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Image and audio files are required",
      });
    }

    const imageFile = req.files["image"][0].path;
    const audioFile = req.files["audio"][0].path;

    let imageUpload, audioUpload;

    try {
      // Upload image to Cloudinary (optimized for web delivery)
      imageUpload = await cloudinary.uploader.upload(imageFile, {
        resource_type: "image",
        fetch_format: "auto",
        quality: "auto"
      });

      // Upload audio to Cloudinary
      audioUpload = await cloudinary.uploader.upload(audioFile, {
        resource_type: "video",
      });
    } catch (cloudinaryError) {
      console.error("❌ Cloudinary upload error:", cloudinaryError);
      return res.status(400).json({
        success: false,
        message: "File upload failed. Please check your files and try again.",
      });
    }

    // Estimate duration based on file size (fallback method)
    let duration = "0:00";
    try {
      const stats = fs.statSync(audioFile);
      const fileSizeInMB = stats.size / (1024 * 1024);
      // Rough estimate: 1MB ≈ 1 minute for MP3
      const estimatedMinutes = Math.max(1, Math.round(fileSizeInMB));
      const estimatedSeconds = Math.round(
        (fileSizeInMB - Math.floor(fileSizeInMB)) * 60,
      );
      duration = `${estimatedMinutes}:${estimatedSeconds.toString().padStart(2, "0")}`;
    } catch (durationError) {
      console.warn("⚠️ Could not estimate duration:", durationError.message);
    }

    const songData = {
      name: name || "Unknown Song",
      desc: description || "No description",
      album: album === "none" ? "Single" : album || "Unknown Album",
      artist: artist || "",
      genre: genre || "",
      image: imageUpload.secure_url,
      file: audioUpload.secure_url,
      duration: duration,
      createdAt: new Date(),
    };

    const song = new Song(songData);
    await song.save();
    
    // Structural change: Invalidate master lists and trending caches
    await invalidateSongStructuralCaches();
    rebuildSongCaches();
    logActivity({
      type: "song_added",
      message: `"${song.name}" by ${song.artist || "Unknown"} was added`,
      req,
    });

    // Clean up temporary files
    try {
      fs.unlinkSync(imageFile);
      fs.unlinkSync(audioFile);
    } catch (cleanupError) {
      console.warn("⚠️ Could not clean up temp files:", cleanupError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Song added successfully",
      song,
    });
  } catch (error) {
    console.error("❌ Add song error:", error);

    // Clean up temp files on error
    try {
      if (req.files?.["image"]?.[0]?.path)
        fs.unlinkSync(req.files["image"][0].path);
      if (req.files?.["audio"]?.[0]?.path)
        fs.unlinkSync(req.files["audio"][0].path);
    } catch (cleanupError) {
      console.warn(
        "⚠️ Could not clean up temp files on error:",
        cleanupError.message,
      );
    }

    return res.status(500).json({
      success: false,
      message: "Error adding song to database",
      error: error.message,
    });
  }
};

export const listSong = async (req, res) => {
  try {
    const { language, artist, duration, popularity, sort } = req.query;

    // Determine cacheability
    const isCacheable = Object.keys(req.query).length === 0;
    if (isCacheable) {
      const cached = await cacheGet(CACHE_KEYS.SONGS_LIST);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached.data,
          count: cached.count,
        });
      }
    }

    let filter = {};

    if (language && language !== "all") {
      filter.language = language;
    }

    if (artist && artist !== "all") {
      filter.artist = artist;
    }

    // Duration filter via native Regex
    if (duration === "short") {
      filter.duration = { $regex: /^[0-2]:[0-5][0-9]$/ };
    } else if (duration === "medium") {
      filter.duration = { $regex: /^[3-5]:[0-5][0-9]$/ };
    } else if (duration === "long") {
      filter.duration = { $regex: /^(?:[6-9]:[0-5][0-9]|[1-9][0-9]+:[0-5][0-9])$/ };
    }

    // Popularity filter
    if (popularity === "high") {
      filter.playCount = { $gte: 10 };
    } else if (popularity === "low") {
      filter.playCount = { $lt: 10 };
    }

    // Sorting definition
    let sortObj = { createdAt: -1 }; // Default sort
    if (sort === "newest") sortObj = { createdAt: -1 };
    if (sort === "oldest") sortObj = { createdAt: 1 };
    if (sort === "name") sortObj = { name: 1 };
    if (sort === "album") sortObj = { album: 1 };
    if (sort === "popular") sortObj = { playCount: -1 };

    // Native MongoDB Execution pulling exactly what we need
    const songs = await Song.find(filter).sort(sortObj).lean();

    if (isCacheable) {
      await cacheSet(CACHE_KEYS.SONGS_LIST, { data: songs, count: songs.length }, 300); // cache for 5 minutes
    }

    res.status(200).json({
      success: true,
      data: songs,
      count: songs.length,
    });
  } catch (error) {
    console.error("List songs error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching songs",
    });
  }
};

export const removeSong = async (req, res) => {
  try {
    const result = await Song.findByIdAndDelete(req.body.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }
    
    // Structural change: Invalidate master lists and trending caches
    await invalidateSongStructuralCaches();
    rebuildSongCaches();
    res.status(200).json({
      success: true,
      message: "Song deleted successfully",
    });
  } catch (error) {
    console.error("Remove song error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting song",
    });
  }
};

export const likeSong = async (req, res) => {
  try {
    const { songId } = req.body;
    const userId = req.user?.userId; // Get user ID from auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!songId) {
      return res.status(400).json({
        success: false,
        message: "Song ID is required",
      });
    }

    // Check if song exists
    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    // Add song to user's liked songs atomically
    const updateResult = await User.updateOne(
      { _id: userId },
      { $addToSet: { likedSongs: songId } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Only increase total like count if the DB was actively modified (not a duplicate)
    if (updateResult.modifiedCount > 0) {
      const updatedSong = await Song.findByIdAndUpdate(songId, { $inc: { likeCount: 1 } }, { new: true });
      
      // Deduplicate rapid like/unlike toggling logs
      if (canProcessLikeLog(userId, songId)) {
        await logActivity({
          type: "song_liked",
          message: `${req.user?.name || "User"} liked "${updatedSong.name}"`,
          userId: userId,
          req,
        });
      }

      // Statistics update: Skip global purge to avoid cache thrashing. 
      // Individual counters sync via TTL or next structural rebuild.

      // Broadcast analytics update instantly
      try {
        const io = req.app?.get?.("io");
        if (io && updatedSong) {
          io.emit("analytics_updated", {
            type: "song_liked",
            songId: updatedSong._id.toString(),
            songName: updatedSong.name,
            artist: updatedSong.artist,
            likeCount: updatedSong.likeCount,
            timestamp: new Date().toISOString()
          });
        }
      } catch (emitErr) {
        console.warn("Socket emit error in likeSong:", emitErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Song liked successfully",
    });
  } catch (error) {
    console.error("Like song error:", error);
    res.status(500).json({
      success: false,
      message: "Error liking song",
    });
  }
};

export const unlikeSong = async (req, res) => {
  try {
    const { songId } = req.body;
    const userId = req.user?.userId; // Get user ID from auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!songId) {
      return res.status(400).json({
        success: false,
        message: "Song ID is required",
      });
    }

    // Remove song from user's liked songs atomically
    const updateResult = await User.updateOne(
      { _id: userId },
      { $pull: { likedSongs: songId } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Only decrement likeCount if the song was actually pulled
    if (updateResult.modifiedCount > 0) {
      const updatedSong = await Song.findByIdAndUpdate(songId, [
        { $set: { likeCount: { $max: [{ $subtract: ["$likeCount", 1] }, 0] } } },
      ], { new: true });

      // Broadcast analytics update instantly
      try {
        const io = req.app?.get?.("io");
        if (io && updatedSong) {
          io.emit("analytics_updated", {
            type: "song_unliked",
            songId: updatedSong._id.toString(),
            songName: updatedSong.name,
            artist: updatedSong.artist,
            likeCount: updatedSong.likeCount,
            timestamp: new Date().toISOString()
          });
        }
      } catch (emitErr) {
        console.warn("Socket emit error in unlikeSong:", emitErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Song unliked successfully",
    });
  } catch (error) {
    console.error("Unlike song error:", error);
    res.status(500).json({
      success: false,
      message: "Error unliking song",
    });
  }
};

export const addToRecentlyPlayed = async (req, res) => {
  const { songId } = req.body;
  const userId = req.user?.userId; // Get user ID from auth middleware

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "User not authenticated",
    });
  }

  if (!songId) {
    return res.status(400).json({
      success: false,
      message: "Song ID is required",
    });
  }

  try {
    console.log("[RecentlyPlayed] Adding song:", songId, "for user:", userId);
    
    // Validate ObjectId formats to prevent casting errors
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(songId)) {
      console.error("[RecentlyPlayed] Invalid ID format detected");
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const songObjectId = new mongoose.Types.ObjectId(songId);

    // Check if song exists
    const song = await Song.findById(songObjectId);
    if (!song) {
      console.warn("[RecentlyPlayed] Song not found:", songId);
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    // Atomic update to recently played list (max 5 items)
    // 1. Remove song if already present (to move it to top)
    const pullResult = await User.updateOne(
      { _id: userObjectId },
      { $pull: { recentlyPlayed: { song: songObjectId } } }
    );
    console.log("[RecentlyPlayed] Pull result:", pullResult.modifiedCount);

    // 2. Add song to top and trim to 5 items atomically
    const updatedUser = await User.findByIdAndUpdate(
      userObjectId,
      {
        $push: {
          recentlyPlayed: {
            $each: [{ song: songObjectId, playedAt: new Date() }],
            $position: 0,
            $slice: 5
          }
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Song added to recently played",
    });
  } catch (error) {
    console.error("[RecentlyPlayed Error]:", error);
    res.status(500).json({
      success: false,
      message: `Error adding to recently played: ${error.message}`,
    });
  }
};

export const getLikedSongs = async (req, res) => {
  try {
    const userId = req.user?.userId; // Get user ID from auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get user with populated liked songs
    const user = await User.findById(userId).populate("likedSongs");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      likedSongs: user.likedSongs || [],
    });
  } catch (error) {
    console.error("Get liked songs error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching liked songs",
    });
  }
};

export const getRecentlyPlayed = async (req, res) => {
  try {
    const userId = req.user?.userId; // Get user ID from auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get user with populated recently played songs
    const user = await User.findById(userId).populate("recentlyPlayed.song");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Sort by playedAt date (most recent first) and include playedAt timestamp
    const recentlyPlayed = user.recentlyPlayed
      .filter((item) => item.song !== null && item.song !== undefined) // Remove null songs first
      .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
      .map((item) => ({
        ...item.song.toObject(),
        playedAt: item.playedAt,
      }));

    res.status(200).json({
      success: true,
      recentlyPlayed: recentlyPlayed || [],
    });
  } catch (error) {
    console.error("Get recently played error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recently played songs",
    });
  }
};

/**
 * Get personalized song recommendations (top 10).
 * Uses: recentlyPlayed, likedSongs, similar genre, similar artist, playCount ranking.
 * Optional auth: when authenticated, recommendations are personalized; otherwise returns trending by playCount.
 */
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const cacheKey = CACHE_KEYS.RECOMMENDATIONS(
      userId ? userId.toString() : "anon",
    );
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        recommendations: cached.recommendations,
        count: cached.count,
      });
    }

    const recommended = await songService.getRecommendations({
      userId: userId?.toString(),
    });

    await cacheSet(
      cacheKey,
      { recommendations: recommended, count: recommended.length },
      120 // 2 minutes
    );

    res.status(200).json({
      success: true,
      recommendations: recommended,
      count: recommended.length,
    });
  } catch (error) {
    console.error("Get recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recommendations",
    });
  }
};

/**
 * Get trending songs (top by playCount). Public endpoint.
 */
export const getTrendingSongs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const cacheKey = CACHE_KEYS.TRENDING(limit);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached.data,
        count: cached.count,
      });
    }

    const songs = await songService.getTrendingSongsList({ limit });
    
    await cacheSet(cacheKey, { data: songs, count: songs.length }, 60); // Trending changes often, keep short TTL

    res.status(200).json({
      success: true,
      data: songs,
      count: songs.length,
    });
  } catch (error) {
    console.error("Get trending songs error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching trending songs",
    });
  }
};

export const getArtists = async (req, res) => {
  try {
    const artists = await Song.distinct("artist");
    res.status(200).json({
      success: true,
      artists,
    });
  } catch (error) {
    console.error("Get artists error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching artists",
    });
  }
};

export const incrementPlayCount = async (req, res) => {
  try {
    const { songId } = req.params;
    const { listenerId, userName } = req.body;
    
    // Fallback ID to ensure deduplicating for purely unauthenticated users missing a listenerId
    const effectiveListenerId = listenerId || req.ip || "unknown-listener";

    if (!songId) {
      return res.status(400).json({
        success: false,
        message: "Song ID is required",
      });
    }

    // Check if song exists
    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    // Apply deduplication logic based on listenerId
    if (!canProcessPlay(effectiveListenerId, songId)) {
      return res.status(200).json({
        success: true,
        message: "Play count already updated recently (duplicate ignored)",
        duplicate: true,
      });
    }

    let playSuccess = false;
    try {
      // Increment song play count
      const updatedSong = await Song.findByIdAndUpdate(
        songId,
        { $inc: { playCount: 1 } },
        { new: true }
      );

      // NOTE: We no longer clear global song/trending caches here to avoid 
      // Redis flooding during high traffic. Play counts will sync when TTL expires (60s).

      // Emit real-time events for live activity and analytics updates
      try {
        const io = req.app?.get?.("io");
        if (io && updatedSong) {
          
          // Broadcast live listening UI event
          const eventPayload = {
            songId: updatedSong._id.toString(),
            songName: updatedSong.name,
            userId: effectiveListenerId,
            userName: userName || "Anonymous"
          };
          
          io.emit("user_listening", eventPayload);
          await cachePushLiveEvent(eventPayload);
          
          // Emit dashboard data updates
          io.emit("analytics_updated", {
            type: "song_played",
            songId: updatedSong._id.toString(),
            songName: updatedSong.name,
            artist: updatedSong.artist,
            timestamp: new Date().toISOString()
          });

          // Unconditionally persist to DB so "Recent Activity" doesn't disappear on refresh
          await logActivity({
            type: "song_played",
            message: `${userName || "Someone"} played "${updatedSong.name}" by ${updatedSong.artist}`,
            userId: req.user?.userId || null, 
            req
          });

        }
      } catch (emitErr) {
        console.warn("Socket emit error in incrementPlayCount:", emitErr.message);
      }

      playSuccess = true;
      res.status(200).json({
        success: true,
        message: "Play count updated",
      });
    } catch (error) {
      console.error("Increment play count error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating play count",
      });
    } finally {
      recordPlayProcessed(effectiveListenerId, songId, playSuccess);
    }
  } catch (error) {
    console.error("Increment play count error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating play count",
    });
  }
};
