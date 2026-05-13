import mongoose from "mongoose";

import AIInteraction from "../models/aiInteractionModel.js";
import AIMetric from "../models/aiMetricModel.js";

const INTERACTION_WEIGHTS = {
  impression: 0,
  play: 2.0,
  click: 0.4,
  like: 5.0,
  skip: -5.0,
};

const INTERACTION_TO_METRIC_KEY = {
  impression: "impressions",
  click: "clicks",
  play: "plays",
  like: "likes",
  skip: "skips",
};

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  const asString = value.toString().trim();
  if (!mongoose.Types.ObjectId.isValid(asString)) return null;
  return new mongoose.Types.ObjectId(asString);
};

const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const metricIncPayload = ({ interactionType, source }) => {
  const key = INTERACTION_TO_METRIC_KEY[interactionType];
  const payload = {};

  if (key) payload[key] = 1;

  if (source === "ai-embedding") payload.aiRequests = 1;
  if (source === "fallback") payload.fallbackRequests = 1;

  return payload;
};

const updateMetricCounter = async ({ day, userId, scopeKey, incPayload }) => {
  if (!incPayload || Object.keys(incPayload).length === 0) return;

  await AIMetric.updateOne(
    { day, scopeKey },
    {
      $setOnInsert: {
        day,
        scopeKey,
        userId,
      },
      $inc: incPayload,
    },
    { upsert: true }
  );
};

export function getInteractionWeight(interactionType) {
  return INTERACTION_WEIGHTS[interactionType] ?? 0;
}

export async function logAIInteraction({
  userId,
  songId,
  interactionType,
  source = "unknown",
  recommendationRequestId = null,
  rank = null,
  metadata = null,
  weight,
}) {
  const userObjectId = toObjectIdOrNull(userId);
  const songObjectId = toObjectIdOrNull(songId);

  if (!songObjectId) {
    return null;
  }

  const effectiveWeight = Number.isFinite(weight)
    ? weight
    : getInteractionWeight(interactionType);

  const interaction = await AIInteraction.create({
    userId: userObjectId,
    songId: songObjectId,
    interactionType,
    source,
    recommendationRequestId,
    rank,
    metadata,
    weight: effectiveWeight,
  });

  const day = getStartOfDay(interaction.createdAt);
  const incPayload = metricIncPayload({ interactionType, source });

  await Promise.all([
    updateMetricCounter({ day, userId: null, scopeKey: "global", incPayload }),
    userObjectId
      ? updateMetricCounter({
          day,
          userId: userObjectId,
          scopeKey: userObjectId.toString(),
          incPayload,
        })
      : Promise.resolve(),
  ]);

  return interaction;
}

export async function logRecommendationServed({
  userId,
  source,
  recommendationRequestId,
  recommendedSongIds,
}) {
  const userObjectId = toObjectIdOrNull(userId);
  const day = getStartOfDay();
  const impressionCount = Array.isArray(recommendedSongIds) ? recommendedSongIds.length : 0;

  const requestInc = {
    recommendationRequests: 1,
    ...(source === "ai-embedding" ? { aiRequests: 1 } : {}),
    ...(source === "fallback" ? { fallbackRequests: 1 } : {}),
    ...(impressionCount > 0 ? { impressions: impressionCount } : {}),
  };

  await Promise.all([
    updateMetricCounter({ day, userId: null, scopeKey: "global", incPayload: requestInc }),
    userObjectId
      ? updateMetricCounter({
          day,
          userId: userObjectId,
          scopeKey: userObjectId.toString(),
          incPayload: requestInc,
        })
      : Promise.resolve(),
  ]);

  if (impressionCount === 0) return;

  const bulk = [];

  for (let index = 0; index < recommendedSongIds.length; index += 1) {
    const songId = toObjectIdOrNull(recommendedSongIds[index]);
    if (!songId) continue;

    bulk.push({
      userId: userObjectId,
      songId,
      interactionType: "impression",
      source,
      recommendationRequestId,
      rank: index,
      metadata: null,
      weight: 0,
    });
  }

  if (bulk.length > 0) {
    await AIInteraction.insertMany(bulk, { ordered: false });
  }
}

export async function evaluateRecommendationPerformance({ userId = null, days = 7 } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 365);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeDays - 1));

  const query = {
    day: { $gte: start },
    ...(userId ? { scopeKey: userId.toString() } : { scopeKey: "global" }),
  };

  const summary = await AIMetric.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        plays: { $sum: "$plays" },
        likes: { $sum: "$likes" },
        skips: { $sum: "$skips" },
        recommendationRequests: { $sum: "$recommendationRequests" },
        aiRequests: { $sum: "$aiRequests" },
        fallbackRequests: { $sum: "$fallbackRequests" },
      },
    },
  ]);

  const stats = summary[0] || {
    impressions: 0,
    clicks: 0,
    plays: 0,
    likes: 0,
    skips: 0,
    recommendationRequests: 0,
    aiRequests: 0,
    fallbackRequests: 0,
  };

  const denom = stats.impressions > 0 ? stats.impressions : 1;

  return {
    scope: userId ? "user" : "global",
    scopeKey: userId ? userId.toString() : "global",
    windowDays: safeDays,
    counts: stats,
    rates: {
      clickRate: stats.clicks / denom,
      playRate: stats.plays / denom,
      skipRate: stats.skips / denom,
      likeRate: stats.likes / denom,
    },
  };
}
