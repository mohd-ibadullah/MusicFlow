/**
 * Migration script: fix song metadata (artist, genre) using known mappings and album inference.
 * Ensures every song has artist, genre, duration, playCount, likeCount.
 * Run: npm run migrate:songs (from server directory)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Song from "../src/models/songModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_GENRE = "Unknown";

// Song name (lowercase, trimmed) -> { artist, genre }
const SONG_METADATA_MAP = {
  "tum hi ho": { artist: "Arijit Singh", genre: "Hindi" },
  "kesariya": { artist: "Arijit Singh", genre: "Hindi" },
  "agar tum saath ho": { artist: "Alka Yagnik / Arijit Singh", genre: "Hindi" },
  "enna sona": { artist: "Arijit Singh", genre: "Hindi" },
  "main tumhara": { artist: "Arijit Singh", genre: "Hindi" },
  "o rangrez": { artist: "Arijit Singh", genre: "Hindi" },
  "kaise hua": { artist: "Arijit Singh", genre: "Hindi" },

  "unstoppable": { artist: "Sia", genre: "Pop" },
  "blinding lights": { artist: "The Weeknd", genre: "Pop" },
  "closer": { artist: "The Chainsmokers", genre: "EDM" },
  "love me like you do": { artist: "Ellie Goulding", genre: "Pop" },
  "let me down slowly": { artist: "Alec Benjamin", genre: "Pop" },
  "it's you": { artist: "Ali Gatie", genre: "Pop" },
  "its you": { artist: "Ali Gatie", genre: "Pop" },
  "it is you": { artist: "Ali Gatie", genre: "Pop" },
  "love your voice": { artist: "Ali Gatie", genre: "Pop" },
  "burn": { artist: "Ellie Goulding", genre: "Pop" },
  "until i found you": { artist: "Stephen Sanchez", genre: "Pop" },

  "kadalalle": { artist: "Sid Sriram", genre: "Telugu" },
  "urike urike": { artist: "Sid Sriram", genre: "Telugu" },
  "adiga adiga": { artist: "Sid Sriram", genre: "Telugu" },
  "adhbutam": { artist: "Sid Sriram", genre: "Telugu" },
  "po ve po": { artist: "Sid Sriram", genre: "Telugu" },
  "konte chuputho": { artist: "Sid Sriram", genre: "Telugu" },
  "avunanavaa": { artist: "Sid Sriram", genre: "Telugu" },
  "emai poyave": { artist: "Sid Sriram", genre: "Telugu" },
  "kalalo kooda": { artist: "Sid Sriram", genre: "Telugu" },
  "arerey manasa": { artist: "Sid Sriram", genre: "Telugu" },

  "i wanna be yours": { artist: "Arctic Monkeys", genre: "Pop" },
  "jo tum mere ho": { artist: "Arijit Singh", genre: "Hindi" },
  "ishq hai": { artist: "Arijit Singh", genre: "Hindi" },
  "mast magan": { artist: "Arijit Singh / Chinmayi", genre: "Hindi" },
};

function normalizeName(str) {
  return (str || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\s+/g, " ");
}

function lookupBySongName(name) {
  const key = normalizeName(name);
  const direct = SONG_METADATA_MAP[key];
  if (direct) return direct;
  // Try without apostrophes (e.g. "its you" for "it's you")
  const keyNoApos = key.replace(/'/g, "");
  return SONG_METADATA_MAP[key] || SONG_METADATA_MAP[keyNoApos] || null;
}

function inferGenreFromAlbum(album) {
  if (!album || typeof album !== "string") return null;
  const a = album.toLowerCase();
  if (a.includes("hindi")) return "Hindi";
  if (a.includes("english")) return "Pop";
  if (a.includes("telugu")) return "Telugu";
  if (a.includes("tamil")) return "Tamil";
  if (a.includes("kannada")) return "Kannada";
  if (a.includes("malayalam")) return "Malayalam";
  if (a.includes("punjabi")) return "Punjabi";
  if (a.includes("rock")) return "Rock";
  if (a.includes("pop")) return "Pop";
  if (a.includes("hip") || a.includes("rap")) return "Hip Hop";
  if (a.includes("edm")) return "EDM";
  if (a.includes("classical")) return "Classical";
  return null;
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/music";
  console.log("📡 Connecting to MongoDB...");
  await mongoose.connect(uri);

  const songs = await Song.find({}).lean();
  console.log(`\n📊 Found ${songs.length} songs. Analyzing...\n`);

  const report = {
    totalScanned: songs.length,
    updated: 0,
    skipped: 0,
    artistsAssigned: new Set(),
    genresAssigned: new Set(),
    details: [],
  };

  function isEmpty(val) {
    return val == null || (typeof val === "string" && val.trim() === "");
  }
  function isUnknown(val) {
    if (isEmpty(val)) return true;
    const v = String(val).toLowerCase().trim();
    return v === "unknown" || v === "unknown artist" || v === "unknown genre";
  }

  const genresFromDb = songs.map((s) => s.genre).filter((g) => !isEmpty(g) && !isUnknown(g));
  const genreCounts = {};
  genresFromDb.forEach((g) => {
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  });
  const defaultGenre =
    Object.keys(genreCounts).length > 0
      ? Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0][0]
      : UNKNOWN_GENRE;

  let updatedCount = 0;
  for (const song of songs) {
    const updates = {};
    const metadata = lookupBySongName(song.name);
    const needsArtist = isEmpty(song.artist) || isUnknown(song.artist);
    const needsGenre = isEmpty(song.genre) || isUnknown(song.genre);

    if (needsArtist) {
      const artistVal = metadata?.artist || UNKNOWN_ARTIST;
      updates.artist = artistVal;
      if (metadata?.artist) report.artistsAssigned.add(artistVal);
    }

    if (needsGenre) {
      const genreVal = metadata?.genre || inferGenreFromAlbum(song.album) || defaultGenre || UNKNOWN_GENRE;
      updates.genre = genreVal;
      report.genresAssigned.add(genreVal);
    }

    if (isEmpty(song.duration)) updates.duration = "0:00";
    if (song.playCount == null || typeof song.playCount !== "number") updates.playCount = 0;
    if (song.likeCount == null || typeof song.likeCount !== "number") updates.likeCount = 0;

    if (Object.keys(updates).length > 0) {
      await Song.updateOne({ _id: song._id }, { $set: updates });
      updatedCount++;
      report.details.push({
        name: song.name,
        artist: updates.artist,
        genre: updates.genre,
      });
    } else {
      report.skipped++;
    }
  }

  report.updated = updatedCount;

  console.log("═══════════════════════════════════════════════════════");
  console.log("           SONG METADATA MIGRATION REPORT");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Total songs scanned:", report.totalScanned);
  console.log("Songs updated:", report.updated);
  console.log("Songs skipped (already correct):", report.skipped);
  console.log("───────────────────────────────────────────────────────");
  const artistsList = [...report.artistsAssigned].filter((a) => a && !a.toLowerCase().includes("unknown")).sort();
  const genresList = [...report.genresAssigned].filter((g) => g && !g.toLowerCase().includes("unknown")).sort();
  console.log("Artists assigned:", artistsList.length ? artistsList.join(", ") : "—");
  console.log("Genres assigned:", genresList.length ? genresList.join(", ") : "—");
  console.log("───────────────────────────────────────────────────────");
  if (report.details.length > 0) {
    console.log("Updated songs:");
    report.details.forEach((d) => {
      const parts = [];
      if (d.artist) parts.push(`artist: ${d.artist}`);
      if (d.genre) parts.push(`genre: ${d.genre}`);
      console.log(`  - ${d.name} → ${parts.join(", ")}`);
    });
  }
  console.log("═══════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("✅ Migration complete. Disconnected.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
