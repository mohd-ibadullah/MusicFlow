import Activity from "../models/activityModel.js";

const logActivity = async ({ type, message, userId = null }) => {
  try {
    await Activity.create({ type, message, userId });
  } catch (err) {
    console.warn("Activity log failed:", err.message);
  }
};

export default logActivity;
