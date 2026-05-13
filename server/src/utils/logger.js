const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const DEFAULT_LEVEL = process.env.NODE_ENV === "production" ? "warn" : "info";
const configuredLevel = `${process.env.LOG_LEVEL || DEFAULT_LEVEL}`.toLowerCase();
const currentLevel = LEVELS[configuredLevel] ?? LEVELS[DEFAULT_LEVEL];

const writeLog = (level, message, meta) => {
  if ((LEVELS[level] ?? LEVELS.info) < currentLevel) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
};

export const logger = {
  debug: (message, meta = {}) => writeLog("debug", message, meta),
  info: (message, meta = {}) => writeLog("info", message, meta),
  warn: (message, meta = {}) => writeLog("warn", message, meta),
  error: (message, meta = {}) => writeLog("error", message, meta),
};
