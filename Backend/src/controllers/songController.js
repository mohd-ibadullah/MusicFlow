import mongoose from "mongoose";
import Song from "../models/songModel.js";
import User from "../models/userModel.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from "../utils/cache.js";
import * as songService from "../services/songService.js";
import logActivity from "../utils/logActivity.js";

export const addSong = async (req, res) => {
  try {
    const { name, description, album, artist, genre } = req.body;

    if (!req.files || !req.files["image"] || !req.files["audio"]) {
      return res.status(400).json({
        success: false,
        message: "Image and audio files are required",
      });
    }

    const imageFile = req.files["image"][0].path;
    const audioFile = req.files["audio"][0].path;

    let imageUpload, audioUpload;

    try {
      // Upload image to Cloudinary
      imageUpload = await cloudinary.uploader.upload(imageFile, {
        resource_type: "image",
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
    await cacheDel(CACHE_KEYS.SONGS_LIST);
    await cacheDel(CACHE_KEYS.TRENDING);
    logActivity({
      type: "song_added",
      message: `"${song.name}" by ${song.artist || "Unknown"} was added`,
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

    let filter = {};

    if (language && language !== "all") {
      filter.language = language;
    }

    if (artist && artist !== "all") {
      filter.artist = artist;
    }

    let songs = await Song.find(filter).lean();

    // Duration filter
    if (duration === "short") {
      songs = songs.filter((s) => {
        const mins = parseInt(s.duration?.split(":")[0] || 0);
        return mins < 3;
      });
    }

    if (duration === "medium") {
      songs = songs.filter((s) => {
        const mins = parseInt(s.duration?.split(":")[0] || 0);
        return mins >= 3 && mins <= 5;
      });
    }

    if (duration === "long") {
      songs = songs.filter((s) => {
        const mins = parseInt(s.duration?.split(":")[0] || 0);
        return mins > 5;
      });
    }

    // Popularity filter
    if (popularity === "high") {
      songs = songs.filter((s) => (s.playCount || 0) >= 10);
    }

    if (popularity === "low") {
      songs = songs.filter((s) => (s.playCount || 0) < 10);
    }

    // Sorting
    if (sort === "newest") {
      songs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    if (sort === "oldest") {
      songs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    if (sort === "name") {
      songs.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === "album") {
      songs.sort((a, b) => (a.album || "").localeCompare(b.album || ""));
    }

    if (sort === "popular") {
      songs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
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
    await cacheDel(CACHE_KEYS.SONGS_LIST);
    await cacheDel(CACHE_KEYS.TRENDING);
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

    // Add song to user's liked songs if not already liked
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.likedSongs.includes(songId)) {
      user.likedSongs.push(songId);
      await user.save();
      await Song.findByIdAndUpdate(songId, { $inc: { likeCount: 1 } });
      logActivity({
        type: "song_liked",
        message: `"${song.name}" was liked`,
        userId: userId,
      });
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

    // Remove song from user's liked songs
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const wasLiked = user.likedSongs.some((id) => id.toString() === songId);
    user.likedSongs = user.likedSongs.filter((id) => id.toString() !== songId);
    await user.save();

    // Only decrement likeCount if the song was actually in the user's liked list
    if (wasLiked) {
      await Song.findByIdAndUpdate(songId, [
        { $set: { likeCount: { $max: [{ $subtract: ["$likeCount", 1] }, 0] } } },
      ]);
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

    // Get user and update recently played
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Remove song if already in recently played (and clean up any null references)
    user.recentlyPlayed = user.recentlyPlayed.filter(
      (item) => item.song && item.song.toString() !== songId,
    );

    user.recentlyPlayed.unshift({
      song: songId,
      playedAt: new Date(),
    });

    user.recentlyPlayed = user.recentlyPlayed.slice(0, 5);

    await user.save();
    logActivity({
      type: "song_played",
      message: `"${song.name}" by ${song.artist || "Unknown"} was played`,
      userId: userId,
    });

    // Real-time: broadcast that this user is listening (for live activity UI)
    try {
      const io = req.app?.get?.("io");
      if (io && song) {
        io.emit("user_listening", {
          songId: song._id.toString(),
          songName: song.name,
          userId: userId.toString(),
          userName: req.user?.name || "Anonymous",
        });
      }
    } catch (emitErr) {
      console.warn("Socket emit error:", emitErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Song added to recently played",
    });
  } catch (error) {
    console.error("Add to recently played error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding to recently played",
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
      60,
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
    const cacheKey = `${CACHE_KEYS.TRENDING}:${limit}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached.data,
        count: cached.count,
      });
    }
    const songs = await songService.getTrendingSongsList({ limit });
    await cacheSet(cacheKey, { data: songs, count: songs.length }, 60);
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

    if (!songId) {
      return res.status(400).json({
        success: false,
        message: "Song ID is required",
      });
    }

    const song = await Song.findByIdAndUpdate(
      songId,
      { $inc: { playCount: 1 } },
      { new: false }
    ).lean();

    if (song) {
      logActivity({
        type: "song_played",
        message: `"${song.name}" was played`,
      }).catch(() => {});
    }

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
  }
};
