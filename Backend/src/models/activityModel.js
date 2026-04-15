import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "song_played",
        "song_added",
        "song_deleted",
        "song_liked",
        "song_unliked",
        "playlist_created",
        "playlist_updated",
        "playlist_deleted",
        "album_added",
        "album_deleted",
        "loop_triggered",
        "loop_updated",
        "ai_playlist_generated",
      ],
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
