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
import { useToast } from "./ThemeContext";
import { useAuth } from "./AuthContext";

export const PlayerContext = createContext();

const PlayerContextProvider = (props) => {
  const audioRef = useRef();
  const seekBg = useRef();
  const seekBar = useRef();
  const { user, isAuthenticated } = useAuth();
  const lastPlayCountedRef = useRef({ songId: null, at: 0 });
  const playStatusRef = useRef(false);
  const userRef = useRef(user);
  const socketRef = useRef(null);
  // Unique listener ID (works for both logged-in users and guests)
  const listenerIdRef = useRef(null);

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

  const url = import.meta.env.VITE_API_URL ?? "";

  // Core data states
  const [songsData, setSongsData] = useState([]);
  const [albumsData, setAlbumsData] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  // Player state
  const [track, setTrack] = useState(null);
  const [playStatus, setPlayStatus] = useState(false);
  // Keep a ref in sync so closures always read the live value
  useEffect(() => { playStatusRef.current = playStatus; }, [playStatus]);
  const [time, setTime] = useState({
    currentTime: { second: 0, minute: 0 },
    totalTime: { second: 0, minute: 0 },
  });

  // Features state
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [volume, setVolume] = useState(80);
  const [currentPlaylist, setCurrentPlaylist] = useState([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0);

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

  // Emit listener status to socket (reusable)
  const emitStartedListening = useCallback(() => {
    const sock = socketRef.current;
    const listenerId = listenerIdRef.current;

    if (!sock || !listenerId) return;

    sock.emit("user_started_listening", { userId: listenerId });
  }, []);

  const emitStoppedListening = useCallback(() => {
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
        addToRecentlyPlayed(song);
        const safePlaylist = Array.isArray(playlist) ? playlist : songsData;
        setCurrentPlaylist(safePlaylist);
        const songIndex = safePlaylist.findIndex((item) => item?._id === id);
        setCurrentPlaylistIndex(songIndex >= 0 ? songIndex : 0);

        if (audioRef.current) {
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
                setPlayStatus(true);
                showToast(`Now playing: ${song.name}`, "success");
                // Socket emit is handled exclusively by el.onplay (audio element callback)

                // Track a "play" only once per track start (even if events fire multiple times)
                try {
                  const now = Date.now();
                  const prev = lastPlayCountedRef.current || {};
                  const sameSongRecently =
                    prev.songId === song._id && now - (prev.at || 0) < 15000;
                  if (!sameSongRecently) {
                    lastPlayCountedRef.current = { songId: song._id, at: now };
                    axios
                      .post(`${url}/api/song/play/${song._id}`)
                      .catch((e) =>
                        console.warn(
                          "playCount increment failed:",
                          e?.response?.data?.message || e.message,
                        ),
                      );
                  }
                } catch (e) {
                  console.warn("playCount increment skipped:", e.message);
                }
              })
              .catch((error) => {
                console.error("Play error:", error);
                showToast("Failed to play song. Please try again.", "error");
                setPlayStatus(false);
              });
          };

          const handleError = () => {
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
      songsData,
      addToRecentlyPlayed,
      showToast,
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

  const next = useCallback(() => {
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
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = nextSong.file || nextSong.url || nextSong.src || nextSong.audio || "";
        audioRef.current.load();
        // { once: true } prevents handler accumulation from rapid next() calls
        audioRef.current.addEventListener("canplay", () => {
          audioRef.current.play()
            .then(() => {
              setPlayStatus(true);
              // Socket emit handled exclusively by el.onplay
            })
            .catch((err) => console.error("next() play error:", err));
        }, { once: true });
      }
    }
  }, [
    currentPlaylist,
    currentPlaylistIndex,
    isShuffled,
    addToRecentlyPlayed,
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
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = prevSong.file || prevSong.url || prevSong.src || prevSong.audio || "";
        audioRef.current.load();
        // { once: true } prevents handler accumulation from rapid previous() calls
        audioRef.current.addEventListener("canplay", () => {
          audioRef.current.play()
            .then(() => {
              setPlayStatus(true);
              // Socket emit handled exclusively by el.onplay
            })
            .catch((err) => console.error("previous() play error:", err));
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
      audioRef.current.play().catch(() => {});
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

      // Optimistic update - update UI immediately
      if (isCurrentlyLiked) {
        // Unlike the song
        const updatedLikedSongs = currentLikedSongs.filter((likedSong) =>
          typeof likedSong === "string"
            ? likedSong !== songId
            : likedSong._id !== songId,
        );
        setLikedSongs(updatedLikedSongs);
        showToast(`Removed "${song.name}" from liked songs`, "info");
      } else {
        // Like the song
        const updatedLikedSongs = [...currentLikedSongs, song];
        setLikedSongs(updatedLikedSongs);
        showToast(`Added "${song.name}" to liked songs`, "success");
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

      try {
        const response = await axios.post(`${url}/api/playlist/create`, {
          name: name.trim(),
          description: "My playlist",
        });

        if (response.data.success) {
          await getPlaylistsData();
          showToast("Playlist created successfully", "success");
          return { success: true };
        } else {
          showToast(
            response.data.message || "Failed to create playlist",
            "error",
          );
          return { success: false };
        }
      } catch (error) {
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

      try {
        const response = await axios.delete(
          `${url}/api/playlist/delete/${playlistId}`,
        );

        if (response.data.success) {
          await getPlaylistsData();
          showToast("Playlist deleted successfully", "success");
          return { success: true };
        } else {
          showToast(
            response.data.message || "Failed to delete playlist",
            "error",
          );
          return { success: false };
        }
      } catch (error) {
        console.error("Error deleting playlist:", error);
        const message =
          error.response?.data?.message || "Failed to delete playlist";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, isAuthenticated],
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
        // Find the song to add
        const songToAdd = songsData.find((song) => song._id === songId);
        if (!songToAdd) {
          showToast("Song not found", "error");
          return { success: false };
        }

        // Optimistically update the local state first for instant UI update
        setPlaylists((prevPlaylists) =>
          prevPlaylists.map((playlist) => {
            if (playlist._id === playlistId) {
              // Check if song already exists in playlist
              const songExists = playlist.songs?.some(
                (song) => song._id === songId,
              );
              if (songExists) {
                showToast("Song already exists in this playlist", "error");
                return playlist;
              }
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
          // Refresh from backend to ensure consistency
          try {
            const response = await axios.get(`${url}/api/playlist/list`);
            if (response.data.success) {
              const pls = Array.isArray(response.data.playlists)
                ? response.data.playlists
                : [];
              setPlaylists(pls);
            }
          } catch (refreshError) {
            console.error("Error refreshing playlists:", refreshError);
          }
          showToast("Song added to playlist", "success");
          return { success: true };
        } else {
          // Revert optimistic update on failure
          try {
            const response = await axios.get(`${url}/api/playlist/list`);
            if (response.data.success) {
              const pls = Array.isArray(response.data.playlists)
                ? response.data.playlists
                : [];
              setPlaylists(pls);
            }
          } catch (refreshError) {
            console.error("Error refreshing playlists:", refreshError);
          }
          showToast(response.data.message || "Failed to add song", "error");
          return { success: false };
        }
      } catch (error) {
        console.error("Error adding song to playlist:", error);
        // Revert optimistic update on error
        try {
          const response = await axios.get(`${url}/api/playlist/list`);
          if (response.data.success) {
            const pls = Array.isArray(response.data.playlists)
              ? response.data.playlists
              : [];
            setPlaylists(pls);
          }
        } catch (refreshError) {
          console.error("Error refreshing playlists:", refreshError);
        }
        const message = error.response?.data?.message || "Failed to add song";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, songsData, isAuthenticated],
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
          // Refresh from backend to ensure consistency
          try {
            const response = await axios.get(`${url}/api/playlist/list`);
            if (response.data.success) {
              const pls = Array.isArray(response.data.playlists)
                ? response.data.playlists
                : [];
              setPlaylists(pls);
            }
          } catch (refreshError) {
            console.error("Error refreshing playlists:", refreshError);
          }
          showToast("Song removed from playlist", "success");
          return { success: true };
        } else {
          // Revert optimistic update on failure
          try {
            const response = await axios.get(`${url}/api/playlist/list`);
            if (response.data.success) {
              const pls = Array.isArray(response.data.playlists)
                ? response.data.playlists
                : [];
              setPlaylists(pls);
            }
          } catch (refreshError) {
            console.error("Error refreshing playlists:", refreshError);
          }
          showToast(response.data.message || "Failed to remove song", "error");
          return { success: false };
        }
      } catch (error) {
        console.error("Error removing song from playlist:", error);
        // Revert optimistic update on error
        try {
          const response = await axios.get(`${url}/api/playlist/list`);
          if (response.data.success) {
            const pls = Array.isArray(response.data.playlists)
              ? response.data.playlists
              : [];
            setPlaylists(pls);
          }
        } catch (refreshError) {
          console.error("Error refreshing playlists:", refreshError);
        }
        const message =
          error.response?.data?.message || "Failed to remove song";
        showToast(message, "error");
        return { success: false, message };
      }
    },
    [showToast, isAuthenticated],
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
      const [recRes, trendRes] = await Promise.all([
        axios
          .get(`${url}/api/song/recommendations`)
          .catch(() => ({ data: {} })),
        axios
          .get(`${url}/api/song/trending?limit=10`)
          .catch(() => ({ data: {} })),
      ]);

      let recs = [];
      if (recRes.data?.success && Array.isArray(recRes.data.recommendations)) {
        recs = recRes.data.recommendations;
      } else {
        // Failsafe fallback: use top songs by playCount from /api/song/list
        try {
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
            .slice(0, 10);
        } catch (fallbackErr) {
          console.warn("Fallback recommendations failed:", fallbackErr.message);
        }
      }
      setRecommendations(Array.isArray(recs) ? recs : []);

      if (trendRes.data?.success && Array.isArray(trendRes.data.data)) {
        setTrendingSongs(trendRes.data.data.slice(0, 10));
      }
    } catch (e) {
      console.warn("Recommendations/trending fetch failed:", e.message);
    }
  }, []);

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
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const socket = io({ path: "/socket.io", transports: ["polling", "websocket"] });
        if (!mounted) {
          socket.disconnect();
          return;
        }
        socketRef.current = socket;

        socket.on("connect_error", (err) => {
          console.warn("[Socket] Connection error:", err.message);
        });

        socket.on("user_listening", (payload) => {
          setLiveListening((prev) => {
            const next = [
              { ...payload, at: Date.now() },
              ...(prev || []),
            ].slice(0, 5);
            return next;
          });
        });

        socket.on("users_listening", (count) => {
          const value = typeof count === "number" ? Math.max(0, count) : 0;
          setActiveListenersCount(value);
        });
      } catch (err) {
        console.warn("Socket.IO not available:", err.message);
      }
    })();
    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [url]);

  // Audio event handlers
  useEffect(() => {
    const audioElement = audioRef.current;

    const handleEnded = () => {
      if (isRepeating) {
        audioElement.currentTime = 0;
        audioElement.play();
      } else {
        // Auto-advance to next song in playlist
        const safePlaylist = Array.isArray(currentPlaylist)
          ? currentPlaylist
          : [];
        if (safePlaylist.length > 0) {
          next();
        } else {
          // If no playlist, just stop — socket emit is handled by el.onended
          setPlayStatus(false);
        }
      }
    };

    const handleTimeUpdate = () => {
      if (audioElement && audioElement.duration && seekBar.current) {
        const progress =
          (audioElement.currentTime / audioElement.duration) * 100;
        seekBar.current.style.width = `${progress}%`;

        setTime({
          currentTime: {
            second: Math.floor(audioElement.currentTime % 60)
              .toString()
              .padStart(2, "0"),
            minute: Math.floor(audioElement.currentTime / 60),
          },
          totalTime: {
            second: Math.floor(audioElement.duration % 60)
              .toString()
              .padStart(2, "0"),
            minute: Math.floor(audioElement.duration / 60),
          },
        });
      }
    };

    const handleLoadedMetadata = () => {
      if (audioElement && audioElement.duration) {
        setTime({
          currentTime: {
            second: Math.floor(audioElement.currentTime % 60)
              .toString()
              .padStart(2, "0"),
            minute: Math.floor(audioElement.currentTime / 60),
          },
          totalTime: {
            second: Math.floor(audioElement.duration % 60)
              .toString()
              .padStart(2, "0"),
            minute: Math.floor(audioElement.duration / 60),
          },
        });
      }
    };

    if (audioElement) {
      audioElement.addEventListener("ended", handleEnded);
      audioElement.addEventListener("timeupdate", handleTimeUpdate);
      audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.volume = volume / 100;
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener("ended", handleEnded);
        audioElement.removeEventListener("timeupdate", handleTimeUpdate);
        audioElement.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata,
        );
      }
    };
  }, [isRepeating, next, volume, currentPlaylist, user]);

  // Sync audio src when track changes (not when volume changes - that would reload and stop playback)
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    if (track) {
      const src = track.file || track.url || track.src || track.audio;
      if (src) {
        audioElement.src = src;
        audioElement.load();
        audioElement.volume = volume / 100;
        setPlayStatus(false);
      }
    } else {
      audioElement.removeAttribute("src");
      audioElement.load();
      setPlayStatus(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume omitted: changing volume must not reload audio (stops playback)
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
      time,
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
      time,
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
            emitStartedListening();
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
