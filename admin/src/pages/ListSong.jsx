import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";
import { Search, RefreshCcw, Music, Trash2 } from "lucide-react";
import DeleteModal from "../components/DeleteModal";
import { io as createSocket } from "socket.io-client";

const REALTIME_EVENT_DEDUP_TTL_MS = 120000;

const ListSong = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const socketRef = useRef(null);
  const processedRealtimeEventIdsRef = useRef(new Map());

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    id: null,
    name: null,
    loading: false
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

  const upsertSong = useCallback((song) => {
    if (!song?._id) return;

    setData((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const songId = song._id.toString();
      const existingIndex = current.findIndex((item) => item?._id?.toString?.() === songId);

      if (existingIndex === -1) {
        const next = [song, ...current];
        return next.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
      }

      const next = [...current];
      next[existingIndex] = { ...next[existingIndex], ...song };
      return next;
    });
  }, []);

  const removeSongById = useCallback((songId) => {
    if (!songId) return;

    const normalizedId = songId.toString();
    setData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (song) => song?._id?.toString?.() !== normalizedId,
      ),
    );
  }, []);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/song/list`);
      if (response.data.success && response.data.data) {
        setData(response.data.data);
      } else {
        toast.error("Failed to load songs");
        setData([]);
      }
    } catch (error) {
      console.error("Error fetching songs:", error);
      toast.error("Error fetching songs");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const removeSong = async () => {
    const { id, name } = deleteModal;
    try {
      setDeleteModal(prev => ({ ...prev, loading: true }));
      const token = localStorage.getItem("auth_token");
      const response = await axios.post(`${url}/api/song/remove`, { id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        toast.success(`"${name}" deleted`);
        setDeleteModal({ isOpen: false, id: null, name: null, loading: false });
        removeSongById(id);
      } else {
        toast.error(response.data.message || "Failed to delete song");
        setDeleteModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error deleting song");
      setDeleteModal(prev => ({ ...prev, loading: false }));
    }
  };

  const openDeleteModal = (id, name) => {
    setDeleteModal({ isOpen: true, id, name, loading: false });
  };

  const filteredSongs = data.filter((song) =>
    song.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.album?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.artist?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return "—"; }
  };

  useEffect(() => { fetchSongs(); }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const socketTarget = url || undefined;

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

    socketRef.current = socket;

    socket.on("connect_error", (err) => {
      console.warn("[Admin Songs] Socket connection error:", err.message);
    });

    socket.on("song:created", (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      const payload = unwrapRealtimePayload(eventEnvelope);
      if (payload?.song) {
        upsertSong(payload.song);
      }
    });

    socket.on("song:deleted", (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      const payload = unwrapRealtimePayload(eventEnvelope);
      removeSongById(payload?.songId);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [removeSongById, shouldProcessRealtimeEvent, unwrapRealtimePayload, upsertSong]);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading songs…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">Songs</h1>
          <p className="text-page-subtitle">
            {filteredSongs.length} {filteredSongs.length === 1 ? "song" : "songs"}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-admin pl-9 !w-48 sm:!w-56"
            />
          </div>
          <button onClick={fetchSongs} className="btn-admin-secondary flex items-center gap-1.5">
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card-admin text-center py-20 px-8">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner text-gray-300">
            <Music className="w-7 h-7" />
          </div>
          <p className="text-gray-900 font-bold mb-1.5">No songs discovered yet</p>
          <p className="text-sm text-gray-500 max-w-[200px] mx-auto leading-relaxed">Your library is currently empty. Start by adding your first track.</p>
        </div>
      ) : (
        <div className="card-admin overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50/10 border-b border-gray-100/60">
            <div className="col-span-1 table-admin-header">Cover</div>
            <div className="col-span-3 table-admin-header">Song</div>
            <div className="col-span-2 table-admin-header">Album</div>
            <div className="col-span-2 table-admin-header">Artist</div>
            <div className="col-span-1 table-admin-header">Duration</div>
            <div className="col-span-2 table-admin-header">Added</div>
            <div className="col-span-1 table-admin-header text-center">Action</div>
          </div>

          {filteredSongs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500">No songs match "{searchTerm}"</p>
            </div>
          ) : (
            filteredSongs.map((item) => (
              <div
                key={item._id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 px-5 py-3 items-center table-admin-row"
              >
                <div className="col-span-1">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-10 h-10 object-cover rounded-lg"
                  />
                </div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name || "Untitled"}</p>
                  <p className="text-xs text-gray-500 truncate">{item.desc || ""}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-gray-600">{item.album || "Single"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-gray-600">{item.artist || "—"}</span>
                </div>
                <div className="col-span-1">
                  <span className="badge-blue">{item.duration || "0:00"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-semibold text-gray-500 leading-none">{formatDate(item.createdAt)}</span>
                </div>
                <div className="col-span-1 text-center">
                  <button
                    onClick={() => openDeleteModal(item._id, item.name)}
                    className="btn-admin-danger !p-2 !rounded-xl hover:bg-red-50/50 transition-all duration-200"
                    title="Delete song"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null, name: null, loading: false })}
        onConfirm={removeSong}
        title="Delete Track"
        message="Are you sure you want to remove this song from your permanent collection?"
        itemName={deleteModal.name}
        loading={deleteModal.loading}
      />
    </div>
  );
};

export default ListSong;