// components/CreatePlaylistModal.jsx
import React, { useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useTheme, useToast } from "../context/ThemeContext";

const CreatePlaylistModal = () => {
  const { showPlaylistModal, setShowPlaylistModal, createPlaylist } = usePlayer();
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const [playlistName, setPlaylistName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAIGeneration, setIsAIGeneration] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const handleCreate = async () => {
    if (isAIGeneration) {
      if (!aiPrompt.trim()) return;
      
      setLoading(true);
      // Call AI playlist generation API
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/playlist/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ prompt: aiPrompt.trim() })
        });
        
        const result = await response.json();
        setLoading(false);
        
        if (result.success) {
          showToast(`Generated playlist "${result.playlist.name}"`, "success");
          setAiPrompt("");
          setShowPlaylistModal(false);
          // Optionally navigate to the new playlist
          window.location.href = `/playlist/${result.playlist._id}`;
        } else {
          showToast(result.message || 'Failed to generate playlist', 'error');
        }
      } catch (error) {
        setLoading(false);
        showToast('Error generating playlist', 'error');
      }
    } else {
      if (!playlistName.trim()) return;
      
      const nameToCreate = playlistName.trim();
      setPlaylistName("");
      setShowPlaylistModal(false); // Eagerly close modal for immediate UX response
      
      await createPlaylist(nameToCreate);
    }
  };

  const handleClose = () => {
    setPlaylistName("");
    setAiPrompt("");
    setIsAIGeneration(false);
    setShowPlaylistModal(false);
  };

  if (!showPlaylistModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Playlist</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-300"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex items-center justify-center mb-6">
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
            <button
              onClick={() => setIsAIGeneration(false)}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                !isAIGeneration 
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setIsAIGeneration(true)}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                isAIGeneration 
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              AI Generate
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {isAIGeneration ? 'Describe Your Playlist' : 'Playlist Name'}
          </label>
          {isAIGeneration ? (
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Create a playlist for my workout session with upbeat electronic music..."
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 resize-none"
              rows={4}
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="My Awesome Playlist"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={(!isAIGeneration && !playlistName.trim()) || (isAIGeneration && !aiPrompt.trim()) || loading}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{isAIGeneration ? 'Generating...' : 'Creating...'}</span>
              </div>
            ) : (
              isAIGeneration ? 'Generate Playlist' : 'Create Playlist'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePlaylistModal;