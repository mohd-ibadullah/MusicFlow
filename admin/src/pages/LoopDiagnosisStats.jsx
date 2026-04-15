// SYSTEM SCAN: admin auth token is stored as localStorage key "auth_token".
// SYSTEM SCAN: admin pages use Tailwind utility styles and existing card-admin class conventions.
// SYSTEM SCAN: backend admin analytics endpoints follow Authorization Bearer token pattern.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  RefreshCcw,
  Sparkles,
  CheckCircle2,
  XCircle,
  Percent,
  TimerReset,
  Coffee,
  RotateCcw,
} from "lucide-react";
import { url } from "../App";
import { io as createSocket } from "socket.io-client";

const PAGE_SIZE = 20;
const REALTIME_EVENT_DEDUP_TTL_MS = 120000;

const prettyStatus = (status) => {
  if (!status) return "-";
  return status.replace(/_/g, " ");
};

const statusPillClass = (status) => {
  if (status === "bridge_played") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "break_taken") return "bg-teal-50 text-teal-700 border-teal-200";
  if (status === "switched_mix") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (status === "snoozed") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "dismissed") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "ignored") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
};

const LoopDiagnosisStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const socketRef = useRef(null);
  const processedRealtimeEventIdsRef = useRef(new Map());
  const pendingRefreshTimerRef = useRef(null);

  const authHeaders = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
    }),
    []
  );

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

  const fetchStats = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const response = await axios.get(`${url}/api/loop-diagnosis/admin/stats`, {
        headers: authHeaders(),
      });

      if (response.data?.success) {
        setStats(response.data);
      } else {
        setStats(null);
      }
    } catch (err) {
      console.error("[LD] admin stats fetch failed:", err.message);
      setStats(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [authHeaders]);

  const scheduleStatsRefresh = useCallback((delayMs = 250) => {
    clearTimeout(pendingRefreshTimerRef.current);
    pendingRefreshTimerRef.current = setTimeout(() => {
      fetchStats({ silent: true });
    }, delayMs);
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

    const handleLoopRealtimeEvent = (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      scheduleStatsRefresh(180);
    };

    socket.on("connect_error", (err) => {
      console.warn("[LD Admin] Socket connection error:", err.message);
    });

    socket.on("loop:triggered", handleLoopRealtimeEvent);
    socket.on("loop:updated", handleLoopRealtimeEvent);

    socket.on("live:stream:activity", (eventEnvelope) => {
      if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
      const payload = unwrapRealtimePayload(eventEnvelope);
      if (payload?.type === "loop_triggered" || payload?.type === "loop_updated") {
        scheduleStatsRefresh(180);
      }
    });

    return () => {
      clearTimeout(pendingRefreshTimerRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [scheduleStatsRefresh, shouldProcessRealtimeEvent, unwrapRealtimePayload]);

  const recentEvents = useMemo(() => stats?.recentEvents || [], [stats]);

  const pagedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return recentEvents.slice(start, start + PAGE_SIZE);
  }, [page, recentEvents]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(recentEvents.length / PAGE_SIZE)),
    [recentEvents.length]
  );

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const typeMap = useMemo(() => {
    const map = {
      llm: 0,
      fallback_rule: 0,
      fallback_random: 0,
      no_candidates: 0,
      health_nudge: 0,
    };

    for (const item of stats?.typeBreakdown || []) {
      if (Object.prototype.hasOwnProperty.call(map, item._id)) {
        map[item._id] = item.count;
      }
    }

    return map;
  }, [stats]);

  const metricCards = [
    {
      key: "totals",
      label: "Interventions Triggered",
      value: stats?.totals || 0,
      icon: Sparkles,
      color: "from-blue-500 to-indigo-500",
    },
    {
      key: "accepted",
      label: "Positive Actions",
      value: stats?.accepted || 0,
      icon: CheckCircle2,
      color: "from-emerald-500 to-teal-500",
    },
    {
      key: "breakTaken",
      label: "Break Accepted",
      value: stats?.breakTaken || 0,
      icon: Coffee,
      color: "from-teal-500 to-cyan-500",
    },
    {
      key: "snoozed",
      label: "Snoozed",
      value: stats?.snoozed || 0,
      icon: TimerReset,
      color: "from-cyan-500 to-sky-500",
    },
    {
      key: "loopAfterIntervention",
      label: "Loop After Intervention",
      value: stats?.loopAfterIntervention || 0,
      icon: RotateCcw,
      color: "from-indigo-500 to-blue-500",
    },
    {
      key: "dismissed",
      label: "Dismissed",
      value: stats?.dismissed || 0,
      icon: XCircle,
      color: "from-amber-500 to-orange-500",
    },
    {
      key: "successRate",
      label: "Success Rate",
      value: stats?.successRate || "0.0%",
      icon: Percent,
      color: "from-purple-500 to-fuchsia-500",
    },
  ];

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title">Loop Diagnosis</h1>
          <p className="text-page-subtitle">Behavioral intervention and wellbeing telemetry</p>
        </div>
        <button
          onClick={fetchStats}
          className="btn-admin-secondary flex items-center gap-2 self-start"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card-admin grid place-items-center min-h-[240px]">
          <div className="w-8 h-8 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : !stats ? (
        <div className="card-admin text-center py-12">
          <p className="text-gray-600 font-medium">Unable to load loop diagnosis stats.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-0.5">
            {metricCards.map((card, idx) => (
              <div key={card.key} className={`stat-card group ${idx % 2 === 0 ? "card-admin-alt" : ""}`}>
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-md shadow-blue-500/10`}
                  >
                    <card.icon className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-[26px] font-extrabold text-gray-900 tracking-tight mb-1 leading-none">
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </p>
                <p className="text-[13px] font-semibold text-gray-600 uppercase tracking-[0.06em] leading-snug">
                  {card.label}
                </p>
              </div>
            ))}
          </div>

          <div className="stats-card">
            <div className="card-icon flex items-center justify-between">
              <h2 className="text-section-title">Type Breakdown</h2>
            </div>
            <div className="stats-grid grid grid-cols-2 md:grid-cols-4">
              {Object.entries(typeMap).map(([type, count]) => (
                <div
                  key={type}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-slate-600">{type}</p>
                  <p className="text-xl font-extrabold text-slate-800 mt-1 leading-none">{count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-admin overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-section-title">Recent Interventions</h2>
              <span className="text-xs text-gray-400">{recentEvents.length} rows</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase text-[11px] tracking-[0.06em]">
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Looped Song</th>
                    <th className="text-left px-4 py-3">Bridge Song</th>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEvents.map((event, index) => (
                    <tr
                      key={event._id}
                      className={`border-t border-gray-100 hover:bg-slate-50/70 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{event.userId?.name || "Unknown"}</div>
                        <div className="text-sm text-gray-600">{event.userId?.email || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{event.loopedSongId?.name || "-"}</div>
                        <div className="text-sm text-gray-600">{event.loopedSongId?.artist || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{event.bridgeSongId?.name || "-"}</div>
                        <div className="text-sm text-gray-600">{event.bridgeSongId?.artist || "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold border ${statusPillClass(
                            event.interventionStatus
                          )}`}
                        >
                          {prettyStatus(event.interventionStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{event.interventionType}</td>
                    </tr>
                  ))}
                  {pagedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No intervention events yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                className="btn-admin-secondary"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn-admin-secondary"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LoopDiagnosisStats;
