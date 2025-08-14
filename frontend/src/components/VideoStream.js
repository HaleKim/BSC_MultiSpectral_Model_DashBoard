// /frontend/src/components/VideoStream.js

import React from 'react';

const VideoStream = ({ title, frameData, isStreaming, onStreamClick, personDetected = false }) => {
  const borderColor = personDetected ? 'border-red-500' : 'border-cyan-500';

  // 디버깅 정보 (백엔드 호환성을 위해 추가)
  const debugInfo = {
    hasFrameData: !!frameData,
    frameDataLength: frameData ? frameData.length : 0,
    isStreaming,
    personDetected
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg cursor-pointer" onClick={onStreamClick}>
      <h2 className="text-xl font-semibold mb-2 text-white">{title}</h2>

      {/* 디버깅 정보 표시 (백엔드 호환성을 위해 추가) */}
      <div className="mb-2 text-xs text-gray-400 bg-gray-700 p-2 rounded">
        <p>스트리밍: {isStreaming ? '활성' : '비활성'}</p>
        <p>프레임 데이터: {debugInfo.hasFrameData ? '있음' : '없음'} ({debugInfo.frameDataLength} chars)</p>
        <p>탐지 상태: {personDetected ? '탐지됨' : '탐지 안됨'}</p>
      </div>

      <div
        className={`relative bg-black rounded-md aspect-video flex items-center justify-center border-2 ${borderColor}`}
      >
        {frameData ? (
          <img
            src={`data:image/jpeg;base64,${frameData}`}
            alt="Video Stream"
            className="w-full h-auto object-contain"
            onLoad={() => console.log(`${title} 이미지 로드 완료`)}
            onError={(e) => console.error(`${title} 이미지 로드 실패:`, e)}
          />
        ) : (
          <div className="text-center">
            <p className="text-gray-500 mb-2">
              {isStreaming ? "서버로부터 영상 수신 대기 중..." : "스트리밍이 중지되었습니다."}
            </p>
            <p className="text-xs text-gray-600">
              프레임 데이터: {debugInfo.hasFrameData ? '수신됨' : '수신 안됨'}
            </p>
          </div>
        )}

        {/* 오른쪽 아래 "전체보기" 버튼만 카드 안에서 띄움 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // 부모 클릭 이벤트 방지
            onStreamClick();
          }}
          className="absolute bottom-2 right-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
        >
          전체보기
        </button>
      </div>
    </div>
  );
};

export default VideoStream;