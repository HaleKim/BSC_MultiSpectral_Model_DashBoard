import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="bg-gray-900 text-white min-h-screen">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={<ProtectedRoute><MainPage /></ProtectedRoute>}
            />
            <Route
              path="/admin"
              element={<AdminRoute><AdminPage /></AdminRoute>}
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;