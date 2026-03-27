# MusicFlow

A production-grade music streaming platform built with the MERN stack. Includes real-time listening activity, personalized recommendations, AI playlist generation, an admin dashboard, and optional Redis caching.

---

## Features

- User authentication — register, login, JWT, protected routes
- Music playback — play, pause, seek, shuffle, repeat, queue
- Playlists — create, edit, delete; add/remove songs
- Liked songs and recently played — synced when logged in
- Personalized recommendations — based on recent plays, likes, genre, and artist
- Trending — top songs by play count
- AI playlist generator — generate playlists from a text prompt
- Real-time listening activity — live ticker via Socket.IO
- Admin dashboard — upload songs/albums; analytics (streams, top songs, active users)
- Redis caching — songs, albums, recommendations, trending (graceful fallback if Redis is down)

---

## Tech Stack

| Layer     | Stack                                                                 |
|-----------|-----------------------------------------------------------------------|
| Frontend  | React 19, Vite, Tailwind CSS, Context API, Socket.IO client          |
| Backend   | Node.js, Express 5, MongoDB (Mongoose), JWT, Multer, Cloudinary      |
| Cache     | Redis (optional)                                                     |
| Realtime  | Socket.IO                                                            |

---

## Project Structure

```
MusicFlow/
├── Backend/                  # Express API server
│   ├── server.js             # Entry point
│   ├── src/
│   │   ├── config/           # MongoDB, Cloudinary, Redis
│   │   ├── controllers/      # Route handlers
│   │   ├── middleware/       # Auth, Multer, admin guard
│   │   ├── models/           # Mongoose schemas
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic (recommendations, etc.)
│   │   └── utils/            # Cache helpers
│   ├── seed.js               # Seed sample data
│   ├── setAdmin.js           # Promote user to admin
│   └── package.json
├── MusicWebApp/              # React user-facing frontend
│   ├── src/
│   │   ├── components/
│   │   ├── context/          # Auth, Player, Theme
│   │   ├── pages/
│   │   └── data/             # Sample data fallback
│   └── package.json
├── admin/                    # React admin dashboard
│   └── src/
│       ├── components/
│       └── pages/
├── .env.example              # Root env template (backend reads this)
└── start-backend.sh          # Starts MongoDB + backend together
```

---

## Running Locally

### 1. Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community) (local install) **or** a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- A free [Cloudinary](https://cloudinary.com/) account (for image/audio uploads)
- Git

### 2. Clone the repo

```bash
git clone https://github.com/123ibadullah/MF.git
cd MF
```

### 3. Environment variables

The backend reads a single `.env` file from the project root.

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/musicflow
JWT_SECRET=replace_with_a_long_random_string

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Redis is optional — set false to skip it entirely
REDIS_ENABLED=false
```

The frontend and admin apps only need their own `.env` files if you're **not** using the Vite dev server proxy (the proxy is already configured in `vite.config.js`). For standard local development, leave them empty:

```bash
cp MusicWebApp/.env.example MusicWebApp/.env
cp admin/.env.example admin/.env
```

### 4. Install dependencies

```bash
# Backend
cd Backend && npm install

# Frontend
cd ../MusicWebApp && npm install

# Admin
cd ../admin && npm install
```

### 5. Start the services

Open three terminal windows (or tabs):

**Terminal 1 — Backend** (starts MongoDB + API server):
```bash
bash start-backend.sh
```
Backend runs at → http://localhost:8000

**Terminal 2 — Frontend**:
```bash
cd MusicWebApp && npm run dev
```
Frontend runs at → http://localhost:5000

**Terminal 3 — Admin dashboard** (optional):
```bash
cd admin && npm run dev
```
Admin runs at → http://localhost:5173

### 6. (Optional) Seed sample data

If your database is empty, seed it with sample songs and albums:

```bash
cd Backend && npm run seed
```

The frontend also has a built-in fallback — it will display sample data automatically when the database returns no results.

### 7. Create an admin user

Register a normal account in the frontend first, then promote it to admin:

```bash
cd Backend && node setAdmin.js
```

Enter the email address of the account to promote. After that, log in to the admin dashboard at http://localhost:5173.

---

## API Reference

| Method | Endpoint                      | Auth     | Description                          |
|--------|-------------------------------|----------|--------------------------------------|
| POST   | `/api/auth/register`          | —        | Register a new user                  |
| POST   | `/api/auth/login`             | —        | Login, returns JWT                   |
| GET    | `/api/auth/profile`           | User     | Get current user profile             |
| GET    | `/api/song/list`              | —        | All songs (Redis-cached)             |
| GET    | `/api/song/recommendations`   | Optional | Personalized recommendations         |
| GET    | `/api/song/trending`          | —        | Top songs by play count              |
| POST   | `/api/song/like`              | User     | Like or unlike a song                |
| POST   | `/api/song/recently-played`   | User     | Record a play + real-time broadcast  |
| GET    | `/api/album/list`             | —        | All albums (Redis-cached)            |
| GET    | `/api/playlist/list`          | User     | User's playlists                     |
| POST   | `/api/playlist/generate`      | User     | AI-generate playlist from a prompt   |
| GET    | `/api/admin/analytics`        | Admin    | Streams, top songs, active users     |
| POST   | `/api/admin/song/add`         | Admin    | Upload a new song                    |
| POST   | `/api/admin/album/add`        | Admin    | Upload a new album                   |
| DELETE | `/api/admin/song/remove`      | Admin    | Remove a song                        |
| DELETE | `/api/admin/album/remove`     | Admin    | Remove an album                      |

---

## Common Issues

**MongoDB connection error**
Make sure MongoDB is running locally (`mongod`) or your Atlas connection string is correct in `.env`.

**Port already in use**
Change `PORT` in `.env` (backend) or the `port` field in `vite.config.js` (frontend/admin).

**Cloudinary upload fails**
Double-check your `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env`.

**Frontend shows "sample" data only**
This is expected when the database is empty. Run `npm run seed` inside `Backend/` to populate real data, or upload songs via the admin dashboard.

**Admin login says "not authorized"**
You must first run `node setAdmin.js` in `Backend/` to grant admin access to your account.

---

## License

ISC
