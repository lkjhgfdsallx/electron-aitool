/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  // 使用自定义 jsdom 环境, 通过 Module._load 钩子拦截 canvas 模块,
  // 避免 native 构建产物 canvas.node 缺失导致所有测试套件无法运行
  testEnvironment: '<rootDir>/src/__tests__/jsdom-env.cjs',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@renderer/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // 使用测试专用 tsconfig，确保全局 Window 扩展（包括 electronAPI）
    // 被 ts-jest 的 TypeScript Program 正确加载。
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
    }],
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/services/agent-engine.ts',
    'src/hooks/use-chat.ts',
    'src/types/message.ts',
  ],
  coverageThreshold: {
    // 覆盖率基线基于当前完整测试集（238 个测试）校准；
    // 新增测试应保持或提高此基线。
    'src/services/agent-engine.ts': {
      branches: 61,
      functions: 74,
      lines: 72,
      statements: 70,
    },
    'src/hooks/use-chat.ts': {
      branches: 66,
      functions: 73,
      lines: 75,
      statements: 75,
    },
  },
};
