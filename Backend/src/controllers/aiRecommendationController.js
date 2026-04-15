import crypto from "crypto";

import {
  getAIRecommendations,
  invalidateFeedbackCacheForUser,
} from "../ai/embeddingRecommender.js";
import {
  evaluateRecommendationPerformance,
  logAIInteraction,
  logRecommendationServed,
} from "../ai/telemetryService.js";
import { runEmbeddingRetrainingCycle } from "../ai/retrainingPipeline.js";
import { cacheDel, CACHE_KEYS } from "../services/cacheService.js";
import {
  sendServerError,
  sendUnauthorizedError,
  sendValidationError,
} from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { isValidObjectId, parsePositiveInt } from "../utils/validation.js";

const ALLOWED_INTERACTIONS = new Set(["play", "like", "skip", "click"]);

const toSafeUserId = (value) => (value ? value.toString() : null);

export const getAIRecommendationsByUser = async (req, res) => {
  try {
    const userId = toSafeUserId(req.user?.userId);
    if (!userId || !isValidObjectId(userId)) {
      return sendUnauthorizedError(res, "Authentication required");
    }

    const parsedLimit = parsePositiveInt(req.query.limit, {
      min: 1,
      max: 100,
      defaultValue: null,
    });
    if (!parsedLimit.valid) {
      return sendValidationError(res, "limit must be an integer between 1 and 100");
    }

    const limit = parsedLimit.value ?? undefined;
    const recommendationRequestId =
      req.query.requestId?.toString?.() || crypto.randomUUID();

    const result = await getAIRecommendations({ userId, limit });

    const recommendedSongIds = result.recommendations.map((song) => song?._id).filter(Boolean);

    try {
      await logRecommendationServed({
        userId,
        source: result.source,
        recommendationRequestId,
        recommendedSongIds,
      });
    } catch (error) {
      logger.warn("[AI] Failed to log recommendation impressions", {
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      recommendationRequestId,
      source: result.source,
      fallbackReason: result.reason || null,
      recommendations: result.recommendations,
      count: result.recommendations.length,
      metadata: result.metadata || null,
    });
  } catch (error) {
    logger.error("[AI] Recommendation endpoint error", { error: error.message });
    return sendServerError(res, "Error generating AI recommendations", error);
  }
};

export const submitAIInteractionFeedback = async (req, res) => {
  try {
    const userId = toSafeUserId(req.user?.userId);
    if (!userId || !isValidObjectId(userId)) {
      return sendUnauthorizedError(res, "Authentication required");
    }

    const {
      songId,
      interactionType: interactionTypeInput,
      eventType,
      recommendationRequestId = null,
      rank = null,
      metadata = null,
      weight,
      source = "ai_feedback_api",
    } = req.body || {};
    const interactionType = interactionTypeInput || eventType;

    if (!songId || !isValidObjectId(songId.toString())) {
      return sendValidationError(res, "songId must be a valid id");
    }

    if (!interactionType || !ALLOWED_INTERACTIONS.has(interactionType)) {
      return sendValidationError(
        res,
        "interactionType or eventType must be one of play, like, skip, click",
      );
    }

    await logAIInteraction({
      userId,
      songId,
      interactionType,
      source,
      recommendationRequestId,
      rank,
      metadata,
      weight,
    });

    if (userId) {
      invalidateFeedbackCacheForUser(userId);
    }

    if (userId) {
      cacheDel(CACHE_KEYS.RECOMMENDATIONS(userId.toString())).catch((error) => {
        logger.warn("[AI] Failed to clear fallback recommendation cache", {
          error: error.message,
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: "AI interaction feedback recorded",
    });
  } catch (error) {
    logger.error("[AI] Feedback endpoint error", { error: error.message });
    return sendServerError(res, "Error recording AI feedback", error);
  }
};

export const getAIMetrics = async (req, res) => {
  try {
    const parsedDays = parsePositiveInt(req.query.days, {
      min: 1,
      max: 365,
      defaultValue: null,
    });
    if (!parsedDays.valid) {
      return sendValidationError(res, "days must be an integer between 1 and 365");
    }

    const days = parsedDays.value ?? undefined;
    const metrics = await evaluateRecommendationPerformance({ days });

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    logger.error("[AI] Global metrics endpoint error", { error: error.message });
    return sendServerError(res, "Error computing global AI metrics", error);
  }
};

export const getAIMetricsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return sendValidationError(res, "userId must be a valid id");
    }

    const authUserId = toSafeUserId(req.user?.userId);
    const isAdmin = req.user?.role === "admin";

    if (!isAdmin && authUserId !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const parsedDays = parsePositiveInt(req.query.days, {
      min: 1,
      max: 365,
      defaultValue: null,
    });
    if (!parsedDays.valid) {
      return sendValidationError(res, "days must be an integer between 1 and 365");
    }

    const days = parsedDays.value ?? undefined;
    const metrics = await evaluateRecommendationPerformance({ userId, days });

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    logger.error("[AI] User metrics endpoint error", { error: error.message });
    return sendServerError(res, "Error computing user AI metrics", error);
  }
};

export const triggerAIRetraining = async (_req, res) => {
  try {
    const result = await runEmbeddingRetrainingCycle({ reason: "manual" });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error("[AI] Manual retraining endpoint error", { error: error.message });
    return sendServerError(res, "Error running AI retraining cycle", error);
  }
};
