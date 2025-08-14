// src/services/socket.js
import { io } from 'socket.io-client';

let socket;

export const initSocket = () => {
  if (socket) return socket;
  
  // 환경변수가 없으면 기본값 사용
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  socket = io(apiUrl);

  socket.on('connect', () => {
    console.log('Socket.IO 서버에 연결되었습니다. ID:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO 서버 연결이 끊어졌습니다.');
    socket = null;
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO 연결 오류:', error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    console.log('Socket.IO 연결 해제 중...');
    socket.disconnect();
    socket = null;
  }
};

export const sendEvent = (eventName, data) => {
  if (socket && socket.connected) {
    console.log(`소켓 이벤트 전송: ${eventName}`, data);
    socket.emit(eventName, data);
  } else {
    console.warn('소켓이 연결되지 않았습니다. 이벤트 전송 실패:', eventName);
  }
};

export const subscribeToEvent = (eventName, callback) => {
  if (!socket) {
    console.warn('소켓이 초기화되지 않았습니다. initSocket()을 먼저 호출하세요.');
    return null;
  }

  console.log(`이벤트 구독: ${eventName}`);
  socket.on(eventName, callback);

  // 구독 해제 함수 반환
  return () => {
    console.log(`이벤트 구독 해제: ${eventName}`);
    socket.off(eventName, callback);
  };
};

export const unsubscribeFromEvent = (eventName, callback) => {
  if (!socket) return;
  
  console.log(`이벤트 구독 해제: ${eventName}`);
  socket.off(eventName, callback);
};

// 소켓 연결 상태 확인
export const isSocketConnected = () => {
  return socket && socket.connected;
};

// 소켓 인스턴스 반환 (디버깅용)
export const getSocket = () => {
  return socket;
};