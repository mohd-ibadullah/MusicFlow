import React, { useState, useEffect } from "react";
import { Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SongCard from "../components/SongCard";
import SkeletonLoader from "../components/SkeletonLoader";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const TrendingSongs = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playWithId } = usePlayer();
  const [songs, setSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchTrending = async () => {
      try {
        setIsLoading(true);
        const res = await axios.get(`${API_URL}/api/song/trending?limit=10`);
        if (cancelled) return;
        const data = res.data?.data ?? res.data ?? [];
        setSongs(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          console.error("Trending fetch error:", err);
          setSongs([]);
          showToast("Failed to load trending songs", "error");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchTrending();
    return () => { cancelled = true; };
  }, [showToast]);

  const handleBack = () => navigate(-1);

  const handlePlayAll = () => {
    if (songs.length > 0) {
      playWithId(songs[0]._id, songs);
      showToast(`Playing ${songs.length} trending songs`, "success");
    } else {
      showToast("No trending songs to play", "info");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="btn-ghost p-2 rounded-full border border-gray-200 dark:border-gray-700"
            title="Go back"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">Trending Now</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{songs.length} songs</p>
          </div>
        </div>
        <button
          onClick={handlePlayAll}
          disabled={songs.length === 0}
          className="btn-primary"
        >
          Play All
        </button>
      </div>

      {isLoading ? (
        <SkeletonLoader type="card" count={12} className="songs-grid" />
      ) : songs.length > 0 ? (
        <div className="songs-grid">
          {songs.map((song, index) => (
            <div key={song._id || index} className="animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
              <SongCard song={song} playlist={songs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Flame className="w-10 h-10 text-orange-400" aria-hidden />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No trending songs yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Start listening to see what&#39;s trending</p>
        </div>
      )}
    </div>
  );
};

export default TrendingSongs;
