// /frontend/src/components/FullscreenViewer.js

import React, { useEffect } from 'react';

const FullscreenViewer = ({ title, frameData, onClose }) => {
  // ESC로 닫기 (전역 스타일 변화 없음)
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!frameData) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose} // 바깥 클릭 닫기
    >
      <div
        className="relative w-[70vw] max-w-[1100px] max-h-[70vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()} // 모달 내부 클릭은 전파 방지
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-sm md:text-base">{title}</h2>
            <span className="text-[10px] md:text-[11px] px-2 py-[2px] rounded bg-emerald-600 text-white">실시간</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="bg-black max-h-[62vh] overflow-auto">
          <img
            src={`data:image/jpeg;base64,${frameData}`}
            alt={title}
            className="block max-w-full max-h-[62vh] w-auto h-auto m-auto object-contain"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
};

export default FullscreenViewer;