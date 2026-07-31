// Cross-platform dev launcher that clears ELECTRON_RUN_AS_NODE
// VSCode sets this env var because it's an Electron app, but it prevents
// our Electron app from initializing properly.
const { spawn, execSync } = require('child_process');

// Clear the problematic env var
delete process.env.ELECTRON_RUN_AS_NODE;

const isWin = process.platform === 'win32';

// Windows: 将控制台代码页切到 UTF-8，避免主进程中文日志乱码
// （默认 CP936/GBK 会把 UTF-8 字节显示成「澶辫触」这类乱码）
if (isWin) {
  try {
    execSync('chcp 65001 > NUL', { stdio: 'ignore', windowsHide: true, shell: true });
  } catch {
    // ignore
  }
}

const env = {
  ...process.env,
  PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
};

if (!isWin) {
  env.LANG = process.env.LANG || 'C.UTF-8';
  env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
}

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: isWin,
  env,
  cwd: __dirname
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
