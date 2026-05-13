// SYSTEM SCAN: auth token is stored as localStorage key "token" and axios auth header is configured in AuthContext.
// SYSTEM SCAN: the player state is managed by PlayerContext and playWithId is the canonical playback entry point.
// SYSTEM SCAN: default socket server exists at /socket.io and this feature must use /loopDiagnosis namespace only.

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const LOOP_DIAGNOSIS_ENABLED = import.meta.env.VITE_LOOP_DIAGNOSIS_ENABLED === "true";
const SOCKET_ENV_URL = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = import.meta.env.VITE_API_URL || "";
const DEV_SOCKET_FALLBACK_URL = "http://127.0.0.1:4002";
const UNKNOWN_TEXT_PATTERN = /^unknown(?:\s+\w+)?$/i;

const buildSocketTargets = () => {
  const targets = [];

  if (SOCKET_ENV_URL) {
    targets.push(SOCKET_ENV_URL);
  } else {
    // Same-origin route lets Vite proxy /socket.io during local dev.
    targets.push("");
  }

  if (import.meta.env.DEV && !SOCKET_ENV_URL) {
    targets.push(DEV_SOCKET_FALLBACK_URL);
  }

  return Array.from(new Set(targets));
};

const isMeaningfulText = (value) =>
  typeof value === "string" && value.trim().length > 0 && !UNKNOWN_TEXT_PATTERN.test(value.trim());

const normalizeSongPayload = (song, { requireId = false } = {}) => {
  if (!song) return null;

  if (typeof song === "string") {
    const trimmedId = song.trim();
    if (!trimmedId) return null;
    return {
      _id: trimmedId,
      title: null,
      artist: null,
      coverImage: null,
    };
  }

  if (typeof song !== "object") return null;

  const songId = song._id || song.id || null;
  if (requireId && !songId) return null;

  const titleCandidate = song.title || song.name || null;
  const artistCandidate = song.artist || null;
  const title = isMeaningfulText(titleCandidate) ? titleCandidate.trim() : null;
  const artist = isMeaningfulText(artistCandidate) ? artistCandidate.trim() : null;

  if (!songId && !title && !artist) return null;

  return {
    _id: songId,
    title,
    artist,
    coverImage: song.coverImage || song.image || null,
  };
};

const requiresBridgeTrack = (triggerCategory, interventionType) =>
  (triggerCategory === "loop" || triggerCategory === "combined") && interventionType !== "health_nudge";

const normalizeInterventionPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;

  const nestedData = payload.data && typeof payload.data === "object" ? payload.data : null;
  const source = nestedData ? { ...payload, ...nestedData } : payload;
  const triggerCategory = source.triggerCategory || source.category || null;
  const interventionType =
    source.interventionType ||
    source.type ||
    (triggerCategory === "session" ? "health_nudge" : null);
  const normalizedInterventionType =
    triggerCategory === "combined" && interventionType === "health_nudge"
      ? "fallback_random"
      : interventionType;
  const loopedSong = normalizeSongPayload(source.loopedSong || source.loopedSongId);
  const bridgeSong = normalizeSongPayload(source.bridgeSong || source.bridgeSongId, { requireId: true });

  if (requiresBridgeTrack(triggerCategory, normalizedInterventionType) && !bridgeSong) {
    return null;
  }

  return {
    ...source,
    triggerCategory,
    interventionType: normalizedInterventionType,
    category: triggerCategory,
    type: normalizedInterventionType,
    loopedSong,
    bridgeSong,
    message: typeof source.message === "string" ? source.message.trim() : null,
  };
};

const isRenderableIntervention = (payload) => {
  if (!payload) return false;

  const category = payload.triggerCategory;
  const type = payload.interventionType;

  if (requiresBridgeTrack(category, type) && !payload.bridgeSong?._id) {
    return false;
  }

  return (
    category === "loop" ||
    category === "combined" ||
    category === "session" ||
    type === "health_nudge"
  );
};

const mapHistoryEventToInterventionPayload = (event) => {
  if (!event || event.interventionStatus !== "triggered") return null;
  if (event.interventionType === "no_candidates") return null;

  const triggerCategory = event.triggerCategory || "loop";
  let interventionType =
    event.interventionType ||
    (triggerCategory === "session" ? "health_nudge" : "fallback_random");

  if (triggerCategory === "combined" && interventionType === "health_nudge") {
    interventionType = "fallback_random";
  }

  const loopedSongPayload = normalizeSongPayload(event.loopedSongId);
  const bridgeSongPayload = normalizeSongPayload(event.bridgeSongId, { requireId: true });

  if (requiresBridgeTrack(triggerCategory, interventionType) && !bridgeSongPayload) {
    return null;
  }

  return {
    loopEventId: event._id,
    triggerCategory,
    interventionType,
    replayCount: event.replayCount,
    sessionDurationMinutes: event.sessionDurationMinutes,
    loopedSong: loopedSongPayload,
    bridgeSong: bridgeSongPayload,
    wellbeingActions:
      interventionType === "health_nudge" || triggerCategory === "session"
        ? ["break", "snooze", "switch_mix"]
        : bridgeSongPayload
          ? ["play_bridge", "dismiss"]
          : ["dismiss"],
    message:
      interventionType === "health_nudge" || triggerCategory === "session"
        ? "You've been listening for a while. Want to take a short reset?"
        : "Looks like this track is repeating. Want to switch it up?",
    disclaimer: "Wellbeing reminders are supportive and not medical advice.",
  };
};

export function useLoopDiagnosis(token) {
  const [intervention, setIntervention] = useState(null);
  const [preferences, setPreferences] = useState({
    reminderStyle: "balanced",
    remindersMuted: false,
    quietHoursEnabled: false,
    quietHoursStart: 23,
    quietHoursEnd: 6,
    reminderCapPerDay: 4,
  });
  const socketRef = useRef(null);
  const interventionQueueRef = useRef([]);
  const suppressedInterventionIdsRef = useRef(new Map());

  const suppressIntervention = useCallback((loopEventId, ttlMs = 15000) => {
    if (!loopEventId) return;
    suppressedInterventionIdsRef.current.set(loopEventId, Date.now() + ttlMs);
  }, []);

  const isSuppressedIntervention = useCallback((loopEventId) => {
    if (!loopEventId) return false;

    const now = Date.now();
    for (const [id, expiresAt] of suppressedInterventionIdsRef.current.entries()) {
      if (!expiresAt || expiresAt <= now) {
        suppressedInterventionIdsRef.current.delete(id);
      }
    }

    const expiresAt = suppressedInterventionIdsRef.current.get(loopEventId);
    return !!expiresAt && expiresAt > now;
  }, []);

  const showIntervention = useCallback((rawPayload, source = "socket") => {
    const normalized = normalizeInterventionPayload(rawPayload);

    if (!normalized) {
      console.warn(`[LD][${source.toUpperCase()}] Ignoring intervention: invalid payload`);
      return;
    }

    if (!isRenderableIntervention(normalized)) {
      console.warn(
        `[LD][${source.toUpperCase()}] Ignoring intervention: unsupported category/type category=${normalized.triggerCategory} type=${normalized.interventionType}`
      );
      return;
    }

    setIntervention((current) => {
      const incomingId = normalized.loopEventId || null;

      if (incomingId && isSuppressedIntervention(incomingId)) {
        return current;
      }

      const isDuplicate =
        !!incomingId &&
        ((current?.loopEventId && current.loopEventId === incomingId) ||
          interventionQueueRef.current.some((item) => item?.loopEventId === incomingId));

      if (isDuplicate) {
        return current;
      }

      if (current) {
        interventionQueueRef.current.push(normalized);
        return current;
      }
      return normalized;
    });
  }, [isSuppressedIntervention]);

  const closeCurrentAndShowNext = useCallback((reason = "unknown", options = {}) => {
    const dropQueued = !!options.dropQueued;

    setIntervention(() => {
      if (dropQueued) {
        interventionQueueRef.current = [];
        return null;
      }

      const next = interventionQueueRef.current.shift() || null;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!LOOP_DIAGNOSIS_ENABLED || !token) return;

    const loadPreferences = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/loop-diagnosis/preferences`);
        if (response.data?.success && response.data?.preferences) {
          setPreferences((prev) => ({ ...prev, ...response.data.preferences }));
        }
      } catch (err) {
        console.warn("[LD] preferences fetch failed:", err.message);
      }
    };

    loadPreferences();
  }, [token]);

  useEffect(() => {
    if (!LOOP_DIAGNOSIS_ENABLED) {
      return undefined;
    }

    if (!token) {
      return undefined;
    }

    const socketTargets = buildSocketTargets();
    let disposed = false;
    let currentSocket = null;

    const connectWithTarget = (targetIndex) => {
      if (disposed) return;
      const target = socketTargets[targetIndex] || "";
      const namespaceUrl = target ? `${target}/loopDiagnosis` : "/loopDiagnosis";

      const socket = io(namespaceUrl, {
        path: "/socket.io",
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 8000,
        withCredentials: true,
      });

      currentSocket = socket;
      socketRef.current = socket;

      const recoverPendingIntervention = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/api/loop-diagnosis/history`);
          const events = Array.isArray(response.data?.events) ? response.data.events : [];
          const pending = events.find((event) => event?.interventionStatus === "triggered");

          if (!pending) return;

          const recoveredPayload = mapHistoryEventToInterventionPayload(pending);
          if (!recoveredPayload) return;
          showIntervention(recoveredPayload, "recovery");
        } catch (err) {
          console.warn("[LD][RECOVERY] history recovery failed:", err.message);
        }
      };

      socket.on("connect", () => {
        recoverPendingIntervention();
      });

      socket.on("ld:intervention", (rawPayload) => {
        showIntervention(rawPayload, "socket");
      });

      socket.on("connect_error", (err) => {
        console.warn(`[LD] Socket connection error via ${namespaceUrl}:`, err.message);

        const hasNextTarget = targetIndex + 1 < socketTargets.length;
        const shouldTryNextTarget = hasNextTarget && /ECONNREFUSED|xhr poll error|websocket error/i.test(err.message || "");

        if (shouldTryNextTarget) {
          console.warn("[LD] Retrying loop diagnosis socket with fallback target.");
          socket.disconnect();
          connectWithTarget(targetIndex + 1);
        }
      });

      socket.on("disconnect", () => {});
    };

    connectWithTarget(0);

    return () => {
      disposed = true;
      currentSocket?.disconnect();
      socketRef.current = null;
      interventionQueueRef.current = [];
    };
  }, [token, showIntervention]);

  useEffect(() => {
    if (!LOOP_DIAGNOSIS_ENABLED || !token) return undefined;

    let disposed = false;
    let polling = false;

    const pollPendingIntervention = async () => {
      if (disposed || polling) return;
      polling = true;

      try {
        const response = await axios.get(`${API_BASE_URL}/api/loop-diagnosis/history`);
        const events = Array.isArray(response.data?.events) ? response.data.events : [];
        const pending = events.find((event) => event?.interventionStatus === "triggered");

        if (!pending) return;

        const recoveredPayload = mapHistoryEventToInterventionPayload(pending);
        if (!recoveredPayload) return;

        showIntervention(recoveredPayload, "history-poll");
      } catch (err) {
        console.warn("[LD][POLL] pending intervention poll failed:", err.message);
      } finally {
        polling = false;
      }
    };

    const intervalId = setInterval(pollPendingIntervention, 2500);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [token, showIntervention]);

  useEffect(() => {
    if (!LOOP_DIAGNOSIS_ENABLED) return undefined;

    const onRemoteLoopUpdate = (e) => {
      const p = e.detail;
      if (!p?.loopEventId) return;

      setIntervention((current) => {
        const incomingId = String(p.loopEventId);
        if (!current || String(current.loopEventId) !== incomingId) {
          return current;
        }
        if (p.interventionStatus && p.interventionStatus !== "triggered") {
          return interventionQueueRef.current.shift() || null;
        }
        return current;
      });
    };

    window.addEventListener("musicflow:loop-updated", onRemoteLoopUpdate);
    return () => window.removeEventListener("musicflow:loop-updated", onRemoteLoopUpdate);
  }, []);

  const handleDismiss = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;

    if (!loopEventId) {
      console.warn("[LD] dismiss skipped: missing loopEventId");
      closeCurrentAndShowNext("dismiss-missing-id");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(`${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/dismiss`);
    } catch (err) {
      console.warn("[LD] dismiss request failed:", err.message);
    } finally {
      closeCurrentAndShowNext("dismiss", { dropQueued: true });
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const handleBridgePlayed = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;
    closeCurrentAndShowNext("bridge-played", { dropQueued: true });

    if (!loopEventId) {
      console.warn("[LD] bridge-played skipped: missing loopEventId");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(
        `${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/bridge-played`
      );
    } catch (err) {
      console.warn("[LD] bridge-played request failed:", err.message);
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const handleIgnored = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;

    if (!loopEventId) {
      console.warn("[LD] ignored skipped: missing loopEventId");
      closeCurrentAndShowNext("ignored-missing-id");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(`${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/ignored`);
    } catch (err) {
      console.warn("[LD] ignored request failed:", err.message);
    } finally {
      closeCurrentAndShowNext("ignored", { dropQueued: true });
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const handleBreakTaken = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;
    closeCurrentAndShowNext("break-taken", { dropQueued: true });

    if (!loopEventId) {
      console.warn("[LD] break action skipped: missing loopEventId");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(`${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/break`);
    } catch (err) {
      console.warn("[LD] break action failed:", err.message);
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const handleSnooze = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;
    closeCurrentAndShowNext("snooze", { dropQueued: true });

    if (!loopEventId) {
      console.warn("[LD] snooze action skipped: missing loopEventId");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(`${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/snooze`);
    } catch (err) {
      console.warn("[LD] snooze action failed:", err.message);
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const handleSwitchMix = useCallback(async () => {
    if (!intervention) return;

    const loopEventId = intervention.loopEventId;
    closeCurrentAndShowNext("switch-mix", { dropQueued: true });

    if (!loopEventId) {
      console.warn("[LD] switch mix action skipped: missing loopEventId");
      return;
    }

    suppressIntervention(loopEventId);

    try {
      await axios.post(`${API_BASE_URL}/api/loop-diagnosis/event/${loopEventId}/switch-mix`);
    } catch (err) {
      console.warn("[LD] switch mix action failed:", err.message);
    }
  }, [closeCurrentAndShowNext, intervention, suppressIntervention]);

  const updateReminderStyle = useCallback(async (reminderStyle) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/api/loop-diagnosis/preferences`, {
        reminderStyle,
      });

      if (response.data?.success && response.data?.preferences) {
        setPreferences((prev) => ({ ...prev, ...response.data.preferences }));
      }
    } catch (err) {
      console.warn("[LD] update reminder style failed:", err.message);
    }
  }, []);

  return {
    intervention,
    preferences,
    handleDismiss,
    handleBridgePlayed,
    handleIgnored,
    handleBreakTaken,
    handleSnooze,
    handleSwitchMix,
    updateReminderStyle,
  };
}
