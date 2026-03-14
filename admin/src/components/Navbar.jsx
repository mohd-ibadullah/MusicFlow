import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    delete axios.defaults.headers.common['Authorization'];
    toast.success('Logged out successfully');
    navigate('/admin-login');
  };

  return (
    <div className="nav w-full border-b-2 border-gray-800 px-5 sm:px-12 py-5 text-lg bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Admin Panel</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span>Online</span>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
