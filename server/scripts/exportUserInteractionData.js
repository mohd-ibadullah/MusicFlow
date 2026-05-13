import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

import connectDB from "../src/config/mongodb.js";
import User from "../src/models/userModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");
const outputPath = path.join(projectRoot, "data", "data.json");

const backendEnvPath = path.join(backendRoot, ".env");
const workspaceEnvPath = path.join(projectRoot, ".env");

dotenv.config({ path: backendEnvPath });
dotenv.config({ path: workspaceEnvPath, override: false });

function normalizeObjectId(value) {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }

  if (typeof value === "object" && value._id) {
    return normalizeObjectId(value._id);
  }

  return null;
}

function addInteraction(interactionMap, userId, songId, rating) {
  if (!userId || !songId) {
    return;
  }

  const key = `${userId}:${songId}`;
  const existing = interactionMap.get(key);

  // Keep the stronger signal if the same user-song pair appears multiple times.
  if (!existing || rating > existing.rating) {
    interactionMap.set(key, {
      user: userId,
      song: songId,
      rating,
    });
  }
}

async function exportUserInteractions() {
  await connectDB();

  try {
    const users = await User.find(
      {},
      {
        _id: 1,
        likedSongs: 1,
        recentlyPlayed: 1,
      },
    ).lean();

    const interactionMap = new Map();

    for (const user of users) {
      const userId = normalizeObjectId(user._id);
      if (!userId) {
        continue;
      }

      const likedSongs = Array.isArray(user.likedSongs) ? user.likedSongs : [];
      for (const likedSongId of likedSongs) {
        const songId = normalizeObjectId(likedSongId);
        addInteraction(interactionMap, userId, songId, 5);
      }

      const recentlyPlayed = Array.isArray(user.recentlyPlayed) ? user.recentlyPlayed : [];
      for (const recentItem of recentlyPlayed) {
        const songCandidate = recentItem && typeof recentItem === "object" ? recentItem.song : recentItem;
        const songId = normalizeObjectId(songCandidate);
        addInteraction(interactionMap, userId, songId, 3);
      }
    }

    const output = Array.from(interactionMap.values());
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    console.log(`Export completed: ${output.length} records written to ${outputPath}`);
  } finally {
    await mongoose.connection.close();
  }
}

exportUserInteractions().catch((error) => {
  console.error("Export failed:", error);
  process.exit(1);
});
