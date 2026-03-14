import mongoose from "mongoose";

const albumSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  desc: { 
    type: String, 
    required: true 
  },
  bgColor: { 
    type: String, 
    required: true 
  },
  image: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// FIX: Use consistent naming - "Album" with capital A
const Album = mongoose.model("Album", albumSchema);
export default Album;