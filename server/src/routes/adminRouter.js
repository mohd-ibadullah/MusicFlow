import express from "express";
import { getAnalytics, getRecentActivity } from "../controllers/analyticsController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/analytics", authenticateToken, authorizeAdmin, getAnalytics);
router.get("/recent-activity", authenticateToken, authorizeAdmin, getRecentActivity);

export default router;
