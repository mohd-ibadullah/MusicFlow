import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    // Attempt to restore user with role from localStorage
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("auth_token") || null);
  const [loading, setLoading] = useState(true);

  // Set axios default headers when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Initialize auth state on app start
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem("auth_token");
      const storedUser = localStorage.getItem("user");

      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          setToken(storedToken);
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          
          // Optional: Verify token is still valid
          // await verifyToken(storedToken);
        } catch (error) {
          console.error("Error initializing auth:", error);
          logout();
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = (userObj, authToken) => {
    setUser(userObj);
    setToken(authToken);
    localStorage.setItem("auth_token", authToken);
    localStorage.setItem("user", JSON.stringify(userObj));
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    delete axios.defaults.headers.common['Authorization'];
  };

  // Check if user is admin
  const isAdmin = () => {
    return user && user.role === 'admin';
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    return !!token && !!user;
  };

  // Update user data (for profile updates, etc.)
  const updateUser = (updatedUserData) => {
    setUser(prevUser => {
      const newUser = { ...prevUser, ...updatedUserData };
      localStorage.setItem("user", JSON.stringify(newUser));
      return newUser;
    });
  };

  const value = {
    user,
    setUser,
    token,
    setToken,
    login,
    logout,
    loading,
    isAdmin: isAdmin(),
    isAuthenticated: isAuthenticated(),
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};