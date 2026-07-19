/**
 * Installs Electron's platform-specific binary after pnpm has installed packages.
 *
 * Electron is deliberately ignored by pnpm-workspace.yaml so its upstream
 * lifecycle script cannot run before this project applies mirror and TLS
 * compatibility settings. This keeps optional native dependencies such as
 * canvas out of the install path while still installing Electron normally.
 */

const { spawnSync } = require('child_process');
const path = require('path');

function resolveElectronInstallScript() {
  const packageJson = require.resolve('electron/package.json');
  return path.join(path.dirname(packageJson), 'install.js');
}

function runElectronInstaller() {
  const installScript = resolveElectronInstallScript();
  const env = {
    ...process.env,
    // Electron's installer only recognizes the uppercase form. Keep the
    // project mirror deterministic even when npm configuration is ignored.
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    // Some managed Windows networks replace TLS certificates without exposing
    // their root CA to Node.js. Electron's binary has an integrity checksum;
    // this setting allows the download while the checksum still guards content.
    NODE_TLS_REJECT_UNAUTHORIZED: '0'
  };

  const result = spawnSync(process.execPath, [installScript], {
    cwd: path.dirname(installScript),
    env,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  runElectronInstaller();
} catch (error) {
  console.error('[postinstall] Electron binary installation failed:', error.message);
  process.exit(1);
}
