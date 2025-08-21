// src/pages/MainPage.js
import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import Dashboard from '../components/Dashboard';

// ✅ 배경 이미지 import
import bgRealtime from '../assets/login_bg.png';
// ✅ 로고 이미지 import
import logoImg from '../assets/BSC.png';

const MainPage = () => {
  const { user, logout } = useContext(AuthContext);

  // ✅ 시계 상태
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer); // cleanup
  }, []);

  // 시간 포맷 (예: 2025. 08. 18. 오후 12:17:30)
  const formattedTime = time.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${bgRealtime})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <header className="bg-gray-800/70 shadow-md p-4 flex justify-between items-center relative">
        
        {/* ✅ 왼쪽 시계 */}
        <div className="text-gray-200 font-mono text-lg">
          {formattedTime}
        </div>

        {/* ✅ 가운데 제목 + 로고 */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-3">
          <img
            src={logoImg}
            alt="Logo"
            className="h-14 w-14 object-contain" // 로고 크기 (40px)
          />
          <h1 className="text-2xl font-bold text-teal-600">
            BSC-MODS Dashboard
          </h1>
        </div>

        {/* ✅ 오른쪽 버튼 영역 */}
        <div className="flex items-center ml-auto">
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="px-4 py-2 font-bold text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 mr-4"
            >
              관리자
            </Link>
          )}
          <span className="text-gray-300 mr-4">
            환영합니다,{' '}
            <span className="font-semibold text-teal-600">{user?.username}</span>님 ({user?.role})
          </span>
          <button
            onClick={logout}
            className="px-4 py-2 font-bold text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
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
