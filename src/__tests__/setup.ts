/// <reference path="./jest-types.d.ts" />
/**
 * Jest 全局测试环境 setup
 *
 * 注意：此文件通过 jest.config.js 的 setupFiles 加载，
 * 在测试框架初始化之前执行，因此不能使用 expect 等 Jest 全局对象。
 * 如需 @testing-library/jest-dom 匹配器，应改用 setupFilesAfterEach。
 */

// 全局 mock：crypto.randomUUID（jsdom 环境可能不提供）
if (!globalThis.crypto) {
  ;(globalThis as unknown as { crypto: Record<string, unknown> }).crypto = {}
}
if (!globalThis.crypto.randomUUID) {
  ;(globalThis.crypto as { randomUUID: () => string }).randomUUID = () =>
    'test-uuid-' + Math.random().toString(36).slice(2, 11)
}

// requestAnimationFrame mock（StreamingBuffer 使用，jsdom 不提供）
if (!globalThis.requestAnimationFrame) {
  ;(globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ) => setTimeout(() => cb(Date.now()), 0) as unknown as number
}
if (!globalThis.cancelAnimationFrame) {
  ;(globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = (id: number) =>
    clearTimeout(id)
}
