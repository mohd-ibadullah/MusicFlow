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
  const [isHovered, setIsHovered] = useState(false);

  // Data validation and fallbacks
  const safeName = name && typeof name === 'string' ? name : "Untitled Playlist";
  const safeId = id && typeof id === 'string' ? id : null;
  const safeSongCount = typeof songCount === 'number' ? songCount : 0;
  
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group cursor-pointer transition-all duration-500 ${
        !safeId ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <div className="relative rounded-xl p-5 bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
        <div className="relative overflow-hidden rounded-lg mb-4">
          {/* Playlist Image/Icon */}
          <div 
            className="w-full aspect-square rounded-xl flex items-center justify-center text-white text-6xl font-bold relative overflow-hidden"
            style={{
              background: image && typeof image === 'string' 
                ? `url(${image}) center/cover` 
                : defaultImage
            }}
          >
            {!image && (
              <div className="absolute inset-0 bg-blue-500 flex items-center justify-center">
                <Music2 className="w-16 h-16 text-white" aria-hidden />
              </div>
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
            
            {/* Play Button Overlay - Only show if playlist is available and has songs */}
            {safeId && safeSongCount > 0 && (
              <div className={`absolute bottom-3 right-3 transform transition-all duration-300 ${
                isHovered ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-0 scale-95'
              }`}>
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className={`font-bold text-lg truncate leading-tight transition-colors duration-200 ${
            safeId 
              ? 'text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400' 
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
          <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-blue-500/20 transition-all duration-200 pointer-events-none" />
        )}
      </div>
    </div>
  );
});

PlaylistItem.displayName = "PlaylistItem";

export default PlaylistItem;