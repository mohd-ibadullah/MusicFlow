import mongoose from "mongoose";

const aiMetricSchema = new mongoose.Schema(
  {
    day: {
      type: Date,
      required: true,
      index: true,
    },
    scopeKey: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    impressions: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    plays: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    skips: {
      type: Number,
      default: 0,
      min: 0,
    },
    recommendationRequests: {
      type: Number,
      default: 0,
      min: 0,
    },
    aiRequests: {
      type: Number,
      default: 0,
      min: 0,
    },
    fallbackRequests: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "ai_metrics",
  }
);

aiMetricSchema.index({ day: 1, scopeKey: 1 }, { unique: true });

const AIMetric = mongoose.model("AIMetric", aiMetricSchema);

export default AIMetric;
