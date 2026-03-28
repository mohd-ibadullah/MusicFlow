import Activity from "../models/activityModel.js";

const logActivity = async ({ type, message, userId = null, req = null }) => {
  try {
    const activity = await Activity.create({ type, message, userId });
    
    // Emit socket event for real-time updates if io is available
    if (req && req.app) {
      try {
        const io = req.app.get("io");
        if (io) {
          io.emit("activity_created", {
            _id: activity._id,
            type,
            message,
            userId,
            createdAt: activity.createdAt
          });
        }
      } catch (emitErr) {
        console.warn("Failed to emit activity_created socket event:", emitErr.message);
      }
    }
    
    return activity;
  } catch (err) {
    console.warn("Activity log failed:", err.message);
    return null;
  }
};

export default logActivity;
