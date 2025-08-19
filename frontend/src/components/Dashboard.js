// frontend/src/components/Dashboard.js

import React, { useEffect, useState, useCallback, useMemo, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import VideoStream from './VideoStream';
import EventLog from './EventLog';
import TestModePanel from './TestModePanel';
import FullscreenViewer from './FullscreenViewer';
import EventDetailViewer from './EventDetailViewer';
import { initSocket, disconnectSocket, subscribeToEvent, sendEvent } from '../services/socket';
import { getDefaultModel } from '../services/api';
import AuthContext from '../context/AuthContext';
import alertSound from '../assets/alarm.mp3';

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [serverMessage, setServerMessage] = useState('');
  const [mode, setMode] = useState('live');
  const cameraIds = useMemo(() => [1], []);

  const [liveFrames, setLiveFrames] = useState({ 1: { rgb: null, tir: null } });
  const [isStreaming, setIsStreaming] = useState({ 1: false });
  const [personDetected, setPersonDetected] = useState({ 1: false });

  const [viewer, setViewer] = useState(null);
  const openViewer = (cameraId, stream, title) => setViewer({ cameraId, stream, title });
  const closeViewer = () => setViewer(null);

  const [fullViewEvent, setFullViewEvent] = useState(null);
  const handleOpenFullEvent = (event) => setFullViewEvent(event);
  const handleCloseFullEvent = () => setFullViewEvent(null);

  
  const [selectedLiveModel, setSelectedLiveModel] = useState(null);
  const [isModelReloading, setIsModelReloading] = useState(false);

  const audioRef = useRef(null);
  const isAdmin = user && user.role === 'admin';

  // mode를 참조하는 ref 생성
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 비디오 프레임 핸들러를 useCallback으로 분리 (mode 의존성 제거하여 불필요한 재생성 방지)
  const handleVideoFrame = useCallback((data) => {
    console.log('비디오 프레임 수신:', data.camera_id, '현재 모드:', modeRef.current);
    if (typeof data.camera_id === 'number' && modeRef.current === 'live') {
      setLiveFrames(prev => ({ ...prev, [data.camera_id]: { rgb: data.rgb, tir: data.tir } }));
      setPersonDetected(prev => ({ ...prev, [data.camera_id]: data.person_detected }));
    }
  }, []); // 의존성 배열 비움

  // 1. 소켓 연결 및 이벤트 핸들러 등록 전용 useEffect
  useEffect(() => {
    // 사용자가 로그인하지 않은 경우 소켓 연결하지 않음
    if (!user || !user.id) {
      console.log('Dashboard: 사용자가 로그인하지 않음. 소켓 연결 건너뜀');
      return;
    }

    // 토큰 재확인
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.log('Dashboard: 토큰이 없어 소켓 연결 건너뜀');
      return;
    }

    console.log('Dashboard 마운트: 소켓 초기화 및 이벤트 구독');
    const socket = initSocket();
    
    // 소켓 초기화가 실패한 경우 (토큰이 없거나 연결 실패)
    if (!socket) {
      console.log('Dashboard: 소켓 초기화 실패');
      return;
    }

    const handleResponse = (data) => {
      console.log('서버 응답:', data);
      setServerMessage(data.message);
    };

    subscribeToEvent('response', handleResponse);
    subscribeToEvent('video_frame', handleVideoFrame);

    // Cleanup 함수: 컴포넌트가 사라질 때 소켓 연결을 반드시 끊도록 수정
    return () => {
      console.log('Dashboard 언마운트: 스트림 중지 및 소켓 연결 해제');
      // 현재 cameraIds를 사용하여 스트림 중지
      [1].forEach(id => { // cameraIds 대신 하드코딩된 값 사용
        sendEvent('stop_stream', { camera_id: id });
      });
      disconnectSocket();
    };
  }, [handleVideoFrame, user]);

  // 2. settings.json에서 기본 모델을 불러오는 useEffect
  useEffect(() => {
    const loadDefaultModel = async () => {
      try {
        console.log('기본 모델 로드 시도...');
        const response = await getDefaultModel();
        const defaultModel = response.data.default_model;
        console.log('Dashboard: settings.json에서 기본 모델 로드:', defaultModel);
        setSelectedLiveModel(defaultModel);
      } catch (error) {
        console.error('기본 모델 로드 실패:', error);
        setSelectedLiveModel('yolo11n_early_fusion.pt'); // 에러 시 폴백
      }
    };
    loadDefaultModel();
  }, []);

  // 스트림 및 모델 관리 통합 useEffect
  useEffect(() => {
    const stopStreams = () => {
      cameraIds.forEach(id => {
        if (isStreaming[id]) {
          console.log(`[Effect] 카메라 ${id} 스트림 중지 요청`);
          sendEvent('stop_stream', { camera_id: id });
          setIsStreaming(prev => ({ ...prev, [id]: false }));
        }
      });
    };

    const startStreams = (modelToUse) => {
      if (!modelToUse) {
        console.log('[Effect] 스트림 시작 보류: 모델이 없습니다.');
        return;
      }
      if (!user || !user.id) {
        console.log('[Effect] 스트림 시작 보류: 사용자 정보가 없습니다.');
        return;
      }
      console.log(`[Effect] 스트림 시작 로직 진입 (모델: ${modelToUse})`);
      cameraIds.forEach(id => {
        console.log(`[Effect] 카메라 ${id} 스트림 시작 요청`);
        sendEvent('start_stream', { 
          camera_id: id,
          model: isAdmin ? modelToUse : undefined,
          user_id: user.id
        });
        setIsStreaming(prev => ({ ...prev, [id]: true }));
      });
    };

    // Live 모드가 아니면 항상 스트림 중지
    if (mode !== 'live') {
      stopStreams();
      return;
    }

    // Live 모드일 때의 로직
    // 메인 대시보드 경로로 처음 진입했거나 다시 돌아왔을 때
    if (location.pathname === '/') {
      console.log('[Effect] 메인 대시보드 경로 감지. 모델 재로드 및 스트림 재시작');
      setIsModelReloading(true);
      stopStreams(); // 기존 스트림 확실히 중지

      getDefaultModel()
        .then(response => {
          const newModel = response.data.default_model;
          console.log(`[Effect] 새로 로드된 모델: ${newModel}`);
          setSelectedLiveModel(newModel);
          startStreams(newModel); // 새 모델로 스트림 시작
        })
        .catch(error => {
          console.error('[Effect] 기본 모델 재로드 실패:', error);
          const fallbackModel = 'yolo11n_early_fusion.pt';
          setSelectedLiveModel(fallbackModel);
          startStreams(fallbackModel); // 폴백 모델로 스트림 시작
        })
        .finally(() => {
          setIsModelReloading(false);
        });
    } 
    // 의존성 배열의 다른 요소 변경으로 인한 재실행 (예: user, isAdmin)
    else {
        startStreams(selectedLiveModel);
    }

    // 이 Effect는 컴포넌트가 unmount될 때 스트림을 중지해야 합니다.
    return () => {
        console.log('[Effect Cleanup] 스트림 중지');
        stopStreams();
    };
  }, [mode, location.pathname, user, isAdmin]); // cameraIds, isStreaming 제거

  // 알람음
  useEffect(() => {
    if (Object.values(personDetected).some(detected => detected) && audioRef.current) {
      audioRef.current.play().catch(error => console.error("오디오 재생 오류:", error));
    }
  }, [personDetected]);

  // 모드 변경 핸들러
  const handleModeChange = (newMode) => {
    if (newMode === 'test' && !isAdmin) {
      alert('테스트 영상 분석 기능은 관리자만 사용할 수 있습니다.');
      return;
    }
    setMode(newMode);
  };

  return (
    <div>
      <div className="flex justify-center space-x-4 mb-4">
        <button
          onClick={() => handleModeChange('live')}
          className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
            mode === 'live' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
          }`}
        >
          실시간 다중 감시
        </button>
        {isAdmin && (
          <button
            onClick={() => handleModeChange('test')}
            className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
              mode === 'test' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            시험 영상 분석 (관리자)
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          {mode === 'live' ? (
            <>
              <div className="p-3 bg-gray-800 rounded-lg text-center">
                <span className="text-gray-400 text-sm">현재 적용된 기본 모델: </span>
                <span className="font-mono text-cyan-400">
                  {isModelReloading ? "모델 재로드 중..." : (selectedLiveModel || "로딩 중...")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {cameraIds.map(cameraId => (
                  <React.Fragment key={cameraId}>
                    <VideoStream
                      title={`카메라 ${cameraId} - RGB`}
                      frameData={liveFrames[cameraId]?.rgb}
                      isStreaming={isStreaming[cameraId]}
                      onStreamClick={() => openViewer(cameraId, 'rgb', `카메라 ${cameraId} - RGB`)}
                      personDetected={personDetected[cameraId]}
                    />
                    <VideoStream
                      title={`카메라 ${cameraId} - TIR`}
                      frameData={liveFrames[cameraId]?.tir}
                      isStreaming={isStreaming[cameraId]}
                      onStreamClick={() => openViewer(cameraId, 'tir', `카메라 ${cameraId} - TIR`)}
                      personDetected={personDetected[cameraId]}
                    />
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : (
            <TestModePanel />
          )}
        </div>

        <div className="space-y-6 h-full">
          {serverMessage && (
            <div className="p-4 bg-blue-900 rounded-lg text-center mb-4">{serverMessage}</div>
          )}
          {mode === 'live' && (
            <EventLog onOpenFull={handleOpenFullEvent} />
          )}
        </div>
      </div>

      {viewer && (
        <FullscreenViewer
          title={viewer.title}
          frameData={liveFrames[viewer.cameraId]?.[viewer.stream]}
          onClose={closeViewer}
        />
      )}

      {fullViewEvent && (
        <EventDetailViewer event={fullViewEvent} onClose={handleCloseFullEvent} />
      )}

      <audio ref={audioRef} src={alertSound} />
    </div>
  );
};

export default Dashboard;