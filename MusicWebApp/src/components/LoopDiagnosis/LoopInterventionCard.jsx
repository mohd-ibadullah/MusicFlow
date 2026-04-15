// SYSTEM SCAN: player controls already run in PlayerContext; this card must not autoplay tracks.
// SYSTEM SCAN: app uses non-blocking overlays and toasts, so intervention UI must remain optional.
// SYSTEM SCAN: loop events are resolved through API/socket actions and should support ignored expiry.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./LoopInterventionCard.css";

const EXPIRY_MS = 45000;
const UNKNOWN_TEXT_PATTERN = /^unknown(?:\s+\w+)?$/i;

const isMeaningfulText = (value) =>
  typeof value === "string" && value.trim().length > 0 && !UNKNOWN_TEXT_PATTERN.test(value.trim());

const formatDurationPhrase = (minutes) => {
  const numericValue = Number(minutes);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue < 1) {
    return "less than a minute";
  }

  const roundedMinutes = Math.round(numericValue);
  if (roundedMinutes <= 1) {
    return "about 1 minute";
  }

  return `about ${roundedMinutes} minutes`;
};

const normalizeMinuteMentions = (text) =>
  text.replace(/(?:about\s+)?(\d+(?:\.\d+)?)\s*minutes?/gi, (_, value) => formatDurationPhrase(value));

export function LoopInterventionCard({
  intervention,
  onDismiss,
  onIgnored,
  onBridgePlayed,
  onBreakTaken,
  onSnooze,
  onSwitchMix,
  onPlay,
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const actionTakenRef = useRef(false);
  const normalizedIntervention = useMemo(() => {
    if (!intervention) return null;

    const triggerCategory = intervention.triggerCategory || intervention.category || "loop";
    const interventionType =
      intervention.interventionType ||
      intervention.type ||
      (triggerCategory === "session" ? "health_nudge" : "fallback_random");

    return {
      ...intervention,
      triggerCategory,
      interventionType,
      category: triggerCategory,
      type: interventionType,
    };
  }, [intervention]);

  const cardLabel = useMemo(() => {
    if (!normalizedIntervention) return "";
    if (
      normalizedIntervention.interventionType === "health_nudge" ||
      normalizedIntervention.triggerCategory === "session"
    ) {
      return normalizedIntervention.isLateNight ? "Late-night wellbeing reminder" : "Wellbeing check-in";
    }
    return normalizedIntervention.isLateNight ? "Late-night loop detected" : "Loop detected";
  }, [normalizedIntervention]);

  useEffect(() => {
    if (!normalizedIntervention) {
      setVisible(false);
      setExiting(false);
      return undefined;
    }

    actionTakenRef.current = false;
    // Reset transition flags so each new intervention starts visible.
    setVisible(false);
    setExiting(false);

    const enterTimer = setTimeout(() => setVisible(true), 120);
    const expireTimer = setTimeout(() => {
      handleIgnore();
    }, EXPIRY_MS);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(expireTimer);
    };
  }, [normalizedIntervention]);

  const {
    loopedSong,
    bridgeSong,
    replayCount,
    sessionDurationMinutes,
    triggerCategory,
    interventionType,
    message,
  } = normalizedIntervention || {};

  const isHealthNudge = interventionType === "health_nudge" || triggerCategory === "session";
  const hasBridgeTrack = !!bridgeSong?._id;

  const sessionDurationLabel = useMemo(() => {
    return formatDurationPhrase(sessionDurationMinutes);
  }, [sessionDurationMinutes]);

  const safeReplayCount = useMemo(() => {
    const value = Number(replayCount);
    if (!Number.isFinite(value) || value <= 0) return 2;
    return Math.round(value);
  }, [replayCount]);

  const loopedSongTitle = useMemo(() => {
    if (isMeaningfulText(loopedSong?.title)) return loopedSong.title.trim();
    return "this track";
  }, [loopedSong]);

  const displayTitle = useMemo(() => {
    if (isMeaningfulText(bridgeSong?.title)) return bridgeSong.title.trim();
    if (isHealthNudge) return "Calm track suggestion";
    if (hasBridgeTrack) return "Fresh track suggestion";
    return "Quick reset check-in";
  }, [bridgeSong, hasBridgeTrack, isHealthNudge]);

  const displayArtist = useMemo(() => {
    if (isMeaningfulText(bridgeSong?.artist)) return bridgeSong.artist.trim();
    if (isHealthNudge || hasBridgeTrack) return "MusicFlow";
    return "";
  }, [bridgeSong, hasBridgeTrack, isHealthNudge]);

  const displayMessage = useMemo(() => {
    const fallback = isHealthNudge
      ? `You've been listening for ${sessionDurationLabel}. Want to take a short break?`
      : hasBridgeTrack
        ? "A quick switch can help keep your listening fresh."
        : "No track switch right now. You can keep listening or take a short pause.";

    if (!message || typeof message !== "string") return fallback;

    const cleanedMessage = normalizeMinuteMentions(message.replace(/\s+/g, " ").trim());
    return cleanedMessage || fallback;
  }, [hasBridgeTrack, isHealthNudge, message, sessionDurationLabel]);

  const snoozeLabel = useMemo(() => {
    const seconds = Number(normalizedIntervention?.snoozeSeconds);
    if (Number.isFinite(seconds) && seconds > 0 && seconds < 120) {
      return `Snooze ${Math.round(seconds)} sec`;
    }
    return "Snooze 30 min";
  }, [normalizedIntervention]);

  if (!normalizedIntervention) return null;

  const handleIgnore = () => {
    if (actionTakenRef.current) return;
    actionTakenRef.current = true;
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onIgnored?.();
    }, 280);
  };

  const handleDismiss = () => {
    actionTakenRef.current = true;
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 280);
  };

  const handlePlay = () => {
    actionTakenRef.current = true;
    onBridgePlayed?.();
    onPlay?.(bridgeSong);

    setTimeout(() => {
      setVisible(false);
    }, 280);
  };

  const handleBreak = () => {
    actionTakenRef.current = true;
    onBreakTaken?.();
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
    }, 280);
  };

  const handleSnooze = () => {
    actionTakenRef.current = true;
    onSnooze?.();
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
    }, 280);
  };

  const handleSwitchMix = () => {
    actionTakenRef.current = true;
    onSwitchMix?.();
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
    }, 280);
  };

  const card = (
    <div
      className={`ld-card ${visible ? "ld-card--visible" : ""} ${exiting ? "ld-card--exiting" : ""}`}
      role="dialog"
      aria-label="Loop diagnosis bridge suggestion"
      aria-live="polite"
    >
      <button className="ld-card__dismiss" onClick={handleDismiss} aria-label="Dismiss">
        x
      </button>

      <div className="ld-card__header">
        <span className="ld-card__label">{cardLabel}</span>
        <span className="ld-card__count">
          {isHealthNudge
            ? `${sessionDurationLabel} of continuous listening`
            : `${safeReplayCount}x "${loopedSongTitle}"`}
        </span>
      </div>

      <div className="ld-card__bridge">
        {hasBridgeTrack && bridgeSong?.coverImage ? (
          <img src={bridgeSong.coverImage} alt={displayTitle} className="ld-card__cover" />
        ) : (
          <div className="ld-card__cover ld-card__cover--placeholder" aria-hidden="true">
            {isHealthNudge || hasBridgeTrack ? "mix" : "tip"}
          </div>
        )}

        <div className="ld-card__info">
          <p className="ld-card__bridge-label">
            {isHealthNudge ? "Optional calm mix" : hasBridgeTrack ? "Optional next track" : "Quick check-in"}
          </p>
          <p className="ld-card__title">{displayTitle}</p>
          {displayArtist ? <p className="ld-card__artist">{displayArtist}</p> : null}
          <p className="ld-card__message">{displayMessage}</p>
        </div>
      </div>

      {isHealthNudge ? (
        <div className="ld-card__actions ld-card__actions--stacked">
          <button className="ld-card__play" onClick={handleBreak}>
            Take 2-min break
          </button>
          <button className="ld-card__skip" onClick={handleSnooze}>
            {snoozeLabel}
          </button>
          <button className="ld-card__mix" onClick={handleSwitchMix}>
            Switch to calm mix
          </button>
          <button className="ld-card__skip" onClick={handleDismiss}>
            Not now
          </button>
        </div>
      ) : (
        <div className="ld-card__actions">
          {hasBridgeTrack ? (
            <button className="ld-card__play" onClick={handlePlay}>
              Play this track
            </button>
          ) : (
            <button className="ld-card__play ld-card__play--soft" onClick={handleDismiss}>
              Got it
            </button>
          )}
          <button className="ld-card__skip" onClick={handleDismiss}>
            Not now
          </button>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") {
    return card;
  }

  return createPortal(card, document.body);
}
