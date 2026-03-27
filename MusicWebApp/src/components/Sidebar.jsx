// components/Sidebar.jsx
import React, { useState } from "react";
import { Home, Search, Headphones, Library, Clock, Heart, Music2, Disc } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setShowPlaylistModal, likedSongs, albumsData, playlists, recentlyPlayed } = usePlayer();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const mainMenu = [
    { id: 'home', path: '/', label: 'Home', Icon: Home },
    { id: 'search', path: '/search', label: 'Search', Icon: Search },
    { id: 'songs', path: '/songs', label: 'All Songs', Icon: Headphones },
    { id: 'library', path: '/library', label: 'Your Library', Icon: Library },
  ];

  const libraryMenu = [
    { id: 'recent', path: '/recent', label: 'Recently Played', Icon: Clock, count: recentlyPlayed.length },
    { id: 'liked', path: '/liked', label: 'Liked Songs', Icon: Heart, count: likedSongs.length },
    { id: 'playlists', path: '/playlists', label: 'Playlists', Icon: Music2, count: playlists.length },
    { id: 'albums', path: '/albums', label: 'Albums', Icon: Disc, count: albumsData.length },
  ];

  return (
    <div className={`hidden lg:flex flex-col flex-shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50 transition-all duration-500 overflow-hidden ${
      isCollapsed ? 'w-16' : 'w-72'
    }`}>
      {/* Header */}
      <div className={`border-b border-gray-100/50 dark:border-gray-700/50 flex items-center ${isCollapsed ? 'justify-center p-3' : 'justify-between p-6'}`}>
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
          className="btn-ghost p-2 rounded-xl flex-shrink-0"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {/* Main Menu */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} space-y-1`}>
          {mainMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center py-3 rounded-lg text-left transition-all duration-200 ${
                isCollapsed ? 'justify-center px-2' : 'space-x-4 px-4'
              } ${
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

        {/* Library Section */}
        <div className={`${isCollapsed ? 'px-2 py-4' : 'px-6 py-6'} mt-2 border-t border-gray-100/50 dark:border-gray-700/50`}>
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">
                Your Library
              </h3>
              <button
                onClick={() => setShowPlaylistModal(true)}
                className="flex items-center justify-center shrink-0 w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-all duration-200"
                title="Create playlist"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}

          <div className="space-y-1">
            {libraryMenu.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center py-3 rounded-lg text-left transition-all duration-200 ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } ${
                  location.pathname === item.path
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200 dark:border-blue-700'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
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

        {/* Create Playlist Card — only when expanded and no playlists */}
        {!isCollapsed && playlists.length === 0 && (
          <div className="p-4">
            <div className="rounded-xl p-6 shadow-md border border-blue-400/20 dark:border-blue-700/30 bg-gradient-to-b from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
              <h3 className="font-bold text-lg mb-2 text-white">Create your first playlist</h3>
              <p className="text-blue-100 dark:text-blue-200/90 text-sm mb-4">It&apos;s easy, we&apos;ll help you</p>
              <button
                onClick={() => setShowPlaylistModal(true)}
                className="btn-primary w-full"
              >
                Create Playlist
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Section */}
      <div className={`border-t border-gray-100/50 dark:border-gray-700/50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <UserSection isCollapsed={isCollapsed} />
      </div>
    </div>
  );
};

export default Sidebar;

const UserSection = ({ isCollapsed }) => {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className={`flex items-center rounded-xl bg-gray-50 dark:bg-gray-700 transition-all duration-300 ${isCollapsed ? 'justify-center p-2' : 'space-x-3 p-3'}`}>
        <div className="w-9 h-9 bg-gray-200 dark:bg-gray-600 rounded-full flex-shrink-0" />
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
    <div className={`flex items-center rounded-xl bg-gray-50 dark:bg-gray-700 transition-all duration-300 ${isCollapsed ? 'justify-center p-2' : 'space-x-3 p-3'}`}>
      <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">
        {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
      </div>
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Member</p>
          </div>
          <button onClick={logout} className="btn-ghost text-sm px-2 py-1 rounded-lg flex-shrink-0">Logout</button>
        </>
      )}
    </div>
  );
};
