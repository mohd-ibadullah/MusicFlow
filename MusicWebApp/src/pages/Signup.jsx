import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ThemeContext';

const Signup = () => {
  const { signup, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
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
      await signup({ name, email, password });
      showToast('Account created', 'success');
      // Navigation will be handled by useEffect when isAuthenticated changes
    } catch (err) {
      showToast(err.message || 'Signup failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Create account</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign up to save your likes and playlists in your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" 
            placeholder="Full name" 
            value={name} 
            onChange={(e)=>setName(e.target.value)}
            minLength="2"
            maxLength="50"
            required
          />
          <input 
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" 
            placeholder="Email" 
            type="email"
            value={email} 
            onChange={(e)=>setEmail(e.target.value)}
            required
          />
          <input 
            type="password" 
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" 
            placeholder="Password (min 6 characters)" 
            value={password} 
            onChange={(e)=>setPassword(e.target.value)}
            minLength="6"
            required
          />
          <button disabled={loading} className="w-full py-3 btn-primary rounded-xl">{loading ? 'Creating...' : 'Create account'}</button>
        </form>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Already have an account? <Link to="/login" className="text-blue-600">Sign in</Link></p>
      </div>
    </div>
  );
};

export default Signup;
