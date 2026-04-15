import mongoose from "mongoose";

export const isValidObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value.trim());

export const parsePositiveInt = (
  value,
  { min = 1, max = Number.MAX_SAFE_INTEGER, defaultValue = null } = {},
) => {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: defaultValue };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return { valid: false, value: null };
  }

  if (parsed < min || parsed > max) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
};
