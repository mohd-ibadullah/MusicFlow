const isDevelopment = process.env.NODE_ENV === "development";

export const sendServerError = (
  res,
  message = "Internal server error",
  error = null,
) => {
  const response = {
    success: false,
    message,
  };

  if (isDevelopment && error?.message) {
    response.error = error.message;
  }

  return res.status(500).json(response);
};

export const sendValidationError = (res, message) =>
  res.status(400).json({
    success: false,
    message,
  });

export const sendUnauthorizedError = (res, message = "Unauthorized") =>
  res.status(401).json({
    success: false,
    message,
  });

export const sendForbiddenError = (res, message = "Access denied") =>
  res.status(403).json({
    success: false,
    message,
  });
