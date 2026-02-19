import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = () => {
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
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user'); // We will store user info as a JSON string

      if (token && storedUser) {
        const parsedUser = parseStoredUser(storedUser);
        if (parsedUser?._id && parsedUser?.role) {
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
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    clearAuth();
    window.location.href = '/'; // Force redirect to login
  };

  const updateUser = (updatedUserData) => {
    localStorage.setItem('user', JSON.stringify(updatedUserData));
    setUser(updatedUserData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
