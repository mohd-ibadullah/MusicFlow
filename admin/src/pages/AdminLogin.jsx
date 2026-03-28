import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { AuthContext } from "../context/AuthContext.jsx";

export const url = import.meta.env.VITE_API_URL ?? "";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { toast.error("Please fill in all fields"); return; }

    setLoading(true);
    try {
      const response = await axios.post(`${url}/api/auth/login`, { email: email.trim(), password: password.trim() });
      if (response.data.success) {
        const { user, token } = response.data.data;
        if (user.role !== "admin") { toast.error("Access denied. Admin privileges required."); setLoading(false); return; }
        login(user, token);
        toast.success("Welcome back!");
        setTimeout(() => navigate("/list-song"), 800);
      } else {
        toast.error(response.data.message || "Login failed");
      }
    } catch (error) {
      if (error.response) toast.error(error.response.data?.message || "Login failed");
      else if (error.request) toast.error("Network error. Check your connection.");
      else toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 py-8 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg">M</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Admin Panel</h2>
          <p className="text-sm text-gray-500">Sign in to manage your platform</p>
        </div>

        {/* Card */}
        <div className="card-admin p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="text-label">Email</label>
              <input
                id="email"
                className="input-admin"
                placeholder="admin@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-label">Password</label>
              <input
                id="password"
                type="password"
                className="input-admin"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <button
              disabled={loading}
              className="btn-admin-primary w-full flex items-center justify-center"
              type="submit"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] text-gray-400 mt-6">
          Only users with admin privileges can access this panel
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;