import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["song_played", "song_added", "song_liked", "playlist_created", "album_added"],
      required: true,
    },
    message: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

activitySchema.index({ createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;
