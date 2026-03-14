import express from "express";
import { 
  createPlaylist, 
  getPlaylists, 
  getPlaylistById, 
  addSongToPlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  generatePlaylist,
  testPlaylist,
  cleanupOldPlaylists
} from "../controllers/playlistController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Test endpoint (public)
router.get("/test", testPlaylist);

// Cleanup endpoint (public - for migration)
router.delete("/cleanup-old", cleanupOldPlaylists);

// CRUD operations (all require authentication)
router.post("/create", authenticateToken, createPlaylist);
router.post("/generate", authenticateToken, generatePlaylist);
router.get("/list", authenticateToken, getPlaylists);
router.get("/:id", authenticateToken, getPlaylistById);
router.post("/add-song", authenticateToken, addSongToPlaylist);
router.delete("/delete/:id", authenticateToken, deletePlaylist);
router.post("/remove-song", authenticateToken, removeSongFromPlaylist);

export default router;