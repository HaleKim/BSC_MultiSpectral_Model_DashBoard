// /frontend/src/components/TestModePanel.js (수정된 최종본)

import React, { useState, useEffect } from 'react';
import { getTestVideos } from '../services/api';
import { sendEvent, subscribeToEvent, unsubscribeFromEvent } from '../services/socket';
import VideoStream from './VideoStream';

const TestModePanel = () => {
    const [testVideos, setTestVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [testFrame, setTestFrame] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchVideos = async () => {
            setIsLoading(true);
            try {
                const { data } = await getTestVideos();
                setTestVideos(data);
                if (data.length > 0) {
                    setSelectedVideo(data[0]);
                }
            } catch (error) {
                console.error("테스트 비디오 목록 로딩 실패:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchVideos();

        // 시험 영상 프레임 수신 구독
        subscribeToEvent('video_frame', (data) => {
            if (data.camera_id === 'test_video') {
                setTestFrame(data.image);
            }
        });

        return () => {
            unsubscribeFromEvent('video_frame');
            // 컴포넌트 언마운트 시 스트리밍 중지
            if (isStreaming) {
                sendEvent('stop_stream', { camera_id: 'test_video' });
            }
        }
    }, [isStreaming]);

    const handleStartTest = () => {
        if (selectedVideo) {
            setTestFrame(null); // 분석 시작 시 이전 프레임 초기화
            setIsStreaming(true);
            sendEvent('start_test_stream', { filename: selectedVideo });
        }
    };
    
    return (
        <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-2 text-white">시험 영상 선택</h3>
                <div className="flex space-x-2">
                    <select 
                        value={selectedVideo} 
                        onChange={(e) => setSelectedVideo(e.target.value)}
                        className="w-full px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <option>목록을 불러오는 중...</option>
                        ) : testVideos.length > 0 ? (
                            testVideos.map((video) => (
                                <option key={video} value={video}>{video}</option>
                            ))
                        ) : (
                            <option>사용 가능한 영상이 없습니다.</option>
                        )}
                    </select>
                    <button onClick={handleStartTest} className="px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700">
                        분석 시작
                    </button>
                </div>
            </div>
            {/* 수정: VideoStream에 프레임 데이터와 스트리밍 상태 전달 */}
            <VideoStream title="시험 영상 분석 결과 (RGB/TIR)" frameData={testFrame} isStreaming={isStreaming} />
        </div>
    );
};

export default TestModePanel;