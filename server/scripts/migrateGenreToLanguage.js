/**
 * Migration: Replace genre with language.
 * album: "Hindi Songs" -> language: "Hindi"
 * album: "English Songs" -> language: "English"
 * album: "Telugu Songs" -> language: "Telugu"
 * Remove genre from all documents.
 * Run: node scripts/migrateGenreToLanguage.js (from server directory)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Song from "../src/models/songModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function inferLanguage(album, genre) {
  const str = `${album || ""} ${genre || ""}`.toLowerCase();
  if (str.includes("hindi")) return "Hindi";
  if (str.includes("english")) return "English";
  if (str.includes("telugu")) return "Telugu";
  return "Unknown";
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/music";
  console.log("📡 Connecting to MongoDB...");
  await mongoose.connect(uri);

  const songs = await Song.find({}).lean();
  console.log(`\n📊 Found ${songs.length} songs. Migrating genre → language...\n`);

  const report = { scanned: songs.length, updated: 0, languageAssigned: new Set(), genreRemoved: 0 };

  for (const song of songs) {
    const language = inferLanguage(song.album, song.genre);
    report.languageAssigned.add(language);

    const updates = { language };
    if (song.genre !== undefined) {
      updates.$unset = { genre: "" };
      report.genreRemoved++;
    }

    await Song.updateOne(
      { _id: song._id },
      song.genre !== undefined ? { $set: { language }, $unset: { genre: "" } } : { $set: { language } }
    );
    report.updated++;
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("     GENRE → LANGUAGE MIGRATION REPORT");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Songs scanned:", report.scanned);
  console.log("Songs updated:", report.updated);
  console.log("Language assigned:", [...report.languageAssigned].sort().join(", "));
  console.log("Genre removed from:", report.genreRemoved, "documents");
  console.log("═══════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("✅ Migration complete.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
