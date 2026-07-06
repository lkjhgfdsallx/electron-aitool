/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
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
        paths: {
          '@renderer/*': ['./src/*'],
          '@/*': ['./src/*'],
        },
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
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
