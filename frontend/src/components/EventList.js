// /frontend/src/components/EventList.js

import React from 'react';

const EventList = React.memo(({ events, onRefresh }) => (
    <div className="mt-6 card p-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">탐지 이벤트 목록 (최신 50개)</h2>
            <button 
                onClick={onRefresh} 
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
                새로고침
            </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* 데이터가 비어있거나 없을 경우를 대비한 처리 */}
            {!events || events.length === 0 ? (
                <p className="col-span-full text-center text-gray-400">저장된 이벤트가 없습니다.</p>
            ) : (
                events.map(event => (
                    <div key={event.id} className="event-item bg-gray-800 rounded-lg p-3 flex flex-col justify-between transition-transform hover:scale-105">
                        <div>
                            <img 
                                src={`/events/${event.thumbnail_path}`} 
                                alt="Event Thumbnail" 
                                className="w-full h-40 object-cover rounded-md mb-3" 
                            />
                            <h4 className="font-bold text-lg">
                                {event.detected_object} 
                                <span className="text-base font-normal text-gray-300">({event.confidence}%)</span>
                            </h4>
                            <p className="text-sm text-gray-400 mt-1">
                                <span className="font-semibold">카메라:</span> {event.camera_name || `카메라 ${event.camera_id}`} ({event.location || 'N/A'})
                            </p>
                            <p className="text-sm text-gray-400">
                                <span className="font-semibold">발생 시각:</span> {event.timestamp}
                            </p>
                            <p className="text-sm text-gray-400">
                                <span className="font-semibold">근무자:</span> {event.user_name || 'N/A'}
                            </p>
                        </div>
                        <div className="mt-3 flex space-x-2">
                            <a 
                                href={`/events/${event.video_path_rgb}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex-1 text-center text-sm bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-3 rounded"
                            >
                                RGB 영상
                            </a>
                            <a 
                                href={`/events/${event.video_path_tid}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex-1 text-center text-sm bg-orange-600 hover:bg-orange-700 text-white py-2 px-3 rounded"
                            >
                                TID 영상
                            </a>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
));

export default EventList;