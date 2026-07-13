/**
 * ts-jest AST Transformer (before)
 *
 * 在每个被测 .ts/.tsx 文件转换为 AST 之前，向 sourceText 头部
 * 注入环境类型声明。这样做可以确保 coverage collector 在编译
 * collectCoverageFrom 中的文件（如 use-chat.ts）时，也能看到
 * window.electronAPI 等全局扩展类型。
 *
 * 为什么不用 tsconfig include：
 *   1. ts-jest 是逐文件独立编译的，不会读取 tsconfig 的 include/files
 *   2. 测试文件本身已经引用了 use-chat，但 coverage collector 是
 *      从 jest-runtime 对源文件单独做 transform，不会加载测试文件上下文
 *
 * 为什么不用 src/types/electron.d.ts：
 *   该文件从 electron/preload/index.ts 导入 ElectronAPI，
 *   而 preload 会 require('electron')，在 jest 环境中不可用。
 *
 * 使用方法：在 jest.config.js 的 ts-jest transforms 中配置
 *   astTransformers: { before: [{ path: '.../inject-jest-types.cjs' }] }
 */

const typesHeader = `
/// <reference path="./jest-types.d.ts" />
`

/**
 * @param {import('typescript').SourceFile} sourceFile
 * @param {import('ts-jest').AstTransformerContext} context
 * @returns {import('typescript').SourceFile}
 */
function factory(context) {
  return (sourceFile) => {
    // 仅在包含 electronAPI 访问的文件中注入类型声明头
    // 这里简化处理：对所有被测文件注入（jest-types.d.ts 本身很小，不会影响语义）
    const text = sourceFile.fileName.includes('__tests__')
      ? typesHeader + sourceFile.text
      : sourceFile.text

    // 仅修改文本内容，返回新的 sourceFile
    if (text !== sourceFile.text) {
      return context.ts.createSourceFile(
        sourceFile.fileName,
        text,
        sourceFile.languageVersion,
        /*setParentNodes*/ true,
        /*scriptKind*/ sourceFile.scriptKind,
      )
    }
    return sourceFile
  }
}

module.exports = { factory }