// components/DisplayPlaylist.jsx
import React, { useState, useEffect } from "react";
import { Play, Pause, Music2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const DisplayPlaylist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    playWithId,
    playPlaylist,
    deletePlaylist,
    removeSongFromPlaylist,
    playlists,
    track,
    playStatus,
  } = usePlayer();
  
  const { showToast } = useToast();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveSong, setShowRemoveSong] = useState(null);

  const getPlaylistData = async () => {
    try {
      // First try to find playlist in local data
      const localPlaylist = playlists.find(p => p._id === id);
      if (localPlaylist) {
        setPlaylist(localPlaylist);
        setLoading(false);
        return;
      }

      // If not found locally, try backend
      const response = await axios.get(`${import.meta.env.VITE_API_URL ?? ""}/api/playlist/${id}`);
      if (response.data.success) {
        setPlaylist(response.data.playlist);
      } else {
        showToast("Playlist not found", "error");
      }
    } catch (error) {
      console.error("Error fetching playlist:", error);
      showToast("Failed to load playlist", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlaylist = async () => {
    const result = await deletePlaylist(id);
    if (result.success) {
      navigate('/');
    }
    setShowDeleteConfirm(false);
  };

  const handleRemoveSong = async (songId) => {
    const result = await removeSongFromPlaylist(id, songId);
    if (result.success) {
      // Update local state immediately for reactive rendering
      setPlaylist(prevPlaylist => ({
        ...prevPlaylist,
        songs: prevPlaylist.songs.filter(song => song._id !== songId)
      }));
      // Toast is already shown by removeSongFromPlaylist function
    } else {
      showToast("Failed to remove song", "error");
    }
    setShowRemoveSong(null);
  };

  const handlePlayPlaylist = () => {
    if (playlist?.songs?.length > 0) {
      playPlaylist(playlist._id);
    } else {
      showToast("No songs in this playlist", "info");
    }
  };

  useEffect(() => {
    if (id) {
      getPlaylistData();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <Music2 className="w-12 h-12 text-gray-500 dark:text-gray-400" aria-hidden />
        </div>
        <p className="text-xl text-gray-900 dark:text-gray-100 mb-4">Playlist not found</p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      {/* Playlist Header */}
      <div className="flex gap-6 items-end mb-8">
        <div className="w-48 h-48 bg-blue-500 rounded-xl shadow-lg flex items-center justify-center">
          <span className="text-white text-6xl">♫</span>
        </div>
        <div className="flex-1">
          <p className="text-gray-600 dark:text-gray-300 text-sm font-medium mb-2">PLAYLIST</p>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-6">{playlist.name}</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            {playlist.description || "Your personalized playlist"}
          </p>
          <p className="text-gray-600 dark:text-gray-300">
            {playlist.songs?.length || 0} {playlist.songs?.length === 1 ? 'song' : 'songs'}
          </p>
          
          {/* Playlist Actions */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={handlePlayPlaylist}
              disabled={!playlist.songs || playlist.songs.length === 0}
              className={playlist.songs?.length > 0 ? 'btn-primary py-2' : 'btn-primary opacity-50 cursor-not-allowed py-2'}
            >
              {playlist.songs?.length > 0 ? 'Play' : 'No Songs'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-all duration-200"
            >
              Delete Playlist
            </button>
          </div>
        </div>
      </div>

      {/* Songs List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        {!playlist.songs || playlist.songs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Music2 className="w-10 h-10 text-gray-500 dark:text-gray-400" aria-hidden />
            </div>
            <p className="text-gray-900 dark:text-gray-100 text-lg mb-4">This playlist is empty</p>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Add songs from the home page to get started</p>
            <button
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              Browse Songs
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 p-3 text-gray-600 dark:text-gray-400 text-sm font-medium border-b border-gray-300 dark:border-gray-700 pb-2">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Title</div>
              <div className="col-span-4">Album</div>
              <div className="col-span-1 text-center">Duration</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>
            
            {playlist.songs.map((song, index) => {
              const isCurrent = track?._id === song._id;
              const isPlaying = isCurrent && playStatus;
              return (
              <div
                key={song._id}
                className={`grid grid-cols-12 gap-4 p-3 rounded-lg transition-all group items-center ${
                  isCurrent
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <div className="col-span-1 text-center text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                  {isCurrent ? (
                    isPlaying ? (
                      <Pause className="w-4 h-4 text-blue-500 mx-auto" />
                    ) : (
                      <Play className="w-4 h-4 text-blue-500 mx-auto" />
                    )
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="col-span-5 flex items-center gap-3">
                  <img
                    src={song.image}
                    alt={song.name}
                    className="w-12 h-12 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium truncate ${isCurrent ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"}`}>{song.name}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm truncate">{song.desc}</p>
                  </div>
                </div>
                <div className="col-span-4 text-gray-600 dark:text-gray-400 truncate">
                  {song.album}
                </div>
                <div className="col-span-1 text-center text-gray-600 dark:text-gray-400 text-sm">
                  {song.duration}
                </div>
                <div className="col-span-1 flex justify-center gap-2">
                  <button
                    onClick={() => playWithId(song._id, playlist.songs)}
                    className="btn-primary opacity-0 group-hover:opacity-100 p-2 min-w-0"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 text-white shrink-0" size={16} strokeWidth={2.5} />
                    ) : (
                      <Play className="w-4 h-4 text-white shrink-0" size={16} strokeWidth={2.5} />
                    )}
                  </button>
                  <button
                    onClick={() => setShowRemoveSong(song._id)}
                    className="opacity-0 group-hover:opacity-100 bg-red-500 text-white p-2 rounded-lg transition-all duration-200"
                    title="Remove from playlist"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Delete Playlist</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "<span className="font-bold">{playlist.name}</span>"? 
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePlaylist}
                className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors duration-200"
              >
                Delete Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Song Confirmation Modal */}
      {showRemoveSong && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Remove Song</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove this song from the playlist?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRemoveSong(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveSong(showRemoveSong)}
                className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors duration-200"
              >
                Remove Song
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplayPlaylist;