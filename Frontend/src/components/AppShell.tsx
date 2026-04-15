import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Server,
  Shield,
  Sun,
  UserPlus,
  UserRound,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCameraAccess } from '../contexts/CameraAccessContext';
import { Button } from './ui/Button';
import { ModeBadge } from './ui/ModeBadge';

interface AppShellProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }]
  },
  {
    title: 'Operations',
    items: [
      { id: 'attendance', label: 'Attendance', icon: Camera },
      { id: 'monitoring', label: 'Monitoring', icon: Activity }
    ]
  },
  {
    title: 'Management',
    items: [
      { id: 'users', label: 'Users', icon: Users },
      { id: 'enroll', label: 'Enroll', icon: UserPlus },
      { id: 'manager', label: 'Manager', icon: ClipboardList }
    ]
  },
  {
    title: 'System',
    items: [
      { id: 'logs', label: 'Logs', icon: ClipboardList },
      { id: 'settings', label: 'Settings', icon: Cog },
      { id: 'system', label: 'System', icon: Server }
    ]
  }
];

function AppSidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onCloseMobile
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCloseMobile?: () => void;
}) {
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), []);
  const active = allItems.find((item) => item.id === currentPage);

  return (
    <aside
      className={[
        'flex h-full flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/65',
        collapsed ? 'w-[92px]' : 'w-[272px]'
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Contexa</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vision Suite</p>
            </div>
          )}
        </div>
        <Button variant="icon" onClick={onToggleCollapse} aria-label="Toggle sidebar">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-5 space-y-1">
            {!collapsed && (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile?.();
                  }}
                  title={item.label}
                  className={[
                    'group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70',
                    selected
                      ? 'border-blue-300/70 bg-blue-600 text-white shadow-sm dark:border-blue-500/40'
                      : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/70'
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                  {selected && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-white/90" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {collapsed ? active?.label : `Active: ${active?.label ?? 'Dashboard'}`}
      </div>
    </aside>
  );
}

export function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { username, logout } = useAuth();
  const { enabled: camEnabled, toggle: toggleCam } = useCameraAccess();

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/65 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100 md:text-base">AI Attendance Platform</h1>
            <ModeBadge />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="icon"
              onClick={toggleCam}
              title={camEnabled ? 'Disable all camera feeds' : 'Enable all camera feeds'}
              aria-label={camEnabled ? 'Disable camera access' : 'Enable camera access'}
            >
              {camEnabled ? <Camera className="h-4 w-4 text-emerald-500" /> : <CameraOff className="h-4 w-4" />}
            </Button>

            <Button variant="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>

            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 sm:flex">
              <UserRound className="h-3.5 w-3.5" />
              {username}
            </div>

            <Button variant="destructive" size="sm" onClick={logout} leadingIcon={<LogOut className="h-4 w-4" />}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <div className="hidden h-[calc(100vh-65px)] md:block">
          <AppSidebar
            currentPage={currentPage}
            onNavigate={onNavigate}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
          />
        </div>

        <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/50 md:hidden"
              aria-label="Close menu overlay"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 md:hidden"
            >
              <AppSidebar
                currentPage={currentPage}
                onNavigate={onNavigate}
                collapsed={false}
                onToggleCollapse={() => undefined}
                onCloseMobile={() => setMobileOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
