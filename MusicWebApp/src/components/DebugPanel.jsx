// components/DebugPanel.jsx - Development debugging component
import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';

const DebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    songsData = [], 
    albumsData = [], 
    playlists = [], 
    track, 
    playStatus, 
    currentPlaylist = [],
    currentPlaylistIndex 
  } = usePlayer();

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      {/* Debug Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
        title="Debug Panel"
      >
        🐛
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-4 max-w-sm w-full max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Debug Panel</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-2 text-xs">
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Songs:</strong> {songsData.length}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Albums:</strong> {albumsData.length}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Playlists:</strong> {playlists.length}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Current Track:</strong> {track?.name || 'None'}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Playing:</strong> {playStatus ? 'Yes' : 'No'}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Playlist Index:</strong> {currentPlaylistIndex}
            </div>
            <div>
              <strong className="text-gray-700 dark:text-gray-300">Playlist Length:</strong> {currentPlaylist.length}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                console.log('🎵 Music App Debug Info:', {
                  songsData,
                  albumsData,
                  playlists,
                  track,
                  playStatus,
                  currentPlaylist,
                  currentPlaylistIndex
                });
              }}
              className="btn-primary w-full px-3 py-2 text-xs rounded-lg"
            >
              Log to Console
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DebugPanel;
