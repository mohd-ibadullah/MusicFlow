# MusicFlow

> A production-grade, full-stack music streaming platform built with the MERN stack featuring real-time analytics, LLM-intent AI playlist generation, Loop Diagnosis wellbeing interventions, Redis caching, and Socket.io live activity.

---

## Architecture Overview

```
┌─────────────────────┐   ┌─────────────────────┐
│   User App (React)  │   │  Admin Panel (React) │
│   Port: 5000        │   │  Port: 5173          │
└────────┬────────────┘   └────────┬─────────────┘
         │  Vite Proxy (/api)      │  Vite Proxy (/api)
         └──────────┬──────────────┘
                    │
          ┌─────────▼──────────┐
          │  Express Backend   │
          │  Port: 4002        │
          │  REST + Socket.io  │
          └──┬───────────┬─────┘
             │           │
    ┌────────▼───┐  ┌────▼──────┐   ┌───────────────┐
    │  MongoDB   │  │   Redis   │   │  Cloudinary   │
    │  (Atlas)   │  │  (Cache)  │   │  (Media CDN)  │
    └────────────┘  └───────────┘   └───────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, Vite, Tailwind CSS | User-facing SPA with responsive design |
| **Admin** | React 19, Vite, Tailwind CSS | Separate SPA for content management |
| **Backend** | Node.js, Express 5 | REST API server |
| **Database** | MongoDB + Mongoose | Primary data store with atomic operators |
| **Cache** | Redis | Performance layer with graceful degradation |
| **Real-time** | Socket.io | Live listener counts and activity feed |
| **Media** | Cloudinary | Audio/image CDN with auto-optimization |
| **Auth** | JWT + bcrypt (salt 12) | Token-based auth with role-based access |
| **Security** | Helmet, CORS, Rate Limiting | HTTP hardening + DDoS protection |

---

## Features at a Glance

### User App
- 🎵 Audio streaming with full playback controls (play/pause, seek, next/prev, shuffle, repeat)
- ❤️ Like/unlike songs with optimistic UI and atomic rollback
- 📀 Browse albums and song collections
- 🔥 Trending songs (ranked by play count)
- 🤖 LLM-assisted AI playlist generation from text prompts (intent extraction + DB-only song retrieval)
- 📋 Custom playlist CRUD (create, add/remove songs, delete)
- 🕐 Recently played history (capped at 5, atomic deduplication)
- 🎯 Personalized recommendations (language + artist affinity)
- 🧠 Loop Diagnosis interventions (bridge track, break, snooze, switch mix)
- 🔍 Client-side search with real-time filtering
- 👥 Live listener count via Socket.io
- 🔐 JWT authentication with cross-tab sync
- 📱 Fully responsive (desktop + mobile sidebar)

### Admin Panel
- 📊 Real-time analytics dashboard (songs, albums, streams, active users)
- 🏆 Top 10 songs and top 10 artists (MongoDB aggregation)
- 📝 Live activity feed (plays, likes, playlist creates, song adds)
- ➕ Add songs with dual Cloudinary upload (image + audio)
- ➕ Add albums with image upload
- 🗑️ Delete songs/albums with cache invalidation
- 🔒 Admin-only route protection (role-based middleware)

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (optional — app degrades gracefully without it)

### Setup
```bash
cp .env.example .env
# Fill in: MONGODB_URI, JWT_SECRET, CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_SECRET_KEY
```

### Run
```bash
# Backend
cd Backend && npm install && node server.js

# Frontend (separate terminal)
cd MusicWebApp && npm install && npm run dev

# Admin Panel (separate terminal)
cd admin && npm install && npm run dev
```

---

## Project Structure

```
MF/
├── Backend/
│   ├── server.js                 # Express + Socket.io + HTTP server
│   ├── src/
│   │   ├── config/               # MongoDB, Redis, Cloudinary connections
│   │   ├── controllers/          # Business logic (auth/song/album/playlist/ai/analytics)
│   │   ├── middleware/           # JWT auth, admin authorization, multer
│   │   ├── models/               # Core + AI + Loop Diagnosis schemas
│   │   ├── routes/               # Auth/song/album/playlist/admin/ai/loop diagnosis routers
│   │   ├── services/             # Cache, recommendations, loop diagnosis engine
│   │   └── utils/                # Activity logger
│   └── package.json
├── MusicWebApp/
│   ├── src/
│   │   ├── components/           # 29 React components
│   │   ├── context/              # PlayerContext, AuthContext, ThemeContext
│   │   ├── pages/                # Login, Signup, TrendingSongs, BiggestHits
│   │   └── index.css             # Design system (Tailwind + custom)
│   └── package.json
├── admin/
│   ├── src/
│   │   ├── components/           # Navbar, Sidebar, DeleteModal, AdminProtectedRoute
│   │   ├── context/              # AuthContext (admin-specific)
│   │   └── pages/                # AdminLogin, AdminAnalytics, AddSong, AddAlbum, ListSong, ListAlbum
│   └── package.json
├── FINAL_PROJECT_GUIDE.md        # Deep technical walkthrough (interview prep)
└── .env.example
```

---

## For Reviewers

If you're evaluating this codebase, these are the files worth reading:

1. **`PlayerContext.jsx`** — Global player state management. Playback time is deliberately excluded from context to prevent re-render cascades.
2. **`songController.js`** — 800+ lines covering play count deduplication, atomic like/unlike, recently played history, recommendations, and Cloudinary uploads.
3. **`cacheService.js`** — Redis caching layer with structural invalidation and graceful degradation.
4. **`server.js`** — Socket.io connection lifecycle with multi-tab user tracking using `userId → Set<socketId>` mapping.
5. **`playlistController.js`** — Full playlist CRUD + LLM-driven intent extraction (OpenRouter/OpenAI/Anthropic/Google) with DB-only retrieval and ranked playlist creation.
6. **`authController.js`** — Complete auth system with bcrypt hashing, JWT tokens, profile management, and soft-delete.

For a complete walkthrough of every feature, architectural decision, and interview-ready Q&A, see **[FINAL_PROJECT_GUIDE.md](./FINAL_PROJECT_GUIDE.md)**.

---

## Latest Updates (April 2026)

### Loop Diagnosis and Wellbeing Interventions (Updated)
- Added a full loop-diagnosis feature set across backend, user app, and admin app.
- New backend model: `Backend/src/models/LoopEvent.js` (with retention index).
- New backend routes: `Backend/src/routes/loopDiagnosis.js` mounted at `/api/loop-diagnosis`.
- New backend engine modules under `Backend/src/services/loopDiagnosis/`:
    - loop detection logic
    - adaptive behavior policy
    - bridge candidate selection (LLM + safe fallback)
    - Redis loop/session/cooldown tracker with in-memory fallback safety
- New Socket.io namespace: `/loopDiagnosis` initialized via `Backend/src/socket/loopDiagnosisSocket.js`.
- Reliability updates:
    - prevents duplicate popups when a pending intervention already exists
    - resets session baseline after intervention actions (dismiss/bridge/break/snooze/switch)
    - supports cooldown clear for break/retest flows
    - marks stale pending interventions as ignored
- User app integration:
    - `MusicWebApp/src/hooks/useLoopDiagnosis.js`
    - `MusicWebApp/src/components/LoopDiagnosis/LoopInterventionCard.jsx`
- Admin integration:
    - New page `admin/src/pages/LoopDiagnosisStats.jsx`
    - New route: `/loop-diagnosis`

### LLM-based AI Playlist Generation (Updated)
- `POST /api/playlist/generate` now uses LLM for **intent extraction only**; songs are always retrieved from MongoDB.
- Supports provider normalization for `openrouter`, `openai`, `anthropic`, and `google`.
- OpenRouter integration uses OpenAI-compatible API calls with `OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_TITLE` headers.
- Intent payload is sanitized to ignore song-level suggestions and keep only mood/energy/vibe/genre/keyword/artist signals.
- Matching and ranking use database metadata (`genre`, `artist`, `desc`, `album`) and popularity (`playCount`, `likeCount`).

### ML-based Recommendation System (Updated)
- Added an embedding-based recommendation pipeline in `Backend/src/ai/embeddingRecommender.js`, exposed via `GET /api/ai/recommendations/:userId`.
- Ranking combines long-term taste (user-item embedding similarity) with short-term behavior feedback (`play`, `like`, `skip`, `click`) submitted via `POST /api/ai/feedback`.
- Cold-start handling is multi-stage: feedback-bootstrap recommendations for new users, then deterministic fallback recommendations/trending when signal is insufficient.
- Recommendation feedback invalidates per-user recommendation cache so the next fetch reflects latest interactions immediately.
- Responses include explainable metadata (`source`, `fallbackReason`, `metadata`) for debugging and interview discussion.

### Environment and Feature Flags
- Root `.env` includes Loop Diagnosis settings (thresholds, cooldowns, late-night window, LLM provider/model/timeouts).
- LLM provider config supports OpenRouter routing in addition to OpenAI/Anthropic/Google provider options.
- User app `.env` now supports `VITE_LOOP_DIAGNOSIS_ENABLED`.
- Backend API/proxy defaults remain aligned to backend `PORT=4002`.

### Testing, Security, and CI/CD Improvements
- Added backend tests:
    - `Backend/tests/playlistController.validation.test.js`
    - `Backend/tests/playlistIntent.test.js`
    - `Backend/tests/songService.test.js`
    - Loop diagnosis suite under `Backend/tests/loopDiagnosis/`
- Added workflow: `.github/workflows/quality-gates.yml`.
    - Backend tests + high-severity audit
    - MusicWebApp lint/build + high-severity audit
    - Admin lint/build + high-severity audit
    - Backend client-dist verification
- Added consistent scripts:
    - Backend: `audit:high`, `ci`, `test:ld`
    - MusicWebApp/Admin: `audit:high`, `ci`

### Current Validation Snapshot
- Backend tests passing locally (including new tests).
- Frontend and admin lint/build passing.
- High-severity audits clean for backend, MusicWebApp, and admin.

### Useful Commands
```bash
# Backend
cd Backend && npm test
cd Backend && npm run test:ld
cd Backend && npm run ci

# User app
cd MusicWebApp && npm run ci

# Admin app
cd admin && npm run ci
```

---

## License
ISC
