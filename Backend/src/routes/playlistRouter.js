import express from "express";
import { 
  createPlaylist, 
  getPlaylists, 
  getPlaylistById, 
  addSongToPlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  generatePlaylist,
  cleanupOldPlaylists
} from "../controllers/playlistController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cleanup endpoint (admin only)
router.delete("/cleanup-old", authenticateToken, authorizeAdmin, cleanupOldPlaylists);

// CRUD operations (all require authentication)
router.post("/create", authenticateToken, createPlaylist);
router.post("/generate", authenticateToken, generatePlaylist);
router.get("/list", authenticateToken, getPlaylists);
router.get("/:id", authenticateToken, getPlaylistById);
router.post("/add-song", authenticateToken, addSongToPlaylist);
router.delete("/delete/:id", authenticateToken, deletePlaylist);
router.post("/remove-song", authenticateToken, removeSongFromPlaylist);

export default router;