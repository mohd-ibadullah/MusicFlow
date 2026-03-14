/**
 * Migration: Fix "Unknown Artist" by assigning correct artists based on song name.
 * Run: node scripts/fixArtists.js (from Backend directory)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Song from "../src/models/songModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SONG_ARTIST_MAP = {
  "tum hi ho": "Arijit Singh",
  "kesariya": "Arijit Singh",
  "agar tum saath ho": "Alka Yagnik / Arijit Singh",
  "enna sona": "Arijit Singh",
  "main tumhara": "Arijit Singh",
  "o rangrez": "Arijit Singh",
  "kaise hua": "Arijit Singh",
  "jo tum mere ho": "Arijit Singh",
  "ishq hai": "Arijit Singh",
  "mast magan": "Arijit Singh / Chinmayi",

  "unstoppable": "Sia",
  "blinding lights": "The Weeknd",
  "closer": "The Chainsmokers",
  "love me like you do": "Ellie Goulding",
  "let me down slowly": "Alec Benjamin",
  "it's you": "Ali Gatie",
  "its you": "Ali Gatie",
  "it is you": "Ali Gatie",
  "love your voice": "Ali Gatie",
  "burn": "Ellie Goulding",
  "until i found you": "Stephen Sanchez",
  "i wanna be yours": "Arctic Monkeys",

  "kadalalle": "Sid Sriram",
  "urike urike": "Sid Sriram",
  "adiga adiga": "Sid Sriram",
  "adhbutam": "Sid Sriram",
  "po ve po": "Sid Sriram",
  "konte chuputho": "Sid Sriram",
  "avunanavaa": "Sid Sriram",
  "emai poyave": "Sid Sriram",
  "kalalo kooda": "Sid Sriram",
  "arerey manasa": "Sid Sriram",
};

function normalizeName(str) {
  return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function lookupArtist(name) {
  const key = normalizeName(name);
  const direct = SONG_ARTIST_MAP[key];
  if (direct) return direct;
  const keyNoApos = key.replace(/'/g, "");
  if (SONG_ARTIST_MAP[keyNoApos]) return SONG_ARTIST_MAP[keyNoApos];
  const entries = Object.entries(SONG_ARTIST_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, artist] of entries) {
    if (key.includes(pattern) || key.startsWith(pattern) || key.endsWith(pattern)) return artist;
  }
  return null;
}

function needsFix(artist) {
  if (!artist || typeof artist !== "string") return true;
  const v = artist.trim().toLowerCase();
  return v === "" || v === "unknown" || v === "unknown artist";
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/music";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);

  const songs = await Song.find({}).lean();
  console.log(`Found ${songs.length} songs. Fixing artists...\n`);

  let updated = 0;
  for (const song of songs) {
    if (!needsFix(song.artist)) continue;

    const artist = lookupArtist(song.name);
    if (!artist) continue;

    await Song.updateOne({ _id: song._id }, { $set: { artist } });
    updated++;
    console.log(`  ${song.name} → ${artist}`);
  }

  console.log("\n═══════════════════════════════════════");
  console.log("FIX ARTISTS REPORT");
  console.log("═══════════════════════════════════════");
  console.log("Songs scanned:", songs.length);
  console.log("Artists fixed:", updated);
  console.log("═══════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("Migration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
