// frontend/src/components/TestModePanel.js (ESLint 오류 수정된 최종본)

import React, { useState, useEffect, useRef } from 'react';
import { getTestVideos, getModels } from '../services/api';
import { sendEvent, subscribeToEvent, unsubscribeFromEvent } from '../services/socket';

const TestModePanel = () => {
    const [testVideos, setTestVideos] = useState([]);
    const [selectedRgbVideo, setSelectedRgbVideo] = useState('');
    const [selectedTirVideo, setSelectedTirVideo] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [rgbFrame, setRgbFrame] = useState(null);
    const [tirFrame, setTirFrame] = useState(null);
    
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

    // 데이터 로딩 및 소켓 구독 useEffect
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setIsModelsLoading(true);
            try {
                const [videosResponse, modelsResponse] = await Promise.all([
                    getTestVideos(),
                    getModels()
                ]);
                setTestVideos(videosResponse.data);
                if (videosResponse.data.length > 0) {
                    setSelectedRgbVideo(videosResponse.data[0]);
                    setSelectedTirVideo(videosResponse.data[0]);
                }
                setAvailableModels(modelsResponse.data);
                const savedTestModel = localStorage.getItem('selectedTestModel');
                if (savedTestModel && modelsResponse.data.includes(savedTestModel)) {
                    setSelectedModel(savedTestModel);
                } else if (modelsResponse.data.length > 0) {
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

        const handleVideoFrame = (data) => {
            if (data.camera_id === 'test_video') {
                setRgbFrame(data.rgb);
                setTirFrame(data.tir);
            }
        };
        subscribeToEvent('video_frame', handleVideoFrame);

        return () => {
            unsubscribeFromEvent('video_frame', handleVideoFrame);
            if (isAnalyzing) {
                sendEvent('stop_test_stream', {});
            }
        };
    }, [isAnalyzing]);

    // 중앙 비디오 제어 로직
    const handlePlayPause = () => {
        if (!rgbVideoRef.current || !tirVideoRef.current) return;
        if (rgbVideoRef.current.paused) {
            rgbVideoRef.current.play();
            tirVideoRef.current.play();
        } else {
            rgbVideoRef.current.pause();
            tirVideoRef.current.pause();
        }
    };
    
    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        if (rgbVideoRef.current) rgbVideoRef.current.currentTime = time;
        if (tirVideoRef.current) tirVideoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const handlePlaybackRateChange = (rate) => {
        if (rgbVideoRef.current) rgbVideoRef.current.playbackRate = rate;
        if (tirVideoRef.current) tirVideoRef.current.playbackRate = rate;
        setPlaybackRate(rate);
    };
    
    // RGB 비디오(마스터)의 상태 변화를 감지하여 UI와 TIR 비디오(슬레이브)를 업데이트
    useEffect(() => {
        const rgbVideo = rgbVideoRef.current;
        if (!rgbVideo) return;
    
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => setCurrentTime(rgbVideo.currentTime);
        const onLoadedData = () => setDuration(rgbVideo.duration);
    
        rgbVideo.addEventListener('play', onPlay);
        rgbVideo.addEventListener('pause', onPause);
        rgbVideo.addEventListener('timeupdate', onTimeUpdate);
        rgbVideo.addEventListener('loadedmetadata', onLoadedData);
    
        return () => {
            rgbVideo.removeEventListener('play', onPlay);
            rgbVideo.removeEventListener('pause', onPause);
            rgbVideo.removeEventListener('timeupdate', onTimeUpdate);
            rgbVideo.removeEventListener('loadedmetadata', onLoadedData);
        };
    }, []);

    const handleStartAnalysis = () => {
        if (!selectedRgbVideo || !selectedTirVideo || !selectedModel) {
            setError('RGB 영상, TIR 영상, 그리고 모델을 모두 선택해주세요.');
            return;
        }
        setError('');
        setRgbFrame(null);
        setTirFrame(null);
        setIsAnalyzing(true);
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
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-white">분석 모델 선택</h3>
                <select 
                    value={selectedModel} 
                    onChange={(e) => {
                        const newModel = e.target.value;
                        setSelectedModel(newModel);
                        localStorage.setItem('selectedTestModel', newModel);
                    }}
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
                <div className="mt-2 text-xs text-gray-400">
                    <p>models_ai 폴더에서 {availableModels.length}개 모델 발견</p>
                    {selectedModel && (
                        <p>선택된 모델: <span className="text-cyan-400 font-mono">{selectedModel}</span></p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-white">RGB 영상 선택</h3>
                    <select 
                        value={selectedRgbVideo} 
                        onChange={(e) => {
                            setSelectedRgbVideo(e.target.value);
                            setIsPlaying(false);
                            setCurrentTime(0);
                            setDuration(0);
                        }}
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

                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-white">TIR 영상 선택</h3>
                    <select 
                        value={selectedTirVideo} 
                        onChange={(e) => {
                            setSelectedTirVideo(e.target.value);
                            setIsPlaying(false);
                            setCurrentTime(0);
                            setDuration(0);
                        }}
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

            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-white">동기화된 비디오 플레이어</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-black rounded-md aspect-video relative">
                        {selectedRgbVideo ? (
                            <>
                                <video
                                    ref={rgbVideoRef}
                                    src={`${process.env.REACT_APP_API_URL}/test_videos/${selectedRgbVideo}`}
                                    className={`w-full h-full object-contain ${isAnalyzing ? 'opacity-50' : ''}`}
                                    muted
                                />
                                {isAnalyzing && rgbFrame && (
                                    <img 
                                        src={`data:image/jpeg;base64,${rgbFrame}`} 
                                        alt="RGB Analysis Result" 
                                        className="absolute top-0 left-0 w-full h-full object-contain"
                                    />
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                RGB 영상을 선택해주세요
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                            RGB
                        </div>
                    </div>

                    <div className="bg-black rounded-md aspect-video relative">
                        {selectedTirVideo ? (
                            <>
                                <video
                                    ref={tirVideoRef}
                                    src={`${process.env.REACT_APP_API_URL}/test_videos/${selectedTirVideo}`}
                                    className={`w-full h-full object-contain ${isAnalyzing ? 'opacity-50' : ''}`}
                                    muted
                                />
                                {isAnalyzing && tirFrame && (
                                    <img 
                                        src={`data:image/jpeg;base64,${tirFrame}`} 
                                        alt="TIR Analysis Result" 
                                        className="absolute top-0 left-0 w-full h-full object-contain"
                                    />
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                TIR 영상을 선택해주세요
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                            TIR
                        </div>
                    </div>
                </div>

                {isAnalyzing && (
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center space-x-2">
                            <span className="text-white text-sm">{formatTime(currentTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={duration || 0}
                                value={currentTime}
                                onChange={handleSeek}
                                className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-white text-sm">{formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center justify-center space-x-4">
                            <button onClick={handlePlayPause} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg">
                                {isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
                            </button>
                            <select
                                value={playbackRate}
                                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                                className="px-2 py-1 bg-gray-700 text-white rounded"
                            >
                                <option value={0.5}>0.5x</option>
                                <option value={1}>1x</option>
                                <option value={1.5}>1.5x</option>
                                <option value={2}>2x</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

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

            {error && (
                <div className="p-4 bg-red-800 border border-red-600 rounded-lg">
                    <p className="text-red-200">{error}</p>
                </div>
            )}

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