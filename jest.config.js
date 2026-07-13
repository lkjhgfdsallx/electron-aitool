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
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        target: 'ES2020',
        moduleResolution: 'node',
        skipLibCheck: true,
        strict: true,
        types: ['jest', 'node'],
        // window.electronAPI 类型通过 src/env.d.ts 的 Window
        // interface 合并提供（any 兜底），详见 env.d.ts 第 13 行
        paths: {
          '@renderer/*': ['./src/*'],
          '@/*': ['./src/*'],
        },
        // 显式引入 env.d.ts，确保 coverage collector 编译
        // collectCoverageFrom 中的文件时也能解析 Window interface 增强
        typeRoots: ['./node_modules/@types', './src'],
      },
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
    'src/services/agent-engine.ts': {
      branches: 68,
      functions: 76,
      lines: 78,
      statements: 76,
    },
    'src/hooks/use-chat.ts': {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
};
