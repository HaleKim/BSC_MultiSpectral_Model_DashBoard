// /frontend/src/services/api.js (수정된 최종본)

import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- 인증 API ---
export const login = (username, password) => {
  return apiClient.post('/api/auth/login', { username, password });
};
export const getProfile = () => {
  return apiClient.get('/api/auth/profile');
};

// --- 데이터 API ---
export const getTestVideos = () => {
    return apiClient.get('/api/test_videos');
};
export const getEvents = () => {
  return apiClient.get('/api/events');
};
export const getModels = () => {
  return apiClient.get('/api/models');
};

export const getDefaultModel = () => {
  return apiClient.get('/api/default-model');
};

export const setDefaultModel = (model) => {
  return apiClient.post('/api/default-model', { model });
};

// --- 관리자 API ---
export const getAllUsers = () => {
    return apiClient.get('/api/users');
};

export const addUser = (userData) => {
    return apiClient.post('/api/users', userData);
};

export const deleteUser = (userId) => {
    return apiClient.delete(`/api/users/${userId}`);
};

export const getAllCameras = () => {
    return apiClient.get('/api/cameras');
};

export const addCamera = (cameraData) => {
    return apiClient.post('/api/cameras', cameraData);
};

export const deleteCamera = (cameraId) => {
    return apiClient.delete(`/api/cameras/${cameraId}`);
};