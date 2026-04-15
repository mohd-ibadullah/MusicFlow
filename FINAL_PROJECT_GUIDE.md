# MusicFlow — Complete Technical Deep Dive

This document covers **100% of the project** — every feature, every file, every architectural decision, every edge case, and every interview question you could face. If you master this document, you can explain any part of MusicFlow to any interviewer.

---

## Table of Contents

1. [What MusicFlow Does](#1-what-musicflow-does)
2. [System Architecture](#2-system-architecture)
3. [Database Design](#3-database-design)
4. [Authentication & Security](#4-authentication--security)
5. [Core Feature Flows](#5-core-feature-flows)
6. [Caching Strategy](#6-caching-strategy)
7. [Real-Time System (Socket.io)](#7-real-time-system-socketio)
8. [Admin Panel](#8-admin-panel)
9. [Playlist System & AI Generator](#9-playlist-system--ai-generator)
10. [Recommendation Engine](#10-recommendation-engine)
11. [File Upload Pipeline (Cloudinary)](#11-file-upload-pipeline-cloudinary)
12. [Frontend Architecture](#12-frontend-architecture)
13. [State Management Deep Dive](#13-state-management-deep-dive)
14. [Error Handling & Resilience](#14-error-handling--resilience)
15. [Security Hardening](#15-security-hardening)
16. [Key Files Reference](#16-key-files-reference)
17. [API Reference](#17-api-reference)
18. [Problems I Hit and How I Fixed Them](#18-problems-i-hit-and-how-i-fixed-them)
19. [Edge Cases I Handle](#19-edge-cases-i-handle)
20. [Interview Questions & Answers (30+)](#20-interview-questions--answers)
21. [What I'd Do Differently](#21-what-id-do-differently)
22. [How to Talk About This Project](#22-how-to-talk-about-this-project)
23. [April 2026 Addendum](#23-april-2026-addendum)

---

## 1. What MusicFlow Does

MusicFlow is a music streaming platform with three parts:

- **User App** (React SPA): Browse songs by album, play tracks with a full-featured player, create playlists (including AI-generated ones), like songs, see what others are listening to in real-time, and get personalized recommendations.
- **Admin Panel** (Separate React SPA): Manage the song and album catalog, view real-time analytics (total streams, top songs, top artists, active users), and monitor a live activity feed.
- **Backend** (Node.js/Express): REST APIs, real-time Socket.io events, Redis caching with graceful degradation, MongoDB persistence with atomic operators, Cloudinary media storage, JWT authentication, and role-based access control.

**The full user journey**: A user signs up → browses the home page → clicks a song → playback starts → the backend atomically increments the play count, deduplicates rapid clicks, emits a socket event → all connected users see the live listener count update → the admin dashboard shows the play in the activity feed — all in real-time, without a single page refresh.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENTS                          │
│  ┌─────────────────┐         ┌─────────────────────┐    │
│  │   User App      │         │   Admin Panel        │    │
│  │   React + Vite  │         │   React + Vite       │    │
│  │   Port :5173    │         │   Port :5174         │    │
│  │                 │         │                      │    │
│  │  PlayerContext   │         │  AuthContext          │    │
│  │  AuthContext     │         │  AdminAnalytics       │    │
│  │  ThemeContext    │         │  CRUD Pages           │    │
│  └────────┬────────┘         └──────────┬───────────┘    │
│           │  Vite Proxy /api →          │                │
└───────────┼─────────────────────────────┼────────────────┘
            │          HTTP + WebSocket   │
            └──────────────┬──────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    EXPRESS SERVER                        │
│                    Port :4002                            │
│                                                         │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │   Routes   │ │  Middleware   │ │   Socket.io        │ │
│  │            │ │              │ │                    │ │
│  │  /api/auth │ │ authenticateToken │   user_started   │ │
│  │  /api/song │ │ authorizeAdmin   │   user_stopped   │ │
│  │ /api/album │ │ optionalAuth │ │   get_listeners    │ │
│  │/api/playlist│ │ rateLimit   │ │   analytics_updated│ │
│  │ /api/admin │ │ helmet      │ │   user_listening   │ │
│  └──────┬─────┘ └──────────────┘ └────────────────────┘ │
│         │                                               │
│  ┌──────▼──────────────────────────────────────────┐    │
│  │              CONTROLLERS                        │    │
│  │  songController (824 lines)                     │    │
│  │  authController (350 lines)                     │    │
│  │  playlistController (352 lines)                 │    │
│  │  albumController (141 lines)                    │    │
│  │  analyticsController (97 lines)                 │    │
│  └──────┬─────────────────┬────────────────────────┘    │
│         │                 │                             │
│  ┌──────▼─────┐    ┌──────▼─────┐    ┌──────────────┐  │
│  │  MongoDB   │    │   Redis    │    │  Cloudinary  │  │
│  │  5 Models  │    │   Cache    │    │  Image+Audio │  │
│  └────────────┘    └────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why Three Separate Apps?

The User App and Admin Panel are **separate React SPAs** by design:
- **Security**: The admin bundle doesn't ship to regular users. Admin-only code (analytics, CRUD) never reaches the user's browser.
- **Independent Deployment**: Admin can be updated without touching the user experience.
- **Different auth flows**: The user app uses `AuthContext` with signup/login; the admin uses a separate `AuthContext` that checks `user.role === "admin"` after login.

---

## 3. Database Design

### 5 Mongoose Models

#### Song (`songModel.js`)
```javascript
{
  name: String,           // "Tum Hi Ho"
  desc: String,           // "Eternal devotion"
  album: String,          // "Hindi Songs"
  artist: String,         // "Arijit Singh" (indexed)
  language: String,       // enum: ["Hindi", "English", "Telugu", "Unknown"]
  image: String,          // Cloudinary URL
  file: String,           // Cloudinary URL (audio)
  duration: String,       // "4:06"
  genre: String,          // "Bollywood"
  playCount: Number,      // Atomic $inc on each valid play (indexed, descending)
  likeCount: Number,      // Atomic $inc/$max on like/unlike
  createdAt: Date
}
// Compound indexes: { language: 1 }, { playCount: -1 }, { language: 1, artist: 1 }
```

**Why these indexes?** The recommendation engine queries by `language` and `artist`, sorted by `playCount`. Without these indexes, every recommendation query would be a full collection scan.

#### User (`userModel.js`)
```javascript
{
  name: String,            // min 2, max 50 chars, trimmed
  email: String,           // unique, lowercase, regex validated
  password: String,        // bcrypt hashed, salt 12, select: false
  avatar: String,          // nullable
  likedSongs: [ObjectId],  // refs Song — used for $addToSet/$pull
  recentlyPlayed: [{       // Capped subdocument array
    song: ObjectId,        // ref Song
    playedAt: Date
  }],
  playlists: [ObjectId],   // refs Playlist
  isActive: Boolean,       // Soft-delete flag (default: true)
  role: String,            // enum: ['user', 'admin']
  lastLogin: Date          // Updated on each login
}
```

**Why `select: false` on password?** Every `User.find()` automatically excludes the password hash. You must explicitly `.select("+password")` in login/change-password flows. This prevents accidental leaks.

**Why `isActive` instead of hard delete?** Soft-delete preserves referential integrity. Other documents pointing to this user (playlists, activity logs) don't break.

#### Playlist (`playlistModel.js`)
```javascript
{
  name: String,
  description: String,       // default: "My playlist"
  user: ObjectId,            // ref User (required — ownership)
  songs: [ObjectId],         // refs Song
  isAIGenerated: Boolean,    // true if created by the prompt-based generator
  createdAt: Date
}
```

#### Album (`albumModel.js`)
```javascript
{
  name: String,
  desc: String,
  bgColor: String,          // Hex color for UI gradient
  image: String             // Cloudinary URL
}
```

#### Activity (`activityModel.js`)
```javascript
{
  type: String,    // enum: ["song_played", "song_added", "song_liked", "playlist_created", "album_added"]
  message: String, // Human-readable: 'User liked "Tum Hi Ho"'
  userId: ObjectId // nullable (some events are system-level)
}
// Index: { createdAt: -1 } for reverse-chronological feed
```

---

## 4. Authentication & Security

### Registration Flow
1. User submits `{ name, email, password }`.
2. Backend validates all fields are present.
3. `User.findOne({ email })` checks for duplicates.
4. `User.create()` triggers the `pre('save')` middleware.
5. The middleware hashes the password with **bcrypt, salt rounds 12**.
6. A JWT token is generated with `{ userId, role }` and 7-day expiry.
7. Response includes user data (without password) + token.

### Login Flow
1. User submits `{ email, password }`.
2. **Type validation**: Both must be strings (prevents NoSQL injection via `{ "$gt": "" }`).
3. `User.findOne({ email }).select("+password")` — explicitly includes the hashed password.
4. `user.isActive` check — deactivated accounts can't login.
5. `bcrypt.compare(password, hashedPassword)` — timing-safe comparison.
6. `user.updateLastLogin()` — records the login timestamp.
7. JWT token generated and returned.

### Middleware Chain
```
authenticateToken → extracts Bearer token → jwt.verify() → checks user exists & isActive → attaches req.user
authorizeAdmin   → checks req.user.role === 'admin' → 403 if not
optionalAuth     → same as authenticateToken but doesn't reject if no token (for anon recommendations)
```

### Cross-Tab Session Sync
`AuthContext.jsx` on the frontend listens for `storage` events:
```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'token' && !e.newValue) {
    // Another tab logged out → clear this tab's state too
    setUser(null);
    setToken(null);
  }
});
```
If Tab A logs out, Tab B immediately detects the localStorage change and clears its session.

### Security Layers
| Layer | Implementation | File |
|-------|---------------|------|
| **Password hashing** | bcrypt, salt rounds 12 | `userModel.js` |
| **JWT tokens** | 7-day expiry, role-encoded | `authController.js` |
| **HTTP headers** | Helmet (XSS, clickjacking, etc.) | `server.js` |
| **Rate limiting** | Configurable via env; enabled in production, disabled by default in local dev | `server.js` |
| **CORS** | Strict origin whitelist | `server.js` |
| **Role-based auth** | `authorizeAdmin` middleware | `authMiddleware.js` |
| **Soft delete** | `isActive` flag instead of hard delete | `userModel.js` |
| **Input validation** | Type checking to prevent NoSQL injection | `authController.js` |
| **Password exclusion** | `select: false` on password field | `userModel.js` |
| **Fail-fast startup** | Server refuses to start without JWT_SECRET | `server.js` |

---

## 5. Core Feature Flows

### Playing a Song (end-to-end)

1. User clicks a song → `PlayerContext.playWithId(id)` sets the track in global state.
2. The `<audio>` element's `src` is updated → `onplay` fires.
3. Frontend emits `user_started_listening` socket event.
4. A POST to `/api/song/play/:songId` is sent with a `listenerId`.
5. **Backend deduplication** (`canProcessPlay`):
   - Check `processingPlays` Set — if key exists, another request is mid-flight → reject.
   - Check `lastPlayMap` — if same user+song played within 10 seconds → reject.
   - Add key to `processingPlays` to reserve the slot.
6. If valid: `Song.findByIdAndUpdate(id, { $inc: { playCount: 1 } })` — atomic increment.
7. `recordPlayProcessed()` — removes from `processingPlays`, stamps `lastPlayMap`.
8. Socket emits: `user_listening` (live ticker) + `analytics_updated` (admin).
9. `logActivity()` persists the event to the Activity collection.
10. `cachePushLiveEvent()` pushes to a Redis list (capped at 5) for late-joining clients.
11. Caches are **not** cleared on every play — they expire via TTL (60s trending, 300s list).

### Liking a Song

1. User clicks heart → `toggleLikeSong()` in `PlayerContext`.
2. **Optimistic update**: UI flips immediately (heart fills).
3. Backend: `User.findByIdAndUpdate(userId, { $addToSet: { likedSongs: songId } })` — atomic, no duplicates.
4. Backend: `Song.findByIdAndUpdate(songId, { $inc: { likeCount: 1 } })` — atomic counter.
5. Like activity is logged with deduplication (`canProcessLikeLog` — 2-minute cooldown per user+song).
6. Socket emits `analytics_updated` for the admin dashboard.
7. If API fails → optimistic update is **rolled back** to the previous state.

### Unliking: Uses `$pull` instead of `$addToSet`, and `likeCount` uses a pipeline with `$max` to never go below zero.

### Recently Played

1. When a song starts → `addToRecentlyPlayed()` fires.
2. Optimistic update: song added to front of local list.
3. Backend validates both `userId` and `songId` with `mongoose.Types.ObjectId.isValid()`.
4. Two atomic MongoDB operations:
   ```javascript
   // Step 1: Remove the song if already in the list (prevent duplicates)
   await User.findByIdAndUpdate(userId, {
     $pull: { recentlyPlayed: { song: songId } }
   });
   // Step 2: Push to position 0, cap at 5 entries
   await User.findByIdAndUpdate(userId, {
     $push: { recentlyPlayed: { $each: [{ song: songId, playedAt: new Date() }], $position: 0, $slice: 5 } }
   });
   ```
5. No JavaScript-side array manipulation — MongoDB's engine handles everything atomically.

---

## 6. Caching Strategy

### Cache Keys
| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `songs:list` | 300s | Full song catalog |
| `albums:list` | 300s | Full album catalog |
| `songs:trending:{limit}` | 60s | Top N songs by playCount |
| `songs:recommendations:{userId}` | 300s | Personalized recommendations |
| `song:detail:{id}` | 300s | Individual song metadata |
| `recent_live_events` | No TTL (list) | Last 5 live events for late-joining clients |

### Structural Invalidation (Not Naive Clear-All)

**The problem**: The old code cleared `songs:*` on every mutation. Adding one song caused a **thundering herd** — trending, recommendations, and the master list all hit MongoDB simultaneously.

**The solution**: `invalidateSongStructuralCaches()` only clears list-level keys. After invalidation, `rebuildSongCaches()` immediately pre-warms the most common queries:
1. Rebuilds the master list (`songs:list`).
2. Rebuilds trending (top 10 by playCount).
3. User-specific recommendation caches are lazily refreshed on the next request.

### Write-Through Pattern
When a song is added or deleted, the backend doesn't just delete the cache — it **proactively rebuilds** it. This eliminates the "null window" where the first user after invalidation would see a slow response.

### Graceful Degradation
Every cache operation is wrapped in `if (!isRedisAvailable()) return null/[]`:
```javascript
export const cacheGet = async (key) => {
  if (!isRedisAvailable()) return null;  // ← Falls through to MongoDB query
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;  // ← Also falls through on error
  }
};
```
If Redis dies, the app continues working — just without caching. The user experience is slightly slower but **functionally identical**.

### Live Event Buffer
`cachePushLiveEvent()` uses a Redis List to store the last 5 "who's listening" events. When a new client connects, `get_listeners` sends these historical events so the UI isn't empty on first load.

---

## 7. Real-Time System (Socket.io)

### Multi-Tab User Tracking

**Problem**: A user opens 5 tabs. Each tab creates a socket. Naive counting would show 5 active users.

**Solution**: Two-level mapping:
1. `socketToUserMap`: Map<socketId, userId> — which user owns which socket.
2. Redis: `user_sockets:{userId}` → Set of socket IDs per user.
3. Redis: `active_users` → Set of unique user IDs.

**On connect**:
```javascript
await client.sAdd(`user_sockets:${userId}`, socket.id);  // Track this tab
await client.sAdd("active_users", userId);                // Track the user
```

**On disconnect**:
```javascript
await client.sRem(`user_sockets:${userId}`, socket.id);  // Remove this tab
const socketCount = await client.sCard(`user_sockets:${userId}`);
if (socketCount === 0) {
  await client.sRem("active_users", userId);  // Only remove user when ALL tabs closed
  await client.del(`user_sockets:${userId}`);
}
```

**Fallback** (no Redis): Uses in-memory `activeUsersMap`: Map<userId, Set<socketId>> with the same logic.

### Socket Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `user_started_listening` | Client → Server | Register client as active listener |
| `user_stopped_listening` | Client → Server | Explicitly stop (e.g., pause) |
| `disconnect` | Client → Server | Tab closed |
| `get_listeners` | Client → Server | Request current count + recent events |
| `users_listening` | Server → All | Broadcast updated listener count |
| `user_listening` | Server → All | Live ticker: "X is listening to Y" |
| `analytics_updated` | Server → All | Trigger admin dashboard refresh |
| `recent_live_events` | Server → Client | Historical buffer for new connections |

### Stale Session Cleanup
On server boot, a 3-second delayed cleanup runs:
```javascript
const keys = await client.keys('user_sockets:*');
if (keys.length > 0) await client.del(keys);
await client.del('active_users');
```
This prevents ghost listeners from a previous server crash.

---

## 8. Admin Panel

### 6 Pages

| Page | Route | Purpose |
|------|-------|---------|
| `AdminLogin` | `/admin-login` | Secure login with role check |
| `AdminAnalytics` | `/analytics` | Real-time dashboard |
| `AddSong` | `/add-song` | Upload song (image + audio to Cloudinary) |
| `AddAlbum` | `/add-album` | Upload album (image to Cloudinary) |
| `ListSong` | `/list-song` | View/delete all songs |
| `ListAlbum` | `/list-album` | View/delete all albums |

### Analytics Dashboard (`AdminAnalytics.jsx`)

Fetches from `/api/admin/analytics` which runs **5 parallel operations**:
```javascript
const [totalSongs, totalAlbums, streamAgg, topSongs, topArtistsAgg] = await Promise.all([
  Song.countDocuments(),
  Album.countDocuments(),
  Song.aggregate([{ $group: { _id: null, total: { $sum: "$playCount" } } }]),
  Song.find().sort({ playCount: -1 }).limit(10).lean(),
  Song.aggregate([
    { $match: { artist: { $ne: "" } } },
    { $group: { _id: "$artist", totalSongs: { $sum: 1 }, totalPlays: { $sum: "$playCount" } } },
    { $sort: { totalPlays: -1 } },
    { $limit: 10 }
  ])
]);
```

**Real-time updates**: The admin listens to the same `analytics_updated` socket event as the user app. When a user plays or likes a song, the admin dashboard re-fetches data without manual refresh.

### Activity Feed
`getRecentActivity()` returns the last 20 entries from the Activity collection, sorted by `createdAt: -1`. Each entry has a `type` that maps to a color-coded icon (blue for plays, green for adds, pink for likes, purple for playlists).

### Admin Route Protection
```javascript
// AdminProtectedRoute.jsx
if (!isAuthenticated || user?.role !== 'admin') {
  return <Navigate to="/admin-login" />;
}
```
Backend: `authorizeAdmin` middleware rejects any request where `req.user.role !== 'admin'` with a 403.

---

## 9. Playlist System & AI Generator

### CRUD Operations
| Operation | Route | Atomic? |
|-----------|-------|---------|
| Create playlist | `POST /api/playlist/create` | Yes — single `save()` |
| List user's playlists | `GET /api/playlist/list` | N/A (read) |
| Get single playlist | `GET /api/playlist/:id` | N/A (read) |
| Add song to playlist | `POST /api/playlist/add-song` | Duplicate check first |
| Remove song from playlist | `POST /api/playlist/remove-song` | Array filter |
| Delete playlist | `DELETE /api/playlist/delete/:id` | `findOneAndDelete` |

**Ownership enforcement**: Every playlist query includes `{ user: userId }` to ensure users can only access their own playlists.

### AI Playlist Generator

`POST /api/playlist/generate` with body `{ prompt: "relaxing evening music" }`

**How it works** (LLM for intent extraction, DB-only retrieval):

1. **Provider-normalized intent extraction**: Uses `LLM_PROVIDER` and supports OpenRouter, OpenAI, Anthropic, and Google Gemini.
2. **Strict JSON intent schema**: Model output is constrained to:
   ```javascript
   {
     mood: "string",
     energy: "low|medium|high|mixed",
     vibe: "string",
     genres: ["string"],
     keywords: ["string"],
     artists: ["string"]
   }
   ```
3. **Safety sanitization**: Any song-title/track-level suggestions are ignored; only intent fields are retained.
4. **Heuristic backfill**: Intent is merged with prompt-derived terms when LLM output is sparse or unavailable.
5. **MongoDB-only matching**: Queries `genre`, `artist`, `desc`, and `album` with regex/$in filters from sanitized intent.
6. **Ranking + creation**: Sorts by `playCount`, then `likeCount`, creates playlist with `isAIGenerated: true`, capped at 20 songs.
7. **Traceable response metadata**: API returns `intentSource`, `llmProvider`, `llmModel`, and sanitized `intent`.

OpenRouter path details:
- Uses OpenAI-compatible client with base URL `https://openrouter.ai/api/v1`.
- Sends `OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_TITLE` headers for proper provider attribution.
- Falls back safely to heuristic intent when API key/quota/provider call fails.

---

## 10. Recommendation Engine

The rule-based flow below is still used as a safe fallback path. The newer ML-based layer is documented in Section 23.G.

### How Personalized Recommendations Work (`songService.js`)

1. **Fetch user history**: Load `recentlyPlayed` and `likedSongs` with full song data (populated).
2. **Extract affinity signals**:
   - Languages the user listens to (e.g., Hindi, English)
   - Artists the user likes
3. **Build exclusion set**: Songs already played/liked should NOT appear in recommendations.
4. **Query similar songs**:
   ```javascript
   Song.find({
     _id: { $nin: excludeIds },
     $or: [
       { language: { $in: ["Hindi", "English"] } },
       { artist: { $in: ["Arijit Singh", "Ed Sheeran"] } }
     ]
   }).sort({ playCount: -1, createdAt: -1 }).limit(20).lean();
   ```
5. **Fallback to trending**: If not enough personalized matches, fill remaining slots with globally trending songs (excluding already-recommended ones).
6. **Capped at 10 results**.

### Anonymous Recommendations
If no user is logged in (via `optionalAuth` middleware), the engine skips personalization and returns pure trending songs. Cached under `songs:recommendations:anon`.

---

## 11. File Upload Pipeline (Cloudinary)

### Dual Upload for Songs
Song creation requires **two files**: an image (cover art) and an audio file (the song).

```javascript
upload.fields([
  { name: "image", maxCount: 1 },
  { name: "audio", maxCount: 1 }
])
```

**Upload sequence**:
1. Multer receives files → stores in temp directory.
2. Image uploaded to Cloudinary with `resource_type: "image"`, `fetch_format: "auto"`, `quality: "auto"`.
3. Audio uploaded with `resource_type: "video"` (Cloudinary treats audio as video).
4. Duration estimated from file size (`1MB ≈ 1 minute` for MP3).
5. `secure_url` values stored in MongoDB.
6. **Temp files cleaned up** in both success and error paths via `fs.unlinkSync()`.

### Album Upload
Single image upload via `upload.single("image")` with MIME type validation:
```javascript
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
```

---

## 12. Frontend Architecture

### 29 Components in the User App

| Component | Purpose |
|-----------|---------|
| `Display.jsx` | Main content router — Navbar + Routes wrapper |
| `DisplayHome.jsx` | Home page (548 lines) — albums, trending, recently played, liked, recommendations, playlists |
| `DisplayAlbum.jsx` | Album detail page with song list |
| `DisplayPlaylist.jsx` | Individual playlist view |
| `DisplayPlaylists.jsx` | All playlists overview |
| `Player.jsx` | Full music player (500+ lines) — playback, progress, volume, queue |
| `Navbar.jsx` | Top navigation with search, auth, notifications |
| `Sidebar.jsx` | Desktop sidebar — albums, playlists, quick links |
| `MobileSidebar.jsx` | Responsive off-canvas sidebar for mobile |
| `Library.jsx` | Aggregated user content (liked songs, playlists, recently played) |
| `SongItem.jsx` | Song row with play, like, add-to-playlist actions |
| `SongCard.jsx` | Compact card for carousel display |
| `AlbumItem.jsx` | Album card with dynamic gradient background |
| `PlaylistItem.jsx` | Playlist card for grid display |
| `SearchPage.jsx` | Full search results page |
| `LikedSongs.jsx` | Dedicated liked songs page |
| `RecentlyPlayed.jsx` | Recently played history page |
| `RecommendedSongsPage.jsx` | Recommendations page |
| `CarouselSection.jsx` | Paginated horizontal scroll for song/album sections |
| `AllSongs.jsx` | Browse all songs with filtering |
| `AllAlbums.jsx` | Browse all albums |
| `AddToPlaylistDropdown.jsx` | Dropdown menu to add a song to any playlist |
| `CreatePlaylistModal.jsx` | Modal for creating new playlists |
| `CustomDropdown.jsx` | Reusable dropdown component |
| `ErrorBoundary.jsx` | Catches React errors, shows fallback UI |
| `LoadingSpinner.jsx` | Skeleton loading component |
| `SkeletonLoader.jsx` | Realistic skeleton screens for content loading |
| `PrivateRoute.jsx` | Route guard — redirects to login if not authenticated |
| `Tooltip.jsx` | Reusable tooltip component |

### 4 Full Pages
- `Login.jsx` — Email/password login with premium light-mode design
- `Signup.jsx` — Registration with validation
- `TrendingSongs.jsx` — Full trending songs view
- `BiggestHitsSongs.jsx` — Top songs by all-time plays

---

## 13. State Management Deep Dive

### 3 Context Providers

#### PlayerContext (`PlayerContext.jsx` — 47,988 bytes, largest file)

This is the **heart of the application**. It manages:
- `songsData`, `albumsData` — full catalog from API
- `track`, `playStatus` — current playback state
- `queue`, `originalQueue`, `shuffledQueue` — queue management
- `likedSongs`, `recentlyPlayed`, `playlists` — user-specific data
- `recommendations`, `trendingSongs` — algorithmic content
- `searchQuery`, `searchResults` — real-time search
- `liveListening` — Socket.io listener data
- Socket connection lifecycle (connect, disconnect, event handlers)

**Critical design decision**: Playback `time` and `duration` are **NOT** in this context. They live as local state inside `Player.jsx`. This is the single most important performance decision in the app.

#### AuthContext (`AuthContext.jsx` — 6,050 bytes)

Manages:
- `user`, `token`, `isAuthenticated`, `isLoading`
- `login()`, `signup()`, `logout()` functions
- localStorage persistence
- Cross-tab synchronization via `storage` event

#### ThemeContext (`ThemeContext.jsx` — 4,258 bytes)

Manages:
- Dark/light mode toggle with `localStorage` persistence
- System preference detection (`prefers-color-scheme: dark`)
- **Flash prevention**: Waits for theme initialization before rendering
- Custom toast notification system with:
  - Duplicate prevention (same message won't stack)
  - Auto-dismiss after 3 seconds
  - Color-coded types (success = green, error = red, info = blue)

---

## 14. Error Handling & Resilience

### Backend
- **Global error handler**: Express middleware catches unhandled errors, returns JSON with error details in development only.
- **404 handler**: Returns structured JSON instead of Express's default HTML.
- **Fail-fast startup**: Server refuses to start if `JWT_SECRET` is missing.
- **Port conflict detection**: Catches `EADDRINUSE` with a clear message.
- **Cloudinary errors**: Caught separately with temp file cleanup in both success and error paths.
- **Redis errors**: Every operation has try-catch with silent fallback.
- **Validation errors**: Mongoose ValidationError caught and returned as structured arrays.
- **Duplicate email**: MongoDB error code 11000 caught and returned as user-friendly message.

### Frontend
- **ErrorBoundary**: Wraps the app — catches React render errors and displays a fallback UI instead of a white screen.
- **Optimistic rollback**: If a like/unlike API call fails, the UI reverts to the previous state.
- **Loading states**: Skeleton loaders prevent layout shift during data fetching.
- **Toast notifications**: Non-blocking user feedback for errors, success messages, and info.

---

## 15. Security Hardening

| Threat | Mitigation |
|--------|-----------|
| **Brute-force login** | API rate limiting is configurable and enforced in production |
| **NoSQL injection** | Type validation on login inputs (must be strings) |
| **XSS** | Helmet sets Content-Security-Policy headers |
| **Clickjacking** | Helmet sets X-Frame-Options: DENY |
| **MIME sniffing** | Helmet sets X-Content-Type-Options: nosniff |
| **CORS abuse** | Strict origin whitelist (env-configurable) |
| **Password leaks** | bcrypt salt 12 + `select: false` + `toJSON` strips password |
| **Privilege escalation** | `authorizeAdmin` middleware on all admin routes |
| **Role tampering on profile update** | `updateUserProfile` explicitly preserves original role |
| **Stale sessions** | Token expiry (7 days) + cross-tab logout sync |
| **Missing secrets** | Fail-fast: server won't start without JWT_SECRET |

---

## 16. Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `PlayerContext.jsx` | ~1200 | Global player state — queue, track, socket lifecycle, liked songs, search |
| `songController.js` | 824 | Play counting, dedup, likes, recently played, recommendations, CRUD |
| `Player.jsx` | ~500 | Music player UI — progress, volume, controls. Time state is LOCAL. |
| `DisplayHome.jsx` | 548 | Home page — assembles albums, trending, recently played, playlists |
| `playlistController.js` | 352 | Full playlist CRUD + LLM-intent playlist generation |
| `authController.js` | 350 | Registration, login, profile, password change, account deletion |
| `cacheService.js` | 131 | Redis wrapper — get/set/delete/pattern/live events |
| `server.js` | 286 | Express app + Socket.io + multi-tab user tracking |
| `authMiddleware.js` | 127 | JWT verification + admin authorization + optional auth |
| `songService.js` | 83 | Recommendation engine + trending songs query |
| `ThemeContext.jsx` | 123 | Dark/light mode + custom toast notifications |
| `AuthContext.jsx` | ~160 | JWT-based auth with cross-tab sync |

---

## 17. API Reference

### Auth (`/api/auth`)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/register` | No | Create account |
| POST | `/login` | No | Login, get JWT |
| GET | `/profile` | Yes | Get user profile (populated) |
| PUT | `/profile` | Yes | Update name/avatar |
| PUT | `/change-password` | Yes | Change password (requires current) |
| DELETE | `/account` | Yes | Soft-delete account |

### Songs (`/api/song`)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/add` | Admin | Upload song (image + audio) |
| GET | `/list` | No | Get all songs |
| GET | `/artists` | No | Get unique artists |
| GET | `/recommendations` | Optional | Personalized or trending |
| GET | `/trending` | No | Top songs by playCount |
| POST | `/remove` | Admin | Delete song |
| POST | `/like` | Yes | Like a song |
| POST | `/unlike` | Yes | Unlike a song |
| GET | `/liked` | Yes | Get user's liked songs |
| POST | `/play/:songId` | No | Increment play count |
| POST | `/recently-played` | Yes | Add to recently played |
| GET | `/recently-played` | Yes | Get recently played |

### Albums (`/api/album`)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/add` | Admin | Upload album (image) |
| GET | `/list` | No | Get all albums |
| POST | `/remove` | Admin | Delete album |

### Playlists (`/api/playlist`)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/create` | Yes | Create playlist |
| POST | `/generate` | Yes | AI-generate playlist from prompt |
| GET | `/list` | Yes | Get user's playlists |
| GET | `/:id` | Yes | Get single playlist |
| POST | `/add-song` | Yes | Add song to playlist |
| POST | `/remove-song` | Yes | Remove song from playlist |
| DELETE | `/delete/:id` | Yes | Delete playlist |
| DELETE | `/cleanup-old` | Admin | Remove orphaned playlists |

### Admin (`/api/admin`)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/analytics` | Admin | Dashboard stats + aggregations |
| GET | `/recent-activity` | Admin | Activity feed (last 20) |

---

## 18. Problems I Hit and How I Fixed Them

### The Re-Render Problem
**Symptom**: Playing a song caused lag across the entire app — search typing was delayed, scrolling stuttered.
**Root cause**: The `time` state (current playback position) was in `PlayerContext`. Since every component using `usePlayer()` subscribes to the full context, a state change every second caused cascading re-renders of the entire tree (~300+ unnecessary re-renders/second).
**Fix**: Moved all time-related state into `Player.jsx` as local state. Context only holds track metadata, play/pause status, and queue — things that change infrequently.

### The Cache Flooding Problem (Thundering Herd)
**Symptom**: Adding a single song caused a spike in MongoDB queries for several seconds.
**Root cause**: `clearSongCaches()` deleted every key matching `songs:*`. The next requests for trending, recommendations, and the master list all hit MongoDB simultaneously.
**Fix**: `invalidateSongStructuralCaches()` + `rebuildSongCaches()`. Invalidate only list-level keys, then proactively pre-warm the most common queries. Individual song caches are untouched.

### The Recently Played Race Condition
**Symptom**: Recently played list showed duplicates or exceeded 5 items.
**Root cause**: `user.recentlyPlayed.push(song); user.save()` — two rapid requests read the same array, second `save()` overwrites the first.
**Fix**: Two-step atomic approach using `$pull` then `$push` with `$position: 0` and `$slice: 5`. Both execute inside MongoDB's engine.

### The CORS Multi-Origin Problem
**Symptom**: Frontend 5173 worked but admin 5174 got CORS rejections.
**Root cause**: Express CORS was configured with a single origin string.
**Fix**: Dynamic origin matching with an array of allowed origins, configurable via `CORS_ORIGIN` env var.

### The Play Count Spam Problem
**Symptom**: Rapid clicking on the play button inflated play counts by 10x.
**Root cause**: No deduplication — every click was a valid POST.
**Fix**: Dual deduplication. Frontend: ref-based 15-second cooldown. Backend: in-memory `lastPlayMap` with 10-second cooldown + `processingPlays` Set to prevent concurrent processing of the same key.

### The Ghost Listener Problem
**Symptom**: After a server restart, listener count showed stale numbers.
**Root cause**: Redis still had `user_sockets:*` and `active_users` keys from the previous session.
**Fix**: 3-second delayed cleanup on boot that deletes all socket-tracking keys.

---

## 19. Edge Cases I Handle

| Edge Case | How It's Handled |
|-----------|-----------------|
| **Multi-tab playback** | `userId → Set<socketId>` mapping; user counted once, not per tab |
| **Rapid play clicking** | Dual dedup: 15s frontend cooldown + 10s backend `lastPlayMap` |
| **Rapid like clicking** | `$addToSet` is idempotent; activity log has 2-minute dedup |
| **Redis goes down mid-request** | Every cache call has try-catch with fallback to MongoDB |
| **Invalid ObjectIds** | `mongoose.Types.ObjectId.isValid()` before any DB operation |
| **Token expiry across tabs** | `storage` event listener clears all tabs on logout |
| **File upload failure** | `fs.unlinkSync()` in both success and error cleanup blocks |
| **Concurrent recently-played writes** | Atomic `$pull` + `$push` prevents duplicates and overflow |
| **User deactivation** | `isActive` check in both `authenticateToken` and `loginUser` |
| **Role escalation attempt** | `updateUserProfile` preserves the DB-stored role, ignoring any `role` in request body |
| **Missing environment variables** | Fail-fast: server refuses to start without JWT_SECRET |
| **Stale Redis keys on restart** | Boot-time cleanup of all socket-tracking keys |
| **Memory leak in dedup maps** | Probabilistic cleanup (1% chance each call) purges entries older than 30s/5min |
| **Zero like count** | Unlike uses `$max(likeCount - 1, 0)` pipeline — never goes negative |
| **Empty search** | Returns full song list (no crash) |
| **No recommendations data** | Falls back to globally trending songs |
| **Anonymous user** | `optionalAuth` middleware provides anon recommendations |

---

## 20. Interview Questions & Answers

### Architecture & Design

**Q: Why did you split the admin and user into separate React apps?**
A: Security and deployment independence. The admin bundle contains analytics code, CRUD operations, and admin-specific UI. Keeping them separate means admin code never ships to regular users' browsers, reducing attack surface and bundle size. They can also be deployed independently — an admin-only fix doesn't require re-deploying the user app.

**Q: Why Context API instead of Redux or Zustand?**
A: We have exactly two global states: player/audio and auth. Context API with `useMemo` on the value object handles this well. Adding Redux would introduce boilerplate (`actions`, `reducers`, `dispatch`) without solving an actual problem. If the app grew to 20+ slices, migration to Zustand would be straightforward since the hook-based API is similar.

**Q: How does your application handle state that updates very frequently?**
A: The audio element fires `timeupdate` roughly once per second. If that value lived in React context, every component consuming the context would re-render every second — including the song list, sidebar, and search. I isolated time-related state into `Player.jsx` as local state. The context only holds track metadata and play status — things that change infrequently. This reduced re-renders from 300+/second to near zero for non-player components.

**Q: What's your API design philosophy?**
A: RESTful with consistent response format: `{ success: boolean, message/data }`. Auth routes return `data.user` + `data.token`. Error routes include `error` only in development mode. API rate limiting is environment-configurable and enforced in production; local development defaults are relaxed for manual/E2E validation. Admin routes require both `authenticateToken` and `authorizeAdmin` middleware.

### Database & Data

**Q: Why atomic MongoDB operators instead of `findOne` + modify + `save`?**
A: If two requests arrive simultaneously (e.g., user spam-clicks like), a load-modify-save approach can lose one update because both reads see the same initial state. `$addToSet`, `$pull`, `$push`, and `$inc` execute inside MongoDB's engine as single operations. There's no window for a race condition.

**Q: How do you prevent duplicate play counts?**
A: Dual layer. Frontend: ref-based timestamp check — if the same song was counted within 15 seconds, the API call is skipped entirely. Backend: in-memory `lastPlayMap` with a 10-second cooldown per `listenerId + songId` pair, plus a `processingPlays` Set to prevent race conditions from concurrent requests.

**Q: How does your recommendation engine work without ML?**
A: It uses collaborative-style signals from the user's own behavior. I extract languages and artists from their recently played and liked songs, then query for songs matching those attributes that they haven't already heard. Results are sorted by popularity (playCount). If there aren't enough personalized matches, I fill in with globally trending songs. It's cached for 5 minutes per user.

**Q: What indexes do you have and why?**
A: Three on the Song collection: `{ language: 1 }`, `{ playCount: -1 }`, `{ language: 1, artist: 1 }`. The compound index serves the recommendation engine's `$or` query. The descending playCount index serves trending queries. Without these, recommendation and trending queries would do full collection scans.

### Caching

**Q: What happens if Redis crashes in production?**
A: The app continues working. `isRedisAvailable()` gates every cache call. If it returns false, we skip directly to MongoDB. The user experience is slightly slower but functionally identical. The Redis client has a retry strategy limited to 2 attempts — it won't hang the process trying to reconnect forever.

**Q: What's a thundering herd and how did you solve it?**
A: When cache is invalidated, multiple concurrent requests all miss the cache and hit the database simultaneously. My old code cleared all `songs:*` keys on a single song add. I replaced it with structural invalidation (only list-level keys) plus proactive cache rebuilding. After invalidating, `rebuildSongCaches()` immediately pre-warms the master list and trending — so the first user after invalidation still gets a cache hit.

**Q: Why not use in-memory caching instead of Redis?**
A: In-memory caches die when the server restarts. Redis persists across restarts and can be shared across multiple Node.js processes behind a load balancer. For a single-server deployment the difference is small, but Redis gives us horizontal scaling readiness for free.

### Real-Time

**Q: Why Socket.io instead of Server-Sent Events or polling?**
A: With 100 users polling every 5 seconds, that's 20 requests/second just for listener updates. SSE is one-directional (server to client). Socket.io gives us bidirectional, event-driven communication — the server pushes data only when something changes. It also handles reconnection, fallback transports, and room-based broadcasting out of the box.

**Q: How do you handle a user with multiple tabs?**
A: Each user maps to a Set of socket IDs in Redis (`user_sockets:{userId}`). When a tab disconnects, I remove that socket ID. Only when the Set becomes empty (last tab closed) do I remove the user from `active_users`. This prevents inflated listener counts.

### Security

**Q: How do you prevent privilege escalation?**
A: Three layers. (1) `authorizeAdmin` middleware checks `req.user.role === 'admin'` on every admin route. (2) Profile update explicitly reads the existing role from the database and preserves it — any `role` field in the request body is ignored. (3) Admin panel's `AdminProtectedRoute` checks the role client-side before rendering admin UI.

**Q: How do you handle password security?**
A: Passwords are hashed with bcrypt using 12 salt rounds (higher than the common 10, adding ~4x computation). The password field has `select: false` on the schema, so it's never included in query results unless explicitly requested. The `toJSON` method also strips it as a safety net.

### Scaling

**Q: How would you scale this to handle 1 million users?**
A: Three changes: (1) **Redis Cluster** instead of single instance for cache sharding. (2) **Socket.io Redis adapter** to sync events across multiple Node.js processes behind a load balancer. (3) **MongoDB read replicas** and shard the songs collection by a high-cardinality key. The caching and socket architecture are already designed for this — Redis was chosen specifically because it supports multi-process sharing.

**Q: What would break first under heavy load?**
A: The in-memory deduplication maps (`lastPlayMap`, `processingPlays`). They live on a single process. With multiple processes, two different servers could accept duplicate plays for the same song. Fix: move deduplication to Redis with `SETNX` and TTL.

### Frontend

**Q: How does your toast notification system prevent duplicates?**
A: Before adding a toast, I check `prev.some(toast => toast.message === message && toast.type === type)`. If the exact same message and type already exists in the queue, it's skipped. Each toast has a unique ID (timestamp + random) and auto-removes after 3 seconds.

**Q: How do you prevent theme flash on page load?**
A: `ThemeProvider` has an `isInitialized` flag that starts as `false`. Until the saved theme is read from localStorage and applied to `document.documentElement`, it renders a loading spinner instead of the app. This prevents a light→dark flash.

**Q: What's your error boundary strategy?**
A: `ErrorBoundary.jsx` wraps the entire app. If any component throws during render, it catches the error and displays a fallback UI with an option to reload, instead of showing a white screen.

---

## 21. What I'd Do Differently

- **Search**: Currently client-side (filters the local array). Works for hundreds of songs but won't scale. I'd add MongoDB text indexes or Meilisearch.
- **Testing**: Backend automated tests exist, but frontend E2E and deeper integration coverage can still be expanded.
- **Logging**: Currently `console.error`/`console.warn`. For production: Winston or Pino with structured JSON, shipped to an aggregator.
- **JWT refresh tokens**: Current tokens expire after 7 days with no refresh mechanism. I'd implement refresh token rotation.
- **Image optimization**: Cloudinary auto-optimizes, but I'd add responsive image sizes (`srcset`) for different viewports.
- **Deduplication at scale**: Move play dedup maps from in-memory to Redis `SETNX` for multi-process safety.
- **Database migrations**: No migration system. For schema changes, I'd add a migration runner.

---

## 22. How to Talk About This Project

### In 30 Seconds
"I built a full-stack music streaming platform with React and Node.js. The interesting parts are the performance optimization — I solved a React re-render bottleneck by isolating high-frequency state — and the backend architecture, which uses Redis caching with structural invalidation, atomic MongoDB operations to prevent race conditions, and Socket.io for real-time activity tracking across multiple tabs."

### In 3 Minutes
Add specifics: the multi-tab socket tracking (mapping users to socket ID sets), the play count deduplication (dual frontend/backend guards), the LLM-intent AI playlist generator (OpenRouter/OpenAI/Anthropic/Gemini intent extraction + MongoDB-only retrieval), the recommendation engine (user affinity signals), the optimistic UI with rollback, the admin real-time dashboard with MongoDB aggregation pipelines, and the complete auth system with bcrypt hashing, role-based middleware, and cross-tab session sync. Mention the problems you hit (cache flooding/thundering herd, recently-played race condition, re-render cascades) and why the solutions work at scale.

### In 10 Minutes
Walk through the full architecture diagram. Explain the separation between User App and Admin Panel. Deep-dive into one feature flow end-to-end (best choice: "Playing a Song" — it touches all layers). Show the database schemas and explain the index strategy. Discuss the caching layers with TTLs. Explain the Socket.io multi-tab tracking. Cover the security layers. End with what you'd improve.

---

## 23. April 2026 Addendum

This addendum captures the latest implementation updates and quality improvements added after the original deep-dive sections were written.

### A) New Feature Area: Loop Diagnosis

MusicFlow now includes an end-to-end "loop diagnosis" and wellbeing intervention flow.

Backend additions:
- `Backend/src/config/loopDiagnosisConfig.js`
- `Backend/src/models/LoopEvent.js`
- `Backend/src/routes/loopDiagnosis.js` mounted at `/api/loop-diagnosis`
- `Backend/src/socket/loopDiagnosisSocket.js` for `/loopDiagnosis` namespace
- `Backend/src/services/loopDiagnosis/`
  - `loopDiagnosisEngine.js`
  - `loopDetector.js`
  - `adaptivePolicy.js`
  - `candidateSelector.js`
  - `llmBridgeSelector.js`
  - `redisLoopTracker.js`
  - `timeUtils.js`

Frontend additions:
- `MusicWebApp/src/hooks/useLoopDiagnosis.js`
- `MusicWebApp/src/components/LoopDiagnosis/LoopInterventionCard.jsx`
- `MusicWebApp/src/components/LoopDiagnosis/LoopInterventionCard.css`

Admin additions:
- `admin/src/pages/LoopDiagnosisStats.jsx`
- Admin route at `/loop-diagnosis`

Key behavior notes:
- Detection runs additively from the play pipeline and never blocks playback.
- Redis remains optional; loop-tracking falls back safely if Redis is unavailable.
- Pending `triggered` interventions are deduplicated so users do not receive overlapping popups.
- Interventions reset session baseline after action events for predictable cooldown/session timing.
- Break action clears cooldown for controlled retest/developer flows.
- Interventions support dismiss, bridge-played, break, snooze, switch-mix, and ignored outcomes.

### B) LLM Playlist Generation + OpenRouter Integration

Playlist generation has been upgraded from keyword-only matching to a hybrid LLM-intent pipeline.

Implemented behavior:
- Endpoint `POST /api/playlist/generate` extracts structured intent from user prompts.
- Provider normalization supports: OpenRouter, OpenAI, Anthropic, and Google Gemini.
- OpenRouter path uses OpenAI-compatible calls to `https://openrouter.ai/api/v1`.
- LLM output is sanitized to intent-only fields (`mood`, `energy`, `vibe`, `genres`, `keywords`, `artists`).
- Songs are always selected from MongoDB; no external recommendation payload is used.
- Response includes observability metadata (`intentSource`, `llmProvider`, `llmModel`, `intent`).

### C) API Additions (Loop Diagnosis)

User endpoints:
- `POST /api/loop-diagnosis/event/:id/dismiss`
- `POST /api/loop-diagnosis/event/:id/bridge-played`
- `POST /api/loop-diagnosis/event/:id/break`
- `POST /api/loop-diagnosis/event/:id/snooze`
- `POST /api/loop-diagnosis/event/:id/switch-mix`
- `POST /api/loop-diagnosis/event/:id/ignored`
- `GET /api/loop-diagnosis/preferences`
- `PUT /api/loop-diagnosis/preferences`
- `GET /api/loop-diagnosis/history`

Admin endpoints:
- `GET /api/loop-diagnosis/admin/stats`
- `POST /api/loop-diagnosis/admin/clear-cooldown/:userId`

Dev helper:
- `POST /api/loop-diagnosis/cooldown/clear-self` (non-production)

### D) Quality Gates and Validation Tooling

Added CI workflow:
- `.github/workflows/quality-gates.yml`

Pipeline coverage:
- Backend tests + high-severity audit
- MusicWebApp lint/build + high-severity audit
- Admin lint/build + high-severity audit
- Backend `build:client` artifact verification

Added package scripts:
- Backend: `audit:high`, `ci`, `test:ld`
- MusicWebApp: `audit:high`, `ci`
- Admin: `audit:high`, `ci`

### E) Test Coverage Additions

New backend tests include:
- `Backend/tests/playlistController.validation.test.js`
- `Backend/tests/playlistIntent.test.js`
- `Backend/tests/songService.test.js`
- `Backend/tests/loopDiagnosis/loopDetector.test.js`
- `Backend/tests/loopDiagnosis/llmBridgeSelector.test.js`
- `Backend/tests/loopDiagnosis/engine.test.js`

Simulation utility:
- `scripts/simulateLoop.js`

### F) Environment and Port Alignment

Current local defaults:
- Backend: `4002`
- User app (Vite): `5000`
- Admin app (Vite): `5173`

Loop diagnosis environment settings are now documented in root `.env.example`, and the user app feature flag is available via `VITE_LOOP_DIAGNOSIS_ENABLED`.

### G) ML-based Recommendation System

MusicFlow now has an additive ML recommendation layer designed for stronger personalization and faster adaptation, especially for new users.

Core modules and endpoints:
- `Backend/src/ai/embeddingRecommender.js` computes ranked recommendations.
- `Backend/src/controllers/aiRecommendationController.js` exposes API handlers.
- `GET /api/ai/recommendations/:userId` returns recommendation lists and source metadata.
- `POST /api/ai/feedback` records `play`, `like`, `skip`, and `click` interactions in real time.

How scoring works (interview-ready):
- Long-term preference: user-item embedding similarity from trained vectors.
- Short-term intent: recent feedback signals and adaptive profile updates.
- Final ranking: weighted combination of embedding score + feedback score, with deterministic tie-breaks and a controlled diversity tail.

Cold-start behavior:
- If user embedding is missing but feedback exists, the system uses feedback-bootstrap ranking so early actions immediately change results.
- If both embedding and feedback signals are weak, the system falls back to deterministic recommendation/trending paths.

Operational behavior:
- Feedback submission invalidates per-user recommendation cache to reflect changes on the next request.
- API responses include `source`, `fallbackReason`, and `metadata` for observability and debugging.
