import React from 'react';
import AlbumItem from './AlbumItem';
import { usePlayer } from '../context/PlayerContext';

const AllAlbums = () => {
  const { albumsData } = usePlayer();

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Albums</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Browse albums in the library</p>
        </div>
      </div>

      <div className="songs-grid">
        {Array.isArray(albumsData) && albumsData.length > 0 ? (
          albumsData.map((album, idx) => (
            <div key={album._id || idx} className="animate-slide-up" style={{ animationDelay: `${idx * 0.03}s` }}>
              <AlbumItem
                image={album.image}
                name={album.name}
                desc={album.desc}
                id={album._id}
              />
            </div>
          ))
        ) : (
          <div className="text-center py-20 col-span-full">No albums available</div>
        )}
      </div>
    </div>
  );
};

export default AllAlbums;
