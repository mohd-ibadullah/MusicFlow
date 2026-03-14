// components/Search.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import SongCard from "./SongCard";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const Search = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { songsData, searchQuery, setSearchQuery, performSearch, searchResults } = usePlayer();
  const [isLoading, setIsLoading] = useState(false);

  // Clear search when component mounts
  useEffect(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  // Use search results from context
  const filteredSongs = useMemo(() => {
    return searchResults.songs || [];
  }, [searchResults.songs]);

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    performSearch(query);
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value.trim();
      setSearchQuery(query);
      performSearch(query);
    }
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    performSearch("");
  };

  const hasResults = filteredSongs.length > 0;

  return (
    <div className="p-4">
      <div className="flex items-center space-x-4 mb-8">
        <div className="relative flex-1">
          <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <svg className="w-6 h-6 text-gray-400 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search for songs..."
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyPress={handleKeyPress}
              className="w-full bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-lg font-medium"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Clear search"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="space-y-8">
          {isLoading ? (
            <div className="flex justify-center items-center min-h-[200px]">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          ) : hasResults ? (
            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Songs</h2>
                <div className="songs-grid">
                  {filteredSongs.map((song) => (
                    <SongCard key={song._id} song={song} playlist={filteredSongs} />
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p className="text-lg">No results found for "{searchQuery}"</p>
              <p className="text-sm mt-2">Try searching for something else</p>
            </div>
          )}
        </div>
      )}

      {/* Browse Categories - Only show when no search query */}
      {!searchQuery && (
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Browse Songs</h2>
          <div className="songs-grid">
            {songsData.slice(0, 10).map((song) => (
              <SongCard key={song._id} song={song} playlist={songsData} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
