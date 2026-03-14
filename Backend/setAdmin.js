import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/userModel.js"; // ✅ make sure this path exists

// Load environment variables from .env file
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ MongoDB URI not found in .env file");
  process.exit(1);
}

const setAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Replace with the email you want to make admin
    const email = "first@gmail.com";

    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ User not found");
      process.exit(1);
    }

    // ✅ Correct field based on your MongoDB document
    user.role = "admin";
    await user.save();

    console.log(`✅ ${email} is now an admin!`);
  } catch (error) {
    console.error("❌ Error setting admin role:", error);
  } finally {
    await mongoose.connection.close();
  }
};

setAdmin();
