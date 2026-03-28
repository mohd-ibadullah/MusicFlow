import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    delete axios.defaults.headers.common["Authorization"];
    toast.success("Logged out successfully");
    navigate("/admin-login");
  };

  return (
    <header className="w-full bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-8 py-3.5 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-emerald-50 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse-dot"></span>
            <span className="text-emerald-700 font-medium">Online</span>
          </div>
          <button
            onClick={handleLogout}
            className="btn-admin-secondary text-xs !px-3 !py-1.5"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
