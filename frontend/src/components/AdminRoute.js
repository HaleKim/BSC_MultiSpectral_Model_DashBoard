// src/components/AdminRoute.js
import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    alert('관리자만 접근할 수 있는 페이지입니다.');
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};

export default AdminRoute;