// components/Navbar.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const Navbar = ({ onOpenMobileSidebar }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    playWithId,
    songsData,
    albumsData,
    playlists
  } = usePlayer();
  
  const { isDark, toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  

  // Navigation history for back/forward buttons
  const [navHistory, setNavHistory] = useState({
    canGoBack: false,
    canGoForward: false
  });
  const wentBackRef = useRef(false);

  useEffect(() => {
    const getCanGoBack = () => {
      if (typeof window.navigation !== 'undefined' && 'canGoBack' in window.navigation) {
        return window.navigation.canGoBack;
      }
      const idx = window.history.state?.idx;
      return typeof idx === 'number' && !isNaN(idx) && idx > 0;
    };

    const getCanGoForward = () => {
      if (wentBackRef.current) {
        wentBackRef.current = false;
        return true;
      }
      if (typeof window.navigation !== 'undefined' && 'canGoForward' in window.navigation) {
        return window.navigation.canGoForward;
      }
      const idx = window.history.state?.idx;
      const len = window.history.length;
      return typeof idx === 'number' && !isNaN(idx) && typeof len === 'number' && idx < len - 1;
    };

    setNavHistory({
      canGoBack: getCanGoBack(),
      canGoForward: getCanGoForward()
    });
  }, [location]);

  const handleNavigation = (direction) => {
    if (direction === 'back' && navHistory.canGoBack) {
      wentBackRef.current = true;
      navigate(-1);
    } else if (direction === 'forward' && navHistory.canGoForward) {
      navigate(1);
    }
  };

  // Always show all navigation items for consistent UX
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/songs', label: 'All Songs' },
    { path: '/albums', label: 'Albums' },
    { path: '/playlists', label: 'Playlists' },
    { path: '/liked', label: 'Liked Songs' },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-b border-gray-200/50 dark:border-gray-700/50 transition-all duration-500 shadow-lg shadow-gray-200/20 dark:shadow-gray-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Navigation */}
            <div className="flex items-center space-x-4">
              {/* Mobile Menu Button */}
              <button
                onClick={onOpenMobileSidebar}
                className="lg:hidden p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200/50 dark:border-gray-700/50"
                title="Open menu"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Back/Forward Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleNavigation('back')}
                  disabled={!navHistory.canGoBack}
                  className="btn-arrow"
                  title="Go back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleNavigation('forward')}
                  disabled={!navHistory.canGoForward}
                  className="btn-arrow"
                  title="Go forward"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Logo - Removed */}
              
              {/* Desktop Navigation - Only show functional items */}
              <div className="hidden md:ml-8 md:flex md:items-center md:space-x-6">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      location.pathname === item.path
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>


            {/* Right Section */}
            <div className="flex items-center space-x-4">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200"
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>


              {/* User Profile */}
              <div className="flex items-center space-x-3">
                {isAuthenticated ? (
                  <div className="hidden sm:flex items-center space-x-2 bg-white dark:bg-gray-800 rounded-xl pl-3 pr-4 py-2 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.name || user?.email}</span>
                    <button onClick={logout} className="btn-ghost ml-2 text-sm px-2 py-1 rounded-lg">Logout</button>
                  </div>
                ) : (
                  <div className="hidden sm:flex items-center space-x-2">
                    <button onClick={() => navigate('/login')} className="btn-ghost px-3 py-2 text-sm">Sign in</button>
                    <button onClick={() => navigate('/signup')} className="btn-primary px-3 py-2 text-sm">Get started</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;