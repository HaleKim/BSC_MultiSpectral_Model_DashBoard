// src/components/Dashboard.js
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import VideoStream from './VideoStream';
import EventLog from './EventLog';
import TestModePanel from './TestModePanel';
import FullscreenViewer from './FullscreenViewer';
import EventDetailViewer from './EventDetailViewer';
import { initSocket, disconnectSocket, subscribeToEvent, sendEvent, getSocket } from '../services/socket';
import alertSound from '../assets/alarm.mp3';

const Dashboard = () => {
  const [serverMessage, setServerMessage] = useState('');
  const [mode, setMode] = useState('live');

  // 카메라가 1대라면 [0], 2대면 [0,1]로 변경
  const cameraIds = useMemo(() => [0], []);

  // 프레임/상태
  const [liveFrames, setLiveFrames] = useState({ 0: { rgb: null, tir: null } });
  const [isStreaming, setIsStreaming] = useState({ 0: false });
  const [personDetected, setPersonDetected] = useState({ 0: false });

  // ✅ 모달 상태: 스냅샷이 아니라 "선택 정보"만 저장
  // { cameraId, stream: 'rgb' | 'tir', title }
  const [viewer, setViewer] = useState(null);
  const openViewer = (cameraId, stream, title) => setViewer({ cameraId, stream, title });
  const closeViewer = () => setViewer(null);

  // 전체 화면 이벤트 뷰어 상태
  const [fullViewEvent, setFullViewEvent] = useState(null);
  const handleOpenFullEvent = (event) => setFullViewEvent(event);
  const handleCloseFullEvent = () => setFullViewEvent(null);

  // 모드 전환 중 상태 (백엔드 호환성을 위해 추가)
  const [isModeChanging, setIsModeChanging] = useState(false);

  const audioRef = useRef(null);

  // 소켓 연결/해제 및 이벤트 수신 전용 useEffect
  useEffect(() => {
    console.log('Dashboard 컴포넌트 마운트 - 소켓 초기화 시작');
    initSocket();
    
    // 서버 응답 메시지 수신
    subscribeToEvent('response', (data) => { 
      console.log('서버 응답 수신:', data);
      setServerMessage(data.message); 
    });
    
    // 비디오 프레임 수신
    subscribeToEvent('video_frame', (data) => {
      console.log('비디오 프레임 수신:', {
        camera_id: data.camera_id,
        has_rgb: !!data.rgb,
        has_tir: !!data.tir,
        person_detected: data.person_detected
      });
      
      if (typeof data.camera_id === 'number') {
        console.log(`카메라 ${data.camera_id} 프레임 처리 중...`);
        setLiveFrames(prev => ({ ...prev, [data.camera_id]: { rgb: data.rgb, tir: data.tir } }));
        setPersonDetected(prev => ({ ...prev, [data.camera_id]: data.person_detected }));
        console.log(`카메라 ${data.camera_id} 프레임 처리 완료`);
      } else if (data.camera_id === 'test_video') {
        console.log('시험 영상 프레임 수신');
      }
    });
    
    // 연결 상태 확인 (백엔드 호환성을 위해 추가)
    const checkConnection = setInterval(() => {
      const socket = getSocket();
      if (socket) {
        console.log('소켓 연결 상태:', socket.connected, 'ID:', socket.id);
      }
    }, 5000);
    
    return () => { 
      console.log('Dashboard 컴포넌트 언마운트 - 소켓 정리');
      clearInterval(checkConnection);
      disconnectSocket(); 
    };
  }, []);

  // 실시간 스트림 시작 함수 (백엔드 호환성을 위해 복원)
  const startAllStreams = useCallback(async () => {
    console.log('실시간 스트림 시작 시도...');
    setIsModeChanging(true);
    
    try {
      // 소켓 연결 상태 확인
      const socket = getSocket();
      if (!socket || !socket.connected) {
        console.error('소켓이 연결되지 않았습니다. 소켓 초기화를 다시 시도합니다.');
        initSocket();
        // 잠시 대기 후 다시 시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 모든 카메라에 대해 스트림 시작 요청
      for (const id of cameraIds) {
        console.log(`카메라 ${id + 1} 스트림 시작 요청`);
        sendEvent('start_stream', { camera_id: id });
        setIsStreaming(prev => ({ ...prev, [id]: true }));
      }
      
      // 스트림 상태 초기화
      setLiveFrames({ 0: { rgb: null, tir: null } });
      setPersonDetected({ 0: false });
      
      console.log('실시간 스트림 시작 완료');
    } catch (error) {
      console.error('스트림 시작 오류:', error);
    } finally {
      setIsModeChanging(false);
    }
  }, [cameraIds]);

  // 모든 스트림을 중지하는 함수 (백엔드 호환성을 위해 복원)
  const stopAllStreams = useCallback(async () => {
    console.log('모든 스트림 중지 시도...');
    setIsModeChanging(true);
    
    try {
      // 모든 카메라에 대해 스트림 중지 요청
      for (const id of cameraIds) {
        console.log(`카메라 ${id + 1} 스트림 중지 요청`);
        sendEvent('stop_stream', { camera_id: id });
      }
      
      // 스트림 상태 초기화
      setIsStreaming({ 0: false });
      setLiveFrames({ 0: { rgb: null, tir: null } });
      setPersonDetected({ 0: false });
      
      console.log('모든 스트림 중지 완료');
    } catch (error) {
      console.error('스트림 중지 오류:', error);
    } finally {
      setIsModeChanging(false);
    }
  }, [cameraIds]);

  // 모드 변경에 따라 스트림 시작/중지 (백엔드 호환성을 위해 수정)
  useEffect(() => {
    if (isModeChanging) return; // 모드 변경 중이면 무시
    
    if (mode === 'live') {
      console.log('실시간 모드로 전환 - 스트림 시작');
      // 실시간 모드로 전환 시 즉시 스트림 시작
      startAllStreams();
    } else {
      console.log('시험 모드로 전환 - 스트림 중지');
      // 시험 모드로 전환 시 즉시 스트림 중지
      stopAllStreams();
    }
  }, [mode, startAllStreams, stopAllStreams, isModeChanging]);

  // 알람음 (옵션)
  useEffect(() => {
    if (personDetected[0] && audioRef.current) {
      audioRef.current.play().catch(error => console.error("오디오 재생 오류:", error));
    }
  }, [personDetected]);

  // 모드 변경 핸들러 (백엔드 호환성을 위해 추가)
  const handleModeChange = (newMode) => {
    if (isModeChanging) return; // 모드 변경 중이면 무시
    
    console.log(`모드 변경: ${mode} -> ${newMode}`);
    setMode(newMode);
  };

  return (
    <div>
      {/* 상단 모드 토글 */}
      <div className="flex justify-center space-x-4 mb-4">
        <button
          onClick={() => handleModeChange('live')}
          disabled={isModeChanging}
          className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
            mode === 'live' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
          } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isModeChanging && mode === 'live' ? '전환 중...' : '실시간 다중 감시'}
        </button>
        <button
          onClick={() => handleModeChange('test')}
          disabled={isModeChanging}
          className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
            mode === 'test' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
          } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isModeChanging && mode === 'test' ? '전환 중...' : '시험 영상 분석'}
        </button>
      </div>

      {/* 모드 전환 중 표시 (백엔드 호환성을 위해 추가) */}
      {isModeChanging && (
        <div className="text-center mb-4 p-2 bg-blue-900 rounded-lg">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
          <p className="text-white mt-2">모드 전환 중...</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          {mode === 'live' ? (
            <div className="grid grid-cols-2 gap-4">
              {cameraIds.map(cameraId => (
                <React.Fragment key={`${cameraId}-rgb`}>
                  <VideoStream
                    title={`카메라 ${cameraId + 1} - RGB`}
                    frameData={liveFrames[cameraId]?.rgb}
                    isStreaming={isStreaming[cameraId]}
                    onStreamClick={() => openViewer(cameraId, 'rgb', `카메라 ${cameraId + 1} - RGB`)}
                    personDetected={personDetected[cameraId]}
                  />
                  <VideoStream
                    title={`카메라 ${cameraId + 1} - TIR`}
                    frameData={liveFrames[cameraId]?.tir}
                    isStreaming={isStreaming[cameraId]}
                    onStreamClick={() => openViewer(cameraId, 'tir', `카메라 ${cameraId + 1} - TIR`)}
                    personDetected={personDetected[cameraId]}
                  />
                </React.Fragment>
              ))}
            </div>
          ) : (
            <TestModePanel />
          )}
        </div>

        <div className="space-y-6 h-full">
          {serverMessage && (
            <div className="p-4 bg-blue-900 rounded-lg text-center mb-4">{serverMessage}</div>
          )}
          <EventLog onOpenFull={handleOpenFullEvent} />
        </div>
      </div>

      {/* ✅ 모달: 현재 liveFrames에서 프레임을 꺼내 전달 → 실시간 갱신 */}
      {viewer && (
        <FullscreenViewer
          title={viewer.title}
          frameData={liveFrames[viewer.cameraId]?.[viewer.stream]}
          onClose={closeViewer}
        />
      )}

      {/* 이벤트 상세 뷰어 렌더링 */}
      {fullViewEvent && (
        <EventDetailViewer event={fullViewEvent} onClose={handleCloseFullEvent} />
      )}

      <audio ref={audioRef} src={alertSound} />
    </div>
  );
};

export default Dashboard;