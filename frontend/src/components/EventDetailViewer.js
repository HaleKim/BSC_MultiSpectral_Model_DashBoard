// /frontend/src/components/EventDetailViewer.js (새 파일)

import React, { useEffect } from 'react';
import personIcon from '../assets/person.png';
import boarIcon from '../assets/boar.png';
import deerIcon from '../assets/deer.png';

const EventIcon = ({ type, size = 'w-16 h-16' }) => {
    const iconMap = {
        person: { src: personIcon, bgColor: 'bg-red-500' },
        scrofa: { src: boarIcon, bgColor: 'bg-blue-500' },
        inermis: { src: deerIcon, bgColor: 'bg-green-500' },
    };
    const icon = iconMap[type] || { src: personIcon, bgColor: 'bg-gray-500' };

    return (
        <div className={`rounded-full flex items-center justify-center ${icon.bgColor} ${size} flex-shrink-0`}>
            <img src={icon.src} alt={type} className="w-8 h-8" />
        </div>
    );
};

const ConfidenceGauge = ({ value }) => {
    const percent = (parseFloat(value) || 0) * 100;
    let bgColor = 'bg-gray-500';
    if (percent >= 90) bgColor = 'bg-red-600';
    else if (percent >= 80) bgColor = 'bg-green-500';
    else if (percent >= 50) bgColor = 'bg-yellow-500';

    return (
        <div className="w-full bg-gray-600 rounded-full h-4">
            <div className={`${bgColor} h-4 rounded-full flex items-center justify-center text-xs font-bold`} style={{ width: `${percent}%` }}>
                {percent.toFixed(1)}%
            </div>
        </div>
    );
};


const EventDetailViewer = ({ event, onClose }) => {
  // 현재는 정적 파일 라우트를 사용 (비디오 태그에서 JWT 토큰 처리 어려움)
  // 향후 보안 강화를 위해 API 엔드포인트 + blob URL 방식으로 개선 가능
  const videoBaseUrl = `${process.env.REACT_APP_API_URL.replace('/api', '')}/event_recordings`;
  
  // 디버그 정보 출력
  console.log('=== EventDetailViewer Debug Info ===');
  console.log('Event:', event);
  console.log('Video path:', event?.video_path_rgb);
  console.log('Video base URL:', videoBaseUrl);
  console.log('Full video URL:', event?.video_path_rgb ? `${videoBaseUrl}/${event.video_path_rgb}` : 'N/A');
  console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
  console.log('====================================');

  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);



  if (!event) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg h-[40vh] flex flex-col bg-gray-800 rounded-2xl shadow-xl text-white" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-cyan-400 capitalize">{event.detected_object} 탐지 상세 정보</h2>
            <button onClick={onClose} className="text-gray-400 text-3xl font-bold hover:text-white">&times;</button>
        </div>
        
        <div className="flex-grow p-6 space-y-4 overflow-y-auto flex flex-col justify-center">
            <div className="flex items-center justify-center space-x-4">
                <EventIcon type={event.detected_object} />
                <div className="text-center">
                    <p className="text-lg"><strong>탐지 객체:</strong> <span className="font-bold capitalize">{event.detected_object}</span></p>
                    <p><strong>발생 시각:</strong> {new Date(event.timestamp).toLocaleString()}</p>
                </div>
            </div>
            <div className="text-center">
                <p className="mb-2"><strong>신뢰도:</strong></p>
                <div className="flex justify-center">
                    <ConfidenceGauge value={event.confidence} />
                </div>
            </div>
            <div className="text-center">
                <p><strong>카메라 정보:</strong> {event.camera_name} ({event.location})</p>
                <p><strong>담당 근무자:</strong> {event.user_name || 'N/A'}</p>
            </div>

            {event.video_path_rgb && event.video_path_rgb.trim() !== '' && (
                <div className="mt-4 flex-grow flex flex-col">
                    <p className="mb-2 flex-shrink-0"><strong>녹화 영상:</strong></p>
                    <div className="flex-grow h-5/6">
                        <video 
                            key={event.video_path_rgb} // 영상 소스가 바뀔 때마다 리렌더링
                            className="w-full h-full rounded-lg bg-black"
                            controls 
                            muted
                            preload="metadata"
                            onLoadStart={() => {
                                console.log('Video load started');
                                console.log('Loading video from:', `${videoBaseUrl}/${event.video_path_rgb}`);
                            }}
                            onLoadedData={() => {
                                console.log('Video loaded successfully');
                            }}
                            onCanPlay={() => {
                                console.log('Video can play');
                            }}
                            onError={(e) => {
                                console.error('=== Video Error Details ===');
                                console.error('Error object:', e);
                                console.error('Error target:', e.target);
                                console.error('Error target error:', e.target.error);
                                console.error('Error target networkState:', e.target.networkState);
                                console.error('Error target readyState:', e.target.readyState);
                                console.error('Video source attempted:', `${videoBaseUrl}/${event.video_path_rgb}`);
                                console.error('Full URL:', `${videoBaseUrl}/${event.video_path_rgb}`);
                                console.error('==========================');
                            }}
                        >
                            <source src={`${videoBaseUrl}/${event.video_path_rgb}`} type="video/mp4" />
                            브라우저가 비디오 태그를 지원하지 않습니다.
                        </video>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default EventDetailViewer;