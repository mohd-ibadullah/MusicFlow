// context/PlayerContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import axios from "axios";
import { io as createSocket } from "socket.io-client";
import { useToast } from "./ThemeContext";
import { useAuth } from "./AuthContext";

export const PlayerContext = createContext();

const PLAY_COUNT_SAME_SONG_DEDUP_MS = 10000;
const AI_RECOMMENDATION_LIMIT = 50;
const REALTIME_EVENT_DEDUP_TTL_MS = 120000;

const unwrapRealtimePayload = (eventEnvelope) => {
  if (eventEnvelope && typeof eventEnvelope === "object" && eventEnvelope.payload) {
    return eventEnvelope.payload;
  }
  return eventEnvelope;
};

const PlayerContextProvider = (props) => {
  const audioRef = useRef();
  const seekBg = useRef();
  const seekBar = useRef();
  const { user, isAuthenticated } = useAuth();
  const lastPlayCountedRef = useRef({ songId: null, at: 0 });
  const playStatusRef = useRef(false);
  const userRef = useRef(user);
  const socketRef = useRef(null);
  const songsDataRef = useRef([]);
  // Unique listener ID (works for both logged-in users and guests)
  const listenerIdRef = useRef(null);
  const processedRealtimeEventIdsRef = useRef(new Map());
  const recommendationContextRef = useRef({
    source: null,
    recommendationRequestId: null,
    rankBySongId: new Map(),
  });

  useEffect(() => {
    const uid = user?._id ?? user?.id;

    if (uid) {
      listenerIdRef.current = String(uid);
    } else {
      const saved = localStorage.getItem("guestListenerId");

      if (saved) {
        listenerIdRef.current = saved;
      } else {
        const guestId = "guest_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("guestListenerId", guestId);
        listenerIdRef.current = guestId;
      }
    }
  }, [user]);
  userRef.current = user;

  // Track the src that playWithId already loaded so the [track] effect doesn't double-load
  const manuallyLoadedSrcRef = useRef(null);
  // Suppress emitStoppedListening while switching songs (avoid 0-listener flash)
  const isTransitioningRef = useRef(false);

  const url = import.meta.env.VITE_API_URL ?? "";

  // Core data states
  const [songsData, setSongsData] = useState([]);
  const [albumsData, setAlbumsData] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  // Player state
  const [track, setTrack] = useState(() => {
    try {
      const saved = localStorage.getItem("currentTrack");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return null; // Will fallback to songsData[0] inside getSongsData
  });
  const [playStatus, setPlayStatus] = useState(false);
  const trackRef = useRef(track);
  // Keep a ref in sync so closures always read the live value
  useEffect(() => { playStatusRef.current = playStatus; }, [playStatus]);
  useEffect(() => {
    songsDataRef.current = Array.isArray(songsData) ? songsData : [];
  }, [songsData]);
  // Sync track to ref
  useEffect(() => { trackRef.current = track; }, [track]);

  // Features state
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [volume, setVolume] = useState(80);
  const [currentPlaylist, setCurrentPlaylist] = useState(() => {
    try {
      const saved = localStorage.getItem("currentPlaylist");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(() => {
    const saved = localStorage.getItem("currentPlaylistIndex");
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  // Persist track and queue
  useEffect(() => {
    if (track) localStorage.setItem("currentTrack", JSON.stringify(track));
  }, [track]);
  useEffect(() => {
    localStorage.setItem("currentPlaylist", JSON.stringify(currentPlaylist || []));
  }, [currentPlaylist]);
  useEffect(() => {
    localStorage.setItem("currentPlaylistIndex", currentPlaylistIndex.toString());
  }, [currentPlaylistIndex]);

  // User data
  const [likedSongs, setLikedSongs] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [trendingSongs, setTrendingSongs] = useState([]);
  const [liveListening, setLiveListening] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState({
    songs: [],
    albums: [],
    playlists: [],
  });

  // Load data from localStorage on mount (for both authenticated and non-authenticated users)
  useEffect(() => {
    try {
      const savedLikedSongs = localStorage.getItem("likedSongs");
      const savedRecentlyPlayed = localStorage.getItem("recentlyPlayed");
      const savedVolume = localStorage.getItem("volume");

      // Only load from localStorage if backend hasn't loaded data yet (for authenticated users)
      // For non-authenticated users, always load from localStorage
      if (!isAuthenticated) {
        if (savedLikedSongs) setLikedSongs(JSON.parse(savedLikedSongs));
        if (savedRecentlyPlayed)
          setRecentlyPlayed(JSON.parse(savedRecentlyPlayed));
      }
      if (savedVolume) setVolume(parseInt(savedVolume));
    } catch (error) {
      console.error("Error loading from localStorage:", error);
    }
  }, []); // Only run on mount

  // Save to localStorage - for both authenticated and non-authenticated users
  useEffect(() => {
    try {
      const likedSongsToSave = Array.isArray(likedSongs) ? likedSongs : [];
      localStorage.setItem("likedSongs", JSON.stringify(likedSongsToSave));
    } catch (error) {
      console.error("Error saving liked songs to localStorage:", error);
    }
  }, [likedSongs]);

  useEffect(() => {
    try {
      const recentlyPlayedToSave = Array.isArray(recentlyPlayed)
        ? recentlyPlayed
        : [];
      localStorage.setItem(
        "recentlyPlayed",
        JSON.stringify(recentlyPlayedToSave),
      );
    } catch (error) {
      console.error("Error saving recently played to localStorage:", error);
    }
  }, [recentlyPlayed]);

  useEffect(() => {
    localStorage.setItem("volume", volume.toString());
  }, [volume]);

  // Add to recently played
  const addToRecentlyPlayed = useCallback(async (song) => {
    if (!song?._id) return;

    // Capture the current state before the optimistic update so we can restore it exactly on failure
    let previousState;
    setRecentlyPlayed((prev) => {
      previousState = Array.isArray(prev) ? prev : [];
      const filtered = previousState.filter((item) => item && item._id !== song._id);
      const songWithTime = { ...song, playedAt: new Date().toISOString() };
      return [songWithTime, ...filtered].slice(0, 5);
    });

    try {
      const response = await axios.post(`${url}/api/song/recently-played`, {
        songId: song._id,
      });

      if (!response.data.success) {
        setRecentlyPlayed(previousState);
      }
    } catch (error) {
      console.error("Error adding to recently played:", error);
      setRecentlyPlayed(previousState);
    }
  }, []);

  // Use ThemeContext's toast; assume PlayerContext is used within ThemeProvider
  const themeToast = useToast();

  const showToast = useCallback(
    (message, type = "info") => {
      if (themeToast && typeof themeToast.showToast === "function") {
        themeToast.showToast(message, type);
      }
    },
    [themeToast],
  );

  const shouldProcessRealtimeEvent = useCallback((eventEnvelope) => {
    const eventId = eventEnvelope?.eventId;
    if (!eventId) return true;

    const now = Date.now();
    for (const [trackedEventId, expiresAt] of processedRealtimeEventIdsRef.current.entries()) {
      if (!expiresAt || expiresAt <= now) {
        processedRealtimeEventIdsRef.current.delete(trackedEventId);
      }
    }

    if (processedRealtimeEventIdsRef.current.has(eventId)) {
      return false;
    }

    processedRealtimeEventIdsRef.current.set(
      eventId,
      now + REALTIME_EVENT_DEDUP_TTL_MS,
    );

    return true;
  }, []);

  const upsertSongInState = useCallback((songPayload) => {
    const songId = songPayload?._id?.toString?.() || songPayload?._id;
    if (!songId) return;

    setSongsData((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const index = current.findIndex((song) => song?._id?.toString?.() === songId.toString());
      if (index === -1) {
        return [songPayload, ...current];
      }

      const next = [...current];
      next[index] = { ...next[index], ...songPayload };
      return next;
    });
  }, []);

  const removeSongFromState = useCallback((songId) => {
    const normalizedSongId = songId?.toString?.() || songId;
    if (!normalizedSongId) return;

    setSongsData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (song) => song?._id?.toString?.() !== normalizedSongId,
      ),
    );

    setTrendingSongs((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (song) => song?._id?.toString?.() !== normalizedSongId,
      ),
    );

    setRecommendations((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (song) => song?._id?.toString?.() !== normalizedSongId,
      ),
    );

    setLikedSongs((prev) =>
      (Array.isArray(prev) ? prev : []).filter((song) => {
        if (typeof song === "string") return song !== normalizedSongId;
        return song?._id?.toString?.() !== normalizedSongId;
      }),
    );

    setRecentlyPlayed((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (song) => song?._id?.toString?.() !== normalizedSongId,
      ),
    );
  }, []);

  const upsertAlbumInState = useCallback((albumPayload) => {
    const albumId = albumPayload?._id?.toString?.() || albumPayload?._id;
    if (!albumId) return;

    setAlbumsData((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const index = current.findIndex((album) => album?._id?.toString?.() === albumId.toString());
      if (index === -1) {
        return [albumPayload, ...current];
      }

      const next = [...current];
      next[index] = { ...next[index], ...albumPayload };
      return next;
    });
  }, []);

  const removeAlbumFromState = useCallback((albumId) => {
    const normalizedAlbumId = albumId?.toString?.() || albumId;
    if (!normalizedAlbumId) return;

    setAlbumsData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (album) => album?._id?.toString?.() !== normalizedAlbumId,
      ),
    );
  }, []);

  const upsertPlaylistInState = useCallback((playlistPayload) => {
    const playlistId = playlistPayload?._id?.toString?.() || playlistPayload?._id;
    if (!playlistId) return;

    setPlaylists((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const index = current.findIndex((playlist) => playlist?._id?.toString?.() === playlistId.toString());
      if (index === -1) {
        return [playlistPayload, ...current];
      }

      const next = [...current];
      next[index] = { ...next[index], ...playlistPayload };
      return next;
    });
  }, []);

  const removePlaylistFromState = useCallback((playlistId) => {
    const normalizedPlaylistId = playlistId?.toString?.() || playlistId;
    if (!normalizedPlaylistId) return;

    setPlaylists((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (playlist) => playlist?._id?.toString?.() !== normalizedPlaylistId,
      ),
    );
  }, []);

  // Emit listener status to socket (reusable)
  const emitStartedListening = useCallback(() => {
    const sock = socketRef.current;
    const listenerId = listenerIdRef.current;
    const currentTrack = trackRef.current;

    if (!sock || !listenerId) {
      console.warn("[Socket] Cannot emit: socket or listenerId not ready");
      return;
    }

    sock.emit("user_started_listening", {
      userId: listenerId,
      songId: currentTrack?._id || null,
      songName: currentTrack?.name || null,
      userName: userRef.current?.name || "Anonymous"
    });
  }, []);

  const emitStoppedListening = useCallback(() => {
    // Don't emit during song transitions — the brief pause between songs is internal
    if (isTransitioningRef.current) return;

    const sock = socketRef.current;
    const listenerId = listenerIdRef.current;

    if (!sock || !listenerId) return;

    sock.emit("user_stopped_listening", { userId: listenerId });
  }, []);

  // Player controls
  const play = useCallback(() => {
    if (audioRef.current && track) {
      audioRef.current.volume = volume / 100;
      audioRef.current
        .play()
        .then(() => {
          setPlayStatus(true);
          // Socket emit is handled exclusively by el.onplay (audio element callback)
        })
        .catch((error) => {
          console.error("Play error:", error);
          showToast("Failed to play song", "error");
        });
    }
  }, [track, volume, showToast]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayStatus(false);
      // Socket emit is handled exclusively by el.onpause (audio element callback)
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (playStatus) {
      pause();
    } else {
      play();
    }
  }, [playStatus, play, pause]);

  const playWithId = useCallback(
    // Play a song by ID, set audio src and play
    (id, playlist = null) => {
      if (!id) {
        showToast("No song selected", "error");
        return;
      }

      let song = songsData.find((item) => item?._id === id);
      if (!song && Array.isArray(playlist) && playlist.length > 0) {
        song = playlist.find((item) => item?._id === id);
      }

      // Always sync the underlying array queue context so Next/Prev buttons map correctly
      // even if the user clicks a song that is already actively playing.
      const safePlaylist = Array.isArray(playlist) && playlist.length > 0 ? playlist : songsData;
      setCurrentPlaylist(safePlaylist);
      const songIndex = safePlaylist.findIndex((item) => item?._id === id);
      setCurrentPlaylistIndex(songIndex >= 0 ? songIndex : 0);

      // If the same song is already loaded, just toggle play/pause now that context is updated
      if (track && track._id === id) {
        if (playStatusRef.current) {
          pause();
        } else {
          play();
        }
        return;
      }

      if (!song) {
        showToast("Song not found", "error");
        return;
      }

      if (!song.file) {
        showToast("Song file not available", "error");
        return;
      }

      try {
        setTrack(song);
        trackRef.current = song; // Update ref immediately for socket emissions
        addToRecentlyPlayed(song);

        if (audioRef.current) {
          // Mark transition so emitStoppedListening is suppressed during load
          isTransitioningRef.current = true;
          // Tell [track] effect this src is already being loaded — skip double-load
          manuallyLoadedSrcRef.current = song.file;

          // Stop current playback
          audioRef.current.pause();
          audioRef.current.currentTime = 0;

          // Set new source
          audioRef.current.src = song.file;
          audioRef.current.load();

          // Wait for audio to be ready
          const handleCanPlay = () => {
            audioRef.current.removeEventListener("canplay", handleCanPlay);
            audioRef.current
              .play()
              .then(() => {
                isTransitioningRef.current = false;
                setPlayStatus(true);
                showToast(`Now playing: ${song.name}`, "success");
                // Socket emit is handled exclusively by el.onplay (audio element callback)
              })
              .catch((error) => {
                isTransitioningRef.current = false;
                console.error("Play error:", error);
                showToast("Failed to play song. Please try again.", "error");
                setPlayStatus(false);
              });
          };

          const handleError = () => {
            isTransitioningRef.current = false;
            audioRef.current.removeEventListener("error", handleError);
            console.error("Audio load error for:", song.file);
            showToast("Failed to load song. Please try another song.", "error");
            setPlayStatus(false);
          };

          audioRef.current.addEventListener("canplay", handleCanPlay);
          audioRef.current.addEventListener("error", handleError);

          // Fallback timeout — use ref to read live playStatus, not the stale closure value
          setTimeout(() => {
            if (!playStatusRef.current) {
              audioRef.current.removeEventListener("canplay", handleCanPlay);
              audioRef.current.removeEventListener("error", handleError);
              showToast(
                "Song is taking too long to load. Please try again.",
                "error",
              );
            }
          }, 10000);
        }
      } catch (error) {
        console.error("Error in playWithId:", error);
        showToast("Failed to play song", "error");
      }
    },
    [
      track,
      songsData,
      addToRecentlyPlayed,
      showToast,
      play,
      pause,
    ],
  );

  // Enhanced playlist playback function
  const playPlaylist = useCallback(
    (playlistId) => {
      const playlist = playlists.find((p) => p._id === playlistId);
      if (!playlist || !playlist.songs || playlist.songs.length === 0) {
        showToast("Playlist is empty or not found", "error");
        return;
      }

      // Start playing the first song in the playlist
      const firstSong = playlist.songs[0];
      if (firstSong) {
        playWithId(firstSong._id, playlist.songs);
        showToast(`Playing playlist: ${playlist.name}`, "success");
      }
    },
    [playlists, playWithId, showToast],
  );

  const next = useCallback((options = {}) => {
    const reason = options?.reason || "auto";
    const currentTrack = trackRef.current;

    if (reason === "manual" && isAuthenticated && currentTrack?._id) {
      const recommendationContext = recommendationContextRef.current;
      const currentTrackId = currentTrack._id.toString();
      const hasRankContext =
        recommendationContext.rankBySongId instanceof Map &&
        recommendationContext.rankBySongId.has(currentTrackId);

      const rank = hasRankContext
        ? recommendationContext.rankBySongId.get(currentTrackId)
        : null;

      axios
        .post(`${url}/api/ai/feedback`, {
          songId: currentTrack._id,
          interactionType: "skip",
          source: hasRankContext ? "player_next_button" : "player_next_button_unranked",
          recommendationRequestId: hasRankContext
            ? recommendationContext.recommendationRequestId || null
            : null,
          rank,
        })
        .catch((error) => {
          console.warn("Skip feedback logging failed:", error.message);
        });
    }

    const safePlaylist = Array.isArray(currentPlaylist) ? currentPlaylist : [];
    if (safePlaylist.length === 0) return;

    let nextIndex;
    if (isShuffled && safePlaylist.length > 1) {
      // Exclude current index so a different song is always selected
      nextIndex = Math.floor(Math.random() * (safePlaylist.length - 1));
      if (nextIndex >= currentPlaylistIndex) nextIndex++;
    } else if (isShuffled) {
      nextIndex = 0;
    } else {
      nextIndex = (currentPlaylistIndex + 1) % safePlaylist.length;
    }

    const nextSong = safePlaylist[nextIndex];
    if (nextSong) {
      setCurrentPlaylistIndex(nextIndex);
      setTrack(nextSong);
      addToRecentlyPlayed(nextSong);

      if (audioRef.current) {
        isTransitioningRef.current = true;
        manuallyLoadedSrcRef.current = nextSong.file || nextSong.url || nextSong.src || nextSong.audio || "";
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = manuallyLoadedSrcRef.current;
        audioRef.current.load();
        // { once: true } prevents handler accumulation from rapid next() calls
        audioRef.current.addEventListener("canplay", () => {
          audioRef.current.play()
            .then(() => {
              setPlayStatus(true);
              // Socket emit + transition flag cleared exclusively by el.onplay
            })
            .catch((err) => {
              isTransitioningRef.current = false;
              console.error("next() play error:", err);
            });
        }, { once: true });
      }
    }
  }, [
    currentPlaylist,
    currentPlaylistIndex,
    isShuffled,
    addToRecentlyPlayed,
    isAuthenticated,
    url,
  ]);

  const previous = useCallback(() => {
    const safePlaylist = Array.isArray(currentPlaylist) ? currentPlaylist : [];
    if (safePlaylist.length === 0) return;

    const prevIndex =
      currentPlaylistIndex > 0
        ? currentPlaylistIndex - 1
        : safePlaylist.length - 1;
    const prevSong = safePlaylist[prevIndex];

    if (prevSong) {
      setCurrentPlaylistIndex(prevIndex);
      setTrack(prevSong);
      addToRecentlyPlayed(prevSong);

      if (audioRef.current) {
        isTransitioningRef.current = true;
        manuallyLoadedSrcRef.current = prevSong.file || prevSong.url || prevSong.src || prevSong.audio || "";
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = manuallyLoadedSrcRef.current;
        audioRef.current.load();
        // { once: true } prevents handler accumulation from rapid previous() calls
        audioRef.current.addEventListener("canplay", () => {
          audioRef.current.play()
            .then(() => {
              setPlayStatus(true);
              // Socket emit + transition flag cleared exclusively by el.onplay
            })
            .catch((err) => {
              isTransitioningRef.current = false;
              console.error("previous() play error:", err);
            });
        }, { once: true });
      }
    }
  }, [currentPlaylist, currentPlaylistIndex, addToRecentlyPlayed]);

  const seekSong = useCallback((e) => {
    if (
      !audioRef.current ||
      !seekBg.current ||
      !Number.isFinite(audioRef.current.duration)
    )
      return;
    const rect = seekBg.current.getBoundingClientRect();
    const percent = Math.min(
      Math.max((e.clientX - rect.left) / rect.width, 0),
      1,
    );
    const seekTime = percent * audioRef.current.duration;
    const wasPlaying = !audioRef.current.paused;
    audioRef.current.currentTime = seekTime;
    if (wasPlaying) {
      audioRef.current.play().catch(() => { });
    }
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffled((prev) => !prev);
    showToast(isShuffled ? "Shuffle disabled" : "Shuffle enabled", "info");
  }, [isShuffled, showToast]);

  const toggleRepeat = useCallback(() => {
    setIsRepeating((prev) => !prev);
    showToast(isRepeating ? "Repeat disabled" : "Repeat enabled", "info");
  }, [isRepeating, showToast]);

  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
  }, []);

  // Like/Unlike functionality
  const toggleLikeSong = useCallback(
    async (songId) => {
      if (!songId) {
        showToast("Invalid song ID", "error");
        return;
      }

      const currentLikedSongs = Array.isArray(likedSongs) ? likedSongs : [];
      const song = songsData.find((s) => s._id === songId);

      if (!song) {
        showToast("Song not found", "error");
        return;
      }

      const isCurrentlyLiked = currentLikedSongs.some((likedSong) =>
        typeof likedSong === "string"
          ? likedSong === songId
          : likedSong._id === songId,
      );

      // Optimistic update - update UI silently immediately
      if (isCurrentlyLiked) {
        setLikedSongs(currentLikedSongs.filter((likedSong) =>
          typeof likedSong === "string"
            ? likedSong !== songId
            : likedSong._id !== songId,
        ));
      } else {
        setLikedSongs([...currentLikedSongs, song]);
      }

      try {
        let response;
        if (isCurrentlyLiked) {
          // Unlike the song
          response = await axios.post(`${url}/api/song/unlike`, { songId });
        } else {
          // Like the song
          response = await axios.post(`${url}/api/song/like`, { songId });
        }

        if (!response.data.success) {
          // Revert optimistic update on failure
          setLikedSongs(currentLikedSongs);
          showToast(
            response.data.message || "Failed to update liked songs",
            "error",
          );
        } else {
          // Fire accurate success toast after DB confirms
          showToast(
            isCurrentlyLiked ? `Removed "${song.name}" from liked songs` : `Added "${song.name}" to liked songs`,
            isCurrentlyLiked ? "info" : "success"
          );
        }
      } catch (error) {
        console.error("Error toggling like:", error);
        // Revert optimistic update on error
        setLikedSongs(currentLikedSongs);
        showToast("Failed to update liked songs", "error");
      }
    },
    [likedSongs, songsData, showToast],
  );

  const isSongLiked = useCallback(
    (songId) => {
      return likedSongs.some((likedSong) =>
        typeof likedSong === "string"
          ? likedSong === songId
          : likedSong._id === songId,
      );
    },
    [likedSongs],
  );

  // Search functionality
  const performSearch = useCallback(
    (query) => {
      const qRaw = typeof query === "string" ? query : "";
      const q = qRaw.trim();

      if (!q) {
        setSearchResults({ songs: [], albums: [], playlists: [] });
        return;
      }

      // Normalization helper (removes accents and lowercases)
      const normalize = (str) => {
        try {
          return (str || "")
            .toString()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase();
        } catch (_e) {
          return (str || "").toString().toLowerCase();
        }
      };

      const needle = normalize(q);
      // Match songs by common string fields (be generous to backend shape)
      const matchedSongs = songsData.filter((song) => {
        const hayParts = [
          song?.name,
          song?.title,
          song?.desc,
          song?.description,
          song?.album,
          song?.artist,
          Array.isArray(song?.artists) ? song.artists.join(" ") : undefined,
        ];
        const hay = normalize(hayParts.filter(Boolean).join(" "));
        return hay.includes(needle);
      });

      const matchedAlbums = albumsData.filter((album) => {
        const hayParts = [
          album?.name,
          album?.title,
          album?.desc,
          album?.artist,
        ];
        const hay = normalize(hayParts.filter(Boolean).join(" "));
        return hay.includes(needle);
      });

      const matchedPlaylists = playlists.filter((playlist) => {
        const hayParts = [
          playlist?.name,
          playlist?.title,
          playlist?.desc,
          playlist?.description,
        ];
        const hay = normalize(hayParts.filter(Boolean).join(" "));
        return hay.includes(needle);
      });


      setSearchResults({
        songs: matchedSongs,
        albums: matchedAlbums,
        playlists: matchedPlaylists,
      });
    },
    [songsData, albumsData, playlists],
  );

  // Debounced search: when `searchQuery` changes, run performSearch after a short pause
  // Also re-run when songsData/albumsData/playlists load (e.g. async fetch) so results update
  useEffect(() => {
    const q = typeof searchQuery === "string" ? searchQuery.trim() : "";
    if (!q) {
      setSearchResults({ songs: [], albums: [], playlists: [] });
      return;
    }
    const id = setTimeout(() => {
      performSearch(q);
    }, 220);
    return () => clearTimeout(id);
  }, [searchQuery, songsData, albumsData, playlists]);

  // Playlist management
  const createPlaylist = useCallback(
    async (name) => {
      if (!name?.trim()) {
        showToast("Playlist name is required", "error");
        return { success: false };
      }

      const tempId = `temp-${Date.now()}`;
      const optimisticPlaylist = {
        _id: tempId,
        name: name.trim(),
        description: "My playlist",
        songs: []
      };

      // Optimistically add the playlist to the UI instantly
      setPlaylists((prev) => [...prev, optimisticPlaylist]);

      try {
        const response = await axios.post(`${url}/api/playlist/create`, {
          name: name.trim(),
          description: "My playlist",
        });

        if (response.data.success) {
          if (response.data.playlist) {
            setPlaylists((prev) =>
              prev.map(p => p._id === tempId ? response.data.playlist : p)
            );
          }
          showToast("Playlist created successfully", "success");
          return { success: true };
        } else {
          // Revert speculative update
          setPlaylists((prev) => prev.filter(p => p._id !== tempId));
          showToast(
            response.data.message || "Failed to create playlist",
            "error",
          );
          return { success: false };
        }
      } catch (error) {
        // Revert speculative update
        setPlaylists((prev) => prev.filter(p => p._id !== tempId));
        console.error("Error creating playlist:", error);
        const message =
          error.response?.data?.message || "Failed to create playlist";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast],
  );

  const deletePlaylist = useCallback(
    async (playlistId) => {
      if (!playlistId) {
        showToast("Invalid playlist ID", "error");
        return { success: false };
      }

      // Check if this is a sample playlist (IDs like 'p1', 'p2', etc.)
      if (playlistId.startsWith("p") && playlistId.length <= 3) {
        showToast(
          "Sample playlists cannot be deleted. Please log in to create and manage your own playlists.",
          "info",
        );
        return { success: false };
      }

      // Check if user is authenticated
      if (!isAuthenticated) {
        showToast("Please log in to delete playlists", "error");
        return { success: false };
      }

      const previousPlaylists = playlists;
      setPlaylists((prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (playlist) => playlist?._id?.toString?.() !== playlistId,
        ),
      );

      try {
        const response = await axios.delete(
          `${url}/api/playlist/delete/${playlistId}`,
        );

        if (response.data.success) {
          showToast("Playlist deleted successfully", "success");
          return { success: true };
        } else {
          setPlaylists(previousPlaylists);
          showToast(
            response.data.message || "Failed to delete playlist",
            "error",
          );
          return { success: false };
        }
      } catch (error) {
        console.error("Error deleting playlist:", error);
        setPlaylists(previousPlaylists);
        const message =
          error.response?.data?.message || "Failed to delete playlist";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, isAuthenticated, playlists],
  );

  const addSongToPlaylist = useCallback(
    async (playlistId, songId) => {
      if (!playlistId || !songId) {
        showToast("Invalid playlist or song ID", "error");
        return { success: false };
      }

      // Check if this is a sample playlist
      if (playlistId.startsWith("p") && playlistId.length <= 3) {
        showToast(
          "Sample playlists cannot be modified. Please log in to create your own playlists.",
          "info",
        );
        return { success: false };
      }

      // Check if user is authenticated
      if (!isAuthenticated) {
        showToast("Please log in to add songs to playlists", "error");
        return { success: false };
      }

      try {
        const previousPlaylists = playlists;
        // Find the song to add
        const songToAdd = songsData.find((song) => song._id === songId);
        if (!songToAdd) {
          showToast("Song not found", "error");
          return { success: false };
        }

        // Check if song already exists in playlist before making any changes
        const playlistObj = playlists.find(p => p._id === playlistId);
        if (playlistObj && playlistObj.songs?.some(song => song._id === songId)) {
          showToast("Song already exists in this playlist", "error");
          return { success: false };
        }

        // Optimistically update the local state first for instant UI update
        setPlaylists((prevPlaylists) =>
          prevPlaylists.map((playlist) => {
            if (playlist._id === playlistId) {
              return {
                ...playlist,
                songs: [...(playlist.songs || []), songToAdd],
              };
            }
            return playlist;
          }),
        );

        const response = await axios.post(`${url}/api/playlist/add-song`, {
          playlistId,
          songId,
        });

        if (response.data.success) {
          // Sync exact state from API response to prevent UI flickering
          if (response.data.playlist) {
            setPlaylists((prevPlaylists) =>
              prevPlaylists.map((playlist) =>
                playlist._id === response.data.playlist._id
                  ? response.data.playlist
                  : playlist
              )
            );
          }
          showToast("Song added to playlist", "success");
          return { success: true };
        } else {
          // Revert optimistic update on failure
          setPlaylists(previousPlaylists);
          showToast(response.data.message || "Failed to add song", "error");
          return { success: false };
        }
      } catch (error) {
        console.error("Error adding song to playlist:", error);
        // Revert optimistic update on error
        setPlaylists(playlists);
        const message = error.response?.data?.message || "Failed to add song";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, songsData, isAuthenticated, playlists],
  );

  const removeSongFromPlaylist = useCallback(
    async (playlistId, songId) => {
      if (!playlistId || !songId) {
        showToast("Invalid playlist or song ID", "error");
        return { success: false };
      }

      // Check if this is a sample playlist
      if (playlistId.startsWith("p") && playlistId.length <= 3) {
        showToast(
          "Sample playlists cannot be modified. Please log in to create your own playlists.",
          "info",
        );
        return { success: false };
      }

      // Check if user is authenticated
      if (!isAuthenticated) {
        showToast("Please log in to remove songs from playlists", "error");
        return { success: false };
      }

      try {
        const previousPlaylists = playlists;
        // Optimistically update the local state first for instant UI update
        setPlaylists((prevPlaylists) =>
          prevPlaylists.map((playlist) => {
            if (playlist._id === playlistId) {
              return {
                ...playlist,
                songs:
                  playlist.songs?.filter((song) => song._id !== songId) || [],
              };
            }
            return playlist;
          }),
        );

        const response = await axios.post(`${url}/api/playlist/remove-song`, {
          playlistId,
          songId,
        });

        if (response.data.success) {
          // Sync exact state from API response to prevent UI flickering
          if (response.data.playlist) {
            setPlaylists((prevPlaylists) =>
              prevPlaylists.map((playlist) =>
                playlist._id === response.data.playlist._id
                  ? response.data.playlist
                  : playlist
              )
            );
          }
          showToast("Song removed from playlist", "success");
          return { success: true };
        } else {
          // Revert optimistic update on failure
          setPlaylists(previousPlaylists);
          showToast(response.data.message || "Failed to remove song", "error");
          return { success: false };
        }
      } catch (error) {
        console.error("Error removing song from playlist:", error);
        // Revert optimistic update on error
        setPlaylists(playlists);
        const message =
          error.response?.data?.message || "Failed to remove song";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, isAuthenticated, playlists],
  );

  // Data fetching
  // Data fetching functions to load songs/albums/playlists

  const getSongsData = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/song/list`);
      const songs = response.data.success
        ? Array.isArray(response.data.data)
          ? response.data.data
          : []
        : Array.isArray(response.data)
          ? response.data
          : [];

      // If backend returned empty, fallback to local sample data
      if (!songs || songs.length === 0) {
        try {
          const sampleModule = await import("../data/sampleData");
          setSongsData(sampleModule.sampleSongs);
          if (!track && sampleModule.sampleSongs.length > 0) {
            setTrack(sampleModule.sampleSongs[0]);
            setCurrentPlaylist(sampleModule.sampleSongs);
          }
          return;
        } catch (impErr) {
          console.warn("No sample songs available", impErr);
        }
      }

      setSongsData(songs);

      if (songs.length > 0 && !track) {
        setTrack(songs[0]);
        setCurrentPlaylist(songs);
      }
    } catch (error) {
      console.error("Error fetching songs:", error);
      // Fallback to sample data on error
      try {
        const sampleModule = await import("../data/sampleData");
        setSongsData(sampleModule.sampleSongs);
        if (!track && sampleModule.sampleSongs.length > 0) {
          setTrack(sampleModule.sampleSongs[0]);
          setCurrentPlaylist(sampleModule.sampleSongs);
        }
      } catch (impErr) {
        console.error("No sample songs available", impErr);
        setSongsData([]);
      }
    }
  }, [track]);

  const getAlbumsData = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/album/list`);
      const albums = Array.isArray(response.data.allAlbums)
        ? response.data.allAlbums
        : Array.isArray(response.data)
          ? response.data
          : [];

      if (!albums || albums.length === 0) {
        try {
          const sampleModule = await import("../data/sampleData");
          setAlbumsData(sampleModule.sampleAlbums);
          return;
        } catch (impErr) {
          console.warn("No sample albums available", impErr);
        }
      }

      setAlbumsData(albums);
    } catch (error) {
      console.error("Error fetching albums:", error);
      try {
        const sampleModule = await import("../data/sampleData");
        setAlbumsData(sampleModule.sampleAlbums);
      } catch (impErr) {
        console.error("No sample albums available", impErr);
        setAlbumsData([]);
      }
    }
  }, []);

  const getPlaylistsData = useCallback(async () => {
    // Only fetch playlists if authenticated
    if (!isAuthenticated) {
      setPlaylists([]);
      return;
    }

    try {
      const response = await axios.get(`${url}/api/playlist/list`);
      if (response.data.success) {
        const pls = Array.isArray(response.data.playlists)
          ? response.data.playlists
          : [];
        setPlaylists(pls);
      } else {
        setPlaylists([]);
      }
    } catch (error) {
      console.error("Error fetching playlists:", error);
      setPlaylists([]);
    }
  }, [isAuthenticated]);

  const getLikedSongs = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/song/liked`);
      if (response.data.success) {
        const likedSongsData = Array.isArray(response.data.likedSongs)
          ? response.data.likedSongs
          : [];
        setLikedSongs(likedSongsData);
        return;
      }
    } catch (error) {
      console.error("Error fetching liked songs:", error);
    }

    // fallback: no liked songs initially
    setLikedSongs([]);
  }, []);

  const getRecentlyPlayed = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/song/recently-played`);
      if (response.data.success) {
        const recentlyPlayedData = Array.isArray(response.data.recentlyPlayed)
          ? response.data.recentlyPlayed
          : [];
        setRecentlyPlayed(recentlyPlayedData);
        return;
      }
    } catch (error) {
      console.error("Error fetching recently played:", error);
    }

    // fallback: no recently played initially
    setRecentlyPlayed([]);
  }, []);

  // Fetch recommendations and trending
  const fetchRecommendationsAndTrending = useCallback(async () => {
    try {
      let recs = [];
      let recommendationRequestId = null;
      let recommendationSource = null;

      const authUserId = userRef.current?._id || userRef.current?.id || null;

      if (isAuthenticated && authUserId) {
        try {
          const aiRes = await axios.get(`${url}/api/ai/recommendations`, {
            params: { limit: AI_RECOMMENDATION_LIMIT },
          });

          if (aiRes.data?.success && Array.isArray(aiRes.data.recommendations)) {
            recs = aiRes.data.recommendations;
            recommendationRequestId = aiRes.data.recommendationRequestId || null;
            recommendationSource = "ai-endpoint";
          }
        } catch (aiErr) {
          console.warn("AI recommendations fetch failed:", aiErr.message);
        }
      }

      if (recs.length === 0) {
        try {
          const recRes = await axios.get(`${url}/api/song/recommendations`);

          if (recRes.data?.success && Array.isArray(recRes.data.recommendations)) {
            recs = recRes.data.recommendations;
          } else {
            // Failsafe fallback: use top songs by playCount from /api/song/list
            const songsRes = await axios
              .get(`${url}/api/song/list`)
              .catch(() => ({ data: {} }));

            const songs =
              Array.isArray(songsRes.data?.data) && songsRes.data.data.length > 0
                ? songsRes.data.data
                : [];

            recs = songs
              .slice()
              .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
              .slice(0, AI_RECOMMENDATION_LIMIT);
          }
        } catch (fallbackErr) {
          console.warn("Fallback recommendations failed:", fallbackErr.message);
        }
      }

      const normalizedRecs = Array.isArray(recs)
        ? recs.slice(0, AI_RECOMMENDATION_LIMIT)
        : [];
      setRecommendations(normalizedRecs);

      const rankBySongId = new Map();
      for (let index = 0; index < normalizedRecs.length; index += 1) {
        const song = normalizedRecs[index];
        const songId = song?._id?.toString?.() || song?._id;
        if (songId) {
          rankBySongId.set(songId.toString(), index);
        }
      }

      recommendationContextRef.current = {
        source: recommendationSource,
        recommendationRequestId,
        rankBySongId,
      };

      try {
        const trendRes = await axios.get(`${url}/api/song/trending?limit=10`);
        if (trendRes.data?.success && Array.isArray(trendRes.data.data)) {
          setTrendingSongs(trendRes.data.data.slice(0, 10));
        }
      } catch (trendErr) {
        console.warn("Trending fetch failed:", trendErr.message);
      }
    } catch (e) {
      console.warn("Recommendations/trending fetch failed:", e.message);
      recommendationContextRef.current = {
        source: null,
        recommendationRequestId: null,
        rankBySongId: new Map(),
      };
    }
  }, [isAuthenticated]);

  // Initialize data on mount and when authentication changes
  useEffect(() => {
    getSongsData();
    getAlbumsData();
    getPlaylistsData();
    fetchRecommendationsAndTrending();

    // Load user-specific data if authenticated
    if (isAuthenticated) {
      getLikedSongs();
      getRecentlyPlayed();
    } else {
      // Clear user data when logged out
      setLikedSongs([]);
      setRecentlyPlayed([]);
    }
  }, [isAuthenticated]); // Run when authentication status changes

  // Socket.IO: live listening activity
  const [activeListenersCount, setActiveListenersCount] = useState(0);
  const isSocketConnectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem("token");
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
        return;
      }

      socketRef.current = socket;

      const patchSongMetrics = (payload, interactionType) => {
        const songId = payload?.songId?.toString?.() || payload?.songId;
        if (!songId) return;

        setSongsData((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const index = current.findIndex((song) => song?._id?.toString?.() === songId.toString());
          if (index === -1) return current;

          const next = [...current];
          const target = { ...next[index] };

          if (interactionType === "played") {
            target.playCount =
              Number.isFinite(payload?.playCount)
                ? payload.playCount
                : (Number(target.playCount) || 0) + 1;
          }

          if (interactionType === "liked" || interactionType === "unliked") {
            target.likeCount =
              Number.isFinite(payload?.likeCount)
                ? payload.likeCount
                : Math.max(
                    0,
                    (Number(target.likeCount) || 0) +
                      (interactionType === "liked" ? 1 : -1),
                  );
          }

          next[index] = target;
          return next;
        });

        setTrendingSongs((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const index = current.findIndex((song) => song?._id?.toString?.() === songId.toString());
          if (index === -1) return current;

          const next = [...current];
          const target = { ...next[index] };

          if (interactionType === "played") {
            target.playCount =
              Number.isFinite(payload?.playCount)
                ? payload.playCount
                : (Number(target.playCount) || 0) + 1;
            next[index] = target;
            return next.sort((a, b) => (Number(b?.playCount) || 0) - (Number(a?.playCount) || 0));
          }

          if (interactionType === "liked" || interactionType === "unliked") {
            target.likeCount =
              Number.isFinite(payload?.likeCount)
                ? payload.likeCount
                : Math.max(
                    0,
                    (Number(target.likeCount) || 0) +
                      (interactionType === "liked" ? 1 : -1),
                  );
            next[index] = target;
            return next;
          }

          return current;
        });

        setRecommendations((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const index = current.findIndex((song) => song?._id?.toString?.() === songId.toString());
          if (index === -1) return current;

          const next = [...current];
          const target = { ...next[index] };
          if (interactionType === "liked" || interactionType === "unliked") {
            target.likeCount =
              Number.isFinite(payload?.likeCount)
                ? payload.likeCount
                : Math.max(
                    0,
                    (Number(target.likeCount) || 0) +
                      (interactionType === "liked" ? 1 : -1),
                  );
          }

          next[index] = target;
          return next;
        });
      };

      const handleListenersCount = (eventOrCount) => {
        const payload = unwrapRealtimePayload(eventOrCount);
        const count = typeof payload === "number" ? payload : payload?.count;
        const value = typeof count === "number" ? Math.max(0, count) : 0;
        setActiveListenersCount(value);
      };

      const handleSongPlayed = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (!payload?.songId) return;

        patchSongMetrics(payload, "played");

        setLiveListening((prev) => {
          const nextItem = {
            ...payload,
            at: Date.now(),
          };

          const current = Array.isArray(prev) ? prev : [];
          const deduped = current.filter((item) => {
            const sameUser = item?.userId && payload?.userId && item.userId === payload.userId;
            const sameSong = item?.songId && payload?.songId && item.songId === payload.songId;
            return !(sameUser && sameSong);
          });

          return [nextItem, ...deduped].slice(0, 5);
        });
      };

      const handleSongLiked = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        patchSongMetrics(payload, "liked");

        const currentUserId = userRef.current?._id?.toString?.() || userRef.current?.id?.toString?.();
        if (!currentUserId || payload?.userId?.toString?.() !== currentUserId) return;

        const songId = payload?.songId?.toString?.() || payload?.songId;
        if (!songId) return;

        setLikedSongs((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const alreadyLiked = current.some((song) =>
            typeof song === "string"
              ? song === songId
              : song?._id?.toString?.() === songId.toString(),
          );

          if (alreadyLiked) return current;

          const songFromState = songsDataRef.current.find(
            (song) => song?._id?.toString?.() === songId.toString(),
          );
          const hydratedSong = songFromState
            ? { ...songFromState, likeCount: payload?.likeCount ?? songFromState.likeCount }
            : {
                _id: songId,
                name: payload?.songName || "Unknown Song",
                artist: payload?.artist || "Unknown",
                likeCount: payload?.likeCount ?? 1,
              };

          return [hydratedSong, ...current];
        });
      };

      const handleSongUnliked = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        patchSongMetrics(payload, "unliked");

        const currentUserId = userRef.current?._id?.toString?.() || userRef.current?.id?.toString?.();
        if (!currentUserId || payload?.userId?.toString?.() !== currentUserId) return;

        const songId = payload?.songId?.toString?.() || payload?.songId;
        if (!songId) return;

        setLikedSongs((prev) =>
          (Array.isArray(prev) ? prev : []).filter((song) =>
            typeof song === "string"
              ? song !== songId
              : song?._id?.toString?.() !== songId.toString(),
          ),
        );
      };

      const handlePlaylistEvent = (eventEnvelope, mode) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        const currentUserId = userRef.current?._id?.toString?.() || userRef.current?.id?.toString?.();

        if (!currentUserId) return;
        if (payload?.userId?.toString?.() !== currentUserId) return;

        if (mode === "deleted") {
          removePlaylistFromState(payload?.playlistId);
          return;
        }

        if (payload?.playlist) {
          upsertPlaylistInState(payload.playlist);
        }
      };

      const handleAlbumCreated = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (payload?.album) upsertAlbumInState(payload.album);
      };

      const handleAlbumDeleted = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        removeAlbumFromState(payload?.albumId);
      };

      const handleSongCreated = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        if (payload?.song) upsertSongInState(payload.song);
      };

      const handleSongDeleted = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        const deletedSongId = payload?.songId?.toString?.() || payload?.songId;
        if (!deletedSongId) return;

        removeSongFromState(deletedSongId);

        setPlaylists((prev) =>
          (Array.isArray(prev) ? prev : []).map((playlist) => ({
            ...playlist,
            songs: (Array.isArray(playlist?.songs) ? playlist.songs : []).filter(
              (song) => song?._id?.toString?.() !== deletedSongId.toString(),
            ),
          })),
        );

        if (trackRef.current?._id?.toString?.() === deletedSongId.toString()) {
          setTrack(null);
          setPlayStatus(false);
        }
      };

      const handleAiPlaylistGenerated = (eventEnvelope) => {
        if (!shouldProcessRealtimeEvent(eventEnvelope)) return;
        const payload = unwrapRealtimePayload(eventEnvelope);
        const currentUserId = userRef.current?._id?.toString?.() || userRef.current?.id?.toString?.();
        if (!currentUserId || payload?.userId?.toString?.() !== currentUserId) return;
        if (payload?.playlist) {
          upsertPlaylistInState(payload.playlist);
        }
      };

      socket.on("connect", () => {
        isSocketConnectedRef.current = true;
        socket.emit("get_listeners");
        if (playStatusRef.current && trackRef.current?._id) {
          socket.emit("started_listening", {
            songId: trackRef.current._id,
            songName: trackRef.current.name,
            userId:
              userRef.current?._id ||
              userRef.current?.id ||
              localStorage.getItem("uid") ||
              "anon",
            userName:
              userRef.current?.name ||
              userRef.current?.username ||
              localStorage.getItem("uname") ||
              "Anonymous",
            artist: trackRef.current.artist,
          });
        }
      });

      socket.on("disconnect", () => {
        isSocketConnectedRef.current = false;
      });

      socket.on("connect_error", (err) => {
        console.warn("[Socket] Connection error:", err.message);
      });

      socket.on("listeners:updated", handleListenersCount);
      socket.on("users_listening", handleListenersCount);
      socket.on("song:played", handleSongPlayed);
      socket.on("song:liked", handleSongLiked);
      socket.on("song:unliked", handleSongUnliked);
      socket.on("song:created", handleSongCreated);
      socket.on("song:deleted", handleSongDeleted);
      socket.on("album:created", handleAlbumCreated);
      socket.on("album:deleted", handleAlbumDeleted);
      socket.on("playlist:created", (eventEnvelope) => handlePlaylistEvent(eventEnvelope, "created"));
      socket.on("playlist:updated", (eventEnvelope) => handlePlaylistEvent(eventEnvelope, "updated"));
      socket.on("playlist:deleted", (eventEnvelope) => handlePlaylistEvent(eventEnvelope, "deleted"));
      socket.on("ai:playlist:generated", handleAiPlaylistGenerated);

      // Legacy compatibility events
      socket.on("user_listening", (payload) => {
        setLiveListening((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const deduped = current.filter((item) => {
            const sameUser = item?.userId && payload?.userId && item.userId === payload.userId;
            const sameSong = item?.songId && payload?.songId && item.songId === payload.songId;
            return !(sameUser && sameSong);
          });

          return [{ ...payload, at: Date.now() }, ...deduped].slice(0, 5);
        });
      });

      socket.on("recent_live_events", (eventsPayload) => {
        if (Array.isArray(eventsPayload)) {
          setLiveListening(eventsPayload.map((item) => ({ ...item, at: Date.now() })));
        }
      });
    } catch (err) {
      console.warn("Socket.IO not available:", err.message);
    }

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        isSocketConnectedRef.current = false;
      }
    };
  }, [
    url,
    removeAlbumFromState,
    removePlaylistFromState,
    removeSongFromState,
    shouldProcessRealtimeEvent,
    upsertAlbumInState,
    upsertPlaylistInState,
    upsertSongInState,
  ]);

  // Audio event handlers
  useEffect(() => {
    const audioElement = audioRef.current;

    const handleEnded = () => {
      if (isRepeatingRef.current) {
        audioElement.currentTime = 0;
        audioElement.play();
      } else {
        next();
      }
    };

    if (audioElement) {
      audioElement.addEventListener("ended", handleEnded);
      audioElement.volume = volume / 100;
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener("ended", handleEnded);
      }
    };
  }, [next, volume]);

  // Keep repeat state in ref for events
  const isRepeatingRef = useRef(isRepeating);
  useEffect(() => { isRepeatingRef.current = isRepeating; }, [isRepeating]);

  // Sync audio src when track changes (not when volume changes - that would reload and stop playback)
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    if (track) {
      const src = track.file || track.url || track.src || track.audio;
      if (src) {
        // If playWithId already loaded this exact src, skip the double-load to prevent
        // interrupting ongoing playback and firing a spurious onpause/emitStoppedListening.
        if (manuallyLoadedSrcRef.current === src) {
          manuallyLoadedSrcRef.current = null;
          audioElement.volume = volume / 100;
          return;
        }
        audioElement.src = src;
        audioElement.load();
        audioElement.volume = volume / 100;
        setPlayStatus(false);
      }
    } else {
      manuallyLoadedSrcRef.current = null;
      audioElement.removeAttribute("src");
      audioElement.load();
      setPlayStatus(false);
    }
  }, [track]);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      // Refs
      audioRef,
      socketRef,
      seekBg,
      seekBar,

      // Player state
      track,
      playStatus,
      volume,

      // Player controls
      play,
      pause,
      togglePlay,
      playWithId,
      playPlaylist,
      previous,
      next,
      seekSong,
      toggleShuffle,
      toggleRepeat,
      handleVolumeChange,

      // Features state
      isShuffled,
      isRepeating,
      currentPlaylist,

      // Data
      songsData,
      albumsData,
      playlists,
      likedSongs,
      recentlyPlayed,
      recommendations,
      trendingSongs,
      liveListening,
      activeListenersCount,

      // Search
      searchQuery,
      setSearchQuery,
      searchResults,
      performSearch,

      // Playlist management
      showPlaylistModal,
      setShowPlaylistModal,
      createPlaylist,
      deletePlaylist,
      addSongToPlaylist,
      removeSongFromPlaylist,

      // Like functionality
      toggleLikeSong,
      isSongLiked,

      // Data refreshing
      getPlaylistsData,
    }),
    [
      track,
      playStatus,
      volume,
      isShuffled,
      isRepeating,
      songsData,
      albumsData,
      playlists,
      likedSongs,
      recentlyPlayed,
      recommendations,
      trendingSongs,
      liveListening,
      activeListenersCount,
      searchQuery,
      searchResults,
      showPlaylistModal,
      play,
      pause,
      togglePlay,
      playWithId,
      previous,
      next,
      seekSong,
      toggleShuffle,
      toggleRepeat,
      handleVolumeChange,
      toggleLikeSong,
      isSongLiked,
      createPlaylist,
      deletePlaylist,
      addSongToPlaylist,
      removeSongFromPlaylist,
      getPlaylistsData,
      fetchRecommendationsAndTrending,
    ],
  );

  return (
    <PlayerContext.Provider value={contextValue}>
      {/* Hidden audio element controlled by PlayerContext */}
      <audio
        ref={(el) => {
          audioRef.current = el;
          if (!el) return;
          el.onplay = () => {
            // Clear transition flag the moment audio actually starts playing.
            // This MUST happen here (not in play().then()) because el.onpause
            // can fire in the microtask gap between play() resolving and .then() running.
            isTransitioningRef.current = false;
            emitStartedListening();

            const currentTrack = trackRef.current;
            if (currentTrack) {
              const now = Date.now();
              const prev = lastPlayCountedRef.current || {};
              const sameSongRecently =
                prev.songId === currentTrack._id &&
                now - (prev.at || 0) < PLAY_COUNT_SAME_SONG_DEDUP_MS;
              
              if (!sameSongRecently) {
                lastPlayCountedRef.current = { songId: currentTrack._id, at: now };
                
                axios.post(`${url}/api/song/play/${currentTrack._id}`, {
                  listenerId: listenerIdRef.current,
                  userName: userRef.current?.name || "Anonymous",
                }).catch(() => {});
              }
            }
          };

          el.onpause = () => {
            emitStoppedListening();
          };

          el.onended = () => {
            emitStoppedListening();
          };
        }}
        style={{ display: "none" }}
        preload="auto"
      />
      {props.children}
    </PlayerContext.Provider>
  );
};
// Make sure this is at the end of your PlayerContext.jsx file, before the default export
export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerContextProvider");
  }
  return context;
};
export default PlayerContextProvider;
