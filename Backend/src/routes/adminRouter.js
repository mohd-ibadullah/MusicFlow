import express from "express";
import { getAnalytics } from "../controllers/analyticsController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/analytics", authenticateToken, authorizeAdmin, getAnalytics);

export default router;
