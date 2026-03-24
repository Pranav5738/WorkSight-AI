import { Moon, Sun, LogOut, User, CameraOff, Camera } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { isBackendConfigured } from '../lib/api/http';
import { useCameraAccess } from '../contexts/CameraAccessContext';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { username, logout } = useAuth();
  const backend = isBackendConfigured();
  const { enabled: camEnabled, toggle: toggleCam } = useCameraAccess();

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              CONTEXA VISION
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide ${backend ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{backend ? 'BACKEND' : 'SUPABASE'}</span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Secure Attendance & Threat Monitoring</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCam}
              className={`p-2 rounded-lg transition-colors ${camEnabled ? 'bg-green-100 dark:bg-green-700/40' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}
              aria-label={camEnabled ? 'Disable camera access' : 'Enable camera access'}
              title={camEnabled ? 'Click to disable all camera feeds' : 'Click to enable camera feeds'}
            >
              {camEnabled ? <Camera className="w-5 h-5 text-green-600 dark:text-green-300" /> : <CameraOff className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
            </button>
            {camEnabled && (
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px] font-medium tracking-wide">CAM ON</span>
            )}
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            ) : (
              <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            )}
          </button>

          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-slate-700 rounded-lg">
            <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{username}</span>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
