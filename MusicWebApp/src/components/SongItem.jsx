import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Play, Pause, Heart } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import AddToPlaylistDropdown from "./AddToPlaylistDropdown";

/**
 * SongItem Component
 * Displays an individual song with play, like, and interaction controls
 *
 * @param {Object} props
 * @param {string} props.image - URL of the song's cover image
 * @param {string} props.name - Name of the song
 * @param {string} props.desc - Description
 * @param {string} props.artist - Artist name
 * @param {string} props.language - Language (optional, shown with artist)
 * @param {string} props.id - Unique identifier for the song
 * @param {string} props.duration - Song duration in MM:SS format
 * @param {string} props.album - Album name
 * @param {Array} [props.playlist] - Optional playlist for Play button (queue)
 */
const SongItem = ({ image, name, desc, artist, language, id, duration, album, playlist }) => {
  // Context hooks for playback and like state
  const {
    playWithId,
    isSongLiked,
    toggleLikeSong,
    songsData,
    track,
    playStatus,
    pause,
    play,
    togglePlay
  } = usePlayer();
  const { showToast } = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);

  // Validate and fallback song data
  const artistLanguage = [artist, language].filter(Boolean).join(" • ") || "—";

  const safeValues = useMemo(() => ({
    image: image && typeof image === "string" ? image : "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=300&h=300&fit=crop&crop=center",
    name: name && typeof name === "string" ? name : "Untitled",
    desc: desc && typeof desc === "string" ? desc : "",
    id: id && typeof id === "string" ? id : null,
    duration: duration && typeof duration === "string" ? duration : "0:00",
    album: album && typeof album === "string" ? album : "Single",
    artistLanguage
  }), [image, name, desc, id, duration, album, artist, language]);

  const { image: safeImage, name: safeName, desc: safeDesc, id: safeId, duration: safeDuration, album: safeAlbum, artistLanguage: safeArtistLanguage } = safeValues;

  // Determine if this song is liked and currently playing
  const isLiked = safeId ? isSongLiked(safeId) : false;
  const isCurrentlyPlaying = track && track._id === safeId && playStatus;

  // Play button handler: ensures only one song plays at a time
  const handlePlay = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!safeId) {
        showToast("This song is not available", "error");
        return;
      }
      
      setIsLoading(true);
      
      try {
        // If already playing, pause; else play this song
        if (isCurrentlyPlaying) {
          pause();
          showToast(`Paused: ${safeName}`, "info");
        } else {
          const queue = Array.isArray(playlist) && playlist.length > 0 ? playlist : songsData;
          playWithId(safeId, queue);
        }
      } catch (error) {
        console.error('Play error:', error);
        showToast("Failed to play song", "error");
      } finally {
        // Reset loading state after a short delay
        setTimeout(() => setIsLoading(false), 500);
      }
    },
    [safeId, safeName, isCurrentlyPlaying, playWithId, songsData, playlist, pause, showToast]
  );

  // Keyboard accessibility for play
  const handleKeyPress = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePlay(e);
    }
  }, [handlePlay]);

  // Like button handler: toggles like/unlike and updates UI instantly
  const handleLike = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!safeId) {
        showToast("Cannot like unavailable song", "error");
        return;
      }
      
      try {
        toggleLikeSong(safeId);
      } catch (error) {
        console.error('Like error:', error);
        showToast("Failed to update like status", "error");
      }
    },
    [safeId, toggleLikeSong, showToast]
  );

  // Image error fallback
  const handleImageError = useCallback(() => {
    setImgError(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsLoading(false);
      setIsHovered(false);
    };
  }, []);

  // Loading indicator
  if (isLoading) {
    return (
      <div className="animate-pulse bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="rounded-xl mb-4 aspect-square bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-2">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyPress}
      tabIndex={0}
      role="article"
      aria-label={`Song: ${safeName} by ${safeArtistLanguage}`}
      className={`group relative rounded-xl p-5 bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${
        !safeId ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      } ${isLoading ? "animate-pulse" : ""}`}
    >
      <div className="relative overflow-hidden rounded-xl mb-3 aspect-square shadow-inner">
        <img
          src={imgError ? "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=300&h=300&fit=crop&crop=center" : safeImage}
          onError={handleImageError}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          alt={safeName}
        />
        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300" />

        {/* Play Button Overlay - Only one song plays at a time */}
        {safeId && (
          <div
            className={`absolute bottom-3 right-3 transform transition-all duration-300 z-10 ${
              isHovered ? "translate-y-0 opacity-100 scale-100" : "translate-y-0 opacity-90 scale-100"
            }`}
          >
            <button
              onClick={handlePlay}
              className={`btn-primary p-2 min-w-0 w-12 h-12 flex items-center justify-center shadow-lg hover:scale-105 transition-transform duration-200 ${
                isCurrentlyPlaying ? "!bg-blue-600 hover:!bg-blue-700" : ""
              }`}
              title={isCurrentlyPlaying ? "Pause" : "Play"}
              aria-label={isCurrentlyPlaying ? `Pause ${safeName}` : `Play ${safeName}`}
              role="button"
              tabIndex={0}
            >
              {isCurrentlyPlaying ? (
                <Pause className="w-5 h-5 text-white shrink-0" size={20} strokeWidth={2.5} />
              ) : (
                <Play className="w-5 h-5 text-white shrink-0 ml-0.5" size={20} strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}

        {/* Like Button Overlay - instant UI update */}
        {safeId && (
          <div
            className={`absolute top-3 right-3 transform transition-all duration-300 z-10 ${
              isHovered ? "translate-y-0 opacity-100 scale-100" : "translate-y-0 opacity-90 scale-100"
            }`}
          >
            <button
              onClick={handleLike}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition-all duration-200 ${
                isLiked
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-white/30 text-gray-800 hover:bg-white/50 dark:bg-gray-700/30 dark:text-gray-200 dark:hover:bg-gray-700/50"
              }`}
              title={isLiked ? "Remove from liked songs" : "Add to liked songs"}
              aria-label={isLiked ? `Remove ${safeName} from liked songs` : `Add ${safeName} to liked songs`}
              role="button"
              aria-pressed={isLiked}
              tabIndex={0}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} aria-hidden />
            </button>
          </div>
        )}

        {/* Add to Playlist Button Overlay */}
        {safeId && (
          <div
            className={`absolute top-3 left-3 transform transition-all duration-300 z-20 ${
              isHovered ? "translate-y-0 opacity-100 scale-100" : "translate-y-0 opacity-90 scale-100"
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowAddToPlaylist(true);
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition-all duration-200 bg-white/30 text-gray-800 hover:bg-white/50 dark:bg-gray-700/30 dark:text-gray-200 dark:hover:bg-gray-700/50"
              title="Add to playlist"
              aria-label={`Add ${safeName} to playlist`}
              role="button"
              tabIndex={0}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Add to Playlist Modal (mounted outside hover visual stack) */}
        {safeId && (
          <AddToPlaylistDropdown
            songId={safeId}
            isOpen={showAddToPlaylist}
            onClose={() => setShowAddToPlaylist(false)}
          />
        )}

        {/* Unavailable Badge */}
        {!safeId && (
          <div className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
            Unavailable
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="space-y-1.5">
        <h3 className={`font-semibold text-base truncate leading-tight transition-colors duration-200 ${
          safeId
            ? "text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400"
            : "text-gray-500 dark:text-gray-400"
        }`}>
          {safeName}
        </h3>
        {safeDesc && (
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed line-clamp-2">
            {safeDesc}
          </p>
        )}
        <p className="text-gray-500 dark:text-gray-400 text-sm truncate">{safeArtistLanguage}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{safeDuration}</p>
      </div>

      {/* Hover ring - Only for available songs */}
      {safeId && (
        <div className="absolute inset-0 rounded-xl ring-0 group-hover:ring-2 group-hover:ring-blue-500/30 transition-all duration-200 pointer-events-none" />
      )}
    </div>
  );
};

// Wrap with Error Boundary
const WrappedSongItem = (props) => (
  <ErrorBoundary onReset={() => window.location.reload()}>
    <SongItem {...props} />
  </ErrorBoundary>
);

export default React.memo(WrappedSongItem);
