/**
 * Migration: Fix song metadata (artist, language).
 * - Replaces "Unknown Artist" with correct artist based on song name
 * - Ensures language is Hindi, English, or Telugu based on album/name
 * Run: node scripts/fixSongMetadata.js (from Backend directory)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Song from "../src/models/songModel.js";
import { cacheDel, CACHE_KEYS } from "../src/utils/cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const VALID_LANGUAGES = ["Hindi", "English", "Telugu"];

const SONG_METADATA = {
  "tum hi ho": { artist: "Arijit Singh", language: "Hindi" },
  "kesariya": { artist: "Arijit Singh", language: "Hindi" },
  "agar tum saath ho": { artist: "Alka Yagnik / Arijit Singh", language: "Hindi" },
  "enna sona": { artist: "Arijit Singh", language: "Hindi" },
  "main tumhara": { artist: "Arijit Singh", language: "Hindi" },
  "o rangrez": { artist: "Arijit Singh", language: "Hindi" },
  "kaise hua": { artist: "Arijit Singh", language: "Hindi" },
  "jo tum mere ho": { artist: "Arijit Singh", language: "Hindi" },
  "ishq hai": { artist: "Arijit Singh", language: "Hindi" },
  "mast magan": { artist: "Arijit Singh / Chinmayi", language: "Hindi" },

  "unstoppable": { artist: "Sia", language: "English" },
  "blinding lights": { artist: "The Weeknd", language: "English" },
  "closer": { artist: "The Chainsmokers", language: "English" },
  "love me like you do": { artist: "Ellie Goulding", language: "English" },
  "let me down slowly": { artist: "Alec Benjamin", language: "English" },
  "it's you": { artist: "Ali Gatie", language: "English" },
  "its you": { artist: "Ali Gatie", language: "English" },
  "it is you": { artist: "Ali Gatie", language: "English" },
  "love your voice": { artist: "Ali Gatie", language: "English" },
  "burn": { artist: "Ellie Goulding", language: "English" },
  "until i found you": { artist: "Stephen Sanchez", language: "English" },
  "i wanna be yours": { artist: "Arctic Monkeys", language: "English" },

  "kadalalle": { artist: "Sid Sriram", language: "Telugu" },
  "urike urike": { artist: "Sid Sriram", language: "Telugu" },
  "adiga adiga": { artist: "Sid Sriram", language: "Telugu" },
  "adhbutam": { artist: "Sid Sriram", language: "Telugu" },
  "po ve po": { artist: "Sid Sriram", language: "Telugu" },
  "konte chuputho": { artist: "Sid Sriram", language: "Telugu" },
  "avunanavaa": { artist: "Sid Sriram", language: "Telugu" },
  "emai poyave": { artist: "Sid Sriram", language: "Telugu" },
  "kalalo kooda": { artist: "Sid Sriram", language: "Telugu" },
  "arerey manasa": { artist: "Sid Sriram", language: "Telugu" },
};

function normalizeName(str) {
  return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function inferLanguageFromAlbum(album) {
  if (!album || typeof album !== "string") return null;
  const a = album.toLowerCase();
  if (a.includes("hindi")) return "Hindi";
  if (a.includes("english")) return "English";
  if (a.includes("telugu")) return "Telugu";
  return null;
}

function lookupMetadata(name) {
  const key = normalizeName(name);
  const direct = SONG_METADATA[key];
  if (direct) return direct;
  const keyNoApos = key.replace(/'/g, "");
  if (SONG_METADATA[keyNoApos]) return SONG_METADATA[keyNoApos];
  const entries = Object.entries(SONG_METADATA).sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, meta] of entries) {
    if (key.includes(pattern) || key.startsWith(pattern) || key.endsWith(pattern)) return meta;
  }
  return null;
}

function needsArtistFix(artist) {
  if (!artist || typeof artist !== "string") return true;
  const v = artist.trim().toLowerCase();
  return v === "" || v === "unknown" || v === "unknown artist";
}

function needsLanguageFix(lang) {
  if (!lang || typeof lang !== "string") return true;
  return !VALID_LANGUAGES.includes(lang.trim());
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/music";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);

  const songs = await Song.find({}).lean();
  console.log(`\nFound ${songs.length} songs. Fixing metadata...\n`);

  const report = { artistFixed: 0, languageFixed: 0 };

  for (const song of songs) {
    const metadata = lookupMetadata(song.name);
    const albumLang = inferLanguageFromAlbum(song.album);
    const updates = {};

    if (needsArtistFix(song.artist) && metadata?.artist) {
      updates.artist = metadata.artist;
      report.artistFixed++;
    }
    if (needsLanguageFix(song.language)) {
      const lang = metadata?.language || albumLang || "English";
      updates.language = VALID_LANGUAGES.includes(lang) ? lang : "English";
      report.languageFixed++;
    }

    if (Object.keys(updates).length > 0) {
      await Song.updateOne({ _id: song._id }, { $set: updates });
      console.log(`  ${song.name} → artist: ${updates.artist || song.artist}, language: ${updates.language || song.language}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("FIX SONG METADATA REPORT");
  console.log("═══════════════════════════════════════════════════");
  console.log("Songs scanned:", songs.length);
  console.log("Artists fixed:", report.artistFixed);
  console.log("Languages fixed:", report.languageFixed);
  console.log("═══════════════════════════════════════════════════\n");

  if (report.artistFixed > 0 || report.languageFixed > 0) {
    try {
      await cacheDel(CACHE_KEYS.SONGS_LIST);
      console.log("Cache invalidated (songs list).");
    } catch (e) {
      // Redis may not be configured
    }
  }

  await mongoose.disconnect();
  console.log("Migration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
