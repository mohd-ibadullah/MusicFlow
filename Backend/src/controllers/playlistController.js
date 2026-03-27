import Playlist from "../models/playlistModel.js";
import Song from "../models/songModel.js";
import logActivity from "../utils/logActivity.js";

export const createPlaylist = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlist = new Playlist({
      name,
      description: description || "My playlist",
      user: userId,
    });
    await playlist.save();
    logActivity({
      type: "playlist_created",
      message: `Playlist "${playlist.name}" was created`,
      userId: userId,
    });

    res.status(201).json({ success: true, playlist });
  } catch (error) {
    console.error("Error creating playlist:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPlaylists = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlists = await Playlist.find({ user: userId }).populate('songs');
    res.status(200).json({ success: true, playlists });
  } catch (error) {
    console.error("Error fetching playlists:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getPlaylistById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlist = await Playlist.findOne({ 
      _id: req.params.id, 
      user: userId 
    }).populate('songs');
    
    if (!playlist) {
      return res.status(404).json({ 
        success: false, 
        message: "Playlist not found or access denied" 
      });
    }
    
    res.status(200).json({ success: true, playlist });
  } catch (error) {
    console.error("Error fetching playlist:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addSongToPlaylist = async (req, res) => {
  try {
    const { playlistId, songId } = req.body;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlist = await Playlist.findOne({ _id: playlistId, user: userId });
    const song = await Song.findById(songId);
    
    if (!playlist) {
      return res.status(404).json({ 
        success: false, 
        message: "Playlist not found or access denied" 
      });
    }
    
    if (!song) {
      return res.status(404).json({ success: false, message: "Song not found" });
    }

    const songExists = playlist.songs.some(song => song.toString() === songId);
    
    if (!songExists) {
      playlist.songs.push(songId);
      await playlist.save();
    }

    const updatedPlaylist = await Playlist.findById(playlistId).populate('songs');
    res.status(200).json({ success: true, playlist: updatedPlaylist });
  } catch (error) {
    console.error("Error adding song to playlist:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlist = await Playlist.findOneAndDelete({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({ 
        success: false, 
        message: "Playlist not found or access denied" 
      });
    }
    
    res.status(200).json({ success: true, message: "Playlist deleted successfully" });
  } catch (error) {
    console.error("Error deleting playlist:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeSongFromPlaylist = async (req, res) => {
  try {
    const { playlistId, songId } = req.body;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    const playlist = await Playlist.findOne({ _id: playlistId, user: userId });
    
    if (!playlist) {
      return res.status(404).json({ 
        success: false, 
        message: "Playlist not found or access denied" 
      });
    }

    const initialLength = playlist.songs.length;
    playlist.songs = playlist.songs.filter(song => song.toString() !== songId);
    
    if (playlist.songs.length === initialLength) {
      return res.status(404).json({ success: false, message: "Song not found in playlist" });
    }
    
    await playlist.save();

    const updatedPlaylist = await Playlist.findById(playlistId).populate('songs');
    res.status(200).json({ success: true, playlist: updatedPlaylist });
  } catch (error) {
    console.error("Error removing song from playlist:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};





/**
 * Extract keywords from prompt for song matching.
 */
function extractKeywords(prompt) {
  const commonWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'create', 'make', 'generate', 'playlist', 'songs', 'music']);
  return prompt
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word.toLowerCase()))
    .slice(0, 10); // Limit keywords
}

/**
 * Find songs matching keywords using MongoDB text search and field matching.
 */
async function findSongsByKeywords(keywords) {
  const searchRegex = new RegExp(keywords.join('|'), 'i');
  
  const songs = await Song.find({
    $or: [
      { name: searchRegex },
      { desc: searchRegex },
      { genre: searchRegex },
      { artist: searchRegex },
      { album: searchRegex }
    ]
  }).sort({ playCount: -1, likeCount: -1 }).limit(50).lean();
  
  return songs;
}

/**
 * Generate a catchy playlist name from the prompt.
 */
function generatePlaylistName(prompt) {
  const words = prompt.split(/\s+/).filter(word => word.length > 2);
  if (words.length >= 2) {
    return `${words[0].charAt(0).toUpperCase() + words[0].slice(1)} ${words[1].charAt(0).toUpperCase() + words[1].slice(1)} Mix`;
  }
  return `${words[0]?.charAt(0).toUpperCase() + words[0]?.slice(1) || 'Custom'} Playlist`;
}

// Cleanup old playlists without user field (admin only)
export const cleanupOldPlaylists = async (req, res) => {
  try {
    const result = await Playlist.deleteMany({ user: { $exists: false } });
    res.status(200).json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} old playlists without user field`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error cleaning up playlists:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * AI-style playlist generator from a text prompt.
 * Uses keyword/genre similarity on existing songs (no external API).
 */
const PROMPT_TO_CRITERIA = {
  workout: ["rock", "pop", "electronic", "hip hop", "dance", "energy", "upbeat"],
  relaxing: ["jazz", "ambient", "acoustic", "chill", "calm", "peaceful"],
  sad: ["ballad", "acoustic", "sad", "slow", "emotional"],
  party: ["dance", "pop", "electronic", "party", "club"],
  focus: ["ambient", "classical", "instrumental", "study"],
  sleep: ["ambient", "calm", "soft", "piano"],
};

const getSearchTermsFromPrompt = (prompt) => {
  if (!prompt || typeof prompt !== "string") return [];
  const lower = prompt.toLowerCase().trim();
  const terms = [];
  for (const [key, values] of Object.entries(PROMPT_TO_CRITERIA)) {
    if (lower.includes(key)) terms.push(...values);
  }
  if (terms.length === 0) terms.push("pop", "rock", "chill");
  return [...new Set(terms)];
};

export const generatePlaylist = async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Prompt is required and must be a non-empty string" 
      });
    }
    
    const keywords = extractKeywords(prompt.toLowerCase());
    
    // Find matching songs
    const matchingSongs = await findSongsByKeywords(keywords);
    
    if (matchingSongs.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No songs found matching the prompt. Try different keywords." 
      });
    }
    
    // Create playlist
    const playlistName = generatePlaylistName(prompt);
    const playlist = new Playlist({
      name: playlistName,
      description: `AI-generated playlist for: ${prompt}`,
      user: userId,
      songs: matchingSongs.slice(0, 20).map(song => song._id), // Limit to 20 songs
      isAIGenerated: true
    });
    
    await playlist.save();
    await playlist.populate('songs');
    
    res.status(201).json({ 
      success: true, 
      playlist,
      message: `Generated playlist "${playlistName}" with ${playlist.songs.length} songs` 
    });
  } catch (error) {
    console.error("Error generating AI playlist:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error generating playlist", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};