import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ThemeContext';

const Login = () => {
  const { login, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Navigate when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ email, password });
      showToast('Logged in successfully', 'success');
      // Navigation will be handled by useEffect when isAuthenticated changes
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Welcome</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Login to continue to MusicFlow</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" 
            placeholder="Email" 
            value={email} 
            onChange={(e)=>setEmail(e.target.value)} 
          />
          <input 
            type="password" 
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" 
            placeholder="Password" 
            value={password} 
            onChange={(e)=>setPassword(e.target.value)} 
          />
          <button disabled={loading} className="w-full py-3 btn-primary rounded-xl">{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Don't have an account? <Link to="/signup" className="text-blue-600">Create one</Link></p>
      </div>
    </div>
  );
};

export default Login;
