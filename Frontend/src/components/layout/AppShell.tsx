import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '../Header';
import { Sidebar } from '../Sidebar';
import { GlobalErrorBanner } from '../GlobalErrorBanner';

export function AppShell() {
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    // Keep route shell synchronized with non-router page state if this shell is reused.
    if (location.pathname.includes('attendance')) setCurrentPage('attendance');
    else if (location.pathname.includes('users')) setCurrentPage('users');
    else if (location.pathname.includes('enroll')) setCurrentPage('enroll');
    else if (location.pathname.includes('settings')) setCurrentPage('settings');
    else if (location.pathname.includes('system')) setCurrentPage('system');
    else if (location.pathname.includes('monitoring')) setCurrentPage('monitoring');
    else if (location.pathname.includes('manager')) setCurrentPage('manager');
    else setCurrentPage('dashboard');
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-transparent text-slate-900 dark:text-slate-100">
      <GlobalErrorBanner />
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
