/**
 * Migration: Assign language from album.
 * Hindi Songs → Hindi, English Songs → English, Telugu Songs → Telugu
 * Run: node scripts/fixLanguages.js (from server directory)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Song from "../src/models/songModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function inferLanguage(album) {
  if (!album || typeof album !== "string") return null;
  const a = album.toLowerCase();
  if (a.includes("hindi")) return "Hindi";
  if (a.includes("english")) return "English";
  if (a.includes("telugu")) return "Telugu";
  return null;
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/music";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);

  const songs = await Song.find({}).lean();
  console.log(`Found ${songs.length} songs. Fixing languages...\n`);

  let updated = 0;
  const languages = new Set();

  for (const song of songs) {
    const lang = inferLanguage(song.album);
    if (!lang) continue;

    await Song.updateOne({ _id: song._id }, { $set: { language: lang } });
    updated++;
    languages.add(lang);
  }

  console.log("═══════════════════════════════════════");
  console.log("FIX LANGUAGES REPORT");
  console.log("═══════════════════════════════════════");
  console.log("Songs scanned:", songs.length);
  console.log("Songs updated:", updated);
  console.log("Languages assigned:", [...languages].sort().join(", "));
  console.log("═══════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("Migration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
