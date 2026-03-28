import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Music2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ThemeContext';

const AddToPlaylistDropdown = ({ songId, isOpen, onClose }) => {
  const { playlists, addSongToPlaylist } = usePlayer();
  const { showToast } = useToast();
  const dropdownRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleAddToPlaylist = async (playlistId) => {
    setIsLoading(true);
    try {
      const result = await addSongToPlaylist(playlistId, songId);
      if (result.success) {
        // Toast is already shown by addSongToPlaylist function
        onClose();
      } else {
        showToast(result.message || "Failed to add song to playlist.", "error");
      }
    } catch (error) {
      console.error("Error adding song to playlist:", error);
      showToast("An unexpected error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div
        ref={dropdownRef}
        className="add-to-playlist-modal relative z-10 w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-hidden transform transition-all duration-200 scale-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-modal-title"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 id="playlist-modal-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Add to Playlist
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {playlists.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Music2 className="w-8 h-8 text-blue-600 dark:text-blue-400" aria-hidden />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-2 font-medium">No playlists available</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mb-6">Create a playlist first to add songs</p>
              <button
                onClick={() => {
                  onClose();
                  showToast('Create your first playlist from the sidebar!', 'info');
                }}
                className="btn-primary rounded-xl text-sm"
              >
                Create Playlist
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {playlists.map((playlist) => (
                <button
                  key={playlist._id}
                  onClick={() => handleAddToPlaylist(playlist._id)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent group"
                  aria-label={`Add song to ${playlist.name}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                      <Music2 className="w-6 h-6 text-white" aria-hidden />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {playlist.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {playlist.songs?.length || 0} {playlist.songs?.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddToPlaylistDropdown;