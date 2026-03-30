# MusicFlow

> A production-grade, full-stack music streaming platform built with the MERN stack featuring real-time analytics, AI playlist generation, Redis caching, and Socket.io live activity.

---

## Architecture Overview

```
┌─────────────────────┐   ┌─────────────────────┐
│   User App (React)  │   │  Admin Panel (React) │
│   Port: 5173        │   │  Port: 5174          │
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
- 🤖 AI-powered playlist generation from text prompts
- 📋 Custom playlist CRUD (create, add/remove songs, delete)
- 🕐 Recently played history (capped at 5, atomic deduplication)
- 🎯 Personalized recommendations (language + artist affinity)
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
│   │   ├── controllers/          # Business logic (5 controllers)
│   │   ├── middleware/           # JWT auth, admin authorization, multer
│   │   ├── models/               # Mongoose schemas (5 models)
│   │   ├── routes/               # Express routers (5 routers)
│   │   ├── services/             # Cache service, recommendation engine
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
5. **`playlistController.js`** — Full playlist CRUD + AI playlist generator using keyword matching.
6. **`authController.js`** — Complete auth system with bcrypt hashing, JWT tokens, profile management, and soft-delete.

For a complete walkthrough of every feature, architectural decision, and interview-ready Q&A, see **[FINAL_PROJECT_GUIDE.md](./FINAL_PROJECT_GUIDE.md)**.

---

## License
ISC
