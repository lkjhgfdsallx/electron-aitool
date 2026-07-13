/**
 * Jest 测试专用类型声明
 *
 * 此文件仅在 jest 测试环境中生效（通过 jest.config.js 的 ts-jest tsconfig
 * 隐式包含 src/**/__tests__/** 下的文件）。
 *
 * 作用：为测试环境补充 window.electronAPI 的类型，避免 TS2339 错误。
 *
 * 注意：不能直接引用 src/types/electron.d.ts，因为它会从 electron/preload/index.ts
 * 导入 ElectronAPI 接口，而该文件 `import ... from 'electron'`，在 jest 环境下
 * electron 模块不可用会导致编译失败。这里用最小化的 any 类型声明替代，
 * 测试中对 electronAPI 的具体行为通过各测试文件内的 mock 精确控制。
 */

interface Window {
  electronAPI?: any
}
