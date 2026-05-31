// Cross-platform dev launcher that clears ELECTRON_RUN_AS_NODE
// VSCode sets this env var because it's an Electron app, but it prevents
// our Electron app from initializing properly.
const { spawn } = require('child_process');

// Clear the problematic env var
delete process.env.ELECTRON_RUN_AS_NODE;

const isWin = process.platform === 'win32';
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
  cwd: __dirname
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
