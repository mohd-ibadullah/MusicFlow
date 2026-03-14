import express from "express";
import {
  addSong,
  listSong,
  getArtists,
  removeSong,
  likeSong,
  unlikeSong,
  getLikedSongs,
  addToRecentlyPlayed,
  getRecentlyPlayed,
  getRecommendations,
  getTrendingSongs,
  incrementPlayCount,
} from "../controllers/songController.js";
import upload from "../middleware/multer.js";
import { authenticateToken, authorizeAdmin, optionalAuth } from "../middleware/authMiddleware.js";

const songRouter = express.Router();

songRouter.post(
  "/add",
  authenticateToken,
  authorizeAdmin,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  addSong
);
songRouter.get("/list", listSong);
songRouter.get("/artists", getArtists);
songRouter.get("/recommendations", optionalAuth, getRecommendations);
songRouter.get("/trending", getTrendingSongs);
songRouter.post("/remove", authenticateToken, authorizeAdmin, removeSong);
songRouter.post("/like", authenticateToken, likeSong);
songRouter.post("/unlike", authenticateToken, unlikeSong);
songRouter.get("/liked", authenticateToken, getLikedSongs);
songRouter.post("/play/:songId", incrementPlayCount);
songRouter.post("/recently-played", authenticateToken, addToRecentlyPlayed);
songRouter.get("/recently-played", authenticateToken, getRecentlyPlayed);

export default songRouter;
