import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Music2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import SongCard from './SongCard';
import AlbumItem from './AlbumItem';
import PlaylistItem from './playlistItem';

const SearchPage = () => {
  const { 
    searchQuery, 
    setSearchQuery, 
    performSearch, 
    searchResults, 
    songsData, 
    albumsData,
    playlists,
    playWithId 
  } = usePlayer();
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'songs', 'albums', 'playlists'
  const searchInputRef = useRef(null);

  // Auto-focus search input when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setLocalQuery(q);
    setSearchQuery(q);
    performSearch(q);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      setLocalQuery(q);
      setSearchQuery(q);
      performSearch(q);
    }
  };

  const songs = useMemo(() => {
    if (searchQuery && searchQuery.trim()) {
      return searchResults.songs || [];
    }
    return [];
  }, [searchQuery, searchResults.songs]);

  const albums = useMemo(() => {
    if (searchQuery && searchQuery.trim()) {
      return searchResults.albums || [];
    }
    return [];
  }, [searchQuery, searchResults.albums]);

  const playlistResults = useMemo(() => {
    if (searchQuery && searchQuery.trim()) {
      return searchResults.playlists || [];
    }
    return [];
  }, [searchQuery, searchResults.playlists]);

  const totalResults = songs.length + albums.length + playlistResults.length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-h1 text-gray-900 dark:text-gray-100 mb-2">Search</h1>
        <p className="text-base text-gray-600 dark:text-gray-400">Search for songs, artists, or albums</p>
      </div>

      <div className="max-w-3xl">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            ref={searchInputRef}
            value={localQuery} 
            onChange={handleChange} 
            onKeyPress={handleKeyPress}
            placeholder="Search songs, artists, albums..." 
            className="input-search-soft" 
          />
          {localQuery && (
            <button
              onClick={() => {
                setLocalQuery("");
                setSearchQuery("");
                performSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
      </div>

      {searchQuery && searchQuery.trim() ? (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
              Results for "{searchQuery}" ({totalResults} found)
            </h3>
            
            {/* Search Tabs */}
            <div className="tabs-shell">
              <button
                onClick={() => setActiveTab('all')}
                className={`tab-chip ${
                  activeTab === 'all'
                    ? 'tab-chip-active'
                    : ''
                }`}
              >
                All ({totalResults})
              </button>
              <button
                onClick={() => setActiveTab('songs')}
                className={`tab-chip ${
                  activeTab === 'songs'
                    ? 'tab-chip-active'
                    : ''
                }`}
              >
                Songs ({songs.length})
              </button>
              <button
                onClick={() => setActiveTab('albums')}
                className={`tab-chip ${
                  activeTab === 'albums'
                    ? 'tab-chip-active'
                    : ''
                }`}
              >
                Albums ({albums.length})
              </button>
              <button
                onClick={() => setActiveTab('playlists')}
                className={`tab-chip ${
                  activeTab === 'playlists'
                    ? 'tab-chip-active'
                    : ''
                }`}
              >
                Playlists ({playlistResults.length})
              </button>
            </div>
          </div>

          {/* Results Content */}
          {totalResults > 0 ? (
            <div className="space-y-8">
              {/* Songs Section */}
              {(activeTab === 'all' || activeTab === 'songs') && songs.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold mb-4 text-gray-600 dark:text-gray-400">
                    Songs ({songs.length})
                  </h4>
                  <div className="songs-grid">
                    {songs.map((s, idx) => (
                      <div key={s._id || idx}>
                        <SongCard song={s} playlist={songs} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Albums Section */}
              {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold mb-4 text-gray-600 dark:text-gray-400">
                    Albums ({albums.length})
                  </h4>
                  <div className="songs-grid">
                    {albums.map((album, idx) => (
                      <div key={album._id || idx}>
                        <AlbumItem
                          image={album.image}
                          name={album.name}
                          desc={album.desc}
                          id={album._id}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Playlists Section */}
              {(activeTab === 'all' || activeTab === 'playlists') && playlistResults.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold mb-4 text-gray-600 dark:text-gray-400">
                    Playlists ({playlistResults.length})
                  </h4>
                  <div className="songs-grid">
                    {playlistResults.map((playlist, idx) => (
                      <div key={playlist._id || idx} className="overflow-visible">
                        <PlaylistItem
                          id={playlist._id}
                          name={playlist.name}
                          songCount={playlist.songs?.length || 0}
                          image={playlist.image}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 px-6 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-500 dark:text-gray-400" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No results found</h3>
              <p className="text-gray-500 dark:text-gray-400">Try searching with different keywords</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 px-6 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Music2 className="w-8 h-8 text-gray-500 dark:text-gray-400" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Start searching</h3>
          <p className="text-gray-500 dark:text-gray-400">Search for songs, artists, albums, or playlists</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
