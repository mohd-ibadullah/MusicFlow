import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";
import { AuthContext } from "../context/AuthContext.jsx";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post("/api/auth/login", {
        email: email.trim(),
        password: password.trim()
      });

      if (response.data.success) {
        const { user, token } = response.data.data;
        if (user.role !== "admin") {
          toast.error("Access denied. Admin privileges required.");
          setLoading(false);
          return;
        }
        login(user, token);
        toast.success("Welcome back, Admin!");
        setTimeout(() => navigate("/list-song"), 500);
      } else {
        toast.error(response.data.message || "Invalid credentials");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="w-full max-w-md animate-fade-in">
        <div className="card-admin-alt p-7 sm:p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <span className="text-white font-bold text-2xl leading-none">M</span>
            </div>
            <h1 className="text-page-title">Admin Login</h1>
            <p className="text-page-subtitle">Sign in to manage MusicFlow</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-label">Admin Email</label>
              <input
                className="input-admin"
                placeholder="yours@musicflow.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-label">Password</label>
              <input
                type="password"
                className="input-admin"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button
              disabled={loading}
              className="w-full btn-admin-primary !py-3.5 mt-2 flex items-center justify-center gap-2"
              type="submit"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;