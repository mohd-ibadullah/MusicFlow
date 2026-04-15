// components/PlaylistItem.jsx
import React, { useState, memo } from "react";
import { Play, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ThemeContext";
import { usePlayer } from "../context/PlayerContext";

const PlaylistItem = memo(({ id, name, songCount = 0, image }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playPlaylist } = usePlayer();
  const [imgError, setImgError] = useState(false);

  // Data validation and fallbacks
  const safeName = name && typeof name === 'string' ? name : "Untitled Playlist";
  const safeId = id && typeof id === 'string' ? id : null;
  const safeSongCount = typeof songCount === 'number' ? songCount : 0;
  const safeImage = image && typeof image === 'string' ? image.trim() : "";
  const hasPlayableImage = !!safeImage && !imgError;
  
  // Default playlist image with gradient
  const defaultImage = `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)`;

  const handleClick = () => {
    if (safeId) {
      navigate(`/playlist/${safeId}`);
    } else {
      showToast("This playlist is not available", "error");
    }
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (safeId && safeSongCount > 0) {
      playPlaylist(safeId);
    } else if (safeSongCount === 0) {
      showToast("This playlist is empty", "info");
    } else {
      showToast("Cannot play this playlist", "error");
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group/playlist-content relative rounded-xl overflow-hidden cursor-pointer transform-gpu transition-all duration-300 hover:-translate-y-0.5 ${
        !safeId ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <div className="relative rounded-xl p-5 bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 shadow-sm transition-all duration-300 group-hover/playlist-content:shadow-md">
        <div className="relative overflow-hidden rounded-xl mb-4">
          <div className="w-full aspect-square rounded-xl relative overflow-hidden bg-blue-500">
            {hasPlayableImage ? (
              <img
                src={safeImage}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/playlist-content:scale-[1.02]"
                alt={safeName}
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: defaultImage }}
              >
                <Music2 className="w-16 h-16 text-white" aria-hidden />
              </div>
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover/playlist-content:opacity-20 transition-opacity duration-300" />
            
            {/* Play Button Overlay - Only show if playlist is available and has songs */}
            {safeId && safeSongCount > 0 && (
              <div className="absolute bottom-3 right-3 transform transition-all duration-300 translate-y-2 opacity-0 scale-95 group-hover/playlist-content:translate-y-0 group-hover/playlist-content:opacity-100 group-hover/playlist-content:scale-100">
                <button 
                  onClick={handlePlayClick}
                  className="btn-primary p-2 min-w-0 w-12 h-12 flex items-center justify-center shadow-md"
                >
                  <Play className="w-5 h-5 text-white shrink-0 ml-0.5" size={20} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Empty Playlist Badge */}
            {safeSongCount === 0 && (
              <div className="absolute top-3 left-3 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                Empty
              </div>
            )}

            {/* Unavailable Badge */}
            {!safeId && (
              <div className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                Unavailable
              </div>
            )}

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover/playlist-content:opacity-100 transition-opacity duration-300" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className={`font-bold text-lg truncate leading-tight transition-colors duration-200 ${
            safeId 
              ? 'text-gray-900 dark:text-gray-100 group-hover/playlist-content:text-blue-600 dark:group-hover/playlist-content:text-blue-400' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {safeName}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {safeSongCount === 0 
              ? 'No songs yet' 
              : `${safeSongCount} ${safeSongCount === 1 ? 'song' : 'songs'}`
            }
          </p>
        </div>

        {/* Hover Border Effect - Only for available playlists */}
        {safeId && (
          <div className="absolute inset-0 rounded-xl ring-0 group-hover/playlist-content:ring-1 group-hover/playlist-content:ring-blue-500/25 transition-all duration-300 pointer-events-none" />
        )}
      </div>
    </div>
  );
});

PlaylistItem.displayName = "PlaylistItem";

export default PlaylistItem;