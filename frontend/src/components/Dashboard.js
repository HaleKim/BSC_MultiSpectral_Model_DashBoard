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

  const [isModeChanging, setIsModeChanging] = useState(false);
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
    console.log('Dashboard 마운트: 소켓 초기화 및 이벤트 구독');
    initSocket();

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
  }, []); // handleVideoFrame 의존성 제거 (이제 재생성되지 않으므로)

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

  // 3. 페이지 location 변경 감지 (관리자 패널에서 메인 페이지로 돌아왔을 때)
  useEffect(() => {
    console.log('페이지 location 변경 감지:', location.pathname);
    
    // 메인 페이지('/')로 돌아왔고 live 모드일 때 기본 모델 재로드
    if (location.pathname === '/' && mode === 'live') {
      console.log('메인 페이지 복귀 감지 - 기본 모델 강제 재로드');
      
      const forceReloadModel = async () => {
        try {
          setIsModelReloading(true); // 로딩 상태 시작
          
          const response = await getDefaultModel();
          const defaultModel = response.data.default_model;
          console.log('메인 페이지 복귀 시 기본 모델:', defaultModel);
          console.log('현재 선택된 모델:', selectedLiveModel);
          
          // UI 깜빡임 없이 모델 업데이트
          if (selectedLiveModel !== defaultModel) {
            console.log(`모델 변경 감지: ${selectedLiveModel} -> ${defaultModel}`);
            setSelectedLiveModel(defaultModel);
          } else {
            console.log('모델 동일 - 스트림 재시작을 위해 강제 업데이트');
            // 임시로 null 설정하되 UI에는 로딩 상태로 표시
            setSelectedLiveModel(null);
            setTimeout(() => {
              setSelectedLiveModel(defaultModel);
              console.log('메인 페이지 복귀 시 모델 강제 업데이트 완료:', defaultModel);
            }, 200);
          }
        } catch (error) {
          console.error('메인 페이지 복귀 시 모델 재로드 실패:', error);
        } finally {
          // 로딩 상태 종료
          setTimeout(() => setIsModelReloading(false), 500);
        }
      };
      
      // 약간의 지연을 두어 페이지 전환이 완전히 완료된 후 실행
      setTimeout(forceReloadModel, 300);
    }
  }, [location.pathname, mode, selectedLiveModel]);

  // 4. live 모드로 변경될 때마다 기본 모델 다시 로드 (기존 로직 유지)
  useEffect(() => {
    if (mode === 'live') {
      console.log('Live 모드 진입 감지, 현재 selectedLiveModel:', selectedLiveModel);
      
      const reloadDefaultModel = async () => {
        try {
          console.log('Live 모드 진입 - 기본 모델 다시 로드 시도');
          const response = await getDefaultModel();
          const defaultModel = response.data.default_model;
          console.log('서버에서 받은 기본 모델:', defaultModel);
          
          if (selectedLiveModel !== defaultModel) {
            console.log(`기본 모델 변경 감지: ${selectedLiveModel} -> ${defaultModel}`);
            setSelectedLiveModel(defaultModel);
          } else {
            console.log('기본 모델 변경 없음, 현재 모델 유지:', selectedLiveModel);
            // 모델은 같지만 스트림이 시작되지 않은 경우를 위해 강제로 상태 업데이트
            // UI 깜빡임 방지를 위해 로딩 상태 사용
            setIsModelReloading(true);
            setSelectedLiveModel(null);
            setTimeout(() => {
              setSelectedLiveModel(defaultModel);
              setIsModelReloading(false);
            }, 50);
          }
        } catch (error) {
          console.error('Live 모드 기본 모델 재로드 실패:', error);
        }
      };
      
      // 약간의 지연을 두어 모드 변경이 완전히 완료된 후 실행
      setTimeout(reloadDefaultModel, 100);
    }
  }, [mode]);

  // 스트림 시작/중지 함수
  const startAllStreams = useCallback(async () => {
    if (!selectedLiveModel) {
      console.log('기본 모델 로딩 대기 중...');
      return;
    }
    
    console.log('=== 실시간 스트림 시작 시도 ===');
    console.log('선택된 모델:', selectedLiveModel);
    console.log('관리자 권한:', isAdmin);
    console.log('카메라 IDs:', cameraIds);
    
    for (const id of cameraIds) {
      console.log(`카메라 ${id} 스트림 시작 요청 (모델: ${selectedLiveModel})`);
      sendEvent('start_stream', { 
        camera_id: id,
        model: isAdmin ? selectedLiveModel : undefined
      });
      setIsStreaming(prev => ({ ...prev, [id]: true }));
    }
    console.log('=== 스트림 시작 요청 완료 ===');
  }, [cameraIds, isAdmin, selectedLiveModel]);

  const stopAllStreams = useCallback(() => {
    console.log('모든 스트림 중지 요청...');
    cameraIds.forEach(id => {
        sendEvent('stop_stream', { camera_id: id });
    });
    const resetStreamingState = {};
    const resetFramesState = {};
    cameraIds.forEach(id => {
      resetStreamingState[id] = false;
      resetFramesState[id] = { rgb: null, tir: null };
    });
    setIsStreaming(resetStreamingState);
    setLiveFrames(resetFramesState);
  }, [cameraIds]);

  // 5. 모델 로드 완료 후 실시간 스트림 시작
  useEffect(() => {
    console.log('=== 모델/모드 변경 감지 ===');
    console.log('selectedLiveModel:', selectedLiveModel);
    console.log('mode:', mode);
    console.log('isAdmin:', isAdmin);
    
    if (selectedLiveModel && mode === 'live') {
      console.log('조건 충족: 실시간 스트림 시작 준비');
      startAllStreams();
    } else {
      console.log('조건 미충족: 스트림 시작 안함');
      if (!selectedLiveModel) console.log('- 모델이 로드되지 않음');
      if (mode !== 'live') console.log('- 라이브 모드가 아님');
    }
  }, [selectedLiveModel, mode, startAllStreams]);

  // 6. 모드 변경 시 스트림을 제어하는 useEffect
  useEffect(() => {
    if (mode === 'test') {
      console.log('>> Test Mode: 스트림 중지');
      stopAllStreams();
    }
    // live 모드로 변경 시는 위의 useEffect(selectedLiveModel 의존성)에서 처리
  }, [mode, stopAllStreams]);

  // 알람음
  useEffect(() => {
    if (Object.values(personDetected).some(detected => detected) && audioRef.current) {
      audioRef.current.play().catch(error => console.error("오디오 재생 오류:", error));
    }
  }, [personDetected]);

  // 모드 변경 핸들러
  const handleModeChange = (newMode) => {
    if (isModeChanging) return;
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
          disabled={isModeChanging}
          className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
            mode === 'live' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
          } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isModeChanging && mode === 'live' ? '전환 중...' : '실시간 다중 감시'}
        </button>
        {isAdmin && (
          <button
            onClick={() => handleModeChange('test')}
            disabled={isModeChanging}
            className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
              mode === 'test' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
            } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isModeChanging && mode === 'test' ? '전환 중...' : '시험 영상 분석 (관리자)'}
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