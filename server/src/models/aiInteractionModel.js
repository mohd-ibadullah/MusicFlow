import mongoose from "mongoose";

const aiInteractionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      index: true,
      required: true,
    },
    interactionType: {
      type: String,
      enum: ["impression", "play", "like", "skip", "click"],
      required: true,
      index: true,
    },
    weight: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      default: "unknown",
      maxlength: 64,
    },
    recommendationRequestId: {
      type: String,
      default: null,
      maxlength: 128,
      index: true,
    },
    rank: {
      type: Number,
      default: null,
      min: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "ai_interactions",
  }
);

aiInteractionSchema.index({ userId: 1, createdAt: -1 });
aiInteractionSchema.index({ interactionType: 1, createdAt: -1 });
aiInteractionSchema.index({ songId: 1, createdAt: -1 });

const AIInteraction = mongoose.model("AIInteraction", aiInteractionSchema);

export default AIInteraction;
