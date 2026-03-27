// components/AllSongs.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Music2 } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import SongCard from "./SongCard";
import SkeletonLoader from "./SkeletonLoader";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const AllSongs = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playWithId } = usePlayer();

  const [songs, setSongs] = useState([]);
  const [artistOptions, setArtistOptions] = useState(["all"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [artistFilter, setArtistFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [popularityFilter, setPopularityFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  const languageOptions = ["all", "Hindi", "English", "Telugu"];

  useEffect(() => {
    axios.get(`${API_URL}/api/song/artists`).then((res) => {
      if (res.data?.success && Array.isArray(res.data.artists)) {
        setArtistOptions(["all", ...res.data.artists.filter((a) => a && a !== "Unknown Artist")]);
      }
    }).catch(() => {});
  }, []);

  const fetchSongs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("language", languageFilter);
      params.set("artist", artistFilter);
      params.set("duration", durationFilter);
      params.set("popularity", popularityFilter);
      params.set("sort", sortBy);

      const url = `${API_URL}/api/song/list?${params.toString()}`;
      console.log("Fetching songs with filters:", url);
      const res = await axios.get(url);
      const data = res.data?.data ?? res.data ?? [];
      setSongs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch songs:", err);
      setSongs([]);
      showToast("Failed to load songs", "error");
    } finally {
      setIsLoading(false);
    }
  }, [languageFilter, artistFilter, durationFilter, popularityFilter, sortBy, showToast]);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const q = searchQuery.toLowerCase().trim();
    return songs.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.language?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q) ||
        s.desc?.toLowerCase().includes(q)
    );
  }, [songs, searchQuery]);

  const handleBack = () => navigate(-1);

  const handlePlayAll = () => {
    if (filteredSongs.length > 0) {
      playWithId(filteredSongs[0]._id, filteredSongs);
      showToast(`Playing ${filteredSongs.length} songs`, "success");
    } else {
      showToast("No songs to play", "info");
    }
  };

  const selectClass =
    "appearance-none px-4 py-2.5 pr-10 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 min-w-0 w-full shadow-sm";

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="flex items-center gap-4">
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
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">All Songs</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{filteredSongs.length} songs</p>
          </div>
        </div>
        <button
          onClick={handlePlayAll}
          disabled={filteredSongs.length === 0}
          className="btn-primary"
        >
          Play All
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative w-full max-w-md">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search songs, artists, albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-[140px] max-w-[180px]">
            <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} className={selectClass}>
              <option value="all">All languages</option>
              {languageOptions.slice(1).map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] max-w-[180px]">
            <select value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)} className={selectClass}>
              <option value="all">All artists</option>
              {artistOptions.slice(1).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] max-w-[180px]">
            <select value={durationFilter} onChange={(e) => setDurationFilter(e.target.value)} className={selectClass}>
              <option value="all">All lengths</option>
              <option value="short">Short (&lt;3m)</option>
              <option value="medium">Medium (3–5m)</option>
              <option value="long">Long (&gt;5m)</option>
            </select>
          </div>
            <div className="min-w-[140px] max-w-[180px]">
            <select value={popularityFilter} onChange={(e) => setPopularityFilter(e.target.value)} className={selectClass}>
              <option value="all">All popularity</option>
              <option value="high">Popular</option>
              <option value="low">Less popular</option>
            </select>
          </div>
          <div className="min-w-[140px] max-w-[180px]">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="album">Album A–Z</option>
              <option value="popular">Most popular</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <SkeletonLoader type="card" count={12} className="songs-grid" />
      ) : filteredSongs.length > 0 ? (
        <div className="songs-grid">
          {filteredSongs.map((song, index) => (
            <div key={song._id || index} className="animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
              <SongCard song={song} playlist={filteredSongs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Music2 className="w-10 h-10 text-gray-400" aria-hidden />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No songs found</h3>
          <p className="text-gray-500 dark:text-gray-400">Try changing your filters or search</p>
        </div>
      )}
    </div>
  );
};

export default AllSongs;
