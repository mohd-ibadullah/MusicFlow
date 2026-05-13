// sampleData.js - fallback data when backend is empty
export const sampleSongs = [
  {
    _id: 's1',
    name: 'Sunrise Drive',
    desc: 'The Morning Band',
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=400&auto=format&fit=crop&crop=faces',
    duration: '3:45',
    album: 'Morning Vibes',
    artist: 'The Morning Band',
    file: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_1ac427d4ed.mp3',
    createdAt: new Date('2024-01-15').toISOString()
  },
  {
    _id: 's2',
    name: 'Midnight City',
    desc: 'City Lights',
    image: 'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?q=80&w=400&auto=format&fit=crop&crop=faces',
    duration: '4:12',
    album: 'Night Drive',
    artist: 'City Lights',
    file: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_b396d0a877.mp3',
    createdAt: new Date('2024-01-20').toISOString()
  },
  {
    _id: 's3',
    name: 'Ocean Breeze',
    desc: 'Waves & Co',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=400&auto=format&fit=crop&crop=faces',
    duration: '2:58',
    album: 'Seaside',
    artist: 'Waves & Co',
    file: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_0339df33c9.mp3',
    createdAt: new Date('2024-01-25').toISOString()
  },
  {
    _id: 's4',
    name: 'Electric Dreams',
    desc: 'Neon Pulse',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=400&auto=format&fit=crop&crop=faces',
    duration: '3:30',
    album: 'Digital Waves',
    artist: 'Neon Pulse',
    file: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_1ac427d4ed.mp3',
    createdAt: new Date('2024-02-01').toISOString()
  },
  {
    _id: 's5',
    name: 'Forest Echoes',
    desc: 'Nature Sounds',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=400&auto=format&fit=crop&crop=faces',
    duration: '4:20',
    album: 'Natural Harmony',
    artist: 'Nature Sounds',
    file: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_b396d0a877.mp3',
    createdAt: new Date('2024-02-05').toISOString()
  }
];

export const sampleAlbums = [
  {
    _id: 'a1',
    name: 'Morning Vibes',
    desc: 'Start your day right',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=400&auto=format&fit=crop&crop=faces',
    bgColor: '#FF6B6B'
  },
  {
    _id: 'a2',
    name: 'Night Drive',
    desc: 'Best songs for the road',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=400&auto=format&fit=crop&crop=faces',
    bgColor: '#4ECDC4'
  },
  {
    _id: 'a3',
    name: 'Digital Waves',
    desc: 'Electronic beats and rhythms',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=400&auto=format&fit=crop&crop=faces',
    bgColor: '#45B7D1'
  },
  {
    _id: 'a4',
    name: 'Natural Harmony',
    desc: 'Sounds of nature and peace',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=400&auto=format&fit=crop&crop=faces',
    bgColor: '#96CEB4'
  }
];

