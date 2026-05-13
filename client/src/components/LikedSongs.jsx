// components/LikedSongs.jsx
import React, { useState, useMemo } from "react";
import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SongCard from "./SongCard";
import SkeletonLoader from "./SkeletonLoader";
import CustomDropdown from "./CustomDropdown";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const LikedSongs = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { songsData, likedSongs, playWithId } = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort liked songs, re-compute on like/unlike
  const filteredLikedSongs = useMemo(() => {
    // Handle both cases: likedSongs as IDs or as full objects
    let likedSongsData;

    if (Array.isArray(likedSongs) && likedSongs.length > 0 && typeof likedSongs[0] === "string") {
      // If likedSongs contains IDs, filter songsData
      likedSongsData = songsData.filter(
        (song) => song && likedSongs.includes(song._id),
      );
    } else {
      // If likedSongs contains full objects, use them directly
      likedSongsData = likedSongs.filter((song) => song && song._id);
    }

    let filtered = likedSongsData.filter((song) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        song.name?.toLowerCase().includes(query) ||
        song.desc?.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query)
      );
    });
    // Sort songs
    // Sort songs
    const sorted = [...filtered];

    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => {
          const da = new Date(a.createdAt || a.playedAt || 0).getTime();
          const db = new Date(b.createdAt || b.playedAt || 0).getTime();
          return db - da;
        });
        break;

      case "oldest":
        sorted.sort((a, b) => {
          const da = new Date(a.createdAt || a.playedAt || 0).getTime();
          const db = new Date(b.createdAt || b.playedAt || 0).getTime();
          return da - db;
        });
        break;

      case "name":
        sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;

      case "album":
        sorted.sort((a, b) => (a.album || "").localeCompare(b.album || ""));
        break;

      default:
        break;
    }

    return sorted;
  }, [songsData, likedSongs, searchQuery, sortBy]);

  // Go back to previous page
  const handleBack = () => {
    navigate(-1);
  };

  // Play all liked songs
  const handlePlayAll = () => {
    if (filteredLikedSongs.length > 0) {
      playWithId(filteredLikedSongs[0]._id, filteredLikedSongs);
      showToast(
        `Playing all ${filteredLikedSongs.length} liked songs`,
        "success",
      );
    } else {
      showToast("No liked songs to play", "info");
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
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              Liked Songs
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {filteredLikedSongs.length}{" "}
              {filteredLikedSongs.length === 1 ? "song" : "songs"} you love
            </p>
          </div>
        </div>

        <button
          onClick={handlePlayAll}
          disabled={filteredLikedSongs.length === 0}
          className="btn-primary"
        >
          Play All
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search your liked songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
          />
        </div>

        <CustomDropdown 
          options={[
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "name", label: "Name A-Z" },
            { value: "album", label: "Album A-Z" },
          ]}
          value={sortBy}
          onChange={setSortBy}
          className="w-full sm:w-auto min-w-[180px]"
        />
      </div>

      {/* Songs Grid */}
      {isLoading ? (
        <SkeletonLoader type="card" count={12} className="songs-grid" />
      ) : filteredLikedSongs.length > 0 ? (
        <div className="songs-grid">
          {filteredLikedSongs.map((song, index) => (
            <div
              key={song._id || index}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <SongCard song={song} playlist={filteredLikedSongs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart
              className="w-12 h-12 text-gray-500 dark:text-gray-400"
              aria-hidden
            />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {searchQuery ? "No liked songs found" : "No liked songs yet"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
            {searchQuery
              ? `No liked songs match your search "${searchQuery}"`
              : "Start liking songs to see them here. Click the heart icon on any song to add it to your liked songs."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => navigate("/songs")}
              className="btn-primary px-8"
            >
              Explore Songs
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LikedSongs;
