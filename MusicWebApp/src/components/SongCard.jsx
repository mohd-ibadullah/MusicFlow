/**
 * SongCard - Single reusable song card component used across the app.
 * Same design as All Songs page: rounded-xl, dark card, hover glow, play/like overlays.
 * 
 * @param {Object} props.song - Song object: { _id, image, name, desc, artist, language, duration, album }
 * @param {Array} [props.playlist] - Optional playlist for Play button context (queue)
 */
import React from "react";
import SongItem from "./SongItem";

const SongCard = ({ song, playlist }) => {
  if (!song) return null;

  return (
    <SongItem
      id={song._id}
      image={song.image}
      name={song.name}
      desc={song.desc}
      artist={song.artist}
      language={song.language}
      duration={song.duration}
      album={song.album}
      playlist={playlist}
    />
  );
};

export default React.memo(SongCard);
