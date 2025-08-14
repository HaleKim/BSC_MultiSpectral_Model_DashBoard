// /frontend/src/pages/AdminPage.js (수정된 최종본)

import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import AdminPanel from '../components/AdminPanel'; // AdminPanel을 불러옵니다.

const AdminPage = () => {
    const { user } = useContext(AuthContext);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="bg-gray-800 shadow-md p-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-yellow-400">관리자 페이지</h1>
                <div>
                    <span className="text-gray-300 mr-4">
                        {user?.username}님 (관리자)
                    </span>
                    <Link to="/" className="px-4 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 mr-2">
                        대시보드로
                    </Link>
                </div>
            </header>
            <main className="flex-grow p-6">
                {/* 기존의 단순 테이블 대신 AdminPanel 컴포넌트를 렌더링합니다. */}
                <AdminPanel />
            </main>
        </div>
    );
};

export default AdminPage;