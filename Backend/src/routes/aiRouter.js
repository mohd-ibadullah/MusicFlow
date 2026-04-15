import express from "express";
import {
	getAIRecommendationsByUser,
	getAIMetrics,
	getAIMetricsForUser,
	submitAIInteractionFeedback,
	triggerAIRetraining,
} from "../controllers/aiRecommendationController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";

const aiRouter = express.Router();

// Authenticated recommendation endpoint. User identity is always derived from JWT.
aiRouter.get("/recommendations", authenticateToken, getAIRecommendationsByUser);
// Backward-compatible route shape; :userId is ignored on purpose for security.
aiRouter.get("/recommendations/:userId", authenticateToken, getAIRecommendationsByUser);

// Additive endpoint for real-time AI feedback (play/like/skip/click).
aiRouter.post("/feedback", authenticateToken, submitAIInteractionFeedback);

// Metrics and operational endpoints.
aiRouter.get("/metrics", authenticateToken, authorizeAdmin, getAIMetrics);
aiRouter.get("/metrics/:userId", authenticateToken, getAIMetricsForUser);
aiRouter.post("/retraining/run", authenticateToken, authorizeAdmin, triggerAIRetraining);

export default aiRouter;
