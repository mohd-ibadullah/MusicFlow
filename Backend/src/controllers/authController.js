import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import {
  sendServerError,
  sendUnauthorizedError,
  sendValidationError,
} from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { isValidObjectId } from "../utils/validation.js";

// Generate JWT Token
const generateToken = (userId, role) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return sendValidationError(res, "Please provide all required fields");
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
    });

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          likedSongs: user.likedSongs,
          recentlyPlayed: user.recentlyPlayed,
          playlists: user.playlists,
          loopDiagnosisPrefs: user.loopDiagnosisPrefs,
        },
        token,
      },
    });
  } catch (error) {
    logger.error("Registration error", { error: error.message });

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }

    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    return sendServerError(res, "Internal server error", error);
  }
};

// Login User
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return sendValidationError(res, "Please provide email and password");
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return sendValidationError(res, "Invalid input format");
    }

    // Find user and include password
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          likedSongs: user.likedSongs,
          recentlyPlayed: user.recentlyPlayed,
          playlists: user.playlists,
          lastLogin: user.lastLogin,
          loopDiagnosisPrefs: user.loopDiagnosisPrefs,
        },
        token,
      },
    });
  } catch (error) {
    logger.error("Login error", { error: error.message });

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }

    return sendServerError(res, "Internal server error", error);
  }
};

// Get User Profile
const getUserProfile = async (req, res) => {
  try {
    if (!isValidObjectId(req.user?.userId?.toString?.() || "")) {
      return sendUnauthorizedError(res, "Invalid authentication token");
    }

    const user = await User.findById(req.user.userId)
      .populate("likedSongs")
      .populate("playlists")
      .populate("recentlyPlayed.song");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          likedSongs: user.likedSongs,
          recentlyPlayed: user.recentlyPlayed,
          playlists: user.playlists,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          loopDiagnosisPrefs: user.loopDiagnosisPrefs,
        },
      },
    });
  } catch (error) {
    logger.error("Get profile error", { error: error.message });
    return sendServerError(res, "Internal server error", error);
  }
};

// Update User Profile
const updateUserProfile = async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const userId = req.user.userId;

    if (!isValidObjectId(userId?.toString?.() || "")) {
      return sendUnauthorizedError(res, "Invalid authentication token");
    }

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return sendValidationError(res, "name must be a non-empty string");
    }

    if (avatar !== undefined && avatar !== null && typeof avatar !== "string") {
      return sendValidationError(res, "avatar must be a string URL");
    }

    // Fetch the original user so we always preserve their current role
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const updateFields = {
      name: name !== undefined ? name : existingUser.name,
      avatar: avatar !== undefined ? avatar : existingUser.avatar,
      role: existingUser.role,
    };
    const user = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error("Update profile error", { error: error.message });
    return sendServerError(res, "Internal server error", error);
  }
};

// Change Password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!isValidObjectId(userId?.toString?.() || "")) {
      return sendUnauthorizedError(res, "Invalid authentication token");
    }

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword.trim() ||
      newPassword.trim().length < 6
    ) {
      return sendValidationError(
        res,
        "currentPassword and newPassword are required (new password min length is 6)",
      );
    }

    // Find user with password
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword.trim();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Change password error", { error: error.message });
    return sendServerError(res, "Internal server error", error);
  }
};

// Delete User Account
const deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!isValidObjectId(userId?.toString?.() || "")) {
      return sendUnauthorizedError(res, "Invalid authentication token");
    }

    // Soft delete - deactivate account
    await User.findByIdAndUpdate(userId, { isActive: false });

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    logger.error("Delete account error", { error: error.message });
    return sendServerError(res, "Internal server error", error);
  }
};

export {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  deleteUserAccount,
};
