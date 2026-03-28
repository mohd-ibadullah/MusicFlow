import React from "react";
import { NavLink } from "react-router-dom";
import { 
  PlusCircle, 
  Music, 
  Disc, 
  LayoutGrid, 
  BarChart3, 
  Library 
} from "lucide-react";
import { assets } from "../assets/assets.js";

const navItems = [
  { to: "/add-song", icon: PlusCircle, label: "New Track" },
  { to: "/list-song", icon: Music, label: "Music Library" },
  { to: "/add-album", icon: Library, label: "New Album" },
  { to: "/list-album", icon: Disc, label: "Collections" },
  { to: "/analytics", icon: BarChart3, label: "Impact" },
];

const SideBar = () => {
  return (
    <aside className="bg-gray-900 min-h-screen w-16 sm:w-56 flex flex-col border-r border-gray-800/60 transition-all duration-300">
      {/* Branding */}
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-gray-800/40">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span className="hidden sm:block font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 text-base">
          MusicFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link transition-all duration-300 group flex items-center gap-3 px-4 py-3 rounded-xl ${
                  isActive 
                    ? "bg-blue-600/10 text-white border-l-4 border-blue-500 shadow-lg shadow-blue-500/5 active-sidebar-link" 
                    : "text-gray-400 hover:text-white hover:bg-white/5 hover:translate-x-1"
                }`
              }
            >
              <div className={`shrink-0 transition-colors duration-200`}>
                <Icon className="w-5 h-5" strokeWidth={2.25} />
              </div>
              <span className="hidden sm:block font-semibold tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800/40">
        <p className="hidden sm:block text-[10px] text-gray-500 font-medium text-center tracking-wider">
          MusicFlow Admin v2
        </p>
      </div>
    </aside>
  );
};

export default SideBar;
