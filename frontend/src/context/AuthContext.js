// src/context/AuthContext.js
import React, { createContext, useState, useEffect } from 'react';
import { login as apiLogin, getProfile } from '../services/api';
import jwt_decode from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      verifyUser(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyUser = async (token) => {
    try {
      const decoded = jwt_decode(token);
      if (decoded.exp * 1000 < Date.now()) {
        logout();
      } else {
        const { data } = await getProfile();
        setUser(data);
      }
    } catch (error) {
      console.error("토큰 검증 실패:", error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const { data } = await apiLogin(username, password);
      localStorage.setItem('accessToken', data.access_token);
      await verifyUser(data.access_token);
      return true;
    } catch (error) {
      console.error("로그인 실패:", error);
      localStorage.removeItem('accessToken');
      setUser(null);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;