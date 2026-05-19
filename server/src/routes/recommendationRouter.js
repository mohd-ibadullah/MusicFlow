import express from "express";

import { getCollaborativeFilteringRecommendations } from "../controllers/songController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const recommendationRouter = express.Router();

recommendationRouter.get("/cf/:userId", authenticateToken, getCollaborativeFilteringRecommendations);

export default recommendationRouter;