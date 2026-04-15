// pages/AdminAnalytics.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";
import { io as createSocket } from "socket.io-client";
import { 
  Play, 
  Plus, 
  Heart, 
  Disc, 
  Users, 
  Music, 
  Library, 
  RefreshCcw, 
  Info, 
  Sparkles,
  Pencil,
  RotateCcw,
  Radio,
  ListMusic 
} from "lucide-react";

const REALTIME_EVENT_DEDUP_TTL_MS = 120000;

const TYPE_META = {
  song_played: { 
    icon: Play, 
    color: "bg-blue-50 text-blue-600", 
    label: "Played" 
  },
  song_added: { 
    icon: Plus, 
    color: "bg-emerald-50 text-emerald-600", 
    label: "Added" 
  },
  song_liked: { 
    icon: Heart, 
    color: "bg-pink-50 text-pink-600", 
    label: "Liked" 
  },
  playlist_created: { 
    icon: ListMusic, 
    color: "bg-purple-50 text-purple-600", 
    label: "Playlist" 
  },
  album_added: { 
    icon: Library, 
    color: "bg-orange-50 text-orange-600", 
    label: "Album" 
  },
  song_deleted: {
    icon: Play,
    color: "bg-rose-50 text-rose-600",
    label: "Song Removed",
  },
  album_deleted: {
    icon: Library,
    color: "bg-rose-50 text-rose-600",
    label: "Album Removed",
  },
  playlist_deleted: {
    icon: ListMusic,
    color: "bg-rose-50 text-rose-600",
    label: "Playlist Removed",
  },
  playlist_updated: {
    icon: Pencil,
    color: "bg-cyan-50 text-cyan-700",
    label: "Playlist Updated",
  },
  ai_playlist_generated: {
    icon: Sparkles,
    color: "bg-fuchsia-50 text-fuchsia-700",
    label: "AI Playlist",
  },
  loop_triggered: {
    icon: RotateCcw,
    color: "bg-amber-50 text-amber-700",
    label: "Loop Triggered",
  },
  loop_updated: {
    icon: Radio,
    color: "bg-teal-50 text-teal-700",
    label: "Loop Updated",
  },
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
  { key: "totalStreams", label: "Total Vibes", icon: Play, color: "from-blue-500 to-blue-600" },
  { key: "liveListeners", label: "Active Now", icon: Users, color: "from-emerald-500 to-emerald-600", live: true },
  { key: "totalSongs", label: "Music Library", icon: Music, color: "from-purple-500 to-purple-600" },
  { key: "totalAlbums", label: "Collections", icon: Disc, color: "from-orange-500 to-orange-600" },
];

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [liveListeners, setLiveListeners] = useState(0);
  const socketRef = useRef(null);
  const socketConnectedRef = useRef(false);
  const processedRealtimeEventIdsRef = useRef(new Map());

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
  });

  const unwrapRealtimePayload = useCallback((eventEnvelope) => {
    if (eventEnvelope && typeof eventEnvelope === "object" && eventEnvelope.payload) {
      return eventEnvelope.payload;
    }
    return eventEnvelope;
  }, []);

  const shouldProcessRealtimeEvent = useCallback((eventEnvelope) => {
    const eventId = eventEnvelope?.eventId;
    if (!eventId) return true;

    const now = Date.now();
    for (const [id, expiresAt] of processedRealtimeEventIdsRef.current.entries()) {
      if (!expiresAt || expiresAt <= now) {
        processedRealtimeEventIdsRef.current.delete(id);
      }
    }

    const expiresAt = processedRealtimeEventIdsRef.current.get(eventId);
    if (expiresAt && expiresAt > now) return false;

    processedRealtimeEventIdsRef.current.set(eventId, now + REALTIME_EVENT_DEDUP_TTL_MS);
    return true;
  }, []);

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
      const derivedId =
        newActivity?._id ||
        newActivity?.eventId ||
        `${newActivity?.type || "activity"}_${newActivity?.songId || newActivity?.playlistId || newActivity?.albumId || newActivity?.loopEventId || newActivity?.createdAt || Date.now()}`;

      const activityObj = {
        _id: derivedId,
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

  const updateTopSongs = useCallback((payload = null, explicitType = null) => {
    const type = explicitType || payload?.type;
    if (!type) return;

    setAnalytics(prev => {
      if (!prev) return prev;
      const updated = { ...prev };

      if (type === "song_played" && typeof updated.totalStreams === "number") {
        updated.totalStreams += 1;
      }

      if (type === "song_created" && typeof updated.totalSongs === "number") {
        updated.totalSongs += 1;
      }

      if (type === "song_deleted" && typeof updated.totalSongs === "number") {
        updated.totalSongs = Math.max(0, updated.totalSongs - 1);
      }

      if (type === "album_created" && typeof updated.totalAlbums === "number") {
        updated.totalAlbums += 1;
      }

      if (type === "album_deleted" && typeof updated.totalAlbums === "number") {
        updated.totalAlbums = Math.max(0, updated.totalAlbums - 1);
      }

      const payloadSongId = payload?.songId?.toString?.() || payload?.songId;

      if (updated.topSongs) {
        updated.topSongs = [...updated.topSongs];
        const songIndex = updated.topSongs.findIndex(song =>
          song._id?.toString?.() === payloadSongId?.toString?.()
        );

        if (type === "song_deleted" && payloadSongId) {
          updated.topSongs = updated.topSongs.filter(
            (song) => song?._id?.toString?.() !== payloadSongId.toString(),
          );
        }

        if (songIndex !== -1) {
          if (type === "song_played") {
            updated.topSongs[songIndex] = { ...updated.topSongs[songIndex], playCount: (updated.topSongs[songIndex].playCount || 0) + 1 };
            updated.topSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
          } else if ((type === "song_liked" || type === "song_unliked") && payload.likeCount !== undefined) {
            updated.topSongs[songIndex] = { ...updated.topSongs[songIndex], likeCount: payload.likeCount };
          }
        }
      }

      if (type === "song_played" && payload?.artist && updated.topArtists) {
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
    const token = localStorage.getItem("auth_token");
    const socketTarget = url || undefined;

    try {
      const socket = socketTarget
        ? createSocket(socketTarget, {
            path: "/socket.io",
            transports: ["polling", "websocket"],
            auth: token ? { token } : undefined,
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
            timeout: 10000,
          })
        : createSocket({
            path: "/socket.io",
            transports: ["polling", "websocket"],
            auth: token ? { token } : undefined,
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
            timeout: 10000,
          });

      if (!mounted) {
        socket.disconnect();
        return undefined;
      }

      socketRef.current = socket;
      socketConnectedRef.current = false;

      const handleListenersCount = (eventOrCount) => {
        const payload = unwrapRealtimePayload(eventOrCount);
        const count = typeof payload === "number" ? payload : payload?.count;
        if (!mounted) return;
        setLiveListeners(typeof count === "number" ? Math.max(0, count) : 0);
      };

      const handleRealtimeActivity = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;

        addActivity({
          ...payload,
          eventId: eventEnvelope?.eventId,
          _id: payload?._id || eventEnvelope?.eventId,
        });
      };

      const handleSongPlayed = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "song_played");
      };

      const handleSongLiked = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "song_liked");
      };

      const handleSongUnliked = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "song_unliked");
      };

      const handleSongCreated = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "song_created");
      };

      const handleSongDeleted = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "song_deleted");
      };

      const handleAlbumCreated = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "album_created");
      };

      const handleAlbumDeleted = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;
        updateTopSongs(payload, "album_deleted");
      };

      const handleLiveStreamActivity = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload || !mounted) return;

        if (payload.type === "loop_triggered") {
          addActivity({
            _id: eventEnvelope?.eventId || payload.loopEventId,
            eventId: eventEnvelope?.eventId,
            type: "loop_triggered",
            message: `Loop intervention triggered (${payload.interventionType || "support"})`,
            createdAt: payload.createdAt || new Date().toISOString(),
            userId: payload.userId || null,
          });
          return;
        }

        if (payload.type === "loop_updated") {
          const status = payload.interventionStatus || "updated";
          addActivity({
            _id: eventEnvelope?.eventId || payload.loopEventId,
            eventId: eventEnvelope?.eventId,
            type: "loop_updated",
            message: `Loop event ${payload.loopEventId || ""} marked ${status}`.trim(),
            createdAt: payload.updatedAt || new Date().toISOString(),
            userId: payload.userId || null,
          });
        }
      };

      socket.on("connect", () => {
        socketConnectedRef.current = true;
        socket.emit("get_listeners");
      });

      socket.on("disconnect", () => {
        socketConnectedRef.current = false;
      });

      socket.on("connect_error", (err) => {
        socketConnectedRef.current = false;
        console.warn("[Admin Analytics] Socket connection error:", err.message);
      });

      socket.on("listeners:updated", handleListenersCount);
      socket.on("users_listening", handleListenersCount);
      socket.on("activity:created", handleRealtimeActivity);
      socket.on("activity_created", handleRealtimeActivity);
      socket.on("song:played", handleSongPlayed);
      socket.on("song:liked", handleSongLiked);
      socket.on("song:unliked", handleSongUnliked);
      socket.on("song:created", handleSongCreated);
      socket.on("song:deleted", handleSongDeleted);
      socket.on("album:created", handleAlbumCreated);
      socket.on("album:deleted", handleAlbumDeleted);
      socket.on("live:stream:activity", handleLiveStreamActivity);
    } catch (err) {
      console.warn("[Admin Analytics] Socket not available:", err.message);
    }

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      socketConnectedRef.current = false;
    };
  }, [addActivity, shouldProcessRealtimeEvent, unwrapRealtimePayload, updateTopSongs]);

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
          <h1 className="text-page-title">The Pulse</h1>
          <p className="text-page-subtitle">Your platform's heartbeat</p>
        </div>
        <button onClick={handleRefresh} className="btn-admin-secondary flex items-center gap-1.5 self-start">
          <RefreshCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-0.5">
        {STAT_CARDS.map((stat, idx) => (
          <div key={stat.key} className={`stat-card group ${idx % 2 === 0 ? "card-admin-alt" : ""}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white shadow-md shadow-blue-500/10`}>
                <stat.icon className="w-5 h-5" />
              </div>
              {stat.live && (
                <span className="badge-green text-[11px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse-dot"></span>
                  Live
                </span>
              )}
            </div>
            <p className="text-[26px] font-extrabold text-gray-900 tracking-tight mb-0.5">
              {getStatValue(stat.key)?.toLocaleString()}
            </p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.08em]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout: Top Songs + Top Artists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Songs */}
        <div className="card-admin overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100/60 bg-gray-50/10">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Top Songs</h2>
          </div>
          {analytics.topSongs?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {analytics.topSongs.map((song, index) => (
                <div key={song._id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 leading-none ${
                    index === 0 ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200" :
                    index === 1 ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200" :
                    index === 2 ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200" :
                    "bg-gray-50 text-gray-500 border border-gray-100"
                  }`}>
                    {index + 1}
                  </span>
                  <img src={song.image} alt={song.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{song.name}</p>
                    <p className="text-sm text-gray-600 truncate">{song.artist || song.album}</p>
                  </div>
                  <div className="text-right shrink-0 pr-1">
                    <p className="text-sm font-bold text-gray-800 leading-tight">{song.playCount?.toLocaleString() || 0} plays</p>
                    <p className="text-xs text-gray-500 font-medium">{song.likeCount?.toLocaleString() || 0} likes</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-10">No song data yet</p>
          )}
        </div>

        {/* Top Artists */}
        <div className="card-admin-alt overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100/60 bg-gray-50/10">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Top Artists</h2>
          </div>
          {analytics.topArtists?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {analytics.topArtists.map((artist, index) => (
                <div key={artist._id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 leading-none ${
                    index === 0 ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200" :
                    index === 1 ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200" :
                    index === 2 ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200" :
                    "bg-gray-50 text-gray-500 border border-gray-100"
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
                    <p className="text-sm font-semibold text-gray-700">{artist.totalPlays?.toLocaleString() || 0}</p>
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-tight">listens</p>
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
          <h2 className="text-section-title">Live Stream</h2>
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
                const meta = TYPE_META[item.type] || { 
                  icon: Info, 
                  color: "bg-gray-50 text-gray-600" 
                };
                const Icon = meta.icon;

                return (
                  <div key={item._id || `${item.type}_${item.createdAt}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/30 transition-all duration-200 border-l-2 border-transparent hover:border-blue-500/20">
                    <div className={`w-9 h-9 rounded-xl ${meta.color} flex items-center justify-center shadow-inner`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-gray-700 leading-relaxed">
                        <span className="font-semibold text-gray-900">{item.message.split(' ')[0]}</span> {item.message.slice(item.message.indexOf(' ') + 1)}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 whitespace-nowrap">{timeAgo(item.createdAt)}</p>
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
