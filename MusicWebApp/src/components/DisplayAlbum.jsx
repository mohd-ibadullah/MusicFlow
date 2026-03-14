// components/DisplayAlbum.jsx
import React, { useEffect, useState, useContext } from "react";
import { Disc, Music2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { PlayerContext } from "../context/PlayerContext";
import { useToast } from "../context/ThemeContext";

const DisplayAlbum = ({ album }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [albumData, setAlbumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { playWithId, albumsData, songsData } = useContext(PlayerContext);
  const { showToast } = useToast();

  useEffect(() => {
    let foundAlbum = null;
    
    if (album) {
      foundAlbum = album;
    } else if (albumsData.length > 0 && id) {
      foundAlbum = albumsData.find((item) => item && item._id === id);
    }

    if (foundAlbum) {
      setAlbumData(foundAlbum);
    } else {
      showToast("Album not found", "error");
    }
    
    setLoading(false);
  }, [albumsData, id, album, showToast]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="animate-pulse">
          <div className="flex gap-8 flex-col md:flex-row md:items-end mb-12">
            <div className="w-48 h-48 bg-gray-300 dark:bg-gray-700 rounded-xl"></div>
            <div className="space-y-4 flex-1">
              <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-300 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!albumData) {
    return (
      <div className="text-center py-20 animate-fade-in">
        <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <Disc className="w-12 h-12 text-gray-500 dark:text-gray-400" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Album Not Found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
          The album you're looking for doesn't exist or may have been removed.
        </p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Safe data access
  const safeAlbumData = {
    name: albumData.name || "Untitled Album",
    desc: albumData.desc || "No description available",
    image: albumData.image || "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=300&h=300&fit=crop&crop=center",
    bgColor: albumData.bgColor || "#3B82F6"
  };

  const albumSongs = songsData.filter((item) => item && item.album === safeAlbumData.name);

  const handlePlayAlbum = () => {
    if (albumSongs.length > 0) {
      playWithId(albumSongs[0]._id, albumSongs);
      showToast(`Playing album: ${safeAlbumData.name}`, "success");
    } else {
      showToast("No songs available in this album", "info");
    }
  };

  const handlePlaySong = (songId, index) => {
    if (songId && albumSongs.length > 0) {
      playWithId(songId, albumSongs);
      showToast("Playing song", "success");
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Album Header */}
      <div className="flex gap-8 flex-col md:flex-row md:items-end mb-12">
        <img 
          className="w-48 h-48 rounded-2xl shadow-2xl object-cover" 
          src={safeAlbumData.image} 
          alt={safeAlbumData.name} 
        />
        <div className="flex flex-col flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">ALBUM</p>
          <h2 className="text-5xl font-bold mb-4 md:text-7xl text-gray-900 dark:text-gray-100">
            {safeAlbumData.name}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{safeAlbumData.desc}</p>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">♪</span>
              </div>
              <span className="text-sm font-medium">MusicFlow</span>
            </div>
            <span className="text-gray-500 dark:text-gray-400">•</span>
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {albumSongs.length} {albumSongs.length === 1 ? 'song' : 'songs'}
            </span>
          </div>
          
          {/* Album Actions */}
          <div className="flex gap-4 mt-6">
            <button
              onClick={handlePlayAlbum}
              disabled={albumSongs.length === 0}
              className={albumSongs.length > 0 ? 'btn-primary px-8' : 'btn-primary opacity-50 cursor-not-allowed px-8'}
            >
              {albumSongs.length > 0 ? 'Play Album' : 'No Songs'}
            </button>
            <button
              onClick={() => showToast("Feature coming soon!", "info")}
              className="btn-secondary"
            >
              Save to Library
            </button>
          </div>
        </div>
      </div>

      {/* Songs List */}
      {albumSongs.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 p-6 text-gray-500 dark:text-gray-400 text-sm font-medium border-b border-gray-200 dark:border-gray-700">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-6">Title</div>
            <div className="col-span-3 hidden md:block">Album</div>
            <div className="col-span-2 text-center">Duration</div>
          </div>
          
          {/* Songs */}
          {albumSongs.map((item, index) => (
            <div
              key={item._id || index}
              onClick={() => handlePlaySong(item._id, index)}
              className="grid grid-cols-12 gap-4 p-6 items-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors duration-200 group"
            >
              <div className="col-span-1 text-center text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                {index + 1}
              </div>
              <div className="col-span-6 flex items-center space-x-4">
                <img 
                  src={item.image || safeAlbumData.image} 
                  className="w-12 h-12 rounded object-cover" 
                  alt={item.name} 
                />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900 dark:text-gray-100 font-medium truncate">
                    {item.name || "Unknown Song"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {item.desc || "No description"}
                  </p>
                </div>
              </div>
              <div className="col-span-3 hidden md:block text-gray-500 dark:text-gray-400 truncate">
                {safeAlbumData.name}
              </div>
              <div className="col-span-2 text-center text-sm text-gray-500 dark:text-gray-400">
                {item.duration || "0:00"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <Music2 className="w-12 h-12 text-gray-500 dark:text-gray-400" aria-hidden />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Songs in This Album
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            This album doesn't contain any songs yet.
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary py-2"
          >
            Browse Other Albums
          </button>
        </div>
      )}
    </div>
  );
};

export default DisplayAlbum;