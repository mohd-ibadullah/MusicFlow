import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ThemeContext';

const Signup = () => {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      showToast('Please fill in all fields', 'info');
      return;
    }
    setLoading(true);
    try {
      await signup({ name, email, password });
      showToast('Account created successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Signup failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-20 px-4 bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0] dark:from-black dark:to-[#121212] overflow-y-auto">
      <div className="w-full max-w-lg animate-fade-in relative z-10 py-10">
        {/* Branding - Spaced out */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20 font-inter text-white">
            <span className="font-bold text-4xl leading-none">M</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">MusicFlow</h1>
          <p className="text-slate-700 dark:text-slate-400 mt-4 font-semibold text-sm uppercase tracking-[0.3em]">Join the rhythm</p>
        </div>

        {/* Signup Card - Spacious and Light */}
        <div className="glass p-8 sm:p-12 rounded-[2.5rem] bg-white dark:bg-[#181818] border border-slate-200 dark:border-slate-800">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-8 flex items-center justify-center gap-4">
            <UserPlus className="w-7 h-7 text-blue-600" />
            Create account
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <input 
                className="input-field" 
                placeholder="John Doe" 
                value={name} 
                onChange={(e)=>setName(e.target.value)} 
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest ml-1">Email address</label>
              <input 
                className="input-field" 
                placeholder="yours@example.com" 
                type="email"
                value={email} 
                onChange={(e)=>setEmail(e.target.value)} 
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest ml-1">Secret Password</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Min. 8 characters" 
                value={password} 
                onChange={(e)=>setPassword(e.target.value)} 
                required
              />
            </div>

            <button 
              disabled={loading} 
              className="w-full py-5 btn-primary rounded-2xl flex items-center justify-center gap-3 text-lg font-bold mt-10 shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : 'Get Started'}
            </button>
          </form>

          <p className="text-center text-slate-600 dark:text-slate-400 mt-10 text-base font-medium">
            Already have an account? <Link to="/login" className="text-blue-600 font-bold hover:text-blue-500 transition-colors ml-1">Sign in</Link>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-[0.4em]">
            Secure Full-Stack Streaming
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
