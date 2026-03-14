import React, { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext.jsx';

export const url = import.meta.env.VITE_API_URL || "http://localhost:4000";

const AdminProtectedRoute = ({ children }) => {
  let contextSafe = useContext(AuthContext) || {};
  const { user = null, setUser = () => {} } = contextSafe;
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAdminAuth = async () => {
      try {
        let localUser = user;
        if (!localUser) {
          // Try restoring from localStorage
          const stored = localStorage.getItem("user");
          if (stored) localUser = JSON.parse(stored);
          if (localUser && setUser) setUser(localUser);
        }
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        if (localUser && localUser.role === 'admin') {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        // Fallback: Fetch profile from API if role still missing
        const response = await axios.get(`${url}/api/auth/profile`);
        if (response.data.success && response.data.data.user.role === 'admin') {
          setIsAuthorized(true);
          if (setUser) setUser(response.data.data.user);
        } else {
          setIsAuthorized(false);
        }
      } catch (error) {
        setIsAuthorized(false);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
      } finally {
        setIsLoading(false);
      }
    };
    checkAdminAuth();
  }, [user, setUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }
  if (!isAuthorized) {
    return <Navigate to="/admin-login" replace />;
  }
  return children;
};

export default AdminProtectedRoute;

