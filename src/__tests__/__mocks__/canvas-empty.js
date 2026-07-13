/**
 * canvas 空模块 mock
 *
 * jsdom 会尝试可选加载 canvas 包以增强 HTMLCanvasElement，
 * 但在测试环境（尤其 Windows + pnpm hoisted）下 canvas 的 native
 * 构建产物 build/Release/canvas.node 经常缺失，导致所有测试套件无法运行。
 *
 * 通过 jest moduleNameMapper 将 'canvas' 指向此空模块，
 * jsdom 检测到 canvas 不提供 createCanvas 等方法后会跳过增强，
 * 测试不需要真实的 canvas 绘制能力。
 */

module.exports = {}
