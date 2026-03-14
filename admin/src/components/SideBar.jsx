import React from "react";
import { assets } from "../assets/assets.js";
import { NavLink } from "react-router-dom";
const SideBar = () => {
  return (
    <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen pl-[4vw] shadow-xl">
      {/* MusicFlow Branding */}
      <div className="mt-5 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <div className="hidden sm:block">
          <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent text-lg">
            MusicFlow
          </span>
        </div>
        <div className="sm:hidden block">
          <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent text-sm">
            M
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-5 mt-10">
        <NavLink
          to="/add-song"
          className="flex items-center gap-2.5 text-gray-200 bg-white/10 backdrop-blur-sm border border-white/20 p-3 pr-[max(8vw,10px)] rounded-lg hover:bg-white/20 transition-all duration-300 text-sm font-medium"
        >
          <img src={assets.add_song} className="w-5" alt="" />
          <p className="hidden sm:block">Add Song</p>
        </NavLink>
      </div>
      <div className="flex flex-col gap-5 mt-10">
        <NavLink
          to="/list-song"
          className="flex items-center gap-2.5 text-gray-200 bg-white/10 backdrop-blur-sm border border-white/20 p-3 pr-[max(8vw,10px)] rounded-lg hover:bg-white/20 transition-all duration-300 text-sm font-medium"
        >
          <img src={assets.song_icon} className="w-5" alt="" />
          <p className="hidden sm:block">List Songs</p>
        </NavLink>
      </div>
      <div className="flex flex-col gap-5 mt-10">
        <NavLink
          to="/add-album"
          className="flex items-center gap-2.5 text-gray-200 bg-white/10 backdrop-blur-sm border border-white/20 p-3 pr-[max(8vw,10px)] rounded-lg hover:bg-white/20 transition-all duration-300 text-sm font-medium"
        >
          <img src={assets.add_album} className="w-5" alt="" />
          <p className="hidden sm:block">Add Album</p>
        </NavLink>
      </div>
      <div className="flex flex-col gap-5 mt-10">
        <NavLink
          to="/list-album"
          className="flex items-center gap-2.5 text-gray-200 bg-white/10 backdrop-blur-sm border border-white/20 p-3 pr-[max(8vw,10px)] rounded-lg hover:bg-white/20 transition-all duration-300 text-sm font-medium"
        >
          <img src={assets.album_icon} className="w-5" alt="" />
          <p className="hidden sm:block">List Albums</p>
        </NavLink>
      </div>
      <div className="flex flex-col gap-5 mt-10">
        <NavLink
          to="/analytics"
          className="flex items-center gap-2.5 text-gray-200 bg-white/10 backdrop-blur-sm border border-white/20 p-3 pr-[max(8vw,10px)] rounded-lg hover:bg-white/20 transition-all duration-300 text-sm font-medium"
        >
          <span className="text-lg">📊</span>
          <p className="hidden sm:block">Analytics</p>
        </NavLink>
      </div>
    </div>
  );
};

export default SideBar;
