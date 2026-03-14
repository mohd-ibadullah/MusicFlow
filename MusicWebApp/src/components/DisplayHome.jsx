// components/DisplayHome.jsx
import React, { useState, useMemo } from "react";
import { Search, Heart, Music2, Disc, Headphones, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AlbumItem from "./AlbumItem";
import SongCard from "./SongCard";
import PlaylistItem from "./playlistItem";
import SkeletonLoader from "./SkeletonLoader";
import CarouselSection from "./CarouselSection";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const DisplayHome = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { 
    songsData, 
    albumsData, 
    playlists, 
    searchQuery, 
    searchResults, 
    likedSongs, 
    recentlyPlayed,
    recommendations,
    trendingSongs,
    liveListening,
    playWithId
  } = usePlayer();
  
  const [isLoading, setIsLoading] = useState(false);
  
  const [sectionPages, setSectionPages] = useState({
    recentlyPlayed: 0,
    likedSongs: 0,
    playlists: 0,
    featuredCharts: 0,
    biggestHits: 0,
    recommendations: 0
  });

  const ITEMS_PER_PAGE = 8;
  const TRENDING_HOME_LIMIT = 10;

  // Format last played date
  const formatLastPlayed = (dateString) => {
    if (!dateString) return "—";
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  // Memoized filtered data
  const likedSongsData = useMemo(() => 
    songsData.filter(song => likedSongs.includes(song._id)),
    [songsData, likedSongs]
  );

  const biggestHitsSongs = useMemo(() =>
    songsData
      .slice()
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, TRENDING_HOME_LIMIT),
    [songsData]
  );

  // Data availability checks
  const hasData = {
    recentlyPlayed: recentlyPlayed.length > 0,
    likedSongs: likedSongs.length > 0,
    playlists: playlists.length > 0,
    featuredCharts: albumsData.length > 0,
    biggestHits: biggestHitsSongs.length > 0,
    recommendations: (recommendations || []).length > 0,
    trending: (trendingSongs || []).length > 0,
    searchResults: searchResults.songs.length > 0 || searchResults.albums.length > 0 || searchResults.playlists.length > 0
  };

  // Pagination functions
  const getPaginatedData = (data, section) => {
    const startIndex = sectionPages[section] * ITEMS_PER_PAGE;
    return data.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  };

  const hasNextPage = (data, section) => {
    return (sectionPages[section] + 1) * ITEMS_PER_PAGE < data.length;
  };

  const hasPreviousPage = (section) => {
    return sectionPages[section] > 0;
  };

  const handleNextPage = (section, data) => {
    if (hasNextPage(data, section)) {
      setSectionPages(prev => ({
        ...prev,
        [section]: prev[section] + 1
      }));
    }
  };

  const handlePreviousPage = (section) => {
    if (hasPreviousPage(section)) {
      setSectionPages(prev => ({
        ...prev,
        [section]: prev[section] - 1
      }));
    }
  };

  // Section Header Component with Navigation
  const SectionHeader = ({ 
    title, 
    data = [], 
    section, 
    onSeeAll,
    showSeeAll = true,
    showNavigation = false,
    seeAllCount
  }) => {
    const displayCount = seeAllCount ?? data.length;
    return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        {data.length > 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {data.length} {data.length === 1 ? 'item' : 'items'}
          </p>
        )}
      </div>
      
      <div className="flex items-center space-x-3">
        {/* Navigation Buttons - Only show if there are multiple pages */}
        {showNavigation && data.length > ITEMS_PER_PAGE && (
          <div className="flex items-center space-x-2 mr-4">
            <button
              onClick={() => handlePreviousPage(section)}
              disabled={!hasPreviousPage(section)}
              className="btn-arrow"
              title="Previous page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => handleNextPage(section, data)}
              disabled={!hasNextPage(data, section)}
              className="btn-arrow"
              title="Next page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* See All Button - Only show if there are more items than displayed */}
        {showSeeAll && (seeAllCount !== undefined ? displayCount > 0 : data.length > ITEMS_PER_PAGE) && (
          <button 
            onClick={onSeeAll}
            className="btn-ghost text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2"
          >
            See all ({displayCount})
          </button>
        )}
      </div>
    </div>
  );
  };

  // Empty State Component
  const EmptyState = ({ 
    title = "No items available", 
    description = "Check back later for new content",
    IconComponent = Music2,
    action 
  }) => (
    <div className="text-center py-16 px-6 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
        <IconComponent className="w-8 h-8 text-gray-500 dark:text-gray-400" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{description}</p>
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );

  // Search Results View
  if (searchQuery) {
    return (
      <div className="space-y-12 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Search results for "{searchQuery}"
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {hasData.searchResults 
                ? `Found ${searchResults.songs.length + searchResults.albums.length + searchResults.playlists.length} results`
                : 'No results found'
              }
            </p>
          </div>
        </div>
        
        {/* Songs Results - Only show if there are songs */}
        {searchResults.songs.length > 0 && (
          <section>
            <SectionHeader 
              title="Songs" 
              data={searchResults.songs}
              showSeeAll={false}
            />
            <div className="songs-grid">
              {searchResults.songs.map((song) => (
                <SongCard key={song._id} song={song} playlist={searchResults.songs} />
              ))}
            </div>
          </section>
        )}

        {/* Albums Results - Only show if there are albums */}
        {searchResults.albums.length > 0 && (
          <section>
            <SectionHeader 
              title="Albums" 
              data={searchResults.albums}
              showSeeAll={false}
            />
            <div className="songs-grid">
              {searchResults.albums.map((album) => (
                <AlbumItem
                  key={album._id}
                  image={album.image}
                  name={album.name}
                  desc={album.desc}
                  id={album._id}
                />
              ))}
            </div>
          </section>
        )}

        {/* Playlists Results - Only show if there are playlists */}
        {searchResults.playlists.length > 0 && (
          <section>
            <SectionHeader 
              title="Playlists" 
              data={searchResults.playlists}
              showSeeAll={false}
            />
            <div className="songs-grid">
              {searchResults.playlists.map((playlist) => (
                <PlaylistItem
                  key={playlist._id}
                  id={playlist._id}
                  name={playlist.name}
                  songCount={playlist.songs?.length || 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* No Results State - Only show if no results */}
        {!hasData.searchResults && (
          <EmptyState
            title="No results found"
            description={`We couldn't find any matches for "${searchQuery}". Try searching with different keywords.`}
            IconComponent={Search}
            action={
              <button
                onClick={() => window.history.back()}
                className="btn-primary py-2"
              >
                Go Back
              </button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="rounded-xl shadow-md bg-gradient-to-b from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 py-8 sm:py-10 lg:py-12 text-white overflow-hidden">
        <div className="relative z-10 max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-h1 text-white mb-4">Welcome to MusicFlow</h1>
          <p className="text-base sm:text-lg text-blue-100 dark:text-blue-200/90 mb-6 sm:mb-8">
            {songsData.length > 0 
              ? `Discover ${songsData.length} songs across ${albumsData.length} albums`
              : 'Start adding music to your library'
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => {
                if (songsData.length > 0) {
                  playWithId(songsData[0]._id, songsData);
                  showToast('Starting your music journey!', 'success');
                } else {
                  showToast('No songs available yet', 'info');
                }
              }}
              className={songsData.length > 0 ? 'btn-primary px-8' : 'btn-primary opacity-50 cursor-not-allowed px-8'}
              disabled={songsData.length === 0}
            >
              {songsData.length > 0 ? 'Start Listening' : 'No Songs Available'}
            </button>
            <button 
              onClick={() => showToast('Premium features coming soon!', 'info')}
              className="px-8 py-3 rounded-lg font-medium border-2 border-white/30 bg-white/10 text-white hover:bg-white/20 transition-all duration-200"
            >
              Explore Premium
            </button>
          </div>
        </div>
      </section>

      {/* Live listening ticker + global active listeners indicator */}
      {(Array.isArray(liveListening) && liveListening.length > 0) && (
        <section className="animate-slide-up rounded-xl bg-gray-100 dark:bg-gray-800/50 px-4 py-2 flex items-center gap-4 overflow-x-auto overflow-y-hidden">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap flex items-center gap-1">
            <Flame className="w-4 h-4" /> Live
          </span>
          {liveListening.slice(0, 5).map((item, i) => (
            <span key={i} className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {item.userName || "Someone"} · {item.songName || "—"}
            </span>
          ))}
        </section>
      )}

      {/* Recommended For You */}
      {hasData.recommendations && (
        <CarouselSection
          title="Recommended For You"
          items={recommendations}
          totalCount={recommendations.length}
          seeAllRoute="/songs/recommended"
          scrollKey="recommendations"
          renderItem={(item) => <SongCard song={item} playlist={recommendations} />}
        />
      )}

      {/* Trending Now */}
      {hasData.trending && (
        <CarouselSection
          title="Trending Now"
          items={trendingSongs.slice(0, TRENDING_HOME_LIMIT)}
          totalCount={trendingSongs.length}
          seeAllRoute="/songs/trending"
          scrollKey="trending"
          renderItem={(item) => <SongCard song={item} playlist={trendingSongs} />}
        />
      )}

      {/* Recently Played */}
      {hasData.recentlyPlayed && (
        <CarouselSection
          title="Recently Played"
          items={recentlyPlayed}
          totalCount={recentlyPlayed.length}
          seeAllRoute="/songs/recent"
          scrollKey="recentlyPlayed"
          renderItem={(song) => (
            <div className="relative">
              <SongCard song={song} playlist={recentlyPlayed} />
              <div className="absolute top-2 left-2 bg-blue-500/90 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                {formatLastPlayed(song.playedAt)}
              </div>
            </div>
          )}
        />
      )}

      {/* Quick Access Grid - Always show but conditionally enable */}
      <section className="animate-slide-up">
        <SectionHeader title="Quick Access" showSeeAll={false} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Liked Songs Card */}
          <div 
            className={`glass-card-premium relative overflow-hidden p-6 text-white cursor-pointer transition-all duration-200 ${
              hasData.likedSongs
                ? 'hover:shadow-lg hover:-translate-y-0.5'
                : 'opacity-60 cursor-not-allowed'
            }`}
            onClick={() => hasData.likedSongs 
              ? navigate('/liked')
              : showToast('No liked songs yet', 'info')
            }
          >
            <div className="absolute inset-0 bg-blue-500 opacity-90"></div>
            <div className="relative z-10">
              <Heart className="w-10 h-10 mb-3 text-white" aria-hidden />
              <h3 className="font-bold text-xl mb-2">Liked Songs</h3>
              <p className="text-blue-100 text-sm">
                {hasData.likedSongs ? `${likedSongs.length} songs` : 'Like songs to see them here'}
              </p>
            </div>
          </div>

          {/* Playlists Card */}
          <div 
            className={`glass-card-premium relative overflow-hidden p-6 text-white cursor-pointer transition-all duration-200 ${
              hasData.playlists
                ? 'hover:shadow-lg hover:-translate-y-0.5'
                : 'opacity-60 cursor-not-allowed'
            }`}
            onClick={() => hasData.playlists 
              ? navigate('/playlists')
              : showToast('Create your first playlist', 'info')
            }
          >
            <div className="absolute inset-0 bg-blue-600 opacity-90"></div>
            <div className="relative z-10">
              <Music2 className="w-10 h-10 mb-3 text-white" aria-hidden />
              <h3 className="font-bold text-lg mb-2">Your Playlists</h3>
              <p className="text-blue-100 text-sm">
                {hasData.playlists ? `${playlists.length} playlists` : 'Create your first playlist'}
              </p>
            </div>
          </div>

          {/* Albums Card */}
          <div 
            className={`glass-card-premium relative overflow-hidden p-6 text-white cursor-pointer transition-all duration-200 ${
              hasData.featuredCharts
                ? 'hover:shadow-lg hover:-translate-y-0.5'
                : 'opacity-60 cursor-not-allowed'
            }`}
            onClick={() => hasData.featuredCharts 
              ? navigate('/albums')
              : showToast('No albums available', 'info')
            }
          >
            <div className="absolute inset-0 bg-blue-700 opacity-90"></div>
            <div className="relative z-10">
              <Disc className="w-10 h-10 mb-3 text-white" aria-hidden />
              <h3 className="font-bold text-lg mb-2">Albums</h3>
              <p className="text-blue-100 text-sm">
                {hasData.featuredCharts ? `${albumsData.length} albums` : 'No albums available'}
              </p>
            </div>
          </div>

          {/* All Songs Card */}
          <div 
            className={`glass-card-premium relative overflow-hidden p-6 text-white cursor-pointer transition-all duration-200 ${
              hasData.biggestHits
                ? 'hover:shadow-lg hover:-translate-y-0.5'
                : 'opacity-60 cursor-not-allowed'
            }`}
            onClick={() => hasData.biggestHits 
              ? navigate('/songs')
              : showToast('No songs available', 'info')
            }
          >
            <div className="absolute inset-0 bg-blue-500 opacity-90"></div>
            <div className="relative z-10">
              <Headphones className="w-10 h-10 mb-3 text-white" aria-hidden />
              <h3 className="font-bold text-lg mb-2">All Songs</h3>
              <p className="text-blue-100 text-sm">
                {hasData.biggestHits ? `${songsData.length} songs` : 'Add songs to get started'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Charts */}
      {hasData.featuredCharts && (
        isLoading ? (
          <section className="animate-slide-up">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Featured Charts</h2>
            </div>
            <SkeletonLoader type="card" count={8} className="songs-grid" />
          </section>
        ) : (
          <CarouselSection
            title="Featured Charts"
            items={albumsData}
            totalCount={albumsData.length}
            seeAllRoute="/albums"
            scrollKey="featuredCharts"
            renderItem={(item) => (
              <AlbumItem
                image={item.image}
                name={item.name}
                desc={item.desc}
                id={item._id}
              />
            )}
          />
        )
      )}

      {/* Today's Biggest Hits */}
      {hasData.biggestHits && (
        <CarouselSection
          title="Today's Biggest Hits"
          items={biggestHitsSongs}
          totalCount={biggestHitsSongs.length}
          seeAllRoute="/songs/biggest-hits"
          scrollKey="biggestHits"
          renderItem={(item) => <SongCard song={item} playlist={biggestHitsSongs} />}
        />
      )}

      {/* Your Playlists */}
      {hasData.playlists && (
        <CarouselSection
          title="Your Playlists"
          items={playlists}
          totalCount={playlists.length}
          seeAllRoute="/playlists"
          scrollKey="playlists"
          renderItem={(playlist) => (
            <PlaylistItem
              id={playlist._id}
              name={playlist.name}
              songCount={playlist.songs?.length || 0}
            />
          )}
        />
      )}
    </div>
  );
};

export default DisplayHome;