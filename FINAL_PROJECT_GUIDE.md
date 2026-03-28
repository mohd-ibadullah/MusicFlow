# MusicFlow — Technical Deep Dive

This document walks through the architecture, feature flows, problems I encountered, and how I solved them. It's written so that someone reading this — whether a teammate or an interviewer — can understand the full system without opening the code.

---

## 1. What MusicFlow Does

MusicFlow is a music streaming platform with three parts:

- **User App** (React): Browse songs, create playlists, like tracks, see what others are listening to in real-time.
- **Admin Panel** (React): Manage the song catalog, view analytics, monitor platform activity.
- **Backend** (Node.js/Express): REST APIs, real-time socket events, Redis caching, MongoDB persistence.

The user plays a song. The backend counts the play, updates caches, and broadcasts the activity to all connected clients. The admin sees live stats update without refreshing.

---

## 2. How Key Features Work

### Playing a Song (end-to-end)

1. User clicks a song → `PlayerContext.playWithId()` is called with the song ID.
2. The track metadata is set in global context. The audio element's `src` is updated.
3. The audio element fires `onplay` → we emit a `user_started_listening` socket event.
4. In the same callback, we POST to `/api/song/play/:id` with a `listenerId`.
5. Backend checks the in-memory dedup map (`canProcessPlay`). If this user played this song within the last 10 seconds, it returns early — no duplicate count.
6. If valid, MongoDB atomically increments `playCount` via `$inc`.
7. The backend emits two socket events: `user_listening` (for the live ticker) and `analytics_updated` (for the admin dashboard).
8. Caches are **not** cleared on every play. They expire naturally via TTL (60s for trending, 300s for the master list). This prevents cache thrashing under high traffic.

### Liking a Song

1. User clicks the heart icon → `toggleLikeSong()` runs.
2. **Optimistic update**: the UI flips immediately (the heart fills/unfills).
3. Backend receives the request and uses `$addToSet` (like) or `$pull` (unlike) — these are atomic. No load-modify-save cycle.
4. `likeCount` on the song document is updated with `$inc` (like) or a `$max[subtract, 0]` pipeline (unlike — never goes below zero).
5. If the API call fails, the optimistic update is rolled back to the previous state.

### Recently Played

1. When a song starts playing, `addToRecentlyPlayed()` fires.
2. Optimistic update: the song is added to the front of the local list (max 5).
3. Backend receives `/api/song/recently-played` POST.
4. It validates both IDs are valid ObjectIds, then runs two atomic operations:
   - `$pull` the song from the array (in case it's already there)
   - `$push` it to position 0, with `$slice: 5` to cap the list
5. This ensures no duplicates and no unbounded growth — all inside MongoDB's engine.

### Real-Time Listener Count

1. On connect, the frontend socket emits `get_listeners`.
2. The backend maintains a `socketToUserMap` (socket ID → user ID) and tracks unique users in a Redis set (`active_users`).
3. Each user can have multiple tabs. Their socket IDs are stored in `user_sockets:{userId}`.
4. When a tab disconnects, its socket ID is removed. Only when the user's **last** socket disconnects is the user removed from `active_users`.
5. The count is broadcast to all clients via `users_listening`.

---

## 3. Key Files and What They Do

| File | Purpose |
|------|---------|
| `PlayerContext.jsx` | Global player state — queue, track metadata, socket lifecycle, liked songs, search. Deliberately excludes playback time from context. |
| `Player.jsx` | Renders the player bar. Manages its own time/progress state locally via `useEffect` + DOM refs to avoid triggering context re-renders. |
| `songController.js` | All song-related API logic — play counting with deduplication, atomic like/unlike, recently played history, recommendations. |
| `cacheService.js` | Redis wrapper. Handles get/set/delete/pattern-invalidation. All operations silently degrade if Redis is down. |
| `server.js` | Express server + Socket.io setup. Manages the distributed user-tracking maps and broadcasts real-time events. |
| `AuthContext.jsx` | Authentication state with cross-tab synchronization via `storage` event listener. Login/logout syncs instantly across all open tabs. |

---

## 4. Technical Decisions and Why

### Why isolate playback time from global context?

The audio element fires `timeupdate` roughly once per second. If that value lives in React context, every component consuming the context re-renders every second — including the song list, sidebar, and search. Moving time to local state in `Player.jsx` confines re-renders to just the progress bar.

### Why Redis for caching instead of in-memory?

In-memory caches die when the server restarts. Redis persists across restarts and can be shared across multiple server instances if we scale horizontally. But Redis is optional — every `cacheGet` call has a try-catch that falls back to a direct MongoDB query.

### Why atomic MongoDB operators instead of `findOne` + `save`?

If two requests arrive simultaneously (e.g., user clicks "like" rapidly), a load-modify-save approach can lose one update. `$addToSet`, `$pull`, `$push`, and `$inc` execute inside the database engine as single operations. There's no window for a race condition.

### Why Socket.io instead of polling?

With 100 users polling every 5 seconds, that's 20 requests/second hitting the server just for "who's listening?" updates. Sockets maintain a persistent connection and push data only when something changes. It's event-driven, not request-driven.

---

## 5. Problems I Hit and How I Fixed Them

### The Re-Render Problem

**What happened**: Playing a song caused visible lag across the entire app — typing in search was delayed, scrolling stuttered.

**Root cause**: The `time` state (current playback position) was stored in `PlayerContext`. Since every component that uses `usePlayer()` subscribes to the full context, a state change every second caused a cascading re-render of the entire component tree.

**Fix**: Moved all time-related state into `Player.jsx` as local state. The global context only holds track metadata, play/pause status, and queue info — things that change infrequently. Performance improved dramatically.

### The Cache Flooding Problem

**What happened**: Adding a single song to the catalog caused a spike in MongoDB queries for the next few seconds.

**Root cause**: The old code called `clearSongCaches()` which deleted every Redis key matching `songs:*`. This meant the next request for trending, recommendations, and the master list all hit MongoDB simultaneously (thundering herd).

**Fix**: Replaced with `invalidateSongStructuralCaches()` which only clears list-level keys. Individual song metadata caches are untouched. A background `rebuildSongCaches()` function pre-warms the most common queries immediately after invalidation.

### The Recently Played Race Condition

**What happened**: Occasionally, the recently played list would show duplicate entries or exceed 5 items.

**Root cause**: The original code did `user.recentlyPlayed.push(song); user.save()`. If two songs were played in quick succession, both `find` calls would read the same initial array, and the second `save` would overwrite the first.

**Fix**: Switched to a two-step atomic approach:
1. `$pull` to remove the song if it already exists
2. `$push` with `$position: 0` and `$slice: 5` to add it at the front and cap the array

Both happen inside MongoDB's engine. No JavaScript-side array manipulation.

---

## 6. Edge Cases I Handle

**Multi-tab playback**: A user opens 5 tabs. Each tab creates a socket connection. The server tracks all 5 socket IDs under one user ID. The active listener count only includes each user once, not once per tab.

**Rapid clicking**: A user spam-clicks the play button. The backend's `canProcessPlay()` function uses an in-memory map with a 10-second cooldown per user-song pair. Duplicate requests return successfully but skip the database write.

**Redis goes down**: Every cache operation is wrapped in try-catch. If Redis is unavailable, `cacheGet` returns `null` and the caller falls through to its MongoDB query. The app keeps working, just without the speed benefit of caching.

**Invalid ObjectIds**: The `addToRecentlyPlayed` endpoint validates both `userId` and `songId` with `mongoose.Types.ObjectId.isValid()` before doing anything. Invalid IDs get a clean 400 response instead of a Mongoose CastError.

**Token expiry across tabs**: `AuthContext` listens for `storage` events. If Tab A logs out (removing the token from localStorage), Tab B immediately detects this and clears its user state — no stale session.

---

## 7. Interview Questions I Can Answer

**Q: How do you prevent duplicate play counts?**  
A: In-memory deduplication on the backend. Each `listenerId + songId` pair has a 10-second cooldown. The frontend also guards against rapid-fire calls using a ref-based timestamp check. If the same song was counted within 15 seconds, the API call is skipped entirely.

**Q: What happens if Redis crashes in production?**  
A: The app continues working. `isRedisAvailable()` gates every cache call. If it returns false, we skip directly to MongoDB. The user experience is slightly slower but functionally identical.

**Q: How do you handle real-time updates without killing the server?**  
A: Socket.io with Redis-backed user tracking. Events are pushed, not polled. The server broadcasts to all clients only when something actually happens (a play, a like, a new song). No periodic polling means no wasted bandwidth.

**Q: Why not use Redux or Zustand?**  
A: Context API with `useMemo` on the value object was sufficient for our data shape. We have one global state (player/audio) and one auth state. Redux would add complexity without solving a real problem. If the app grew to 20+ slices of state, migration to Zustand would be straightforward.

**Q: How does the admin panel stay in sync?**  
A: The admin listens to the same `analytics_updated` socket event. When a user plays or likes a song, the admin dashboard updates instantly — no refresh needed. Activity logs are also persisted to MongoDB so they survive server restarts.

**Q: How would you scale this to handle 1 million users?**  
A: Three changes: (1) Use Redis Cluster instead of a single instance for cache sharding. (2) Use Socket.io's Redis adapter to sync events across multiple Node.js processes behind a load balancer. (3) Add MongoDB read replicas and shard the songs collection by a high-cardinality key.

**Q: What was the hardest bug you encountered?**  
A: The context re-render issue. It was subtle because the app "worked" — songs played, controls responded. But the profiler showed 300+ unnecessary re-renders per second. The fix was architecturally simple (move state out of context) but required understanding exactly how React context propagation works.

---

## 8. What I'd Do Differently

- **Search**: Currently client-side (filters the local `songsData` array). This works for a few hundred songs but won't scale. I'd add MongoDB text indexes or integrate Meilisearch for instant server-side search.
- **Testing**: No automated tests yet. I'd add integration tests for the critical paths (play flow, auth flow) using Vitest + Supertest.
- **Logging**: Currently using `console.error`/`console.warn`. For production monitoring, I'd replace with Winston or Pino and ship logs to an aggregator.
- **JWT refresh**: Tokens currently have a fixed expiry. I'd implement refresh token rotation to avoid forcing users to re-login.

---

## 9. How to Talk About This Project

**In 30 seconds:**  
"I built a full-stack music streaming platform with React and Node.js. The interesting parts are the performance optimization — I solved a React re-render bottleneck by isolating high-frequency state — and the backend architecture, which uses Redis caching with a custom invalidation strategy and atomic MongoDB operations to handle concurrent users safely."

**In 3 minutes:**  
Add specifics: the multi-tab socket tracking, the play count deduplication, the optimistic UI updates with rollback, and the admin real-time dashboard. Mention the problems you hit (cache flooding, race conditions) and why the solutions work at scale.
