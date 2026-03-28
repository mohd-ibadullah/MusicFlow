import React from "react";
import { NavLink } from "react-router-dom";
import { assets } from "../assets/assets.js";

const navItems = [
  { to: "/add-song", icon: assets.add_song, label: "Add Song", isImg: true },
  { to: "/list-song", icon: assets.song_icon, label: "Songs", isImg: true },
  { to: "/add-album", icon: assets.add_album, label: "Add Album", isImg: true },
  { to: "/list-album", icon: assets.album_icon, label: "Albums", isImg: true },
  { to: "/analytics", icon: "📊", label: "Analytics", isImg: false },
];

const SideBar = () => {
  return (
    <aside className="bg-gray-900 min-h-screen w-16 sm:w-56 flex flex-col border-r border-gray-800/60 transition-all duration-300">
      {/* Branding */}
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-gray-800/40">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span className="hidden sm:block font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 text-base">
          MusicFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            {item.isImg ? (
              <img src={item.icon} className="w-5 h-5 opacity-80" alt="" />
            ) : (
              <span className="text-base w-5 text-center">{item.icon}</span>
            )}
            <span className="hidden sm:block">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800/40">
        <p className="hidden sm:block text-[10px] text-gray-600 text-center">
          MusicFlow Admin v2
        </p>
      </div>
    </aside>
  );
};

export default SideBar;
