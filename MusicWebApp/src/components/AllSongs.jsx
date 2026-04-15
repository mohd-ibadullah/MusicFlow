// components/AllSongs.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Music2 } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import SongCard from "./SongCard";
import SkeletonLoader from "./SkeletonLoader";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

import CustomDropdown from "./CustomDropdown";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const AllSongs = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playWithId, songsData } = usePlayer(); // <-- The Single Source of Truth

  const [artistOptions, setArtistOptions] = useState([{value: "all", label: "All artists"}]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [artistFilter, setArtistFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [popularityFilter, setPopularityFilter] = useState("all");

  const languageOptions = [
    { value: "all", label: "All languages" },
    { value: "Hindi", label: "Hindi" },
    { value: "English", label: "English" },
    { value: "Telugu", label: "Telugu" }
  ];

  const durationOptions = [
    { value: "all", label: "All lengths" },
    { value: "short", label: "Short (<3m)" },
    { value: "medium", label: "Medium (3–5m)" },
    { value: "long", label: "Long (>5m)" }
  ];

  const popularityOptions = [
    { value: "all", label: "All popularity" },
    { value: "high", label: "Popular" },
    { value: "low", label: "Less popular" }
  ];

  const sortOptions = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "name", label: "Name A–Z" },
    { value: "album", label: "Album A–Z" },
    { value: "popular", label: "Most popular" }
  ];

  useEffect(() => {
    // Dynamically build artist combinations from songsData so we never rely on separate network delays
    const uniqueArtists = new Set(songsData.map(s => s.artist).filter(a => a && a !== "Unknown Artist"));
    setArtistOptions([
      { value: "all", label: "All artists" },
      ...Array.from(uniqueArtists).sort().map(a => ({ value: a, label: a }))
    ]);
  }, [songsData]);

  const filteredSongs = useMemo(() => {
    let result = [...songsData];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.artist || "").toLowerCase().includes(q) ||
        (s.language || "").toLowerCase().includes(q) ||
        (s.album || "").toLowerCase().includes(q) ||
        (s.desc || "").toLowerCase().includes(q)
      );
    }

    // 2. Exact Match Filters
    if (languageFilter !== "all") {
      result = result.filter(s => s.language === languageFilter);
    }
    if (artistFilter !== "all") {
      result = result.filter(s => s.artist === artistFilter);
    }

    // 3. Mathematical Filters
    if (popularityFilter === "high") {
      result = result.filter(s => (s.playCount || 0) >= 10);
    } else if (popularityFilter === "low") {
      result = result.filter(s => (s.playCount || 0) < 10);
    }

    if (durationFilter !== "all") {
      result = result.filter(s => {
        if (!s.duration) return false;
        const parts = s.duration.split(":");
        const minutes = parseInt(parts[0] || '0', 10);
        if (durationFilter === "short") return minutes < 3;
        if (durationFilter === "medium") return minutes >= 3 && minutes < 6;
        if (durationFilter === "long") return minutes >= 6;
        return true;
      });
    }

    // 4. Sort Strategies
    result.sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "album") return (a.album || "").localeCompare(b.album || "");
      if (sortBy === "popular") return (b.playCount || 0) - (a.playCount || 0);
      return 0;
    });

    return result;
  }, [songsData, searchQuery, languageFilter, artistFilter, popularityFilter, durationFilter, sortBy]);

  const activeFiltersCount = useMemo(() => {
    return [
      languageFilter !== "all",
      artistFilter !== "all",
      durationFilter !== "all",
      popularityFilter !== "all",
      sortBy !== "newest",
      searchQuery.trim().length > 0,
    ].filter(Boolean).length;
  }, [languageFilter, artistFilter, durationFilter, popularityFilter, sortBy, searchQuery]);

  const handleBack = () => navigate(-1);

  const handlePlayAll = () => {
    if (filteredSongs.length > 0) {
      playWithId(filteredSongs[0]._id, filteredSongs);
      showToast(`Playing ${filteredSongs.length} songs`, "success");
    } else {
      showToast("No songs to play", "info");
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSortBy("newest");
    setLanguageFilter("all");
    setArtistFilter("all");
    setDurationFilter("all");
    setPopularityFilter("all");
  };

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

      <div className="panel-soft p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-h3 text-gray-800 dark:text-gray-100">Filter & sort</h3>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="btn-ghost text-sm"
            >
              Clear filters ({activeFiltersCount})
            </button>
          )}
        </div>

        <div className="relative w-full max-w-md">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search songs, artists, albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-search-soft"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 items-center">
          <CustomDropdown 
            options={languageOptions} 
            value={languageFilter} 
            onChange={setLanguageFilter} 
            className="w-full"
          />
          <CustomDropdown 
            options={artistOptions} 
            value={artistFilter} 
            onChange={setArtistFilter} 
            className="w-full"
          />
          <CustomDropdown 
            options={durationOptions} 
            value={durationFilter} 
            onChange={setDurationFilter} 
            className="w-full"
          />
          <CustomDropdown 
            options={popularityOptions} 
            value={popularityFilter} 
            onChange={setPopularityFilter} 
            className="w-full"
          />
          <CustomDropdown 
            options={sortOptions} 
            value={sortBy} 
            onChange={setSortBy} 
            className="w-full"
          />
        </div>
      </div>

      {!songsData.length ? (
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
