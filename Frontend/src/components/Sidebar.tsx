import { LayoutDashboard, Users, UserPlus, Cog, CheckCircle, UserCheck, Server, Activity, ClipboardList } from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

// Navigation items (Matches removed)
const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: CheckCircle },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'enroll', label: 'Enroll', icon: UserPlus },
  { id: 'recognized', label: 'Recognized', icon: UserCheck },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'manager', label: 'Manager', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Cog },
  { id: 'system', label: 'System', icon: Server }
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 h-full flex flex-col">
      <div className="px-4 pt-6 pb-4">
        <h2 className="text-sm font-semibold tracking-wide text-blue-600 dark:text-blue-400">CONTEXA VISION</h2>
      </div>
      <nav className="flex-1 px-4 pb-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-6 border-t border-gray-200 dark:border-slate-700">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-700 dark:to-slate-600 rounded-lg p-4">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">System Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300">Security</span>
              <span className="px-2 py-1 bg-green-500 text-white rounded-full font-medium">Active</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300">Cameras</span>
              <span className="px-2 py-1 bg-green-500 text-white rounded-full font-medium">Online</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
