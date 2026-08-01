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
    // 使用 cmd /c 执行 chcp，确保当前进程的控制台代码页被修改
    // 注意：这只影响当前 cmd 会话，不影响 spawn 创建的子进程
    execSync('chcp 65001 > NUL', { stdio: 'ignore', shell: true });
  } catch {
    // ignore
  }
}

const env = {
  ...process.env,
  PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
  // Windows: 设置 NODE_OPTIONS 确保子进程使用 UTF-8
  ...(isWin ? { NODE_OPTIONS: '--no-warnings' } : {}),
};

if (!isWin) {
  env.LANG = process.env.LANG || 'C.UTF-8';
  env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
}

// Windows: 使用 cmd /c chcp 65001 && command 确保子进程在 UTF-8 环境下运行
let command, args;
if (isWin) {
  // 关键修复：在同一个 cmd 会话中先执行 chcp 65001，再执行 npx
  // 这样 npx 及其子进程都会继承 UTF-8 代码页
  command = 'cmd.exe';
  args = ['/c', 'chcp 65001 >NUL 2>&1 && npx electron-vite dev'];
} else {
  command = 'npx';
  args = ['electron-vite', 'dev'];
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false, // 已经通过 cmd /c 处理，不需要额外 shell
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
