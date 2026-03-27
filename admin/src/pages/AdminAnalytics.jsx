// pages/AdminAnalytics.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";

const TYPE_META = {
  song_played:      { icon: "🎵", label: "Played" },
  song_added:       { icon: "➕", label: "Added" },
  song_liked:       { icon: "❤️", label: "Liked" },
  playlist_created: { icon: "🎶", label: "Playlist" },
  album_added:      { icon: "💿", label: "Album" },
};

const timeAgo = (dateStr) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [liveListeners, setLiveListeners] = useState(0);
  const socketRef = useRef(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
  });

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/admin/analytics`, {
        headers: authHeaders(),
      });
      if (response.data.success) {
        setAnalytics(response.data.data);
      } else {
        toast.error("Failed to load analytics");
        setAnalytics(null);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Error fetching analytics");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/admin/recent-activity`, {
        headers: authHeaders(),
      });
      if (response.data.success) {
        setActivity(response.data.data);
        setActivityLoading(false);
      }
    } catch (error) {
      console.error("Error fetching activity:", error);
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchActivity();

    // Auto-refresh activity every 10 seconds to pick up song plays and other events
    const activityInterval = setInterval(fetchActivity, 10000);

    return () => clearInterval(activityInterval);
  }, [fetchAnalytics, fetchActivity]);

  // Real-time socket connection for live listener count
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const socket = io({ path: "/socket.io", transports: ["polling", "websocket"] });
        if (!mounted) { socket.disconnect(); return; }
        socketRef.current = socket;

        socket.on("users_listening", (count) => {
          if (!mounted) return;
          setLiveListeners(typeof count === "number" ? Math.max(0, count) : 0);
        });
      } catch (err) {
        console.warn("[Admin] Socket not available:", err.message);
      }
    })();
    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const handleRefresh = () => {
    fetchAnalytics();
    fetchActivity();
  };

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-400 border-t-green-800 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500 text-lg mb-2">Failed to load analytics</p>
        <button
          onClick={fetchAnalytics}
          className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Platform performance and user engagement metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Streams</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalStreams?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🎵</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Live Listeners</p>
              <p className="text-3xl font-bold text-gray-900">{liveListeners.toLocaleString()}</p>
              <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span>
                Real-time
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🎧</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Songs</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalSongs?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🎼</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Albums</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalAlbums?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💿</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Songs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Top Songs</h2>
        {analytics.topSongs?.length > 0 ? (
          <div className="space-y-4">
            {analytics.topSongs.map((song, index) => (
              <div key={song._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                    {index + 1}
                  </div>
                  <img
                    src={song.image}
                    alt={song.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{song.name}</p>
                    <p className="text-sm text-gray-600">{song.album}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{song.playCount?.toLocaleString() || 0} plays</p>
                  <p className="text-sm text-gray-600">{song.likeCount?.toLocaleString() || 0} likes</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No song data available</p>
        )}
      </div>

      {/* Top Artists */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Top Artists</h2>
        {analytics.topArtists?.length > 0 ? (
          <div className="space-y-4">
            {analytics.topArtists.map((artist, index) => (
              <div key={artist._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{artist.name}</p>
                    <p className="text-sm text-gray-600">{artist.totalSongs} songs</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{artist.totalPlays?.toLocaleString() || 0} total plays</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No artist data available</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        {activityLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
          </div>
        ) : activity.length > 0 ? (
          <div className="space-y-3">
            {activity.map((item) => {
              const meta = TYPE_META[item.type] || { icon: "📌", label: "" };
              return (
                <div key={item._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{meta.icon}</span>
                    <p className="text-sm text-gray-700">{item.message}</p>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-nowrap ml-4">{timeAgo(item.createdAt)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No activity yet — it will appear here as users interact with the platform</p>
        )}
      </div>
    </div>
  );
};

export default AdminAnalytics;
