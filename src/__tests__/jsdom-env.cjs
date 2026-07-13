/**
 * 自定义 Jest 测试环境（基于 jest-environment-jsdom）
 *
 * 解决问题：jest-environment-jsdom 在初始化时会加载 jsdom，而 jsdom 内部
 * 通过 require.resolve("canvas") + require("canvas") 可选加载 canvas 包以
 * 增强 HTMLCanvasElement。这些 require 发生在 jest 的 moduleNameMapper
 * 作用范围之外（环境自身的 require 上下文），因此 moduleNameMapper 无法拦截。
 *
 * 当 canvas 的 native 构建产物 build/Release/canvas.node 缺失时（Windows +
 * pnpm hoisted 下常见），require("canvas") 直接抛出 Cannot find module，
 * 导致所有使用 jsdom 的测试套件无法运行。
 *
 * 本环境在 setup 阶段通过 Module._load 钩子拦截对 'canvas' 的 require，
 * 返回空对象，使 jsdom 检测到 canvas 不提供 createCanvas 后跳过增强。
 *
 * 用法：在 jest.config.js 中设置 testEnvironment: '<rootDir>/src/__tests__/jsdom-env.cjs'
 */

const Module = require('module')

// 保存原始 _load
const originalLoad = Module._load

// 标记是否已安装钩子，避免重复安装
if (!Module._canvasPatchInstalled) {
  Module._canvasPatchInstalled = true
  Module._load = function patchedLoad(request, parent, isMain) {
    // 拦截对 'canvas' 的 require（jsdom 内部 require 无法被 jest moduleNameMapper 拦截）
    // 只拦截裸 'canvas'，不影响 'canvas/...' 子路径
    if (request === 'canvas') {
      // 返回空对象：jsdom 会检查 typeof Canvas.createCanvas === 'function'，
      // 不满足则不使用 canvas 增强，安全跳过。
      return {}
    }
    return originalLoad.apply(this, arguments)
  }
}

// jest-environment-jsdom 的入口是 webpack 打包的 CJS bundle，
// module.exports 是 __webpack_exports__ 对象，含 default 和 TestEnvironment。
const envModule = require('jest-environment-jsdom')
const JsdomEnvironment = envModule.default || envModule.TestEnvironment || envModule

module.exports = JsdomEnvironment
