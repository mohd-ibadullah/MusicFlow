// pages/AdminAnalytics.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";

const TYPE_META = {
  song_played: { icon: "🎵", label: "Played" },
  song_added: { icon: "➕", label: "Added" },
  song_liked: { icon: "❤️", label: "Liked" },
  playlist_created: { icon: "🎶", label: "Playlist" },
  album_added: { icon: "💿", label: "Album" },
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
  const socketConnectedRef = useRef(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
  });

  // Helper function to generate unique key for activity deduplication
  const getActivityUniqueKey = (activity) => {
    // Extract songId from activity (might be in songId field or embedded in message)
    let songId = activity.songId || null;

    // Try to extract song identifier from message if not directly available
    if (!songId && activity.message) {
      // Common message patterns in the backend:
      // - "Song Name" was played
      // - "Song Name" was liked
      // - "Song Name" by Artist was played
      // - User is listening to "Song Name"
      const match = activity.message.match(/"([^"]+)"/);
      if (match) {
        // Use the song name as a proxy for songId when actual ID is not available
        // This helps deduplicate even when backend doesn't send songId
        songId = match[1].toLowerCase().replace(/\s+/g, '_');
      }
    }

    const timestamp = new Date(activity.createdAt);
    const minuteTimestamp = Math.floor(timestamp.getTime() / 60000); // Round to minute
    return `${activity.type}|${activity.userId}|${songId}|${minuteTimestamp}`;
  };

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

  const fetchActivity = useCallback(async (merge = true) => {
    try {
      const response = await axios.get(`${url}/api/admin/recent-activity`, {
        headers: authHeaders(),
      });
      if (response.data.success) {
        if (merge) {
          // Because the backend now perfectly records 'song_played' and emits 'activity_created' uniformly,
          // we do not need the wild string-matching deduction logic. Just prepend the fresh socket array
          // and deduplicate exactly by Database ID on top of the backend fresh fetch.
          setActivity(prev => {
            const backendActivities = response.data.data;
            const merged = [...backendActivities, ...prev];
            
            // Standard deterministic Deduplication by _id 
            const uniqueMap = new Map();
            merged.forEach(item => { if (item && item._id) uniqueMap.set(item._id.toString(), item); });
            const unique = Array.from(uniqueMap.values());
            
            const limited = unique.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
            return limited;
          });
        } else {
          // Full replace (used on initial load)
          setActivity(response.data.data);
        }
        setActivityLoading(false);
      }
    } catch (error) {
      console.error("Error fetching activity:", error);
      setActivityLoading(false);
    }
  }, []);

  // Add new activity to the list (for real-time updates directly sourced from database hooks)
  const addActivity = useCallback((newActivity) => {
    setActivity(prev => {
      const activityObj = {
        _id: newActivity._id,
        type: newActivity.type || "song_played",
        message: newActivity.message || "New activity",
        createdAt: newActivity.createdAt || new Date().toISOString(),
        userId: newActivity.userId || null,
        songId: newActivity.songId || null
      };

      // Filter out duplicates by exact database ID and insert new activity at beginning
      const filteredPrev = prev.filter(item => item._id?.toString() !== activityObj._id?.toString());
      return [activityObj, ...filteredPrev].slice(0, 20);
    });
  }, []);

  // Update top songs when song is played or liked
  const updateTopSongs = useCallback((payload = null) => {
    if (!payload?.songId) return;

    setAnalytics(prev => {
      if (!prev) return prev;
      const updated = { ...prev };

      // Update total streams count if it was a song_played event
      if (payload.type === "song_played" && typeof updated.totalStreams === 'number') {
        updated.totalStreams += 1;
      }

      // Update top songs
      if (updated.topSongs) {
        updated.topSongs = [...updated.topSongs];
        const songIndex = updated.topSongs.findIndex(song =>
          song._id === payload.songId || song._id?.toString() === payload.songId
        );

        if (songIndex !== -1) {
          if (payload.type === "song_played") {
            updated.topSongs[songIndex] = {
              ...updated.topSongs[songIndex],
              playCount: (updated.topSongs[songIndex].playCount || 0) + 1
            };
            // Re-sort top songs by playCount (descending)
            updated.topSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
          } else if (payload.type === "song_liked" && payload.likeCount !== undefined) {
             updated.topSongs[songIndex] = {
               ...updated.topSongs[songIndex],
               likeCount: payload.likeCount
             };
          } else if (payload.type === "song_unliked" && payload.likeCount !== undefined) {
             updated.topSongs[songIndex] = {
               ...updated.topSongs[songIndex],
               likeCount: payload.likeCount
             };
          }
        }
      }

      // Update top artists if it's a song_played event
      if (payload.type === "song_played" && payload.artist && updated.topArtists) {
        updated.topArtists = [...updated.topArtists];
        const artistIndex = updated.topArtists.findIndex(artist =>
          artist.name === payload.artist || artist._id === payload.artist
        );

        if (artistIndex !== -1) {
          updated.topArtists[artistIndex] = {
            ...updated.topArtists[artistIndex],
            totalPlays: (updated.topArtists[artistIndex].totalPlays || 0) + 1
          };
          updated.topArtists.sort((a, b) => (b.totalPlays || 0) - (a.totalPlays || 0));
        }
      }

      return updated;
    });
  }, []);

  useEffect(() => {
    // Initial fetch ONLY
    fetchAnalytics();
    fetchActivity(false); // Don't merge on initial load
    // Removed all periodic pollings and setTimeouts exactly as requested
  }, [fetchAnalytics, fetchActivity]);

  // Real-time socket connection for live listener count and activity updates
  useEffect(() => {
    let mounted = true;
    let reconnectTimeout = null;

    const connectSocket = async () => {
      try {
        const { io } = await import("socket.io-client");
        const socket = io({ path: "/socket.io", transports: ["polling", "websocket"] });

        if (!mounted) {
          socket.disconnect();
          return;
        }

        socketRef.current = socket;
        socketConnectedRef.current = false;

        socket.on("connect", () => {
          socketConnectedRef.current = true;
          console.log("[Admin Analytics] Socket connected");

          // Request current listener count from server ONLY. 
          // Removed duplicate fetchAnalytics/fetchActivity calls on reconnect.
          socket.emit("get_listeners");
        });

        socket.on("disconnect", () => {
          socketConnectedRef.current = false;
          console.log("[Admin Analytics] Socket disconnected");
        });

        socket.on("connect_error", (err) => {
          console.warn("[Admin Analytics] Socket connection error:", err.message);
          socketConnectedRef.current = false;

          // Attempt reconnection after delay
          if (mounted) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              if (socketRef.current && !socketRef.current.connected) {
                console.log("[Admin Analytics] Attempting to reconnect socket...");
                socketRef.current.connect();
              }
            }, 3000);
          }
        });

        socket.on("users_listening", (count) => {
          if (!mounted) return;
          setLiveListeners(typeof count === "number" ? Math.max(0, count) : 0);
        });

        // Listen for individual user listening events
        socket.on("user_listening", (payload) => {
          if (!mounted) return;
          console.log("[Admin Analytics] Received user_listening:", payload);

          // Explicitly restore activity feed generation for "song played" actions purely optimistically
          addActivity({
            type: "song_played",
            message: `${payload.userName || "User"} is listening to "${payload.songName || "a song"}"`,
            userId: payload.userId,
            songId: payload.songId || null
          });
        });

        // Listen for new activity events (if backend emits them)
        socket.on("activity_created", (newActivity) => {
          if (!mounted) return;
          console.log("[Admin Analytics] New activity:", newActivity);
          addActivity(newActivity);
        });

        // Listen for analytics updates (when song play counts change)
        socket.on("analytics_updated", (payload) => {
          if (!mounted) return;
          console.log("[Admin Analytics] Analytics updated:", payload);

          // Immediately update top songs/artists when analytics change
          updateTopSongs(payload);
        });

      } catch (err) {
        console.warn("[Admin Analytics] Socket not available:", err.message);
      }
    };

    connectSocket();

    // Fallback fully removed to prevent background fetching loop. API load strictly via initial mount.

    return () => {
      mounted = false;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        socketConnectedRef.current = false;
      }
    };
  }, [fetchAnalytics, fetchActivity, addActivity]);

  const handleRefresh = () => {
    console.log("[Admin Analytics] Manual refresh triggered");
    fetchAnalytics();
    // Use merge mode for activity refresh to preserve socket activities
    fetchActivity(true);
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
            {activity
              .filter((item, index, self) => 
                index === self.findIndex((t) => t.message === item.message)
              )
              .slice(0, 20)
              .map((item, index) => {
              const meta = TYPE_META[item.type] || { icon: "📌", label: "" };
              // Create a stable key using _id if available, otherwise use a combination of content and timestamp
              const stableKey = item._id || `${item.type}_${item.message}_${item.createdAt}_${index}`;
              return (
                <div key={stableKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
