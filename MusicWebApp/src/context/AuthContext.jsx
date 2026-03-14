import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Configure axios defaults
  useEffect(() => {
    const storedToken = localStorage.getItem('token') || localStorage.getItem('auth_token');
    const token = storedToken || null;
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Normalize key for future reads
      if (!localStorage.getItem('token')) {
        localStorage.setItem('token', token);
      }
    }
  }, []);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
        if (token) {
          // Verify token with backend
          const response = await axios.get(`${API_BASE_URL}/api/auth/profile`);
          if (response.data.success) {
            setUser(response.data.data.user);
          } else {
            // Token is invalid, clear all auth state
            localStorage.removeItem('token');
            localStorage.removeItem('auth_token');
            delete axios.defaults.headers.common['Authorization'];
            setUser(null);
          }
        }
      } catch (error) {
        // Token is invalid or expired - clear all auth state
        localStorage.removeItem('token');
        localStorage.removeItem('auth_token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const signup = async ({ name, email, password }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        name,
        email,
        password
      });

      if (response.data.success) {
        const { user: userData, token } = response.data.data;
        
        // Store token and user data
        localStorage.setItem('token', token);
        localStorage.setItem('auth_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(userData);
        
        return userData;
      } else {
        throw new Error(response.data.message || 'Registration failed');
      }
    } catch (error) {
      let message = 'Registration failed';
      
      if (error.response?.data?.errors) {
        // Handle validation errors
        message = error.response.data.errors.join(', ');
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      } else if (error.message) {
        message = error.message;
      }
      
      throw new Error(message);
    }
  };

  const login = async ({ email, password }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password
      });

      if (response.data.success) {
        const { user: userData, token } = response.data.data;
        
        // Store token and user data
        localStorage.setItem('token', token);
        localStorage.setItem('auth_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(userData);
        
        return userData;
      } else {
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (error) {
      let message = 'Login failed';
      
      if (error.response?.data?.errors) {
        // Handle validation errors
        message = error.response.data.errors.join(', ');
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      } else if (error.message) {
        message = error.message;
      }
      
      throw new Error(message);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    navigate('/login');
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/api/auth/profile`, profileData);
      
      if (response.data.success) {
        setUser(response.data.data.user);
        return response.data.data.user;
      } else {
        throw new Error(response.data.message || 'Profile update failed');
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Profile update failed';
      throw new Error(message);
    }
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/api/auth/change-password`, {
        currentPassword,
        newPassword
      });
      
      if (response.data.success) {
        return true;
      } else {
        throw new Error(response.data.message || 'Password change failed');
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Password change failed';
      throw new Error(message);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isLoading,
    signup,
    login,
    logout,
    updateProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
