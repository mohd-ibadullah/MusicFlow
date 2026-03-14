# MusicFlow

A **production-grade, AI-powered music streaming platform** built with the MERN stack. Designed as a portfolio project demonstrating real-world backend architecture, personalized recommendations, real-time activity, and performance optimization.

---

## Features

- **User authentication** — Register, login, JWT, protected routes
- **Music playback** — Play, pause, seek, shuffle, repeat, queue
- **Playlists** — Create, edit, delete; add/remove songs
- **Liked songs & recently played** — Synced across devices when logged in
- **Personalized recommendations** — Based on recent plays, likes, genre, artist, and play count
- **Trending** — Top songs by play count
- **AI playlist generator** — Generate playlists from text prompts (e.g. "workout playlist", "relaxing")
- **Real-time listening activity** — Live ticker of who’s listening (Socket.IO)
- **Admin dashboard** — Upload songs/albums; analytics (total streams, top songs, top artists, active users)
- **Redis caching** — Songs list, albums list, recommendations, trending (graceful fallback if Redis is down)
- **Streaming analytics** — Aggregation pipelines for admin metrics

---

## Tech Stack

| Layer      | Stack |
|-----------|--------|
| Frontend  | React 19, Vite, TailwindCSS, Context API, Socket.IO client |
| Backend   | Node.js, Express 5, MongoDB (Mongoose), JWT, Multer, Cloudinary |
| Cache     | Redis (optional) |
| Realtime  | Socket.IO |
| Deploy    | Frontend → Vercel, Backend → Render, DB → MongoDB Atlas |

---

## Project Structure

```
MusicFlow-main/
├── Backend/                 # Express API
│   ├── server.js
│   ├── src/
│   │   ├── config/          # MongoDB, Redis, Cloudinary
│   │   ├── controllers/      # Request/response handlers
│   │   ├── middleware/       # Auth, Multer
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (e.g. recommendations)
│   │   └── utils/           # Cache helpers
│   └── package.json
├── MusicWebApp/             # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── context/         # Auth, Player, Theme
│   │   ├── pages/
│   │   └── utils/
│   └── package.json
├── admin/                   # Admin dashboard (React)
└── docs/
    └── SYSTEM_DESIGN.md     # Scaling & architecture notes
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- (Optional) Redis for caching (see notes below)
- Cloudinary account for media storage

### Environment variables

**Backend** (`Backend/.env`):

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/music
JWT_SECRET=your-secret-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
# Redis configuration (optional)
# - set REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
# - you can disable caching entirely with REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
```

**MusicWebApp** (`.env`):

```env
VITE_API_URL=http://localhost:4000
```

### Run locally

```bash
# Backend
cd Backend && npm install && npm run server

# (optional) populate database with sample data
cd Backend && npm run seed

# Frontend
cd MusicWebApp && npm install && npm run dev

# Admin (optional)
cd admin && npm install && npm run dev
```

- Frontend: http://localhost:5173  
- Backend API: http://localhost:4000  

### Set an admin user

```bash
cd Backend && node setAdmin.js
# Use the email of an existing user to promote to admin.
```

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/auth/register` | Register |
| POST   | `/api/auth/login` | Login |
| GET    | `/api/auth/profile` | Profile (auth) |
| GET    | `/api/song/list` | All songs (cached) |
| GET    | `/api/song/recommendations` | Personalized recommendations (optional auth) |
| GET    | `/api/song/trending?limit=10` | Trending by play count |
| POST   | `/api/song/like` | Like song (auth) |
| POST   | `/api/song/recently-played` | Record play + real-time broadcast (auth) |
| GET    | `/api/album/list` | All albums (cached) |
| GET    | `/api/playlist/list` | User playlists (auth) |
| POST   | `/api/playlist/generate` | AI generate playlist from prompt (auth) |
| GET    | `/api/admin/analytics` | Streams, top songs/artists, active users (admin) |

---

## Architecture Highlights

- **Controllers** handle HTTP; **services** hold business logic (e.g. `songService.getRecommendations()`).
- **Cache-aside**: Check Redis first; on miss, read from MongoDB and write to Redis with TTL. Cache invalidated on song/album add/remove.
- **Real-time**: When a user plays a song, backend emits `user_listening` over Socket.IO; frontend shows a live ticker.
- **Recommendations**: Combine recently played, liked songs, same genre/artist, and play-count ranking; top 10 returned, cached per user/anon.
- **Error handling**: Redis failures do not crash the app; Socket and API errors are caught and logged.

For scaling and system design (Redis, CDN, horizontal scaling, load balancing, microservices), see [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

---

## License

ISC.
# MF
