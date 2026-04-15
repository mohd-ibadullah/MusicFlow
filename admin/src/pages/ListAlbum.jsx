import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";
import { Search, RefreshCcw, Library, Trash2 } from "lucide-react";
import DeleteModal from "../components/DeleteModal";
import { io as createSocket } from "socket.io-client";

const REALTIME_EVENT_DEDUP_TTL_MS = 120000;

const ListAlbum = () => {
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

  const upsertAlbum = useCallback((album) => {
    if (!album?._id) return;

    setData((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const albumId = album._id.toString();
      const existingIndex = current.findIndex((item) => item?._id?.toString?.() === albumId);

      if (existingIndex === -1) {
        const next = [album, ...current];
        return next.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
      }

      const next = [...current];
      next[existingIndex] = { ...next[existingIndex], ...album };
      return next;
    });
  }, []);

  const removeAlbumById = useCallback((albumId) => {
    if (!albumId) return;

    const normalizedId = albumId.toString();
    setData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (album) => album?._id?.toString?.() !== normalizedId,
      ),
    );
  }, []);

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/album/list`);
      if (response.data.success && response.data.allAlbums) {
        setData(response.data.allAlbums);
      } else if (response.data.allAlbums) {
        setData(response.data.allAlbums);
      } else {
        setData([]);
      }
    } catch (error) {
      console.error("Error fetching albums:", error);
      toast.error("Error fetching albums");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const removeAlbum = async () => {
    const { id, name } = deleteModal;
    try {
      setDeleteModal(prev => ({ ...prev, loading: true }));
      const token = localStorage.getItem("auth_token");
      const response = await axios.post(`${url}/api/album/remove`, { id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        toast.success(`"${name}" deleted`);
        setDeleteModal({ isOpen: false, id: null, name: null, loading: false });
        removeAlbumById(id);
      } else {
        toast.error(response.data.message || "Failed to delete album");
        setDeleteModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error deleting album");
      setDeleteModal(prev => ({ ...prev, loading: false }));
    }
  };

  const openDeleteModal = (id, name) => {
    setDeleteModal({ isOpen: true, id, name, loading: false });
  };

  const filteredAlbums = data.filter((album) =>
    album.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    album.desc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return "—"; }
  };

  useEffect(() => { fetchAlbums(); }, []);

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
      console.warn("[Admin Albums] Socket connection error:", err.message);
    });

    socket.on("album:created", (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      const payload = unwrapRealtimePayload(eventEnvelope);
      if (payload?.album) {
        upsertAlbum(payload.album);
      }
    });

    socket.on("album:deleted", (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      const payload = unwrapRealtimePayload(eventEnvelope);
      removeAlbumById(payload?.albumId);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [removeAlbumById, shouldProcessRealtimeEvent, unwrapRealtimePayload, upsertAlbum]);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading albums…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">Albums</h1>
          <p className="text-page-subtitle">
            {filteredAlbums.length} {filteredAlbums.length === 1 ? "album" : "albums"}
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
          <button onClick={fetchAlbums} className="btn-admin-secondary flex items-center gap-1.5">
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card-admin text-center py-20 px-8">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner text-gray-300">
            <Library className="w-7 h-7" />
          </div>
          <p className="text-gray-900 font-bold mb-1.5">No albums created yet</p>
          <p className="text-sm text-gray-500 max-w-[220px] mx-auto leading-relaxed text-center">Your catalog is empty. Create an album to begin grouping your tracks.</p>
        </div>
      ) : (
        <div className="card-admin overflow-hidden shadow-md ring-1 ring-gray-100">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50/10 border-b border-gray-100/60">
            <div className="col-span-1 table-admin-header">Cover</div>
            <div className="col-span-3 table-admin-header">Album</div>
            <div className="col-span-3 table-admin-header">Description</div>
            <div className="col-span-2 table-admin-header">Color</div>
            <div className="col-span-2 table-admin-header">Added</div>
            <div className="col-span-1 table-admin-header text-center">Action</div>
          </div>

          {filteredAlbums.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500">No albums match "{searchTerm}"</p>
            </div>
          ) : (
            filteredAlbums.map((item) => (
              <div
                key={item._id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 px-5 py-3 items-center table-admin-row"
              >
                <div className="col-span-1">
                  <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                </div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-sm text-gray-500 truncate">{item.desc}</p>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md border border-gray-200 shrink-0" style={{ backgroundColor: item.bgColor }}></div>
                    <span className="text-xs text-gray-500 font-mono">{item.bgColor}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-semibold text-gray-500 leading-none">{formatDate(item.createdAt)}</span>
                </div>
                <div className="col-span-1 text-center">
                  <button
                    onClick={() => openDeleteModal(item._id, item.name)}
                    className="btn-admin-danger !p-2 !rounded-xl hover:bg-red-50/50 transition-all duration-200"
                    title="Delete album"
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
        onConfirm={removeAlbum}
        title="Delete Album"
        message="Are you sure you want to permanently delete this album and its contents?"
        itemName={deleteModal.name}
        loading={deleteModal.loading}
      />
    </div>
  );
};

export default ListAlbum;