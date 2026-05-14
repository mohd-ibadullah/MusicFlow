import Playlist from "../models/playlistModel.js";
import Song from "../models/songModel.js";
import logActivity from "../utils/logActivity.js";
import {
  sendServerError,
  sendUnauthorizedError,
  sendValidationError,
} from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { isValidObjectId } from "../utils/validation.js";
import {
  emitRealtimeFromReq,
  REALTIME_EVENTS,
} from "../socket/realtimeEvents.js";

export const createPlaylist = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return sendValidationError(res, "Playlist name is required");
    }

    const playlist = new Playlist({
      name: name.trim(),
      description: description || "My playlist",
      user: userId,
    });
    await playlist.save();
    logActivity({
      type: "playlist_created",
      message: `${req.user?.name || "User"} created playlist "${playlist.name}"`,
      userId: userId,
      req,
    });

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.PLAYLIST_CREATED,
      {
        userId: userId.toString(),
        playlist,
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    res.status(201).json({ success: true, playlist });
  } catch (error) {
    logger.error("Error creating playlist", { error: error.message });
    return sendServerError(res, "Error creating playlist", error);
  }
};

export const getPlaylists = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    const playlists = await Playlist.find({ user: userId }).populate('songs');
    res.status(200).json({ success: true, playlists });
  } catch (error) {
    logger.error("Error fetching playlists", { error: error.message });
    return sendServerError(res, "Error fetching playlists", error);
  }
};

export const getPlaylistById = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!isValidObjectId(req.params.id)) {
      return sendValidationError(res, "Invalid playlist id");
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
    logger.error("Error fetching playlist", { error: error.message });
    return sendServerError(res, "Error fetching playlist", error);
  }
};

export const addSongToPlaylist = async (req, res) => {
  try {
    const { playlistId, songId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!isValidObjectId(playlistId?.toString?.() || "")) {
      return sendValidationError(res, "Invalid playlist id");
    }

    if (!isValidObjectId(songId?.toString?.() || "")) {
      return sendValidationError(res, "Invalid song id");
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

      // Log adding a song to a playlist
      await logActivity({
        type: "song_added",
        message: `${req.user?.name || "User"} added "${song.name}" to playlist "${playlist.name}"`,
        userId: userId,
        req,
      });
    }

    const updatedPlaylist = await Playlist.findById(playlistId).populate('songs');

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.PLAYLIST_UPDATED,
      {
        userId: userId.toString(),
        action: "song_added",
        playlist: updatedPlaylist,
        songId: songId.toString(),
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    res.status(200).json({ success: true, playlist: updatedPlaylist });
  } catch (error) {
    logger.error("Error adding song to playlist", { error: error.message });
    return sendServerError(res, "Error adding song to playlist", error);
  }
};

export const deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!isValidObjectId(id)) {
      return sendValidationError(res, "Invalid playlist id");
    }

    const playlist = await Playlist.findOneAndDelete({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found or access denied"
      });
    }

    await logActivity({
      type: "playlist_deleted",
      message: `${req.user?.name || "User"} deleted playlist "${playlist.name}"`,
      userId,
      req,
    });

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.PLAYLIST_DELETED,
      {
        userId: userId.toString(),
        playlistId: playlist._id?.toString?.() || id,
        playlistName: playlist.name,
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    res.status(200).json({ success: true, message: "Playlist deleted successfully" });
  } catch (error) {
    logger.error("Error deleting playlist", { error: error.message });
    return sendServerError(res, "Error deleting playlist", error);
  }
};

export const removeSongFromPlaylist = async (req, res) => {
  try {
    const { playlistId, songId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!isValidObjectId(playlistId?.toString?.() || "")) {
      return sendValidationError(res, "Invalid playlist id");
    }

    if (!isValidObjectId(songId?.toString?.() || "")) {
      return sendValidationError(res, "Invalid song id");
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

    await logActivity({
      type: "playlist_updated",
      message: `${req.user?.name || "User"} removed a song from playlist "${playlist.name}"`,
      userId,
      req,
    });

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.PLAYLIST_UPDATED,
      {
        userId: userId.toString(),
        action: "song_removed",
        playlist: updatedPlaylist,
        songId: songId.toString(),
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    res.status(200).json({ success: true, playlist: updatedPlaylist });
  } catch (error) {
    logger.error("Error removing song from playlist", { error: error.message });
    return sendServerError(res, "Error removing song from playlist", error);
  }
};

const COMMON_PROMPT_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "my",
  "me",
  "please",
  "want",
  "need",
  "create",
  "make",
  "generate",
  "build",
  "playlist",
  "playlists",
  "songs",
  "song",
  "music",
  "tracks",
  "track",
]);

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENROUTER_MODEL = "openrouter/auto";

/**
 * AI-style playlist generator from a text prompt.
 * LLM is used ONLY for user-intent extraction, never for song recommendations.
 */
const PROMPT_TO_CRITERIA = {
  workout: ["rock", "pop", "electronic", "hip hop", "dance", "energy", "upbeat"],
  relaxing: ["jazz", "ambient", "acoustic", "chill", "calm", "peaceful"],
  sad: ["ballad", "acoustic", "sad", "slow", "emotional"],
  party: ["dance", "pop", "electronic", "party", "club"],
  focus: ["ambient", "classical", "instrumental", "study"],
  sleep: ["ambient", "calm", "soft", "piano"],
};

const AI_PLAYLIST_NAME_MAP = {
  happy: "Happy Vibes",
  upbeat: "Happy Vibes",
  joyful: "Happy Vibes",
  sad: "Sad Nights",
  melancholy: "Sad Nights",
  romance: "Romantic Mix",
  romantic: "Romantic Mix",
  love: "Romantic Mix",
  workout: "Workout Energy",
  gym: "Workout Energy",
  running: "Workout Energy",
  focus: "Focus Flow",
  study: "Study Focus",
  sleep: "Sleep Calm",
  relaxing: "Calm Vibes",
  chill: "Chill Vibes",
  party: "Party Hits",
};

const sanitizeText = (value) => `${value || ""}`.trim();

const sanitizeIntentLabel = (value) =>
  sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toUniqueLowerList = (values, max = 12) => {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[;,|]/)
      : [];

  return [...new Set(source.map((item) => sanitizeText(item).toLowerCase()).filter(Boolean))].slice(0, max);
};

const extractKeywords = (prompt, limit = 12) =>
  sanitizeText(prompt)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9'-]/gi, ""))
    .filter((word) => word.length > 2 && !COMMON_PROMPT_WORDS.has(word))
    .slice(0, limit);

const pickIntentLabelFromList = (values = []) => {
  for (const value of values) {
    const normalized = sanitizeIntentLabel(value);
    if (!normalized) continue;

    // Keep labels concise to avoid exposing full user prompts in UI copy.
    const words = normalized.split(" ").filter(Boolean);
    if (words.length > 3) continue;
    if (COMMON_PROMPT_WORDS.has(normalized)) continue;

    return normalized;
  }

  return "";
};

const deriveIntentLabel = (intent) => {
  const candidates = [
    intent?.mood,
    intent?.vibe,
    ...(Array.isArray(intent?.genres) ? intent.genres : []),
  ];

  const knownIntentKeywords = (Array.isArray(intent?.keywords) ? intent.keywords : []).filter((term) => {
    const normalized = sanitizeIntentLabel(term);
    return normalized && Object.prototype.hasOwnProperty.call(PROMPT_TO_CRITERIA, normalized);
  });

  return pickIntentLabelFromList([...candidates, ...knownIntentKeywords]) || "personalized";
};

const toTitleWord = (word) =>
  word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : "";

const generateAIPlaylistName = (intentLabel) => {
  const normalized = sanitizeIntentLabel(intentLabel);
  if (!normalized || normalized === "personalized") return "My Mix";

  const directMatch = AI_PLAYLIST_NAME_MAP[normalized];
  if (directMatch) return directMatch;

  const tokens = normalized.split(" ").filter(Boolean);

  for (const token of tokens) {
    const mapped = AI_PLAYLIST_NAME_MAP[token];
    if (mapped) return mapped;
  }

  const base = tokens.slice(0, 2).map(toTitleWord).join(" ");
  if (!base) return "My Mix";

  return `${base} Mix`;
};

const getHeuristicTermsFromPrompt = (prompt) => {
  if (!prompt || typeof prompt !== "string") return [];

  const lower = prompt.toLowerCase().trim();
  const mapped = [];
  for (const [key, values] of Object.entries(PROMPT_TO_CRITERIA)) {
    if (lower.includes(key)) mapped.push(...values);
  }

  const keywords = extractKeywords(prompt, 12);
  return [...new Set([...mapped, ...keywords])].slice(0, 16);
};

const normalizeProvider = (provider) => {
  const value = sanitizeText(provider || "openrouter").toLowerCase();
  if (["google", "gemini", "google-ai", "googleai"].includes(value)) return "google";
  if (["anthropic", "claude"].includes(value)) return "anthropic";
  if (["openrouter", "open-router", "or"].includes(value)) return "openrouter";
  return "openai";
};

const resolveLLMModel = (provider, configuredModel) => {
  const candidate = sanitizeText(configuredModel);

  if (provider === "openrouter") {
    if (!candidate || !candidate.includes("/")) return DEFAULT_OPENROUTER_MODEL;
    return candidate;
  }

  if (provider === "google") {
    if (!candidate) return DEFAULT_GEMINI_MODEL;
    if (/^(gpt|o[1-9]|claude)/i.test(candidate)) return DEFAULT_GEMINI_MODEL;
    return candidate;
  }

  if (provider === "anthropic") {
    return candidate || "claude-3-5-haiku-latest";
  }

  return candidate || "gpt-4o-mini";
};

const buildLLMIntentPrompt = (prompt) => `You extract listener intent for music playlist search.

Input prompt:
"""
${prompt}
"""

Return ONLY valid JSON with this schema:
{
  "mood": "string",
  "energy": "low|medium|high|mixed",
  "vibe": "string",
  "genres": ["string"],
  "keywords": ["string"],
  "artists": ["string"]
}

Rules:
- Do NOT return song names or song titles.
- Do NOT return track IDs, album names, or recommendations.
- Keep lists short (max 8 items each).
- If unsure, infer broad intent terms only.`;

const safeParseJSON = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    return cleaned ? JSON.parse(cleaned) : null;
  } catch {
    return null;
  }
};

const sanitizeLLMIntentPayload = (parsed, prompt) => {
  const mood = sanitizeText(parsed?.mood).toLowerCase();
  const energy = sanitizeText(parsed?.energy).toLowerCase();
  const vibe = sanitizeText(parsed?.vibe).toLowerCase();
  const genres = toUniqueLowerList(parsed?.genres || parsed?.genre, 8);
  const keywords = toUniqueLowerList(parsed?.keywords || parsed?.moodKeywords, 12);
  const artists = toUniqueLowerList(parsed?.artists || parsed?.artistHints, 8);

  // Explicitly ignore any model attempts to include song-level recommendations.
  const baseFallback = getHeuristicTermsFromPrompt(prompt);

  return {
    mood,
    energy,
    vibe,
    genres,
    keywords: [...new Set([...keywords, ...baseFallback])].slice(0, 12),
    artists,
  };
};

const callOpenAIIntent = async ({ prompt, apiKey, model, timeoutMs }) => {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 240,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );

    return response?.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timer);
  }
};

const callOpenRouterIntent = async ({ prompt, apiKey, model, timeoutMs }) => {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost:5000",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "MusicFlow AI Playlist Generator",
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // LLM provider: OpenRouter (openrouter.ai)
    // Routes to underlying model — swap model string to change providers without changing this code
    const response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 240,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );

    return response?.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timer);
  }
};

const callAnthropicIntent = async ({ prompt, apiKey, model, timeoutMs }) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 240,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal }
    );

    return response?.content?.[0]?.text || null;
  } finally {
    clearTimeout(timer);
  }
};

const callGoogleIntent = async ({ prompt, apiKey, model, timeoutMs }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 240,
      responseMimeType: "application/json",
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage =
        payload?.error?.message || payload?.error || response.statusText || "Unknown Gemini API error";
      throw new Error(`${response.status} ${errorMessage}`);
    }

    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) return null;

    return parts.map((part) => part?.text || "").join("\n").trim();
  } finally {
    clearTimeout(timer);
  }
};

const extractIntentWithLLM = async (prompt) => {
  const provider = normalizeProvider(process.env.LLM_PROVIDER);
  const apiKey = sanitizeText(process.env.LLM_API_KEY);
  const model = resolveLLMModel(provider, process.env.LLM_MODEL);
  const timeoutMs = Number.parseInt(process.env.LLM_TIMEOUT_MS || "8000", 10);

  if (!apiKey) {
    return {
      source: "fallback_no_key",
      provider,
      model,
      intent: sanitizeLLMIntentPayload({}, prompt),
      error: "missing_llm_api_key",
    };
  }

  const llmPrompt = buildLLMIntentPrompt(prompt);

  try {
    let rawResponse = null;

    if (provider === "openrouter") {
      rawResponse = await callOpenRouterIntent({ prompt: llmPrompt, apiKey, model, timeoutMs });
    } else if (provider === "google") {
      rawResponse = await callGoogleIntent({ prompt: llmPrompt, apiKey, model, timeoutMs });
    } else if (provider === "anthropic") {
      rawResponse = await callAnthropicIntent({ prompt: llmPrompt, apiKey, model, timeoutMs });
    } else {
      rawResponse = await callOpenAIIntent({ prompt: llmPrompt, apiKey, model, timeoutMs });
    }

    const parsed = safeParseJSON(rawResponse);
    const intent = sanitizeLLMIntentPayload(parsed || {}, prompt);

    return {
      source: "llm",
      provider,
      model,
      intent,
      error: null,
    };
  } catch (error) {
    console.warn("[PLAYLIST] LLM intent extraction failed:", error.message);
    return {
      source: "fallback_error",
      provider,
      model,
      intent: sanitizeLLMIntentPayload({}, prompt),
      error: error.message,
    };
  }
};

const buildSongQueryFromIntent = (intent, prompt) => {
  const heuristicTerms = getHeuristicTermsFromPrompt(prompt);
  const moodTerms = [intent?.mood, intent?.vibe, intent?.energy].filter(Boolean);

  const genres = [...new Set([...(intent?.genres || []), ...heuristicTerms])].slice(0, 8);
  const artists = [...new Set(intent?.artists || [])].slice(0, 8);
  const keywordTerms = [...new Set([...(intent?.keywords || []), ...moodTerms, ...heuristicTerms])].slice(0, 14);

  const genreRegexes = genres.map((term) => new RegExp(escapeRegex(term), "i"));
  const artistRegexes = artists.map((term) => new RegExp(escapeRegex(term), "i"));
  const keywordRegexes = keywordTerms.map((term) => new RegExp(escapeRegex(term), "i"));

  const orConditions = [];

  if (genreRegexes.length) {
    orConditions.push({ genre: { $in: genreRegexes } });
  }

  if (artistRegexes.length) {
    orConditions.push({ artist: { $in: artistRegexes } });
  }

  for (const regex of keywordRegexes) {
    orConditions.push({ desc: regex });
    orConditions.push({ genre: regex });
    orConditions.push({ artist: regex });
    orConditions.push({ album: regex });
  }

  if (orConditions.length === 0) {
    return {};
  }

  return { $or: orConditions };
};

const findSongsFromIntent = async ({ intent, prompt }) => {
  const intentQuery = buildSongQueryFromIntent(intent, prompt);
  const rankedSongs = await Song.find(intentQuery)
    .sort({ playCount: -1, likeCount: -1, _id: 1 })
    .limit(20)
    .lean();

  if (rankedSongs.length > 0) {
    return rankedSongs;
  }

  // Fallback query when strict intent query has no matches.
  const fallbackTerms = getHeuristicTermsFromPrompt(prompt);
  if (fallbackTerms.length > 0) {
    const fallbackRegex = new RegExp(fallbackTerms.map((term) => escapeRegex(term)).join("|"), "i");
    const fallbackMatches = await Song.find({
      $or: [
        { genre: fallbackRegex },
        { desc: fallbackRegex },
        { artist: fallbackRegex },
        { album: fallbackRegex },
      ],
    })
      .sort({ playCount: -1, likeCount: -1, _id: 1 })
      .limit(20)
      .lean();

    if (fallbackMatches.length > 0) {
      return fallbackMatches;
    }
  }

  return Song.find({})
    .sort({ playCount: -1, likeCount: -1, _id: 1 })
    .limit(20)
    .lean();
};

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
    logger.error("Error cleaning up playlists", { error: error.message });
    return sendServerError(res, "Error cleaning up playlists", error);
  }
};

export const generatePlaylist = async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return sendUnauthorizedError(res, "User not authenticated");
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return sendValidationError(res, "Prompt is required and must be a non-empty string");
    }

    const trimmedPrompt = prompt.trim();

    // LLM is used only for intent extraction; songs always come from MongoDB.
    const intentResult = await extractIntentWithLLM(trimmedPrompt);
    const cleanedMood = deriveIntentLabel(intentResult.intent);
    const matchingSongs = await findSongsFromIntent({
      intent: intentResult.intent,
      prompt: trimmedPrompt,
    });

    if (matchingSongs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No songs available to build a playlist yet."
      });
    }

    // Create playlist
    const playlistName = generateAIPlaylistName(cleanedMood);
    const playlist = new Playlist({
      name: playlistName,
      description: `AI-generated playlist for: ${cleanedMood}`,
      user: userId,
      songs: matchingSongs.slice(0, 20).map(song => song._id),
      isAIGenerated: true,
      aiIntentLabel: cleanedMood,
    });

    await playlist.save();
    await playlist.populate('songs');

    logActivity({
      type: "playlist_created",
      message: `AI-generated playlist "${playlist.name}" created`,
      userId: userId,
      req,
    });

    await logActivity({
      type: "ai_playlist_generated",
      message: `${req.user?.name || "User"} generated AI playlist "${playlist.name}"`,
      userId,
      req,
    });

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.PLAYLIST_CREATED,
      {
        userId: userId.toString(),
        playlist,
        isAIGenerated: true,
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    emitRealtimeFromReq(
      req,
      REALTIME_EVENTS.AI_PLAYLIST_GENERATED,
      {
        userId: userId.toString(),
        playlist,
        intent: intentResult.intent,
        intentSource: intentResult.source,
        llmProvider: intentResult.provider,
        llmModel: intentResult.model,
      },
      {
        source: "playlist_controller",
        audience: "user_admin",
        userId: userId.toString(),
      }
    );

    res.status(201).json({
      success: true,
      playlist,
      intent: intentResult.intent,
      intentSource: intentResult.source,
      llmProvider: intentResult.provider,
      llmModel: intentResult.model,
      message: `Generated playlist "${playlistName}" with ${playlist.songs.length} songs`
    });
  } catch (error) {
    logger.error("Error generating AI playlist", { error: error.message });
    return sendServerError(res, "Error generating playlist", error);
  }
};

export const __playlistIntentTestables = {
  extractKeywords,
  sanitizeLLMIntentPayload,
  buildSongQueryFromIntent,
  getHeuristicTermsFromPrompt,
  normalizeProvider,
  resolveLLMModel,
  deriveIntentLabel,
  generateAIPlaylistName,
};