import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { AuthContext } from '../context/AuthContext.jsx';

export const url = import.meta.env.VITE_API_URL || "http://localhost:4000";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    
    try {
      const response = await axios.post(`${url}/api/auth/login`, {
        email: email.trim(),
        password: password.trim()
      });

      if (response.data.success) {
        const { user, token } = response.data.data;
        
        // Check if user is admin
        if (user.role !== 'admin') {
          toast.error('Access denied. Admin privileges required.');
          setLoading(false);
          return;
        }

        // Store user and token via context
        login(user, token);
        
        toast.success('🎉 Admin login successful! Redirecting...');
        
        // Navigate after toast is visible
        setTimeout(() => {
          navigate('/list-song');
        }, 1000);
        
      } else {
        toast.error(response.data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.response) {
        // Server responded with error status
        const message = error.response.data?.message || 
                       error.response.data?.error || 
                       'Login failed. Please try again.';
        toast.error(`Login failed: ${message}`);
      } else if (error.request) {
        // Request made but no response received
        toast.error('Network error. Please check your connection.');
      } else {
        // Something else happened
        toast.error('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-8 px-4"> 
      <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"> 
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Admin Panel
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Login to access the admin dashboard
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input 
              id="email"
              className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Enter your email" 
              type="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input 
              id="password"
              type="password" 
              className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors" 
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
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center"
            type="submit"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-t-2 border-white border-solid rounded-full animate-spin mr-2"></div>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-700 dark:text-yellow-300 text-center">
            <strong>Note:</strong> Only users with admin privileges can access this panel
          </p>
        </div>
      </div> 
    </div>
  );
};

export default AdminLogin;