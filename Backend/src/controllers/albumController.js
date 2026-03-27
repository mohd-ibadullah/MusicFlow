import { v2 as cloudinary } from "cloudinary";
import Album from "../models/albumModel.js";
import fs from "fs";
import { cacheGet, cacheSet, cacheDel } from "../utils/cache.js";
import logActivity from "../utils/logActivity.js";

const CACHE_ALBUMS_KEY = "albums:list";

const addAlbum = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No image file provided" 
      });
    }

    const { name, desc, bgColor } = req.body;
    
    if (!name || !desc || !bgColor) {
      return res.status(400).json({
        success: false,
        message: "Name, description, and background color are required"
      });
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      // Clean up temp file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn("⚠️ Could not clean up temp file:", cleanupError.message);
      }
      
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Please upload JPEG, PNG, GIF, or WebP images only."
      });
    }

    const imageFile = req.file.path;
    
    try {
      const imageUpload = await cloudinary.uploader.upload(imageFile, {
        resource_type: "image",
      });

      const album = new Album({ name, desc, bgColor, image: imageUpload.secure_url });
      await album.save();
      await cacheDel(CACHE_ALBUMS_KEY);
      logActivity({ type: "album_added", message: `Album "${album.name}" was added` });

      try {
        fs.unlinkSync(imageFile);
      } catch (cleanupError) {
        console.warn("⚠️ Could not clean up temp file:", cleanupError.message);
      }

      res.status(200).json({
        success: true,
        message: "Album added successfully",
        album,
      });
    } catch (cloudinaryError) {
      console.error("❌ Cloudinary error:", cloudinaryError);
      
      // Clean up temp file on error
      try {
        fs.unlinkSync(imageFile);
      } catch (cleanupError) {
        console.warn("⚠️ Could not clean up temp file on error:", cleanupError.message);
      }
      
      res.status(400).json({
        success: false,
        message: "Cloudinary upload failed. Please check your image file and try again.",
        error: cloudinaryError.message
      });
    }
  } catch (error) {
    console.error("❌ Album upload error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error adding album", 
      error: error.message 
    });
  }
};

const listAlbum = async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_ALBUMS_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: "Albums fetched successfully",
        allAlbums: cached.allAlbums,
      });
    }
    const allAlbums = await Album.find({}).sort({ createdAt: -1 }).lean();
    await cacheSet(CACHE_ALBUMS_KEY, { allAlbums }, 120);
    res.status(200).json({ 
      success: true,
      message: "Albums fetched successfully", 
      allAlbums 
    });
  } catch (error) {
    console.error("List albums error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching albums", 
      error: error.message 
    });
  }
};

const removeAlbum = async (req, res) => {
  try {
    const result = await Album.findByIdAndDelete(req.body.id);
    if (!result) {
      return res.status(404).json({ 
        success: false,
        message: "Album not found" 
      });
    }
    await cacheDel(CACHE_ALBUMS_KEY);
    res.status(200).json({ 
      success: true,
      message: "Album deleted successfully" 
    });
  } catch (error) {
    console.error("Remove album error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error deleting album", 
      error: error.message 
    });
  }
};

export { addAlbum, listAlbum, removeAlbum };