// components/DisplayPlaylists.jsx
import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PlaylistItem from "./playlistItem";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const DisplayPlaylists = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playlists, deletePlaylist, setShowPlaylistModal } = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [playlistToDelete, setPlaylistToDelete] = useState(null);

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



  const handleConfirmDelete = async () => {
    if (!playlistToDelete) return;
    
    const result = await deletePlaylist(playlistToDelete._id);
    if (result.success) {
      showToast("Playlist deleted successfully", "success");
    }
    setPlaylistToDelete(null);
  };

  const renderGlobalDeleteModal = (content) => {
    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        className="fixed top-0 left-0 flex items-center justify-center p-4 animate-fade-in"
        style={{ width: "100vw", height: "100dvh", zIndex: 2147483647 }}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          onClick={() => setPlaylistToDelete(null)}
        ></div>
        <div className="relative w-full max-w-md">{content}</div>
      </div>,
      document.body
    );
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
            <h1 className="text-h1 text-gray-900 dark:text-gray-100">Playlists</h1>
            <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
              {filteredPlaylists.length} {filteredPlaylists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowPlaylistModal(true)}
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
          className="input-search-soft pl-10"
        />
      </div>

      {/* Playlists Grid */}
      {filteredPlaylists.length > 0 ? (
        <div className="songs-grid">
          {filteredPlaylists.map((playlist, index) => (
            <div key={playlist._id || index} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="relative group/playlist-card overflow-visible">
                <PlaylistItem
                  id={playlist._id}
                  name={playlist.name}
                  songCount={playlist.songs?.length || 0}
                  image={playlist.image}
                />
                
                {/* Delete Button - Only show on hover */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPlaylistToDelete({ _id: playlist._id, name: playlist.name });
                  }}
                  className="absolute z-10 top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center opacity-0 group-hover/playlist-card:opacity-100 transition-all duration-200 shadow-md"
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
              onClick={() => setShowPlaylistModal(true)}
              className="btn-primary px-8"
            >
              Create Your First Playlist
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {playlistToDelete &&
        renderGlobalDeleteModal(
          <div className="bg-white dark:bg-[#242b3b] rounded-2xl p-6 w-full shadow-xl border border-gray-200 dark:border-gray-700/50">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Delete Playlist</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              Are you sure you want to delete "<span className="font-bold text-gray-900 dark:text-white">{playlistToDelete.name}</span>"? 
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center sm:justify-end">
              <button
                onClick={() => setPlaylistToDelete(null)}
                className="px-6 py-2.5 rounded-lg font-medium text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-6 py-2.5 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors duration-200"
              >
                Delete Playlist
              </button>
            </div>
          </div>
        )}

    </div>
  );
};

export default DisplayPlaylists;