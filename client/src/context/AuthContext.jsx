import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getStoredToken = () => {
    return sessionStorage.getItem('token') || localStorage.getItem('token');
  };

  const getStoredUser = () => {
    return sessionStorage.getItem('user') || localStorage.getItem('user');
  };

  const setSessionAuth = (token, userData) => {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const clearAuth = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const parseStoredUser = (storedUser) => {
    try {
      return JSON.parse(storedUser);
    } catch (err) {
      return null;
    }
  };

  // Check if user is already logged in when the app starts
  useEffect(() => {
    const checkLoggedIn = async () => {
      const token = getStoredToken();
      const storedUser = getStoredUser();

      if (token && storedUser) {
        const parsedUser = parseStoredUser(storedUser);
        if (parsedUser?._id && parsedUser?.role) {
          setSessionAuth(token, parsedUser);
          setUser(parsedUser);
        } else {
          clearAuth();
        }
      } else {
        clearAuth();
      }
      setLoading(false);
    };
    checkLoggedIn();
  }, []);

  const login = (userData, token) => {
    clearAuth();
    setSessionAuth(token, userData);
    setUser(userData);
  };

  const logout = () => {
    clearAuth();
    window.location.href = '/'; // Force redirect to login
  };

  const updateUser = (updatedUserData) => {
    const token = sessionStorage.getItem('token');
    if (token) {
      setSessionAuth(token, updatedUserData);
    }
    setUser(updatedUserData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
