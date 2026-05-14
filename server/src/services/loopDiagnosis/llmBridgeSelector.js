// SYSTEM SCAN: backend dependencies currently do not guarantee LLM SDK presence at runtime.
// SYSTEM SCAN: loop diagnosis must fail safe and never crash request flow on LLM errors.
// SYSTEM SCAN: Song documents primarily use name/artist/genre/duration fields.

import { getLoopDiagnosisConfig } from "../../config/loopDiagnosisConfig.js";
import { getSongTitle } from "./candidateSelector.js";
import { logger } from "../../utils/logger.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENROUTER_MODEL = "openrouter/auto";

const normalizeProvider = (provider) => {
  const value = `${provider || "openai"}`.trim().toLowerCase();
  if (["google", "gemini", "google-ai", "googleai"].includes(value)) return "google";
  if (["anthropic", "claude"].includes(value)) return "anthropic";
  if (["openrouter", "open-router", "or"].includes(value)) return "openrouter";
  return "openai";
};

const resolveModel = ({ provider, model }) => {
  const candidate = `${model || ""}`.trim();
  if (provider === "openrouter") {
    // OpenRouter model names are typically provider-prefixed (e.g. openai/gpt-4o-mini).
    if (!candidate || !candidate.includes("/")) {
      return DEFAULT_OPENROUTER_MODEL;
    }
    return candidate;
  }

  if (provider !== "google") {
    return candidate;
  }

  if (!candidate) return DEFAULT_GEMINI_MODEL;

  // Prevent accidental provider/model mismatch when env still points to OpenAI/Claude model names.
  if (/^(gpt|o[1-9]|claude)/i.test(candidate)) {
    return DEFAULT_GEMINI_MODEL;
  }

  return candidate;
};

/**
 * Build a strict JSON-only prompt for bridge-track selection.
 */
export function buildPrompt({ loopedSong, candidates, behaviorContext }) {
  const candidateList = candidates
    .map(
      (song, index) =>
        `  ${index + 1}. id="${song._id}" | title="${getSongTitle(song)}" | artist="${song.artist || "Unknown"}" | genre="${song.genre || "unknown"}" | duration="${song.duration || "?"}"`
    )
    .join("\n");

  return `You are a supportive listening assistant in a music platform.

A user appears to be repeating one song in a short session window. Your task is to choose one optional bridge track that can gently vary listening flow.

Looped song:
- Title: "${getSongTitle(loopedSong)}"
- Artist: "${loopedSong.artist || "Unknown"}"
- Genre: "${loopedSong.genre || "unknown"}"

Behavior context:
- Replay count: ${behaviorContext.replayCount}
- Time of day: ${behaviorContext.timeOfDay}
- Late night: ${behaviorContext.isLateNight}
- Session window minutes: ${behaviorContext.sessionWindowMinutes}
- Fatigue level: ${behaviorContext.fatigueLevel}
- Emotional stagnation score: ${behaviorContext.emotionalStagnationScore}

Selection principles:
1. Keep it optional and supportive.
2. Prefer smooth progression, not abrupt contrast.
3. Avoid same artist if possible.
4. Do not make claims about user emotions.
5. Focus on variety and wellbeing over engagement.

Candidates:
${candidateList}

Return only valid JSON with this format:
{
  "selectedSongId": "<exact candidate id>",
  "reason": "<1-2 short neutral sentences>"
}`;
}

async function callOpenAI(prompt, config) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: config.llm.apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model: config.llm.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 220,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);
    return response?.choices?.[0]?.message?.content || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function callOpenRouter(prompt, config, model) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost:5000",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "MusicFlow Loop Diagnosis",
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  try {
    // LLM provider: OpenRouter (openrouter.ai)
    // Routes to underlying model — swap model string to change providers without changing this code
    const response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 220,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);
    return response?.choices?.[0]?.message?.content || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function callClaude(prompt, config) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.llm.apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  try {
    const response = await client.messages.create(
      {
        model: config.llm.model || "claude-sonnet-4-20250514",
        max_tokens: 220,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);
    return response?.content?.[0]?.text || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function callGoogleGemini(prompt, config, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.llm.apiKey)}`;
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 220,
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
    if (!Array.isArray(parts) || parts.length === 0) {
      return null;
    }

    return parts
      .map((part) => part?.text || "")
      .join("\n")
      .trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse JSON safely from LLM output.
 */
export function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    if (!cleaned) return null;

    const parsed = JSON.parse(cleaned);
    if (!parsed?.selectedSongId || typeof parsed.selectedSongId !== "string") {
      logger.warn("[LD] LLM response missing selectedSongId", { raw });
      return null;
    }

    return parsed;
  } catch (err) {
    logger.warn("[LD] LLM JSON parse failed", { error: err.message, raw });
    return null;
  }
}

/**
 * Ensure selected id belongs to provided candidate list.
 */
export function validateSelection(parsed, candidates) {
  if (!parsed?.selectedSongId) return null;

  const normalized = parsed.selectedSongId.trim();
  const selected = candidates.find((candidate) => candidate?._id?.toString() === normalized);

  if (!selected) {
    logger.warn("[LD] LLM selected ID not in candidates", {
      selectedSongId: parsed.selectedSongId,
    });
    return null;
  }

  return selected;
}

/**
 * Main bridge-track selection with strict fail-safe behavior.
 */
export async function selectBridgeTrack({ loopedSong, candidates, behaviorContext }) {
  const config = getLoopDiagnosisConfig();
  const prompt = buildPrompt({ loopedSong, candidates, behaviorContext });
  const provider = normalizeProvider(config.llm.provider);
  const model = resolveModel({ provider, model: config.llm.model });

  if (!config.llm.apiKey) {
    logger.warn("[LD] LLM API key not configured. Skipping LLM selection.");
    return { song: null, reason: "no_api_key", source: "error", prompt };
  }

  let raw = null;

  try {
    logger.debug(`[LD] Calling LLM for bridge selection... provider=${provider} model=${model || "default"}`);
    if (provider === "anthropic") {
      raw = await callClaude(prompt, config);
    } else if (provider === "google") {
      raw = await callGoogleGemini(prompt, config, model);
    } else if (provider === "openrouter") {
      raw = await callOpenRouter(prompt, config, model);
    } else {
      raw = await callOpenAI(prompt, config);
    }
  } catch (err) {
    logger.error("[LD] LLM API call failed", { error: err.message });
    return { song: null, reason: err.message, source: "error", prompt };
  }

  if (!raw) {
    logger.warn("[LD] LLM returned empty response.");
    return { song: null, reason: "empty_response", source: "error", prompt };
  }

  const parsed = safeParseJSON(raw);
  if (!parsed) {
    return { song: null, reason: "parse_failure", source: "error", prompt, rawResponse: raw };
  }

  const selectedSong = validateSelection(parsed, candidates);
  if (!selectedSong) {
    return { song: null, reason: "invalid_selection", source: "error", prompt, rawResponse: raw };
  }

  logger.info("[LD] LLM selected bridge track", {
    title: getSongTitle(selectedSong),
    reason: parsed.reason || "",
  });

  return {
    song: selectedSong,
    reason: parsed.reason || "",
    source: "llm",
    prompt,
    rawResponse: raw,
  };
}
