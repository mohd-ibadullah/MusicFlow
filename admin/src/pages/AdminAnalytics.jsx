// pages/AdminAnalytics.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";

const TYPE_META = {
  song_played: { icon: "🎵", color: "bg-blue-50 text-blue-600", label: "Played" },
  song_added: { icon: "➕", color: "bg-emerald-50 text-emerald-600", label: "Added" },
  song_liked: { icon: "❤️", color: "bg-pink-50 text-pink-600", label: "Liked" },
  playlist_created: { icon: "🎶", color: "bg-purple-50 text-purple-600", label: "Playlist" },
  album_added: { icon: "💿", color: "bg-orange-50 text-orange-600", label: "Album" },
};

const timeAgo = (dateStr) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const STAT_CARDS = [
  { key: "totalStreams", label: "Total Plays", icon: "🎵", color: "from-blue-500 to-blue-600" },
  { key: "liveListeners", label: "Listening Now", icon: "🎧", color: "from-emerald-500 to-emerald-600", live: true },
  { key: "totalSongs", label: "Songs", icon: "🎼", color: "from-purple-500 to-purple-600" },
  { key: "totalAlbums", label: "Albums", icon: "💿", color: "from-orange-500 to-orange-600" },
];

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [liveListeners, setLiveListeners] = useState(0);
  const socketRef = useRef(null);
  const socketConnectedRef = useRef(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
  });

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/admin/analytics`, { headers: authHeaders() });
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

  const fetchActivity = useCallback(async (merge = true) => {
    try {
      const response = await axios.get(`${url}/api/admin/recent-activity`, { headers: authHeaders() });
      if (response.data.success) {
        if (merge) {
          setActivity(prev => {
            const backendActivities = response.data.data;
            const merged = [...backendActivities, ...prev];
            const uniqueMap = new Map();
            merged.forEach(item => { if (item && item._id) uniqueMap.set(item._id.toString(), item); });
            const unique = Array.from(uniqueMap.values());
            return unique.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
          });
        } else {
          setActivity(response.data.data);
        }
        setActivityLoading(false);
      }
    } catch (error) {
      console.error("Error fetching activity:", error);
      setActivityLoading(false);
    }
  }, []);

  const addActivity = useCallback((newActivity) => {
    setActivity(prev => {
      const activityObj = {
        _id: newActivity._id,
        type: newActivity.type || "song_played",
        message: newActivity.message || "New activity",
        createdAt: newActivity.createdAt || new Date().toISOString(),
        userId: newActivity.userId || null,
        songId: newActivity.songId || null,
      };
      const filteredPrev = prev.filter(item => item._id?.toString() !== activityObj._id?.toString());
      return [activityObj, ...filteredPrev].slice(0, 20);
    });
  }, []);

  const updateTopSongs = useCallback((payload = null) => {
    if (!payload?.songId) return;
    setAnalytics(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (payload.type === "song_played" && typeof updated.totalStreams === "number") {
        updated.totalStreams += 1;
      }
      if (updated.topSongs) {
        updated.topSongs = [...updated.topSongs];
        const songIndex = updated.topSongs.findIndex(song =>
          song._id === payload.songId || song._id?.toString() === payload.songId
        );
        if (songIndex !== -1) {
          if (payload.type === "song_played") {
            updated.topSongs[songIndex] = { ...updated.topSongs[songIndex], playCount: (updated.topSongs[songIndex].playCount || 0) + 1 };
            updated.topSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
          } else if ((payload.type === "song_liked" || payload.type === "song_unliked") && payload.likeCount !== undefined) {
            updated.topSongs[songIndex] = { ...updated.topSongs[songIndex], likeCount: payload.likeCount };
          }
        }
      }
      if (payload.type === "song_played" && payload.artist && updated.topArtists) {
        updated.topArtists = [...updated.topArtists];
        const artistIndex = updated.topArtists.findIndex(a => a.name === payload.artist || a._id === payload.artist);
        if (artistIndex !== -1) {
          updated.topArtists[artistIndex] = { ...updated.topArtists[artistIndex], totalPlays: (updated.topArtists[artistIndex].totalPlays || 0) + 1 };
          updated.topArtists.sort((a, b) => (b.totalPlays || 0) - (a.totalPlays || 0));
        }
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchActivity(false);
  }, [fetchAnalytics, fetchActivity]);

  useEffect(() => {
    let mounted = true;
    let reconnectTimeout = null;

    const connectSocket = async () => {
      try {
        const { io } = await import("socket.io-client");
        const socket = io({ path: "/socket.io", transports: ["polling", "websocket"] });
        if (!mounted) { socket.disconnect(); return; }

        socketRef.current = socket;
        socketConnectedRef.current = false;

        socket.on("connect", () => {
          socketConnectedRef.current = true;
          socket.emit("get_listeners");
        });
        socket.on("disconnect", () => { socketConnectedRef.current = false; });
        socket.on("connect_error", (err) => {
          socketConnectedRef.current = false;
          if (mounted) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => { if (socketRef.current && !socketRef.current.connected) socketRef.current.connect(); }, 3000);
          }
        });
        socket.on("users_listening", (count) => { if (mounted) setLiveListeners(typeof count === "number" ? Math.max(0, count) : 0); });
        socket.on("user_listening", () => {});
        socket.on("activity_created", (newActivity) => { if (mounted) addActivity(newActivity); });
        socket.on("analytics_updated", (payload) => { if (mounted) updateTopSongs(payload); });
      } catch (err) {
        console.warn("[Admin Analytics] Socket not available:", err.message);
      }
    };

    connectSocket();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; socketConnectedRef.current = false; }
    };
  }, [fetchAnalytics, fetchActivity, addActivity]);

  const handleRefresh = () => { fetchAnalytics(); fetchActivity(true); };

  // Helper to get stat value
  const getStatValue = (key) => {
    if (key === "liveListeners") return liveListeners;
    return analytics?.[key] || 0;
  };

  /* ===== RENDER ===== */

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="card-admin text-center py-16 px-6 animate-fade-in">
        <p className="text-gray-700 font-medium mb-3">Unable to load analytics</p>
        <button onClick={fetchAnalytics} className="btn-admin-primary">Try Again</button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">Analytics</h1>
          <p className="text-page-subtitle">Platform performance at a glance</p>
        </div>
        <button onClick={handleRefresh} className="btn-admin-secondary flex items-center gap-1.5 self-start">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((stat) => (
          <div key={stat.key} className="stat-card group">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-white text-base shadow-sm`}>
                {stat.icon}
              </div>
              {stat.live && (
                <span className="badge-green text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse-dot"></span>
                  Live
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-0.5">
              {getStatValue(stat.key)?.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout: Top Songs + Top Artists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Songs */}
        <div className="card-admin overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-section-title">Top Songs</h2>
          </div>
          {analytics.topSongs?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {analytics.topSongs.map((song, index) => (
                <div key={song._id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    index === 0 ? "bg-amber-100 text-amber-700" :
                    index === 1 ? "bg-gray-100 text-gray-600" :
                    index === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-gray-50 text-gray-500"
                  }`}>
                    {index + 1}
                  </span>
                  <img src={song.image} alt={song.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{song.name}</p>
                    <p className="text-xs text-gray-500 truncate">{song.artist || song.album}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-700">{song.playCount?.toLocaleString() || 0} plays</p>
                    <p className="text-[11px] text-gray-400">{song.likeCount?.toLocaleString() || 0} likes</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-10">No song data yet</p>
          )}
        </div>

        {/* Top Artists */}
        <div className="card-admin overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-section-title">Top Artists</h2>
          </div>
          {analytics.topArtists?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {analytics.topArtists.map((artist, index) => (
                <div key={artist._id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    index === 0 ? "bg-amber-100 text-amber-700" :
                    index === 1 ? "bg-gray-100 text-gray-600" :
                    index === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-gray-50 text-gray-500"
                  }`}>
                    {index + 1}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {artist.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{artist.name}</p>
                    <p className="text-xs text-gray-500">{artist.totalSongs} {artist.totalSongs === 1 ? "song" : "songs"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-700">{artist.totalPlays?.toLocaleString() || 0}</p>
                    <p className="text-[11px] text-gray-400">total plays</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-10">No artist data yet</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card-admin overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-section-title">Recent Activity</h2>
          {!activityLoading && activity.length > 0 && (
            <span className="text-xs text-gray-400">{activity.length} events</span>
          )}
        </div>
        {activityLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        ) : activity.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {activity
              .filter((item, index, self) => index === self.findIndex((t) => t.message === item.message))
              .slice(0, 20)
              .map((item) => {
                const meta = TYPE_META[item.type] || { icon: "📌", color: "bg-gray-50 text-gray-600" };
                return (
                  <div key={item._id || `${item.type}_${item.createdAt}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${meta.color} flex items-center justify-center text-sm shrink-0`}>
                      {meta.icon}
                    </div>
                    <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{item.message}</p>
                    <p className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{timeAgo(item.createdAt)}</p>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-1">No activity yet</p>
            <p className="text-xs text-gray-400">Events will appear here as users interact with the platform</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAnalytics;
