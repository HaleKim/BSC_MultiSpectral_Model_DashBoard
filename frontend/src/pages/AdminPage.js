// /frontend/src/pages/AdminPage.js
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import AdminPanel from '../components/AdminPanel';

// ✅ 로고 & 배경 이미지
import logoImg from '../assets/BSC.png';
import adminBg from '../assets/login_bg.png';   // <- 원하는 파일명으로 교체 가능

const AdminPage = () => {
  const { user } = useContext(AuthContext);

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        // ✅ 배경 적용
        backgroundImage: `url(${adminBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* (선택) 가독성용 어둡게 오버레이 */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      {/* 헤더 */}
      <header className="bg-gray-800/70 shadow-md p-4 relative flex items-center justify-between z-10">
        <h1 className="text-2xl font-bold text-yellow-400">관리자 페이지</h1>

        {/* 중앙 로고 */}
        <img
          src={logoImg}
          alt="Logo"
          className="absolute left-1/2 -translate-x-1/2 h-[52px] w-[52px] object-contain drop-shadow"
        />

        {/* 우측 영역 */}
        <div className="flex items-center">
          <span className="text-gray-200 mr-4">{user?.username}님 (관리자)</span>
          <Link
            to="/"
            className="px-4 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 mr-2"
          >
            대시보드로
          </Link>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-grow p-6 relative z-10">
        <AdminPanel />
      </main>
    </div>
  );
};

export default AdminPage;
