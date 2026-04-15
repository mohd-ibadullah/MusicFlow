import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import AIInteraction from "../models/aiInteractionModel.js";
import { getEmbeddingSnapshot, applyAdaptiveProfiles } from "./embeddingRecommender.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUNTIME_DIR = path.join(__dirname, "runtime");
const USER_PROFILE_PATH = path.join(RUNTIME_DIR, "adaptive_user_profiles.json");
const DEFAULT_INTERVAL_HOURS = 24;

let schedulerHandle = null;

const createZeroVector = (dim) => new Array(dim).fill(0);

const addScaled = (target, source, scale) => {
  for (let i = 0; i < target.length; i += 1) {
    target[i] += source[i] * scale;
  }
};

const l2Norm = (vector) => {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
};

const normalize = (vector) => {
  const norm = l2Norm(vector);
  if (!norm || !Number.isFinite(norm)) return vector;
  return vector.map((value) => value / norm);
};

const ensureRuntimeDir = async () => {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
};

const loadPersistedProfiles = async () => {
  try {
    const raw = await fs.readFile(USER_PROFILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveProfiles = async (profiles) => {
  await ensureRuntimeDir();
  const nextPayload = `${JSON.stringify(profiles)}\n`;

  try {
    const currentPayload = await fs.readFile(USER_PROFILE_PATH, "utf8");
    if (currentPayload === nextPayload) {
      return;
    }
  } catch {
    // If file does not exist yet, continue and create it.
  }

  await fs.writeFile(USER_PROFILE_PATH, nextPayload, "utf8");
};

const getTrainingWindowStart = (days = 30) => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
};

export async function runEmbeddingRetrainingCycle({ reason = "scheduled" } = {}) {
  const snapshot = await getEmbeddingSnapshot();
  if (!snapshot.initialized) {
    return {
      success: false,
      reason: "embedding_not_initialized",
    };
  }

  const { dim, itemIndexBySongId, itemEmbedding } = snapshot;
  const interactions = await AIInteraction.find(
    {
      userId: { $ne: null },
      createdAt: { $gte: getTrainingWindowStart(30) },
      interactionType: { $in: ["play", "like", "skip", "click"] },
    },
    { userId: 1, songId: 1, weight: 1, createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(200000)
    .lean();

  const profileVectors = new Map();

  for (const event of interactions) {
    const userId = event?.userId?.toString?.();
    const songId = event?.songId?.toString?.();
    if (!userId || !songId) continue;

    const itemIndex = itemIndexBySongId.get(songId.toLowerCase()) ?? itemIndexBySongId.get(songId);
    if (itemIndex == null) continue;

    const weight = Number(event.weight);
    if (!Number.isFinite(weight) || weight === 0) continue;

    const vec = profileVectors.get(userId) || createZeroVector(dim);
    const offset = itemIndex * dim;
    const itemVec = itemEmbedding.subarray(offset, offset + dim);

    addScaled(vec, itemVec, weight);
    profileVectors.set(userId, vec);
  }

  const serializedProfiles = {};
  for (const [userId, vector] of profileVectors.entries()) {
    serializedProfiles[userId] = normalize(vector);
  }

  const persisted = await loadPersistedProfiles();
  const merged = { ...persisted, ...serializedProfiles };

  await saveProfiles(merged);
  applyAdaptiveProfiles(merged);

  return {
    success: true,
    reason,
    trainedUsers: Object.keys(serializedProfiles).length,
  };
}

export function startAIRetrainingScheduler() {
  if (schedulerHandle) return schedulerHandle;

  const intervalHours = Math.min(
    Math.max(Number(process.env.AI_RETRAIN_INTERVAL_HOURS) || DEFAULT_INTERVAL_HOURS, 1),
    24 * 14
  );
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const run = async (triggerReason) => {
    try {
      const result = await runEmbeddingRetrainingCycle({ reason: triggerReason });
      if (result.success) {
        logger.info(`[AI] Retraining cycle complete (${triggerReason}) users=${result.trainedUsers}`);
      } else {
        logger.info(`[AI] Retraining skipped (${triggerReason}) reason=${result.reason}`);
      }
    } catch (error) {
      logger.warn("[AI] Retraining cycle failed", { error: error.message });
    }
  };

  run("startup");
  schedulerHandle = setInterval(() => run("scheduled"), intervalMs);

  return schedulerHandle;
}
