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
                
                // API 응답이 객체로 바뀜 (all, rgb, tir)
                const videoData = videosResponse.data;
                if (Array.isArray(videoData)) {
                    // 이전 형식 호환성
                    setTestVideos(videoData);
                    if (videoData.length > 0) {
                        setSelectedRgbVideo(videoData[0]);
                        setSelectedTirVideo(videoData[0]);
                    }
                } else {
                    // 새로운 형식
                    setTestVideos(videoData.all || []);
                    if (videoData.all && videoData.all.length > 0) {
                        // RGB 비디오가 있으면 우선 선택
                        const firstRgb = videoData.rgb && videoData.rgb.length > 0 ? videoData.rgb[0] : videoData.all[0];
                        const firstTir = videoData.tir && videoData.tir.length > 0 ? videoData.tir[0] : videoData.all[0];
                        setSelectedRgbVideo(firstRgb);
                        setSelectedTirVideo(firstTir);
                    }
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
                
                // 서버에서 받은 시간 정보로 UI 업데이트
                if (data.current_time !== undefined) {
                    setCurrentTime(data.current_time);
                }
                if (data.duration !== undefined && data.duration > 0) {
                    setDuration(data.duration);
                }
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
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        console.log('handlePlayPause 호출됨');
        console.log('rgbVideo:', rgbVideo);
        console.log('tirVideo:', tirVideo);
        console.log('현재 isPlaying 상태:', isPlaying);
        console.log('분석 상태:', isAnalyzing);
        
        if (!rgbVideo || !tirVideo) {
            console.warn('RGB 또는 TIR 비디오 참조를 찾을 수 없습니다.');
            return;
        }
        try {
            if (isPlaying) {
                // 현재 재생 중이면 일시정지
                console.log('비디오 일시정지 요청');
                rgbVideo.pause();
                tirVideo.pause();
                setIsPlaying(false);
                
                // 분석 중이면 서버에도 일시정지 상태 전달
                if (isAnalyzing) {
                    sendEvent('test_video_control', {
                        action: 'pause',
                        time: rgbVideo.currentTime
                    });
                }
            } else {
                // 현재 일시정지 중이면 재생
                console.log('비디오 재생 요청');
                rgbVideo.play().catch(e => console.error('RGB 재생 오류:', e));
                tirVideo.play().catch(e => console.error('TIR 재생 오류:', e));
                setIsPlaying(true);
                
                // 분석 중이면 서버에도 재생 상태 전달
                if (isAnalyzing) {
                    sendEvent('test_video_control', {
                        action: 'play',
                        time: rgbVideo.currentTime
                    });
                }
            }
        } catch (error) {
            console.error('재생/일시정지 오류:', error);
        }
    };
    
    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        console.log('handleSeek 호출됨, 시간:', time);
        console.log('rgbVideo 존재:', !!rgbVideo);
        console.log('tirVideo 존재:', !!tirVideo);
        
        if (!rgbVideo || !tirVideo) {
            console.warn('시간 이동: RGB 또는 TIR 비디오 참조를 찾을 수 없습니다.');
            return;
        }
        
        try {
            console.log(`시간 이동 실행: ${time}초`);
            rgbVideo.currentTime = time;
            tirVideo.currentTime = time;
            setCurrentTime(time);
            
            // 분석 중이면 서버에도 시간 이동 전달
            if (isAnalyzing) {
                sendEvent('test_video_control', {
                    action: 'seek',
                    time: time
                });
            }
            
            console.log('시간 이동 완료');
        } catch (error) {
            console.error('시간 이동 오류:', error);
        }
    };

    const handlePlaybackRateChange = (rate) => {
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        console.log('handlePlaybackRateChange 호출됨, 속도:', rate);
        console.log('rgbVideo 존재:', !!rgbVideo);
        console.log('tirVideo 존재:', !!tirVideo);
        
        if (!rgbVideo || !tirVideo) {
            console.warn('재생 속도 변경: RGB 또는 TIR 비디오 참조를 찾을 수 없습니다.');
            return;
        }
        
        try {
            console.log(`재생 속도 변경 실행: ${rate}x`);
            rgbVideo.playbackRate = rate;
            tirVideo.playbackRate = rate;
            setPlaybackRate(rate);
            
            // 분석 중이면 서버에도 재생 속도 전달
            if (isAnalyzing) {
                sendEvent('test_video_control', {
                    action: 'playback_rate',
                    rate: rate
                });
            }
            
            console.log('재생 속도 변경 완료');
        } catch (error) {
            console.error('재생 속도 변경 오류:', error);
        }
    };
    
    // RGB 비디오(마스터)의 상태 변화를 감지하여 UI와 TIR 비디오(슬레이브)를 업데이트
    useEffect(() => {
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        if (!rgbVideo) {
            console.warn('RGB 비디오 참조를 찾을 수 없습니다.');
            return;
        }
        
        console.log('비디오 이벤트 리스너 설정:', selectedRgbVideo, selectedTirVideo);
    
        const onPlay = () => {
            console.log('RGB 비디오 재생 이벤트');
            setIsPlaying(true);
            // TIR 비디오도 동기화
            if (tirVideo && tirVideo.paused) {
                tirVideo.play().catch(e => console.log('TIR video play failed:', e));
            }
        };
        
        const onPause = () => {
            console.log('RGB 비디오 일시정지 이벤트');
            setIsPlaying(false);
            // TIR 비디오도 동기화
            if (tirVideo && !tirVideo.paused) {
                tirVideo.pause();
            }
        };
        
        const onTimeUpdate = () => {
            const currentTime = rgbVideo.currentTime;
            setCurrentTime(currentTime);
            // TIR 비디오 시간 동기화 (0.3초 이상 차이날 때만)
            if (tirVideo && Math.abs(tirVideo.currentTime - currentTime) > 0.3) {
                tirVideo.currentTime = currentTime;
            }
        };
        
        const onLoadedData = () => {
            const duration = rgbVideo.duration;
            console.log('비디오 로드 완료, 길이:', duration);
            setDuration(duration);
            setCurrentTime(0);
            
            // TIR 비디오 길이도 확인
            if (tirVideo && tirVideo.duration && tirVideo.duration !== duration) {
                console.warn('RGB와 TIR 비디오 길이가 다릅니다:', duration, tirVideo.duration);
            }
        };

        const onCanPlay = () => {
            console.log('비디오 재생 준비 완료');
            // 비디오가 로드되면 초기화
            if (rgbVideo.currentTime !== 0) {
                rgbVideo.currentTime = 0;
            }
            if (tirVideo && tirVideo.currentTime !== 0) {
                tirVideo.currentTime = 0;
            }
        };

        const onError = (e) => {
            console.error('비디오 로드 오류:', e);
        };
    
        // 모든 이벤트 리스너 등록
        rgbVideo.addEventListener('play', onPlay);
        rgbVideo.addEventListener('pause', onPause);
        rgbVideo.addEventListener('timeupdate', onTimeUpdate);
        rgbVideo.addEventListener('loadedmetadata', onLoadedData);
        rgbVideo.addEventListener('loadeddata', onLoadedData);
        rgbVideo.addEventListener('canplay', onCanPlay);
        rgbVideo.addEventListener('error', onError);
    
        return () => {
            if (rgbVideo) {
                rgbVideo.removeEventListener('play', onPlay);
                rgbVideo.removeEventListener('pause', onPause);
                rgbVideo.removeEventListener('timeupdate', onTimeUpdate);
                rgbVideo.removeEventListener('loadedmetadata', onLoadedData);
                rgbVideo.removeEventListener('loadeddata', onLoadedData);
                rgbVideo.removeEventListener('canplay', onCanPlay);
                rgbVideo.removeEventListener('error', onError);
            }
        };
    }, [selectedRgbVideo, selectedTirVideo]); // 선택된 비디오가 바뀔 때마다 재설정

    const handleStartAnalysis = () => {
        if (!selectedRgbVideo || !selectedTirVideo || !selectedModel) {
            setError('RGB 영상, TIR 영상, 그리고 모델을 모두 선택해주세요.');
            return;
        }
        
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        console.log('분석 시작 버튼 클릭');
        console.log('rgbVideo:', rgbVideo);
        console.log('tirVideo:', tirVideo);
        console.log('rgbVideo.readyState:', rgbVideo?.readyState);
        console.log('tirVideo.readyState:', tirVideo?.readyState);
        
        if (!rgbVideo || !tirVideo) {
            setError('RGB와 TIR 비디오가 모두 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        
        console.log('분석 시작:', selectedRgbVideo, selectedTirVideo, selectedModel);
        
        // 분석 시작 전 비디오 상태 초기화
        try {
            rgbVideo.currentTime = 0;
            tirVideo.currentTime = 0;
            rgbVideo.pause();
            tirVideo.pause();
            console.log('비디오 초기화 완료');
        } catch (error) {
            console.error('비디오 초기화 오류:', error);
        }
        
        setError('');
        setRgbFrame(null);
        setTirFrame(null);
        setIsAnalyzing(true);
        setIsPlaying(true); // 분석 시작 시 재생 상태로 설정 (일시정지 버튼이 먼저 보임)
        setCurrentTime(0);
        
        console.log('소켓 이벤트 전송');
        sendEvent('start_test_stream', { 
            rgb_filename: selectedRgbVideo,
            tir_filename: selectedTirVideo,
            model: selectedModel
        });
    };

    const handleStopAnalysis = () => {
        console.log('분석 중지 버튼 클릭');
        
        const rgbVideo = rgbVideoRef.current;
        const tirVideo = tirVideoRef.current;
        
        console.log('분석 중지 시 비디오 상태');
        console.log('rgbVideo:', rgbVideo);
        console.log('tirVideo:', tirVideo);
        
        // 분석 중지 시 비디오 일시정지
        try {
            if (rgbVideo) {
                rgbVideo.pause();
                console.log('RGB 비디오 일시정지 완료');
            }
            if (tirVideo) {
                tirVideo.pause();
                console.log('TIR 비디오 일시정지 완료');
            }
        } catch (error) {
            console.error('비디오 일시정지 오류:', error);
        }
        
        setIsAnalyzing(false);
        setIsPlaying(false);
        sendEvent('stop_test_stream', {});
        setRgbFrame(null);
        setTirFrame(null);
        console.log('분석 중지 완료');
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
                                    src={`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/test_videos/${selectedRgbVideo}`}
                                    className="w-full h-full object-contain relative z-10"
                                    muted
                                    preload="metadata"
                                    controls={false} // 항상 비활성화, 별도 컨트롤러 사용
                                    onError={(e) => console.error('RGB 비디오 로드 오류:', e)}
                                    onLoadStart={() => console.log('RGB 비디오 로드 시작:', selectedRgbVideo)}
                                    onLoadedData={() => console.log('RGB 비디오 로드 완료:', selectedRgbVideo)}
                                />
                                {isAnalyzing && rgbFrame && (
                                    <div className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none">
                                        <img 
                                            src={`data:image/jpeg;base64,${rgbFrame}`} 
                                            alt="RGB Analysis Result" 
                                            className="w-full h-full object-contain opacity-80"
                                        />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                RGB 영상을 선택해주세요
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-30">
                            RGB {isAnalyzing && '(분석 중)'}
                        </div>
                    </div>

                    <div className="bg-black rounded-md aspect-video relative">
                        {selectedTirVideo ? (
                            <>
                                <video
                                    ref={tirVideoRef}
                                    src={`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/test_videos/${selectedTirVideo}`}
                                    className="w-full h-full object-contain relative z-10"
                                    muted
                                    preload="metadata"
                                    controls={false} // 항상 비활성화, 별도 컨트롤러 사용
                                    onError={(e) => console.error('TIR 비디오 로드 오류:', e)}
                                    onLoadStart={() => console.log('TIR 비디오 로드 시작:', selectedTirVideo)}
                                    onLoadedData={() => console.log('TIR 비디오 로드 완료:', selectedTirVideo)}
                                />
                                {isAnalyzing && tirFrame && (
                                    <div className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none">
                                        <img 
                                            src={`data:image/jpeg;base64,${tirFrame}`} 
                                            alt="TIR Analysis Result" 
                                            className="w-full h-full object-contain opacity-80"
                                        />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                TIR 영상을 선택해주세요
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-30">
                            TIR {isAnalyzing && '(분석 중)'}
                        </div>
                    </div>
                </div>

                {/* 분석 중일 때만 비디오 컨트롤러 표시 */}
                {isAnalyzing && (
                    <div className="mt-4 p-4 bg-gray-700 rounded-lg space-y-3">
                        <h4 className="text-md font-semibold text-white mb-2">비디오 컨트롤러</h4>
                        <div className="flex items-center space-x-2">
                            <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={duration || 0}
                                value={currentTime}
                                onChange={handleSeek}
                                className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                style={{
                                    background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${(currentTime / (duration || 1)) * 100}%, #4b5563 ${(currentTime / (duration || 1)) * 100}%, #4b5563 100%)`
                                }}
                            />
                            <span className="text-white text-sm font-mono">{formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center justify-center space-x-4">
                            <button 
                                onClick={handlePlayPause} 
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
                            >
                                <span>{isPlaying ? '⏸️' : '▶️'}</span>
                                <span>{isPlaying ? '일시정지' : '재생'}</span>
                            </button>
                            <div className="flex items-center space-x-2">
                                <span className="text-gray-300 text-sm">속도:</span>
                                <select
                                    value={playbackRate}
                                    onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                                    className="px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value={0.25}>0.25x</option>
                                    <option value={0.5}>0.5x</option>
                                    <option value={1}>1x</option>
                                    <option value={1.5}>1.5x</option>
                                    <option value={2}>2x</option>
                                </select>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400 text-center space-y-1">
                            <p>분석 중인 영상에 대한 재생 제어가 가능합니다. 분석 결과는 실시간으로 오버레이됩니다.</p>
                            <p className="font-mono">
                                상태: {isPlaying ? '재생 중' : '일시정지'} | 
                                시간: {formatTime(currentTime)} / {formatTime(duration)} | 
                                속도: {playbackRate}x
                            </p>
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