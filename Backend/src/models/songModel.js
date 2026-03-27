import mongoose from "mongoose";

const songSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "Unknown Song" },
    desc: { type: String, required: true, default: "No description" },
    album: { type: String, required: true, default: "Single" },
    artist: { type: String, default: "", index: true },
    language: {
      type: String,
      enum: ["Hindi", "English", "Telugu", "Unknown"],
      default: "English",
    },
    image: { type: String, required: true },
    file: { type: String, required: true },
    duration: { type: String, required: true, default: "0:00" },
    genre: { type: String, default: "" },
    playCount: { type: Number, default: 0, index: true },
    likeCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "songs" }
);

songSchema.index({ language: 1 });
songSchema.index({ playCount: -1 });
songSchema.index({ language: 1, artist: 1 });

const Song = mongoose.model("Song", songSchema);
export default Song;