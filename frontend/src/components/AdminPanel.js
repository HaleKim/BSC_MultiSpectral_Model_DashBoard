// /frontend/src/components/AdminPanel.js (수정된 최종본)

import React, { useState, useEffect, useCallback } from 'react';
import { getAllUsers, addUser, deleteUser, getAllCameras, addCamera, deleteCamera, getModels, getDefaultModel, setDefaultModel } from '../services/api';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFullName, setNewFullName] = useState('');
    const [newRank, setNewRank] = useState('');
    const [newRole, setNewRole] = useState('USER');
    const [cameras, setCameras] = useState([]);
    const [newCamId, setNewCamId] = useState('');
    const [newCamName, setNewCamName] = useState('');
    const [newCamSource, setNewCamSource] = useState('');
    const [newCamLocation, setNewCamLocation] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    
    // 모델 관리 상태
    const [availableModels, setAvailableModels] = useState([]);
    const [currentDefaultModel, setCurrentDefaultModel] = useState('');
    const [isModelsLoading, setIsModelsLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            const response = await getAllUsers();
            setUsers(response.data);
        } catch (err) {
            setMessage({ type: 'error', text: '사용자 목록 로딩 실패' });
        }
    }, []);

    const fetchCameras = useCallback(async () => {
        try {
            const response = await getAllCameras();
            setCameras(response.data);
        } catch (err) {
            setMessage({ type: 'error', text: '카메라 목록 로딩 실패' });
        }
    }, []);

    const fetchModels = useCallback(async () => {
        setIsModelsLoading(true);
        try {
            const [modelsResponse, defaultModelResponse] = await Promise.all([
                getModels(),
                getDefaultModel()
            ]);
            
            setAvailableModels(modelsResponse.data);
            
            // settings.json에서 현재 기본 모델 가져오기
            const defaultModel = defaultModelResponse.data.default_model;
            setCurrentDefaultModel(defaultModel);
            
            // localStorage도 동기화
            localStorage.setItem('selectedLiveModel', defaultModel);
            
            console.log('settings.json에서 기본 모델 로드:', defaultModel);
        } catch (err) {
            setMessage({ type: 'error', text: '모델 정보 로딩 실패' });
        } finally {
            setIsModelsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
        fetchCameras();
        fetchModels();
    }, [fetchUsers, fetchCameras, fetchModels]);

    const handleAddUser = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        const newUser = { 
            username: newUsername, 
            password: newPassword, 
            full_name: newFullName, 
            rank: newRank, 
            role: newRole 
        };
        
        try {
            const response = await addUser(newUser);
            setMessage({ type: 'success', text: response.data.message });
            fetchUsers();
            setNewUsername(''); setNewPassword(''); setNewFullName(''); setNewRank(''); setNewRole('USER');
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || '서버 통신 오류' });
        }
    };

    const handleDeleteUser = async (user) => {
        if (window.confirm(`정말로 '${user.username}' 사용자를 삭제하시겠습니까?`)) {
            try {
                const response = await deleteUser(user.id);
                setMessage({ type: 'success', text: response.data.message });
                fetchUsers();
            } catch (err) {
                setMessage({ type: 'error', text: err.response?.data?.error || '서버 통신 오류' });
            }
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchCameras();
    }, [fetchUsers, fetchCameras]);

    const handleAddCamera = async (e) => {
        e.preventDefault();
        const newCamera = { 
            id: newCamId, 
            camera_name: newCamName, 
            source: newCamSource, 
            location: newCamLocation 
        };
        try {
            const response = await addCamera(newCamera);
            setMessage({ type: 'success', text: response.data.message });
            fetchCameras();
            setNewCamId(''); setNewCamName(''); setNewCamSource(''); setNewCamLocation('');
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || '카메라 추가 실패' });
        }
    };

    const handleDeleteCamera = async (cam) => {
        if (window.confirm(`정말로 '${cam.camera_name}' 카메라를 삭제하시겠습니까?`)) {
            try {
                const response = await deleteCamera(cam.id);
                setMessage({ type: 'success', text: response.data.message });
                fetchCameras();
            } catch (err) {
                setMessage({ type: 'error', text: err.response?.data?.error || '카메라 삭제 실패' });
            }
        }
    };

    const handleModelChange = async (newModel) => {
        try {
            setIsModelsLoading(true);
            
            // 백엔드 서버 설정 파일 업데이트
            await setDefaultModel(newModel);
            
            // localStorage에 새 모델 저장 (프론트엔드 동기화)
            localStorage.setItem('selectedLiveModel', newModel);
            setCurrentDefaultModel(newModel);
            
            setMessage({ type: 'success', text: `기본 모델이 '${newModel}'로 변경되었습니다. 새 스트림에서 적용됩니다.` });
            console.log('실시간 감시 기본 모델 변경:', newModel);
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || '모델 변경 실패' });
        } finally {
            setIsModelsLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 사용자 관리 패널 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-white">사용자 관리</h2>
                
                <form onSubmit={handleAddUser} className="mb-6 bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2 text-white">신규 사용자 추가</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg" placeholder="아이디" required />
                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg" type="password" placeholder="비밀번호" required />
                        <input value={newFullName} onChange={e => setNewFullName(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg" placeholder="이름" required />
                        <input value={newRank} onChange={e => setNewRank(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg" placeholder="계급/직책" />
                        <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg">
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                        </select>
                        <button type="submit" className="w-full px-4 py-2 font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 col-span-2">추가</button>
                    </div>
                    {message.text && <p className={`mt-2 text-sm ${message.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>{message.text}</p>}
                </form>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-white">
                        <thead>
                            <tr className="border-b border-gray-600">
                                <th className="p-2">아이디</th>
                                <th className="p-2">이름</th>
                                <th className="p-2">계급/직책</th>
                                <th className="p-2">역할</th>
                                <th className="p-2">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-700">
                                    <td className="p-2">{user.username}</td>
                                    <td className="p-2">{user.full_name}</td>
                                    <td className="p-2">{user.rank}</td>
                                    <td className="p-2">{user.role}</td>
                                    <td className="p-2">
                                        <button onClick={() => handleDeleteUser(user)}
                                            className="text-red-500 hover:text-red-400 text-sm"
                                            disabled={user.username === 'admin'}>
                                            삭제
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 카메라 관리 패널 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-white">카메라 관리</h2>
                
                <form onSubmit={handleAddCamera} className="mb-6 bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">신규 카메라 추가</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input value={newCamId} onChange={e => setNewCamId(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 rounded-lg" placeholder="ID (예: 0)" required />
                        <input value={newCamName} onChange={e => setNewCamName(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 rounded-lg" placeholder="카메라 이름 (예: 웹캠 1)" required />
                        <input value={newCamSource} onChange={e => setNewCamSource(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 rounded-lg" placeholder="소스 (예: 0 또는 URL)" required />
                        <input value={newCamLocation} onChange={e => setNewCamLocation(e.target.value)} className="w-full px-3 py-2 text-white bg-gray-600 rounded-lg" placeholder="위치 (예: 개발실)" />
                        <button type="submit" className="w-full px-4 py-2 font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 col-span-2">추가</button>
                    </div>
                </form>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-white">
                        <thead className="border-b border-gray-600">
                            <tr>
                                <th className="p-2">ID</th>
                                <th className="p-2">이름</th>
                                <th className="p-2">소스</th>
                                <th className="p-2">위치</th>
                                <th className="p-2">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cameras.map(cam => (
                                <tr key={cam.id} className="border-b border-gray-700 hover:bg-gray-700">
                                    <td className="p-2">{cam.id}</td>
                                    <td className="p-2">{cam.camera_name}</td>
                                    <td className="p-2">{cam.source}</td>
                                    <td className="p-2">{cam.location}</td>
                                    <td className="p-2">
                                        <button onClick={() => handleDeleteCamera(cam)} className="text-red-500 hover:text-red-400 text-sm">삭제</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* AI 모델 관리 패널 */}
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-white">AI 모델 관리</h2>
                
                <div className="mb-6 bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-3 text-white">실시간 감시 기본 모델</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                현재 기본 모델
                            </label>
                            <div className="px-3 py-2 bg-gray-600 rounded-lg text-cyan-400 font-mono text-sm">
                                {currentDefaultModel || '로딩 중...'}
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                새 기본 모델 선택
                            </label>
                            <select
                                onChange={(e) => handleModelChange(e.target.value)}
                                disabled={isModelsLoading}
                                className="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                value=""
                            >
                                <option value="">모델을 선택하세요</option>
                                {availableModels.map((model) => (
                                    <option key={model} value={model}>
                                        {model}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {message.text && (
                            <p className={`text-sm ${message.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                                {message.text}
                            </p>
                        )}
                    </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-md font-semibold mb-3 text-white">사용 가능한 모델 목록</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {isModelsLoading ? (
                            <div className="text-gray-400 text-sm">모델 목록을 불러오는 중...</div>
                        ) : availableModels.length > 0 ? (
                            availableModels.map((model) => (
                                <div
                                    key={model}
                                    className={`px-3 py-2 rounded text-sm font-mono ${
                                        model === currentDefaultModel
                                            ? 'bg-cyan-600 text-white'
                                            : 'bg-gray-600 text-gray-300'
                                    }`}
                                >
                                    {model}
                                    {model === currentDefaultModel && (
                                        <span className="ml-2 text-xs">(현재 기본)</span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-400 text-sm">사용 가능한 모델이 없습니다.</div>
                        )}
                    </div>
                    <div className="mt-3 text-xs text-gray-400">
                        <p>총 {availableModels.length}개 모델 사용 가능</p>
                        <p>모델 변경 시 즉시 실시간 감시에 적용됩니다.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;