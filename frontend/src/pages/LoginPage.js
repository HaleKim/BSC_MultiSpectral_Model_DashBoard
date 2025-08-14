// src/pages/LoginPage.js
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

import bg from '../assets/login_bg.png';
import logo from '../assets/BSC.png';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/');
      } else {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('서버와 통신 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.');
      }
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center text-slate-100">
      {/* === 풀스크린 배경 === */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img src={bg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* === 카드 + 로고 래퍼 === */}
      <div className="relative z-10 w-full max-w-xl mt-[8vh]">
        {/* 로고: 크기 ↑, 살짝 내림 */}
        <img
          src={logo}
          alt="MODS"
          className="absolute -top-28 left-1/2 -translate-x-1/2
                     h-56 w-auto opacity-100 mix-blend-normal pointer-events-none
                     [filter:brightness(1.15)_contrast(1.1)_saturate(1.05)]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />

        {/* 로그인 카드: 높이 ↓ (padding, margin 조정) */}
        <div className="mt-[18vh] p-6 pt-6 space-y-4
                        bg-gray-800/50 backdrop-blur-md rounded-2xl shadow-2xl
                        ring-1 ring-black/30">
          <h1 className="sr-only">MODS</h1>

          <div className="text-center">
            <h5 className="text-2xl font-semibold text-teal-400">
              <span className="text-3xl font-bold text-teal-500">M</span>ultispectral{' '}
              <span className="text-3xl font-bold text-teal-500">O</span>bject{' '}
              <span className="text-3xl font-bold text-teal-500">D</span>etection{' '}
              <span className="text-3xl font-bold text-teal-500">S</span>ystem
            </h5>
            <p className="mt-2 mb-8 text-lg text-white-300">멀티스펙트럼 객체 탐지 시스템</p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            {error && (
              <p className="text-red-500 text-center font-medium whitespace-pre-line">
                {error}
              </p>
            )}

            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디"
                className="w-full px-4 py-2 text-white bg-gray-700/70 placeholder-slate-400
                           border border-gray-600 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full px-4 py-2 text-white bg-gray-700/70 placeholder-slate-400
                           border border-gray-600 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 font-bold text-white bg-teal-500
                         rounded-lg hover:bg-teal-600 focus:outline-none
                         focus:ring-2 focus:ring-offset-0 focus:ring-teal-400"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;