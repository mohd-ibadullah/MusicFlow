// components/Sidebar.jsx
import React, { useState } from "react";
import { Home, Search, Headphones, Library, Clock, Heart, Music2, Disc } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext"; // Import usePlayer hook
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setShowPlaylistModal, likedSongs, songsData, albumsData, playlists, recentlyPlayed } = usePlayer(); // Use usePlayer hook
  const { isDark } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Only show functional menu items that have data or purpose
  const mainMenu = [
    { id: 'home', path: '/', label: 'Home', Icon: Home, functional: true },
    { id: 'search', path: '/search', label: 'Search', Icon: Search, functional: true },
    { id: 'songs', path: '/songs', label: 'All Songs', Icon: Headphones, functional: songsData.length > 0 },
    { id: 'library', path: '/library', label: 'Your Library', Icon: Library, functional: songsData.length > 0 },
  ].filter(item => item.functional);

  const libraryMenu = [
    { id: 'recent', path: '/recent', label: 'Recently Played', Icon: Clock, count: recentlyPlayed.length, functional: recentlyPlayed.length > 0 },
    { id: 'liked', path: '/liked', label: 'Liked Songs', Icon: Heart, count: likedSongs.length, functional: likedSongs.length > 0 },
    { id: 'playlists', path: '/playlists', label: 'Playlists', Icon: Music2, count: playlists.length, functional: playlists.length > 0 },
    { id: 'albums', path: '/albums', label: 'Albums', Icon: Disc, count: albumsData.length, functional: albumsData.length > 0 },
  ].filter(item => item.functional);

  const handleCreatePlaylist = () => {
    setShowPlaylistModal(true);
  };

  const handleNavigation = (path) => {
    navigate(path);
  };

  return (
    <div className={`hidden lg:flex flex-col flex-shrink-0 w-72 min-w-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50 transition-all duration-500 ${
      isCollapsed ? 'w-16' : 'w-72'
    }`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-100/50 dark:border-gray-700/50 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              MusicFlow
            </span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="btn-ghost p-2 rounded-xl"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {/* Main Menu */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {mainMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path)}
              className={`w-full flex items-center space-x-4 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                location.pathname === item.path
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {React.createElement(item.Icon, { className: "w-5 h-5 flex-shrink-0 stroke-[2]", "aria-hidden": true })}
              {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Library Section - Only show if there are functional items */}
        {libraryMenu.length > 0 && (
          <div className="px-6 py-6 mt-6 border-t border-gray-100/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between gap-3 mb-6">
              {!isCollapsed && (
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">
                  Your Library
                </h3>
              )}
              {!isCollapsed && (
                <button
                  onClick={handleCreatePlaylist}
                  className="flex items-center justify-center shrink-0 w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-all duration-200"
                  title="Create playlist"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>

            <div className="space-y-3">
              {libraryMenu.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200 dark:border-blue-700'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    {React.createElement(item.Icon, { className: "w-5 h-5 flex-shrink-0 stroke-[2]", "aria-hidden": true })}
                    {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
                  </div>
                  {!isCollapsed && item.count > 0 && (
                    <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                      location.pathname === item.path
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create Playlist Card - Only show when no playlists exist */}
        {!isCollapsed && playlists.length === 0 && (
          <div className="p-4">
            <div className="rounded-xl p-6 shadow-md border border-blue-400/20 dark:border-blue-700/30 bg-gradient-to-b from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
              <h3 className="font-bold text-lg mb-2 text-white">Create your first playlist</h3>
              <p className="text-blue-100 dark:text-blue-200/90 text-sm mb-4">It&apos;s easy, we&apos;ll help you</p>
              <button
                onClick={handleCreatePlaylist}
                className="btn-primary w-full"
              >
                Create Playlist
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-gray-100/50 dark:border-gray-700/50">
        <UserSection isCollapsed={isCollapsed} />
      </div>
    </div>
  );
};

export default Sidebar;

// UserSection component placed here to avoid creating new files

const UserSection = ({ isCollapsed }) => {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center space-x-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700 transition-all duration-300">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full" />
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Guest</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Sign in to save your library</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700 transition-all duration-300">
      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
        {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
      </div>
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.name || user?.email}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Member</p>
        </div>
      )}
      {!isCollapsed && (
        <button onClick={logout} className="btn-ghost text-sm px-2 py-1 rounded-lg">Logout</button>
      )}
    </div>
  );
};