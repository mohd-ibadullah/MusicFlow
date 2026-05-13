import express from "express";
import {
  addAlbum,
  listAlbum,
  removeAlbum,
} from "../controllers/albumController.js";
import upload from "../middleware/multer.js";
import { authenticateToken, authorizeAdmin } from "../middleware/authMiddleware.js";

const albumRouter = express.Router();

albumRouter.post("/add", authenticateToken, authorizeAdmin, upload.single("image"), addAlbum);
albumRouter.get("/list", listAlbum);
albumRouter.post("/remove", authenticateToken, authorizeAdmin, removeAlbum);

export default albumRouter;