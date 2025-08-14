// frontend/src/components/TestModePanel.js (동기화된 비디오 플레이어 버전)

import React, { useState, useEffect, useRef } from 'react';
import { getTestVideos, getModels } from '../services/api';
import { sendEvent, subscribeToEvent, unsubscribeFromEvent } from '../services/socket';

const TestModePanel = () => {
    const [testVideos, setTestVideos] = useState([]);
    const [selectedRgbVideo, setSelectedRgbVideo] = useState('');
    const [selectedTirVideo, setSelectedTirVideo] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    
    // 분석 상태
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [rgbFrame, setRgbFrame] = useState(null);
    const [tirFrame, setTirFrame] = useState(null);
    
    // 로딩 상태
    const [isLoading, setIsLoading] = useState(true);
    const [isModelsLoading, setIsModelsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // 비디오 플레이어 상태
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    
    // 비디오 참조
    const rgbVideoRef = useRef(null);
    const tirVideoRef = useRef(null);
    const isSeeking = useRef(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setIsModelsLoading(true);
            
            try {
                // 비디오 목록과 모델 목록을 병렬로 로드
                const [videosResponse, modelsResponse] = await Promise.all([
                    getTestVideos(),
                    getModels()
                ]);
                
                // 비디오 목록 설정
                setTestVideos(videosResponse.data);
                if (videosResponse.data.length > 0) {
                    setSelectedRgbVideo(videosResponse.data[0]);
                    setSelectedTirVideo(videosResponse.data[0]);
                }
                
                // 모델 목록 설정
                setAvailableModels(modelsResponse.data);
                if (modelsResponse.data.length > 0) {
                    setSelectedModel(modelsResponse.data[0]);
                }
                
                setError('');
            } catch (error) {
                console.error("데이터 로딩 실패:", error);
                setError('데이터를 불러오는데 실패했습니다.');
            } finally {
                setIsLoading(false);
                setIsModelsLoading(false);
            }
        };
        fetchData();

        // 시험 영상 프레임 수신 구독
        const handleVideoFrame = (data) => {
            console.log('TestModePanel에서 비디오 프레임 수신:', data);
            if (data.camera_id === 'test_video') {
                setRgbFrame(data.rgb);
                setTirFrame(data.tir);
                console.log('테스트 프레임 설정 완료');
            }
        };

        subscribeToEvent('video_frame', handleVideoFrame);

        return () => {
            unsubscribeFromEvent('video_frame', handleVideoFrame);
            // 컴포넌트 언마운트 시 분석 중지
            if (isAnalyzing) {
                sendEvent('stop_test_stream', {});
            }
        };
    }, [isAnalyzing]);

    // 비디오 동기화 함수들
    const syncVideos = (targetTime) => {
        if (rgbVideoRef.current && tirVideoRef.current && !isSeeking.current) {
            isSeeking.current = true;
            rgbVideoRef.current.currentTime = targetTime;
            tirVideoRef.current.currentTime = targetTime;
            setTimeout(() => {
                isSeeking.current = false;
            }, 100);
        }
    };

    const handlePlay = () => {
        if (rgbVideoRef.current && tirVideoRef.current) {
            rgbVideoRef.current.play();
            tirVideoRef.current.play();
            setIsPlaying(true);
        }
    };

    const handlePause = () => {
        if (rgbVideoRef.current && tirVideoRef.current) {
            rgbVideoRef.current.pause();
            tirVideoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const handleSeek = (e) => {
        const rect = e.target.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const targetTime = percent * duration;
        syncVideos(targetTime);
        setCurrentTime(targetTime);
    };

    const handlePlaybackRateChange = (rate) => {
        if (rgbVideoRef.current && tirVideoRef.current) {
            rgbVideoRef.current.playbackRate = rate;
            tirVideoRef.current.playbackRate = rate;
            setPlaybackRate(rate);
        }
    };

    // RGB 비디오 이벤트 핸들러
    const handleRgbTimeUpdate = () => {
        if (rgbVideoRef.current && !isSeeking.current) {
            setCurrentTime(rgbVideoRef.current.currentTime);
            // TIR 비디오 동기화
            if (tirVideoRef.current && Math.abs(tirVideoRef.current.currentTime - rgbVideoRef.current.currentTime) > 0.5) {
                tirVideoRef.current.currentTime = rgbVideoRef.current.currentTime;
            }
        }
    };

    const handleRgbLoadedMetadata = () => {
        if (rgbVideoRef.current) {
            setDuration(rgbVideoRef.current.duration);
        }
    };

    const handleStartAnalysis = () => {
        if (!selectedRgbVideo || !selectedTirVideo || !selectedModel) {
            setError('RGB 영상, TIR 영상, 그리고 모델을 모두 선택해주세요.');
            return;
        }

        setError('');
        setRgbFrame(null);
        setTirFrame(null);
        setIsAnalyzing(true);

        // 백엔드에 분석 시작 요청
        sendEvent('start_test_stream', { 
            rgb_filename: selectedRgbVideo,
            tir_filename: selectedTirVideo,
            model: selectedModel
        });
    };

    const handleStopAnalysis = () => {
        setIsAnalyzing(false);
        sendEvent('stop_test_stream', {});
        setRgbFrame(null);
        setTirFrame(null);
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6">
            {/* 모델 선택 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-white">분석 모델 선택</h3>
                <select 
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    disabled={isAnalyzing || isModelsLoading}
                >
                    {isModelsLoading ? (
                        <option>모델 목록을 불러오는 중...</option>
                    ) : availableModels.length > 0 ? (
                        availableModels.map((model) => (
                            <option key={model} value={model}>{model}</option>
                        ))
                    ) : (
                        <option>사용 가능한 모델이 없습니다.</option>
                    )}
                </select>
                
                {/* 모델 정보 */}
                <div className="mt-2 text-xs text-gray-400">
                    <p>models_ai 폴더에서 {availableModels.length}개 모델 발견</p>
                    {selectedModel && (
                        <p>선택된 모델: <span className="text-cyan-400 font-mono">{selectedModel}</span></p>
                    )}
                </div>
            </div>

            {/* 영상 선택 - 2분할 UI */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* RGB 영상 선택 */}
                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-white">RGB 영상 선택</h3>
                    <select 
                        value={selectedRgbVideo} 
                        onChange={(e) => setSelectedRgbVideo(e.target.value)}
                        className="w-full px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-3"
                        disabled={isLoading || isAnalyzing}
                    >
                        {isLoading ? (
                            <option>목록을 불러오는 중...</option>
                        ) : testVideos.length > 0 ? (
                            testVideos.map((video) => (
                                <option key={`rgb-${video}`} value={video}>{video}</option>
                            ))
                        ) : (
                            <option>사용 가능한 영상이 없습니다.</option>
                        )}
                    </select>
                </div>

                {/* TIR 영상 선택 */}
                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-white">TIR 영상 선택</h3>
                    <select 
                        value={selectedTirVideo} 
                        onChange={(e) => setSelectedTirVideo(e.target.value)}
                        className="w-full px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-3"
                        disabled={isLoading || isAnalyzing}
                    >
                        {isLoading ? (
                            <option>목록을 불러오는 중...</option>
                        ) : testVideos.length > 0 ? (
                            testVideos.map((video) => (
                                <option key={`tir-${video}`} value={video}>{video}</option>
                            ))
                        ) : (
                            <option>사용 가능한 영상이 없습니다.</option>
                        )}
                    </select>
                </div>
            </div>

            {/* 동기화된 비디오 플레이어 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-white">동기화된 비디오 플레이어</h3>
                
                {/* 비디오 표시 영역 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {/* RGB 비디오 */}
                    <div className="bg-black rounded-md aspect-video relative">
                        {selectedRgbVideo && !isAnalyzing ? (
                            <video
                                ref={rgbVideoRef}
                                src={`${process.env.REACT_APP_API_URL}/test_videos/${selectedRgbVideo}`}
                                className="w-full h-full object-contain"
                                onTimeUpdate={handleRgbTimeUpdate}
                                onLoadedMetadata={handleRgbLoadedMetadata}
                                muted
                            />
                        ) : isAnalyzing && rgbFrame ? (
                            <img 
                                src={`data:image/jpeg;base64,${rgbFrame}`} 
                                alt="RGB Analysis Result" 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                {isAnalyzing ? "RGB 영상 분석 중..." : "RGB 영상을 선택해주세요"}
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                            RGB
                        </div>
                    </div>

                    {/* TIR 비디오 */}
                    <div className="bg-black rounded-md aspect-video relative">
                        {selectedTirVideo && !isAnalyzing ? (
                            <video
                                ref={tirVideoRef}
                                src={`${process.env.REACT_APP_API_URL}/test_videos/${selectedTirVideo}`}
                                className="w-full h-full object-contain"
                                muted
                            />
                        ) : isAnalyzing && tirFrame ? (
                            <img 
                                src={`data:image/jpeg;base64,${tirFrame}`} 
                                alt="TIR Analysis Result" 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                {isAnalyzing ? "TIR 영상 분석 중..." : "TIR 영상을 선택해주세요"}
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                            TIR
                        </div>
                    </div>
                </div>

                {/* 비디오 컨트롤 */}
                <div className="space-y-3">
                    {/* 진행 바 */}
                    <div className="flex items-center space-x-2">
                        <span className="text-white text-sm">{formatTime(currentTime)}</span>
                        <div 
                            className="flex-1 h-2 bg-gray-600 rounded-full cursor-pointer"
                            onClick={handleSeek}
                        >
                            <div 
                                className="h-full bg-cyan-500 rounded-full"
                                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                            />
                        </div>
                        <span className="text-white text-sm">{formatTime(duration)}</span>
                    </div>

                    {/* 재생 컨트롤 */}
                    <div className="flex items-center justify-center space-x-4">
                        <button
                            onClick={isPlaying ? handlePause : handlePlay}
                            disabled={!selectedRgbVideo || !selectedTirVideo || isAnalyzing}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded-lg"
                        >
                            {isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
                        </button>

                        {/* 재생 속도 */}
                        <select
                            value={playbackRate}
                            onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                            disabled={isAnalyzing}
                            className="px-2 py-1 bg-gray-700 text-white rounded"
                        >
                            <option value={0.5}>0.5x</option>
                            <option value={1}>1x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2x</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 분석 컨트롤 */}
            <div className="flex justify-center space-x-4">
                {!isAnalyzing ? (
                    <button 
                        onClick={handleStartAnalysis} 
                        disabled={isLoading || !selectedRgbVideo || !selectedTirVideo || !selectedModel}
                        className="px-6 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        AI 분석 시작
                    </button>
                ) : (
                    <button 
                        onClick={handleStopAnalysis} 
                        className="px-6 py-2 font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
                    >
                        분석 중지
                    </button>
                )}
            </div>

            {/* 에러 메시지 */}
            {error && (
                <div className="p-4 bg-red-800 border border-red-600 rounded-lg">
                    <p className="text-red-200">{error}</p>
                </div>
            )}

            {/* 분석 상태 정보 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-white">분석 상태</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                        <span className="text-gray-400">선택된 모델:</span>
                        <p className="text-white font-mono">{selectedModel || '선택되지 않음'}</p>
                    </div>
                    <div>
                        <span className="text-gray-400">RGB 영상:</span>
                        <p className="text-white font-mono truncate">{selectedRgbVideo || '선택되지 않음'}</p>
                    </div>
                    <div>
                        <span className="text-gray-400">TIR 영상:</span>
                        <p className="text-white font-mono truncate">{selectedTirVideo || '선택되지 않음'}</p>
                    </div>
                </div>
                <div className="mt-2">
                    <span className="text-gray-400">상태:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                        isAnalyzing ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                    }`}>
                        {isAnalyzing ? 'AI 분석 중' : '대기 중'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TestModePanel;