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
    <div className="min-h-screen flex flex-col items-center py-20 px-4 bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0] overflow-y-auto">
      <div className="w-full max-w-lg animate-fade-in relative z-10 py-10">
        {/* Branding - Spaced out */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
            <span className="text-white font-bold text-4xl leading-none">M</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">MusicFlow</h1>
          <p className="text-slate-700 mt-4 font-semibold text-sm uppercase tracking-[0.3em]">Admin Console</p>
        </div>

        {/* Card - Spacious and Light */}
        <div className="glass p-8 sm:p-12 rounded-[2.5rem] bg-white border border-slate-200 ">
          <h2 className="text-3xl font-bold text-slate-800 mb-8 flex items-center justify-center gap-4">
            <Lock className="w-7 h-7 text-blue-600" />
            Security Shield
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-widest ml-1">Admin Email</label>
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

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-widest ml-1">Secret Password</label>
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
              className="w-full btn-premium mt-10 flex items-center justify-center gap-3"
              type="submit"
            >
              {loading ? (
                <>
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Access Management"
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-12">
          <p className="text-[11px] text-slate-600 font-bold uppercase tracking-[0.4em]">
            Secure Infrastructure • authorized
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;