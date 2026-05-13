// components/Player.jsx
import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Flame, Heart } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { useTheme } from "../context/ThemeContext";

const Player = () => {
  const {
    track,
    seekBg,
    seekBar,
    playStatus,
    volume,
    isShuffled,
    isRepeating,
    play,
    pause,
    togglePlay,
    previous,
    next,
    seekSong,
    toggleShuffle,
    toggleRepeat,
    handleVolumeChange,
    toggleLikeSong,
    isSongLiked,
    activeListenersCount,
    currentPlaylist
  } = usePlayer();
  
  const { isDark } = useTheme();
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const volumeRef = useRef(null);

  const isLiked = track ? isSongLiked(track._id) : false;

  // Local time state to prevent global re-renders
  const [time, setTime] = useState({
    currentTime: { second: 0, minute: 0 },
    totalTime: { second: 0, minute: 0 },
  });

  const { audioRef } = usePlayer();

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleTimeUpdate = () => {
      if (audioElement.duration && seekBar.current) {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        seekBar.current.style.width = `${progress}%`;
        
        setTime({
          currentTime: {
            second: Math.floor(audioElement.currentTime % 60).toString().padStart(2, "0"),
            minute: Math.floor(audioElement.currentTime / 60),
          },
          totalTime: {
            second: (Math.floor(audioElement.duration % 60) || 0).toString().padStart(2, "0"),
            minute: Math.floor(audioElement.duration / 60) || 0,
          },
        });
      }
    };

    const handleLoadedMetadata = () => {
      if (audioElement.duration) {
        setTime(prev => ({
          ...prev,
          totalTime: {
            second: Math.floor(audioElement.duration % 60).toString().padStart(2, "0"),
            minute: Math.floor(audioElement.duration / 60),
          },
        }));
      }
    };

    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [audioRef, track]); // Also re-run when track changes

  // Close volume popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (volumeRef.current && !volumeRef.current.contains(event.target)) {
        setIsVolumeOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!track) {
    return (
      <div className="h-[5.5rem] bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-all duration-500">
        <div className="text-center">
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium">No track selected</p>
          <p className="text-xs mt-1 opacity-75">Choose a song to start listening</p>
        </div>
      </div>
    );
  }

  const formatTime = (timeObj) => {
    if (!timeObj) return "0:00";
    return `${timeObj.minute || 0}:${(timeObj.second || 0).toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-[5.5rem] bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 px-3 sm:px-4 lg:px-5 transition-all duration-500">
      <div className="max-w-7xl mx-auto h-full flex items-center gap-2 lg:gap-3">
        
        {/* Track Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 basis-[35%] xl:basis-[32%] pr-2 lg:pr-4 border-r border-gray-200/60 dark:border-gray-700/60">
          <img 
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover shadow-lg" 
            src={track.image} 
            alt={track.name} 
          />
          <div className="min-w-0 flex-1 hidden sm:block">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">
              {track.name || "Unknown Track"}
            </h4>
            <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
              {track.desc || "No description"}
            </p>
          </div>
          <button 
            onClick={() => toggleLikeSong(track._id)}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isLiked 
                ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-500/10' 
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/70'
            }`}
            title={isLiked ? "Remove from liked songs" : "Add to liked songs"}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} aria-hidden />
          </button>
        </div>

        {/* Player Controls */}
        <div className="flex flex-col items-center justify-center gap-1.5 flex-1 min-w-0 px-2 sm:px-3">
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
            {/* Shuffle Button */}
            <button 
              onClick={toggleShuffle}
              className={`transition-all duration-200 ${
                isShuffled 
                  ? 'text-blue-500' 
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={isShuffled ? "Disable shuffle" : "Enable shuffle"}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
              </svg>
            </button>
            
            {/* Previous Button */}
            <button 
              onClick={previous}
              disabled={!currentPlaylist || currentPlaylist.length <= 1}
              className={`transition-colors duration-200 ${
                !currentPlaylist || currentPlaylist.length <= 1
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
              title="Previous song"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
              </svg>
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="btn-primary p-0 min-w-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center"
              title={playStatus ? "Pause" : "Play"}
            >
              {playStatus ? (
                <Pause className="w-6 h-6 text-white shrink-0" size={24} strokeWidth={2.5} />
              ) : (
                <Play className="w-6 h-6 text-white shrink-0 ml-0.5" size={24} strokeWidth={2.5} />
              )}
            </button>

            {/* Next Button */}
            <button 
              onClick={() => next({ reason: "manual" })}
              disabled={!currentPlaylist || currentPlaylist.length <= 1}
              className={`transition-colors duration-200 ${
                !currentPlaylist || currentPlaylist.length <= 1
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
              title="Next song"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z" />
              </svg>
            </button>

            {/* Repeat Button */}
            <button 
              onClick={toggleRepeat}
              className={`transition-all duration-200 ${
                isRepeating 
                  ? 'text-blue-500' 
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={isRepeating ? "Disable repeat" : "Enable repeat"}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-2 sm:gap-3 w-[88%] max-w-[21rem] mx-auto">
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-11 text-right hidden sm:block">
              {formatTime(time.currentTime)}
            </span>
            <div
              onClick={seekSong}
              ref={seekBg}
              className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer group relative"
            >
              <div
                ref={seekBar}
                className="h-full bg-blue-500 rounded-full relative group-hover:bg-blue-600 transition-colors duration-200"
              >
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg" />
              </div>
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-11 hidden sm:block">
              {formatTime(time.totalTime)}
            </span>
          </div>
        </div>

        {/* Volume Control */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 xl:gap-4 min-w-0 basis-[29%] xl:basis-[30%] pl-3 lg:pl-5 border-l border-gray-200/60 dark:border-gray-700/60">
          <div className="relative" ref={volumeRef}>
            <button
              onClick={() => setIsVolumeOpen(!isVolumeOpen)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors duration-300"
              title="Volume control"
            >
              {volume === 0 ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.95 4.929a1 1 0 011.414 0 9.972 9.972 0 012.929 7.071 9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0014 12a7.971 7.971 0 00-2.343-5.657 1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0113 12a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0011 12a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
              ) : volume < 50 ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.95 4.929a1 1 0 011.414 0A9.972 9.972 0 0117 12a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0015 12a7.971 7.971 0 00-2.343-5.657 1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Volume Popup */}
            {isVolumeOpen && (
              <div className="absolute bottom-12 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-200 dark:border-gray-700 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Volume</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300">{volume}%</span>
                </div>
                <div
                  className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
                    handleVolumeChange(Math.round(percent * 100));
                  }}
                >
                  <div 
                    className="h-full bg-blue-500 rounded-full relative transition-all duration-150"
                    style={{ width: `${volume}%` }}
                  >
                    <div 
                      className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-lg cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const handleMouseMove = (moveEvent) => {
                          const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                          const percent = Math.min(Math.max((moveEvent.clientX - rect.left) / rect.width, 0), 1);
                          handleVolumeChange(Math.round(percent * 100));
                        };
                        
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="w-16 sm:w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer hidden md:block xl:mr-7"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
              handleVolumeChange(Math.round(percent * 100));
            }}
          >
            <div 
              className="h-full bg-blue-500 dark:bg-blue-600 rounded-full relative transition-all duration-150"
              style={{ width: `${volume}%` }}
            />
          </div>
          
          {/* Live listeners indicator */}
          <div className="hidden xl:flex ml-2 items-center rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200/60 dark:border-orange-500/30 px-2.5 py-1.5">
            <span className="whitespace-nowrap text-xs flex text-right font-semibold text-orange-600 dark:text-orange-400 items-center gap-1.5">
              <Flame className="w-4 h-4 shrink-0" />
              {activeListenersCount} listening
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Player;