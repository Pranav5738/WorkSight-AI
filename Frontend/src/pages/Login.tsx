import { useState } from 'react';
import { Shield, AlertCircle, User, Lock, Eye, EyeOff, Loader2, Sparkles, Fingerprint, ScanFace, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const securityPillars = [
  {
    title: 'Biometric Detection',
    detail: 'Live AI identity checks with confidence scoring.',
    icon: ScanFace,
  },
  {
    title: 'Encrypted Audit Trail',
    detail: 'Attendance events are tracked with tamper-resistant logs.',
    icon: Fingerprint,
  },
  {
    title: 'Unified Data Layer',
    detail: 'One trusted source for employees, attendance, and alerts.',
    icon: Database,
  },
];

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(username, password);

    if (!success) {
      setError('Invalid credentials. Use 123 / 123');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12%] top-[-8%] h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl sm:h-96 sm:w-96" />
        <div className="absolute right-[-10%] top-[18%] h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl sm:h-96 sm:w-96" />
        <div className="absolute bottom-[-14%] left-[24%] h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl sm:h-[26rem] sm:w-[26rem]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:radial-gradient(circle_at_center,black_35%,transparent_85%)]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-[0_40px_90px_-30px_rgba(30,41,59,0.8)] backdrop-blur-2xl animate-scale-in lg:grid-cols-[1.05fr_1fr]">
          <aside className="hidden border-r border-white/10 bg-gradient-to-br from-indigo-600/18 via-blue-500/12 to-fuchsia-500/12 p-8 lg:block xl:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-200/10 px-3 py-1 text-[11px] font-medium tracking-wide text-indigo-100">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise Security Stack
            </div>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
              Built for teams that cannot afford blind spots.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-200/85 xl:text-[15px]">
              WorkSight AI secures access, tracks attendance in real time, and keeps operational visibility sharp across every site.
            </p>

            <div className="mt-8 space-y-3">
              {securityPillars.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-900/35 p-4 backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-xl border border-white/15 bg-indigo-400/15 p-2 text-indigo-100">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-300/90">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="p-6 sm:p-8 xl:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-2xl bg-indigo-500/45 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-700/40">
                <Shield className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-200/10 px-3 py-1 text-[11px] font-medium tracking-wide text-indigo-100">
              <Sparkles className="h-3.5 w-3.5" />
              Trusted AI Access
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-[2.05rem]">WorkSight AI</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-200/85">Security & Attendance Management</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" aria-describedby={error ? 'login-error' : undefined}>
            <div>
              <label htmlFor="username" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-200/90">
                Username
              </label>
              <div className="group relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-indigo-200" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/45 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-300/70 transition-all focus:border-indigo-300/75 focus:bg-slate-900/65 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.2)] focus:outline-none"
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-200/90">
                Password
              </label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-indigo-200" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/45 py-3 pl-11 pr-12 text-sm text-white placeholder:text-slate-300/70 transition-all focus:border-indigo-300/75 focus:bg-slate-900/65 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.2)] focus:outline-none"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-200/90">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/30 bg-slate-900/40 text-indigo-500 focus:ring-2 focus:ring-indigo-300"
                />
                Remember me
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="font-medium text-indigo-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Forgot password?
              </a>
            </div>

            {error && (
              <div id="login-error" role="alert" aria-live="polite" className="flex items-start gap-2 rounded-xl border border-rose-300/35 bg-rose-500/15 px-3 py-2.5 text-sm text-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 hover:shadow-[0_16px_36px_-16px_rgba(99,102,241,0.9)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              aria-busy={loading}
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-indigo-200/20 bg-indigo-300/10 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-100">Demo Credentials</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-indigo-50/95">
              <span className="rounded-lg bg-slate-900/40 px-3 py-2 font-medium">Username</span>
              <span className="rounded-lg bg-slate-900/40 px-3 py-2 font-mono">123</span>
              <span className="rounded-lg bg-slate-900/40 px-3 py-2 font-medium">Password</span>
              <span className="rounded-lg bg-slate-900/40 px-3 py-2 font-mono">123</span>
            </div>
            <p className="mt-2 text-[11px] text-indigo-100/80">Use demo access for evaluation environment only.</p>
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}
