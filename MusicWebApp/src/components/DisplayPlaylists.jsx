// components/DisplayPlaylists.jsx
import React, { useState, useMemo } from "react";
import { Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PlaylistItem from "./playlistItem";
import SkeletonLoader from "./SkeletonLoader";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const DisplayPlaylists = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playlists, createPlaylist, deletePlaylist } = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Filter playlists based on search query
  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists;
    
    const query = searchQuery.toLowerCase();
    return playlists.filter(playlist => {
      const name = playlist?.name || '';
      const desc = playlist?.desc || '';
      return name.toLowerCase().includes(query) || desc.toLowerCase().includes(query);
    });
  }, [playlists, searchQuery]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      showToast("Please enter a playlist name", "error");
      return;
    }

    setIsLoading(true);
    const result = await createPlaylist(newPlaylistName.trim());
    setIsLoading(false);

    if (result.success) {
      setNewPlaylistName("");
      setShowCreateModal(false);
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    if (window.confirm("Are you sure you want to delete this playlist?")) {
      const result = await deletePlaylist(playlistId);
      if (result.success) {
        showToast("Playlist deleted successfully", "success");
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="btn-ghost p-2 rounded-lg border border-gray-200 dark:border-gray-700"
            title="Go back"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Playlists</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {filteredPlaylists.length} {filteredPlaylists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Playlist</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
        />
      </div>

      {/* Playlists Grid */}
      {isLoading ? (
        <SkeletonLoader 
          type="card" 
          count={12} 
          className="songs-grid" 
        />
      ) : filteredPlaylists.length > 0 ? (
        <div className="songs-grid">
          {filteredPlaylists.map((playlist, index) => (
            <div key={playlist._id || index} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="relative group">
                <PlaylistItem
                  id={playlist._id}
                  name={playlist.name}
                  songCount={playlist.songs?.length || 0}
                  image={playlist.image}
                />
                
                {/* Delete Button - Only show on hover */}
                <button
                  onClick={() => handleDeletePlaylist(playlist._id)}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md"
                  title="Delete playlist"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 px-6 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Music2 className="w-10 h-10 text-gray-500 dark:text-gray-400" aria-hidden />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {searchQuery ? 'No playlists found' : 'No playlists yet'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
            {searchQuery 
              ? `No playlists match your search "${searchQuery}"`
              : 'Create your first playlist to get started'
            }
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary px-8"
            >
              Create Your First Playlist
            </button>
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Playlist</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-300"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Playlist Name
              </label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="My Awesome Playlist"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                onKeyPress={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary rounded-xl"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || isLoading}
                className="btn-primary rounded-xl shrink-0"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating...</span>
                  </div>
                ) : (
                  'Create Playlist'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplayPlaylists;