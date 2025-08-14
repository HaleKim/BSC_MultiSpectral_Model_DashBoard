// /frontend/src/components/EventLog.js (수정된 최종본)

import React, { useState, useEffect, useCallback } from 'react';
import { getEvents } from '../services/api';
import { subscribeToEvent, getSocket, isSocketConnected } from '../services/socket';

import personIcon from '../assets/person.png';
import boarIcon from '../assets/boar.png';
import deerIcon from '../assets/deer.png';

const EventIcon = ({ type }) => {
    const iconMap = {
        person: { src: personIcon, bgColor: 'bg-red-500' },
        scrofa: { src: boarIcon, bgColor: 'bg-blue-500' },
        inermis: { src: deerIcon, bgColor: 'bg-green-500' },
    };
    const icon = iconMap[type] || { src: personIcon, bgColor: 'bg-gray-500' };

    return (
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${icon.bgColor} flex-shrink-0`}>
            <img src={icon.src} alt={type} className="w-6 h-6" />
        </div>
    );
};

const ConfidenceGauge = ({ value }) => {
    const percent = parseFloat(value) * 100 || 0;
    let bgColor = 'bg-gray-500';
    if (percent >= 90) bgColor = 'bg-red-600 animate-pulse';
    else if (percent >= 80) bgColor = 'bg-green-500';
    else if (percent >= 50) bgColor = 'bg-yellow-500';

    return (
        <div className="w-full bg-gray-600 rounded-full h-2.5">
            <div className={`${bgColor} h-2.5 rounded-full`} style={{ width: `${percent}%` }}></div>
        </div>
    );
};


const EventLog = ({ onOpenFull }) => {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdateTime, setLastUpdateTime] = useState(null);
    const [socketStatus, setSocketStatus] = useState('연결 중...');

    // 초기 이벤트 로드
    const fetchInitialEvents = useCallback(async () => {
        try {
            setIsLoading(true);
            console.log('이벤트 로그 초기 로드 시작...');
            const { data } = await getEvents();
            console.log('초기 이벤트 데이터:', data);
            setEvents(data.slice(0, 50));
            setLastUpdateTime(new Date());
        } catch (error) {
            console.error("이벤트 로그 초기화 실패:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 새 이벤트 처리
    const handleNewEvent = useCallback((newEvent) => {
        console.log('새 이벤트 수신됨:', newEvent);
        setLastUpdateTime(new Date());
        
        setEvents(prev => {
            // 중복 이벤트 방지 (ID와 타임스탬프로 체크)
            const isDuplicate = prev.some(event => 
                event.id === newEvent.id && event.timestamp === newEvent.timestamp
            );
            
            if (isDuplicate) {
                console.log('중복 이벤트 무시:', newEvent.id);
                return prev;
            }
            
            console.log('새 이벤트 추가:', newEvent.detected_object, 'confidence:', newEvent.confidence);
            
            // 새 이벤트를 맨 앞에 추가하고 최대 20개 유지
            const updatedEvents = [newEvent, ...prev.slice(0, 19)];
            console.log('업데이트된 이벤트 목록 길이:', updatedEvents.length);
            return updatedEvents;
        });
    }, []);

    // 소켓 상태 확인
    const checkSocketStatus = useCallback(() => {
        const socket = getSocket();
        if (socket && socket.connected) {
            setSocketStatus(`연결됨 (ID: ${socket.id})`);
        } else {
            setSocketStatus('연결 안됨');
        }
    }, []);

    useEffect(() => {
        console.log('EventLog 컴포넌트 마운트 - 소켓 이벤트 구독 시작');
        
        // 초기 이벤트 로드
        fetchInitialEvents();

        // 실시간 이벤트 구독
        const unsubscribe = subscribeToEvent('new_event', handleNewEvent);
        console.log('new_event 소켓 이벤트 구독 완료');

        // 소켓 상태 주기적 확인
        const statusInterval = setInterval(checkSocketStatus, 2000);
        
        // 초기 상태 확인
        checkSocketStatus();

        return () => {
            console.log('EventLog 컴포넌트 언마운트 - 소켓 이벤트 구독 해제');
            clearInterval(statusInterval);
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [fetchInitialEvents, handleNewEvent, checkSocketStatus]);

    // 새로고침 버튼 클릭 핸들러
    const handleRefresh = () => {
        console.log('수동 새로고침 요청');
        fetchInitialEvents();
    };

    return (
        <div className="p-4 bg-gray-800 rounded-lg shadow-lg h-full flex flex-col">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-white">실시간 이벤트 로그 (최신 20개)</h3>
                <div className="flex items-center space-x-2">
                    {lastUpdateTime && (
                        <span className="text-xs text-gray-400">
                            마지막 업데이트: {lastUpdateTime.toLocaleTimeString()}
                        </span>
                    )}
                    <button 
                        onClick={handleRefresh}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                        새로고침
                    </button>
                </div>
            </div>
            
            {/* 고정 높이 및 스크롤 기능 */}
            <div className="space-y-2 overflow-y-auto flex-grow h-96 pr-2">
                {isLoading ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                        <p className="text-gray-400 mt-2">이벤트 로딩 중...</p>
                    </div>
                ) : events.length > 0 ? (
                    events.map((event) => (
                        <div 
                            key={`${event.id}-${event.timestamp}`} 
                            className="p-3 bg-gray-700 rounded-lg flex items-center space-x-3 cursor-pointer hover:bg-gray-600 transition-colors"
                            onClick={() => onOpenFull && onOpenFull(event)}
                        >
                            <EventIcon type={event.detected_object} />
                            <div className="flex-grow overflow-hidden">
                                <div className="flex justify-between items-baseline">
                                    <p className="font-bold text-white capitalize truncate">{event.detected_object}</p>
                                    {/* 신뢰도 포맷팅 (소수점 1자리) */}
                                    <p className="text-xs font-mono text-gray-300">{(parseFloat(event.confidence) * 100).toFixed(1)}%</p>
                                </div>
                                <ConfidenceGauge value={event.confidence} />
                                <div className="flex justify-between items-center">
                                    {/* 카메라 정보 표시 */}
                                    <p className="text-xs text-gray-400 mt-1 truncate">{event.camera_name}</p>
                                    <p className="text-xs text-gray-400 mt-1 flex-shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</p>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8">
                        <p className="text-gray-500">표시할 이벤트가 없습니다.</p>
                        <p className="text-xs text-gray-600 mt-2">실시간 이벤트가 발생하면 여기에 표시됩니다.</p>
                    </div>
                )}
            </div>
            
            {/* 디버깅 정보 */}
            <div className="mt-2 text-xs text-gray-500 space-y-1">
                <p>총 이벤트 수: {events.length}</p>
                <p>소켓 상태: <span className={isSocketConnected() ? 'text-green-400' : 'text-red-400'}>{socketStatus}</span></p>
                <p>마지막 업데이트: {lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : '없음'}</p>
            </div>
        </div>
    );
};

export default EventLog;