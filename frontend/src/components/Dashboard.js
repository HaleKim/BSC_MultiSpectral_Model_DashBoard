// // src/components/Dashboard.js
// import React, { useEffect, useState, useCallback, useMemo, useRef, useContext } from 'react';
// import VideoStream from './VideoStream';
// import EventLog from './EventLog';
// import TestModePanel from './TestModePanel';
// import FullscreenViewer from './FullscreenViewer';
// import EventDetailViewer from './EventDetailViewer';
// import { initSocket, disconnectSocket, subscribeToEvent, sendEvent, getSocket } from '../services/socket';
// import { getDefaultModel } from '../services/api';
// import AuthContext from '../context/AuthContext';
// import alertSound from '../assets/alarm.mp3';

// const Dashboard = () => {
//   const { user } = useContext(AuthContext);
//   const [serverMessage, setServerMessage] = useState('');
//   const [mode, setMode] = useState('live');

//   // 카메라가 1대라면 [1], 2대면 [1,2]로 변경
//   const cameraIds = useMemo(() => [1], []);

//   // 프레임/상태
//   const [liveFrames, setLiveFrames] = useState({ 1: { rgb: null, tir: null } });
//   const [isStreaming, setIsStreaming] = useState({ 1: false });
//   const [personDetected, setPersonDetected] = useState({ 1: false });

//   // ✅ 모달 상태: 스냅샷이 아니라 "선택 정보"만 저장
//   // { cameraId, stream: 'rgb' | 'tir', title }
//   const [viewer, setViewer] = useState(null);
//   const openViewer = (cameraId, stream, title) => setViewer({ cameraId, stream, title });
//   const closeViewer = () => setViewer(null);

//   // 전체 화면 이벤트 뷰어 상태
//   const [fullViewEvent, setFullViewEvent] = useState(null);
//   const handleOpenFullEvent = (event) => setFullViewEvent(event);
//   const handleCloseFullEvent = () => setFullViewEvent(null);

//   // 모드 전환 중 상태 (백엔드 호환성을 위해 추가)
//   const [isModeChanging, setIsModeChanging] = useState(false);

//   // 실시간 감시용 모델 관리 (간소화)
//   const [selectedLiveModel, setSelectedLiveModel] = useState(null);

//   const audioRef = useRef(null);

//   // 관리자 권한 체크 (AdminRoute와 동일한 기준)
//   const isAdmin = user && user.role === 'admin';

//   // 소켓 연결/해제 및 이벤트 수신 전용 useEffect
//   useEffect(() => {
//     console.log('Dashboard 마운트: 소켓 초기화 및 이벤트 구독');
//     initSocket();

//     const handleResponse = (data) => {
//       console.log('서버 응답:', data);
//       setServerMessage(data.message);
//     };

//     const handleVideoFrame = (data) => {
//       if (typeof data.camera_id === 'number' && mode === 'live') {
//         setLiveFrames(prev => ({ ...prev, [data.camera_id]: { rgb: data.rgb, tir: data.tir } }));
//         setPersonDetected(prev => ({ ...prev, [data.camera_id]: data.person_detected }));
//       }
//     };

//     subscribeToEvent('response', handleResponse);
//     subscribeToEvent('video_frame', handleVideoFrame);

//     // ✨ Cleanup 함수: 컴포넌트가 사라질 때 소켓 연결을 반드시 끊도록 수정
//     return () => {
//       console.log('Dashboard 언마운트: 스트림 중지 및 소켓 연결 해제');
//       // 모든 스트림 중지 요청
//       cameraIds.forEach(id => {
//         sendEvent('stop_stream', { camera_id: id });
//       });
//       disconnectSocket();
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []); // 이 useEffect는 마운트 시 한 번만 실행되도록 의도

//   // 실시간 스트림 시작 함수 (백엔드 호환성을 위해 복원)
//   const startAllStreams = useCallback(async () => {
//     console.log('실시간 스트림 시작 시도...');
//     setIsModeChanging(true);
    
//     try {
//       // 소켓 연결 상태 확인
//       const socket = getSocket();
//       if (!socket || !socket.connected) {
//         console.error('소켓이 연결되지 않았습니다. 소켓 초기화를 다시 시도합니다.');
//         initSocket();
//         // 잠시 대기 후 다시 시도
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }
      
//       // 모든 카메라에 대해 스트림 시작 요청 (선택된 모델 포함)
//       for (const id of cameraIds) {
//         console.log(`카메라 ${id} 스트림 시작 요청 (모델: ${selectedLiveModel})`);
//         sendEvent('start_stream', { 
//           camera_id: id,
//           model: isAdmin ? selectedLiveModel : undefined  // 관리자만 모델 지정
//         });
//         setIsStreaming(prev => ({ ...prev, [id]: true }));
//       }
      
//       // 스트림 상태 초기화
//       setLiveFrames({ 1: { rgb: null, tir: null } });
//       setPersonDetected({ 1: false });
      
//       console.log('실시간 스트림 시작 완료');
//     } catch (error) {
//       console.error('스트림 시작 오류:', error);
//     } finally {
//       setIsModeChanging(false);
//     }
//   }, [cameraIds, isAdmin, selectedLiveModel]);

//   // 모든 스트림을 중지하는 함수 (백엔드 호환성을 위해 복원)
//   const stopAllStreams = useCallback(() => { // async 제거
//     console.log('모든 스트림 중지 요청...');
//     cameraIds.forEach(id => {
//         sendEvent('stop_stream', { camera_id: id });
//     });
//     // 프론트엔드 상태 즉시 업데이트
//     setIsStreaming(prev => {
//         const newState = { ...prev };
//         cameraIds.forEach(id => { newState[id] = false; });
//         return newState;
//     });
//     setLiveFrames(prev => {
//         const newState = { ...prev };
//         cameraIds.forEach(id => { newState[id] = { rgb: null, tir: null }; });
//         return newState;
//     });
//   }, [cameraIds]);

//   // 모드 변경에 따라 스트림 시작/중지 (백엔드 호환성을 위해 수정)
//   useEffect(() => {
//     if (mode === 'live') {
//       console.log('>> Live Mode: 스트림 시작');
//       startAllStreams();
//     } else {
//       console.log('>> Test Mode: 스트림 중지');
//       stopAllStreams();
//     }
//   }, [mode, startAllStreams, stopAllStreams]);

//   // 알람음 (옵션)
//   useEffect(() => {
//     if (personDetected[0] && audioRef.current) {
//       audioRef.current.play().catch(error => console.error("오디오 재생 오류:", error));
//     }
//   }, [personDetected]);
  
//   // 디버깅: 사용자 정보 확인
//   useEffect(() => {
//     console.log('현재 사용자 정보:', user);
//     console.log('관리자 권한:', isAdmin);
//     if (user) {
//       console.log('사용자 역할:', user.role);
//     }
//   }, [user, isAdmin]);

//   // settings.json에서 기본 모델 동기화
//   useEffect(() => {
//     const loadDefaultModel = async () => {
//       try {
//         const response = await getDefaultModel();
//         const defaultModel = response.data.default_model;
//         setSelectedLiveModel(defaultModel);
//         console.log('Dashboard: settings.json에서 기본 모델 로드:', defaultModel);
//       } catch (error) {
//         console.error('기본 모델 로드 실패:', error);
//         setSelectedLiveModel('yolo11n_early_fusion.pt'); // 에러 시 폴백
//       }
//     };
//     loadDefaultModel();
//   }, []); // 이 로직은 컴포넌트 마운트 시 한 번만 실행

//   // 모드 변경 핸들러 (백엔드 호환성을 위해 추가)
//   const handleModeChange = (newMode) => {
//     if (isModeChanging) return; // 모드 변경 중이면 무시
    
//     // 테스트 모드는 관리자만 접근 가능 (AdminRoute와 동일한 체크)
//     if (newMode === 'test' && (!user || user.role !== 'admin')) {
//       alert('테스트 영상 분석 기능은 관리자만 사용할 수 있습니다.');
//       return;
//     }
    
//     console.log(`모드 변경: ${mode} -> ${newMode}`);
//     setMode(newMode);
//   };

//   return (
//     <div>
//       {/* 상단 모드 토글 */}
//       <div className="flex justify-center space-x-4 mb-4">
//         <button
//           onClick={() => handleModeChange('live')}
//           disabled={isModeChanging}
//           className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
//             mode === 'live' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
//           } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
//         >
//           {isModeChanging && mode === 'live' ? '전환 중...' : '실시간 다중 감시'}
//         </button>
//         {user && isAdmin && (
//           <button
//             onClick={() => handleModeChange('test')}
//             disabled={isModeChanging}
//             className={`px-6 py-2 font-bold text-white rounded-lg transition-colors ${
//               mode === 'test' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-700'
//             } ${isModeChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
//           >
//             {isModeChanging && mode === 'test' ? '전환 중...' : '시험 영상 분석 (관리자)'}
//           </button>
//         )}
        
//         {/* 임시 디버깅 정보 */}
//         {process.env.NODE_ENV === 'development' && (
//           <div className="text-xs text-gray-400 mt-2">
//             <p>사용자: {user ? user.username : '없음'}</p>
//             <p>역할: {user ? user.role : '없음'}</p>
//             <p>관리자: {isAdmin ? '예' : '아니오'}</p>
//           </div>
//         )}
//       </div>

//       {/* 모드 전환 중 표시 (백엔드 호환성을 위해 추가) */}
//       {isModeChanging && (
//         <div className="text-center mb-4 p-2 bg-blue-900 rounded-lg">
//           <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
//           <p className="text-white mt-2">모드 전환 중...</p>
//         </div>
//       )}

//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
//         <div className="lg:col-span-2 space-y-6">
//           {mode === 'live' ? (
//             <div className="grid grid-cols-2 gap-4">
//               {cameraIds.map(cameraId => (
//                 <React.Fragment key={`${cameraId}-rgb`}>
//                   <VideoStream
//                     title={`카메라 ${cameraId} - RGB`}
//                     frameData={liveFrames[cameraId]?.rgb}
//                     isStreaming={isStreaming[cameraId]}
//                     onStreamClick={() => openViewer(cameraId, 'rgb', `카메라 ${cameraId} - RGB`)}
//                     personDetected={personDetected[cameraId]}
//                   />
//                   <VideoStream
//                     title={`카메라 ${cameraId} - TIR`}
//                     frameData={liveFrames[cameraId]?.tir}
//                     isStreaming={isStreaming[cameraId]}
//                     onStreamClick={() => openViewer(cameraId, 'tir', `카메라 ${cameraId} - TIR`)}
//                     personDetected={personDetected[cameraId]}
//                   />
//                 </React.Fragment>
//               ))}
//             </div>
//           ) : (
//             <TestModePanel />
//           )}
//         </div>

//         <div className="space-y-6 h-full">
//           {serverMessage && (
//             <div className="p-4 bg-blue-900 rounded-lg text-center mb-4">{serverMessage}</div>
//           )}
//           {/* 실시간 모드에서만 이벤트 로그 표시 */}
//           {mode === 'live' && (
//             <EventLog onOpenFull={handleOpenFullEvent} />
//           )}
//         </div>
//       </div>

//       {/* ✅ 모달: 현재 liveFrames에서 프레임을 꺼내 전달 → 실시간 갱신 */}
//       {viewer && (
//         <FullscreenViewer
//           title={viewer.title}
//           frameData={liveFrames[viewer.cameraId]?.[viewer.stream]}
//           onClose={closeViewer}
//         />
//       )}

//       {/* 이벤트 상세 뷰어 렌더링 */}
//       {fullViewEvent && (
//         <EventDetailViewer event={fullViewEvent} onClose={handleCloseFullEvent} />
//       )}

//       <audio ref={audioRef} src={alertSound} />
//     </div>
//   );
// };

// export default Dashboard;

// frontend/src/components/Dashboard.js (최종 수정본 전체)

import React, { useEffect, useState, useCallback, useMemo, useRef, useContext } from 'react';
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

  const audioRef = useRef(null);
  const isAdmin = user && user.role === 'admin';

  // 1. 소켓 연결 및 이벤트 핸들러 등록 전용 useEffect
  useEffect(() => {
    console.log('Dashboard 마운트: 소켓 초기화 및 이벤트 구독');
    initSocket();

    const handleResponse = (data) => {
      console.log('서버 응답:', data);
      setServerMessage(data.message);
    };

    const handleVideoFrame = (data) => {
      if (typeof data.camera_id === 'number' && mode === 'live') {
        setLiveFrames(prev => ({ ...prev, [data.camera_id]: { rgb: data.rgb, tir: data.tir } }));
        setPersonDetected(prev => ({ ...prev, [data.camera_id]: data.person_detected }));
      }
    };

    subscribeToEvent('response', handleResponse);
    subscribeToEvent('video_frame', handleVideoFrame);

    // Cleanup 함수: 컴포넌트가 사라질 때 소켓 연결을 반드시 끊도록 수정
    return () => {
      console.log('Dashboard 언마운트: 스트림 중지 및 소켓 연결 해제');
      cameraIds.forEach(id => {
        sendEvent('stop_stream', { camera_id: id });
      });
      disconnectSocket();
    };
  }, [mode, cameraIds]);

  // 2. settings.json에서 기본 모델을 불러오는 useEffect
  useEffect(() => {
    const loadDefaultModel = async () => {
      try {
        const response = await getDefaultModel();
        const defaultModel = response.data.default_model;
        setSelectedLiveModel(defaultModel);
        console.log('Dashboard: settings.json에서 기본 모델 로드:', defaultModel);
      } catch (error) {
        console.error('기본 모델 로드 실패:', error);
        setSelectedLiveModel('yolo11n_early_fusion.pt'); // 에러 시 폴백
      }
    };
    loadDefaultModel();
  }, []);

  // 스트림 시작/중지 함수
  const startAllStreams = useCallback(async () => {
    if (!selectedLiveModel) {
      console.log('기본 모델 로딩 대기 중...');
      return;
    }
    console.log('실시간 스트림 시작 시도...');
    for (const id of cameraIds) {
      console.log(`카메라 ${id} 스트림 시작 요청 (모델: ${selectedLiveModel})`);
      sendEvent('start_stream', { 
        camera_id: id,
        model: isAdmin ? selectedLiveModel : undefined
      });
      setIsStreaming(prev => ({ ...prev, [id]: true }));
    }
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

  // 3. 모드 변경 시 스트림을 제어하는 useEffect
  useEffect(() => {
    if (mode === 'live') {
      console.log('>> Live Mode: 스트림 시작');
      startAllStreams();
    } else {
      console.log('>> Test Mode: 스트림 중지');
      stopAllStreams();
    }
  }, [mode, startAllStreams, stopAllStreams]);

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
          }`}
        >
          실시간 다중 감시
        </button>
        {isAdmin && (
          <button
            onClick={() => handleModeChange('test')}
            disabled={isModeChanging}
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
                  {selectedLiveModel ? selectedLiveModel : "로딩 중..."}
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