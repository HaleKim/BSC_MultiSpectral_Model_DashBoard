// src/pages/MainPage.js
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import Dashboard from '../components/Dashboard';

const MainPage = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 shadow-md p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-cyan-400">BSS-MultiModal Dashboard</h1>
        <div className="flex items-center">
          {user?.role === 'admin' && (
            <Link to="/admin" className="px-4 py-2 font-bold text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 mr-4">
              관리자
            </Link>
          )}
          <span className="text-gray-300 mr-4">환영합니다, <span className="font-semibold text-cyan-400">{user?.username}</span>님 ({user?.role})</span>
          <button onClick={logout} className="px-4 py-2 font-bold text-white bg-red-600 rounded-lg hover:bg-red-700">
            로그아웃
          </button>
        </div>
      </header>
      <main className="flex-grow p-4">
        <Dashboard />
      </main>
    </div>
  );
};

export default MainPage;