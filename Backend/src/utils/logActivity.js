import Activity from "../models/activityModel.js";
import {
  emitRealtime,
  REALTIME_EVENTS,
} from "../socket/realtimeEvents.js";

const logActivity = async ({ type, message, userId = null, req = null }) => {
  try {
    const activity = await Activity.create({ type, message, userId });
    
    // Emit socket event for real-time updates if io is available
    if (req && req.app) {
      try {
        const io = req.app.get("io");
        if (io) {
          const payload = {
            _id: activity._id,
            type,
            message,
            userId,
            createdAt: activity.createdAt,
          };

          emitRealtime(io, REALTIME_EVENTS.ACTIVITY_CREATED, payload, {
            source: "activity_logger",
            audience: "all",
            legacy: [{ name: "activity_created", payload }],
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
