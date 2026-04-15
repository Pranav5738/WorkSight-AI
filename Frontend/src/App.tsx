import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CameraAccessProvider } from './contexts/CameraAccessContext';
import { Login } from './pages/Login';
import Dashboard from './pages/Dashboard';
import { AttendanceSystem } from './pages/AttendanceSystem';
import { SystemLogs } from './pages/SystemLogs';
// Users management page
import { UsersPage } from './pages/Users';
import { EnrollPage } from './pages/Enroll';
const RecognizedPage = () => <div className="p-6 text-gray-900 dark:text-white">Recognized (placeholder)</div>;
import { Settings } from './pages/Settings';
import { System } from './pages/System';
import MonitoringPage from './pages/Monitoring';
import ManagerPage from './pages/Manager';
import { AppShell } from './components/AppShell';
import { GlobalErrorBanner } from './components/GlobalErrorBanner';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'attendance':
        return <AttendanceSystem />;
      // 'matches' route removed
      case 'users':
        return <UsersPage />;
      case 'enroll':
        return <EnrollPage />;
      // intruder route removed
      case 'recognized':
        return <RecognizedPage />;
      case 'settings':
        return <Settings />;
      case 'system':
        return <System />;
      case 'monitoring':
        return <MonitoringPage />;
      case 'manager':
        return <ManagerPage />;
      case 'logs':
        return <SystemLogs />; // legacy logs path kept for backward compatibility
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen">
      <GlobalErrorBanner />
      <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>{renderPage()}</AppShell>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CameraAccessProvider>
          <AppContent />
        </CameraAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
