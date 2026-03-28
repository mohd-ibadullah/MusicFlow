# MusicFlow

> A full-stack music streaming platform built with the MERN stack.

MusicFlow is a production-grade music streaming application that combines smooth playback, real-time community activity, and an admin dashboard. It was built to tackle real engineering challenges — caching strategies, real-time synchronization, state management at scale, and atomic database operations.

---

## What Makes This Interesting

This project goes beyond a basic CRUD app. Here are the specific technical problems I solved:

- **Playback performance**: Audio progress updates every second. Putting that in React's global context caused the entire app to re-render 60+ times per second. I isolated time state into the Player component using local refs, keeping the UI at 60fps.
- **Cache strategy**: A naive "clear everything on change" approach caused database spikes (thundering herd). I implemented structural invalidation — only clearing affected cache groups (trending, master list) instead of the entire cache namespace.
- **Real-time listeners**: Socket.io tracks who's listening across multiple tabs. Each user maps to a set of socket IDs. The count only decrements when their *last* tab disconnects.
- **Data consistency**: User history (recently played, likes) uses MongoDB atomic operators (`$pull`, `$push`, `$slice`) instead of load-modify-save, which prevents race conditions under concurrent requests.

---

## Tech Stack

**Frontend**: React 19, Vite, Tailwind CSS, Context API, Lucide React  
**Backend**: Node.js, Express, MongoDB, Mongoose, Redis, Socket.io  
**Storage**: Cloudinary (audio + images)  
**Admin**: Separate React app with analytics dashboard

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (optional — app degrades gracefully without it)

### Setup
```bash
cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, and Cloudinary credentials
```

### Run
```bash
# Backend
cd Backend && npm install && npm start

# Frontend
cd MusicWebApp && npm install && npm run dev

# Admin Panel
cd admin && npm install && npm run dev
```

---

## For Reviewers

If you're evaluating this codebase, these are the files worth reading:

1. **`PlayerContext.jsx`** — Global player state management. Look at how playback time is deliberately excluded from context to prevent re-render cascades.
2. **`songController.js`** — Play count deduplication, atomic history updates, and the write-through cache rebuild pattern.
3. **`cacheService.js`** — Redis caching layer with structural invalidation. Designed to fail gracefully if Redis is unavailable.
4. **`server.js`** — Socket.io connection lifecycle. Multi-tab user tracking using `userId → Set<socketId>` mapping.

For a detailed walkthrough of every feature flow, architectural decision, and interview-ready Q&A, see **[FINAL_PROJECT_GUIDE.md](./FINAL_PROJECT_GUIDE.md)**.

---

## License
ISC
