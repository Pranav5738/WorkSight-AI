#!/usr/bin/env node
/*
  Cross-platform launcher for frontend (Vite) + backend (FastAPI) without relying on cmd.exe or concurrently.
  Features:
    - Auto install Frontend deps if missing
    - Checks/installs Python requirements (if pip available) once per run (cache file)
    - Graceful shutdown on Ctrl+C
*/
const { spawn } = require('node:child_process');
const { existsSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const FRONTEND_DIR = join(process.cwd(), 'Frontend');
const BACKEND_DIR = join(process.cwd(), 'Backend');

// -------------------- CLI ARG PARSING --------------------
// Supported flags (mirrors previous PowerShell script capability):
//   --no-frontend            Skip starting the frontend
//   --no-backend             Skip starting the backend
//   --frontend-port <port>   Override Vite dev server port (default 5173)
//   --backend-port <port>    Override FastAPI port (default 8000)
//   -h | --help              Show usage

const argv = process.argv.slice(2);
let runFrontend = true;
let runBackend = true;
let frontendPort = '5173';
let backendPort = '8000';

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  switch (a) {
    case '--no-frontend': runFrontend = false; break;
    case '--no-backend': runBackend = false; break;
    case '--frontend-port': frontendPort = argv[++i] || frontendPort; break;
    case '--backend-port': backendPort = argv[++i] || backendPort; break;
    case '-h':
    case '--help':
      console.log(`Usage: node scripts/dev.js [options]\n\nOptions:\n  --no-frontend             Skip starting Vite\n  --no-backend              Skip starting FastAPI\n  --frontend-port <port>    Vite dev server port (default 5173)\n  --backend-port <port>     FastAPI uvicorn port (default 8000)\n  -h, --help                Show this help\n`);
      process.exit(0);
    default:
      if (a.startsWith('-')) console.warn(`[WARN] Unknown flag: ${a}`);
  }
}

const processes = [];
function log(scope, msg) { console.log(`[${scope}] ${msg}`); }

function run(name, command, args, options = {}) {
  log(name, `Starting: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: false, ...options });
  processes.push({ name, child });
  child.on('exit', (code) => log(name, `Exited with code ${code}`));
  child.on('error', (err) => log(name, `Error: ${err.message}`));
  return child;
}

async function ensureFrontendDeps() {
  if (!existsSync(join(FRONTEND_DIR, 'node_modules'))) {
    log('SETUP', 'Installing Frontend dependencies (first run)...');
    await new Promise((res, rej) => {
      const p = spawn('npm', ['install'], { cwd: FRONTEND_DIR, stdio: 'inherit' });
      p.on('exit', (c) => c === 0 ? res() : rej(new Error('Frontend npm install failed')));
      p.on('error', rej);
    });
  }
}

async function ensureBackendDeps() {
  if (!existsSync(BACKEND_DIR)) { log('BACKEND', 'Backend directory missing; skipping.'); return false; }
  const marker = join(BACKEND_DIR, '.deps_installed');
  if (existsSync(marker)) return true;
  if (!existsSync(join(BACKEND_DIR, 'requirements.txt'))) { log('BACKEND', 'No requirements.txt; skipping install.'); return true; }
  log('SETUP', 'Installing backend Python dependencies...');
  await new Promise((res, rej) => {
    const p = spawn('python', ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: BACKEND_DIR, stdio: 'inherit' });
    p.on('exit', (c) => c === 0 ? res() : rej(new Error('Backend pip install failed')));
    p.on('error', rej);
  });
  writeFileSync(marker, new Date().toISOString());
  return true;
}

(async () => {
  try {
    if (runFrontend) await ensureFrontendDeps();
    if (runBackend) await ensureBackendDeps();
  } catch (e) {
    log('ERROR', e.message);
    process.exit(1);
  }

  if (runFrontend) {
    // Frontend (Vite) — run the JS entry directly with Node to avoid any *.cmd wrappers
    const viteEntry = join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
    if (existsSync(viteEntry)) {
      log('FRONTEND', `Launching Vite via Node on port ${frontendPort}: ${viteEntry}`);
      const args = [viteEntry, '--port', frontendPort];
      const child = run('FRONTEND', process.execPath, args, { cwd: FRONTEND_DIR });
      child.on('exit', (code) => { if (code !== 0) log('FRONTEND', `Vite exited non‑zero (${code}).`); });
    } else {
      log('FRONTEND', 'vite.js not found. Dependencies may be missing. Skipping frontend start. Run "npm install" inside Frontend manually.');
    }
  }

  if (runBackend) {
    // Backend (FastAPI via uvicorn)
    if (existsSync(join(BACKEND_DIR, 'main.py'))) {
      const venvPy = process.platform === 'win32'
        ? join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
        : join(BACKEND_DIR, '.venv', 'bin', 'python');
      const pythonCmd = existsSync(venvPy) ? venvPy : 'python';
      log('BACKEND', `Using Python interpreter: ${pythonCmd} (port ${backendPort})`);
      run('BACKEND', pythonCmd, ['-m', 'uvicorn', 'main:app', '--reload', '--port', backendPort], { cwd: BACKEND_DIR });
    } else {
      log('BACKEND', 'main.py not found; skipping backend launch');
    }
  }

  function shutdown() {
    log('CTRL', 'Shutting down child processes...');
    processes.forEach(({ child }) => { try { child.kill('SIGINT'); } catch (_) {} });
    setTimeout(() => process.exit(0), 500);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
