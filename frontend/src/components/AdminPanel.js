// /frontend/src/components/AdminPanel.js (수정된 최종본)

import React, { useState, useEffect, useCallback } from 'react';
import { getAllUsers, addUser, deleteUser, getAllCameras, addCamera, deleteCamera } from '../services/api';

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

    useEffect(() => {
        fetchUsers();
        fetchCameras();
    }, [fetchUsers, fetchCameras]);

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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        </div>
    );
};

export default AdminPanel;