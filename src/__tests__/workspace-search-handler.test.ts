jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
}))

import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findWorkspaceFiles,
  findWorkspaceSymbols,
  searchWorkspaceFiles,
} from '../../electron/main/workspace-search-handler'

describe('workspace search handler', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'workspace-search-'))
    await mkdir(join(rootPath, 'src'), { recursive: true })
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('按 glob 查找文件并忽略 node_modules', async () => {
    await writeFile(join(rootPath, 'src', 'app.ts'), 'export const app = true\n')
    await writeFile(join(rootPath, 'README.md'), '# readme\n')
    await mkdir(join(rootPath, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(rootPath, 'node_modules', 'pkg', 'index.ts'), 'export const hidden = true\n')

    const result = await findWorkspaceFiles(rootPath, { glob: 'src/**/*.ts' })

    expect(result).toMatchObject({ success: true, files: ['src/app.ts'], count: 1 })
    expect(result.files).not.toContain('node_modules/pkg/index.ts')
  })

  it('默认不区分大小写搜索并返回上下文', async () => {
    await writeFile(join(rootPath, 'src', 'app.ts'), 'first\nconst Target = 1\nlast\n')

    const result = await searchWorkspaceFiles(rootPath, { query: 'target' })

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.matches?.[0]).toMatchObject({
      file_path: 'src/app.ts',
      line: 2,
      column: 7,
      line_text: 'const Target = 1',
      context: [
        { line: 1, text: 'first' },
        { line: 2, text: 'const Target = 1' },
        { line: 3, text: 'last' },
      ],
    })
  })

  it('支持正则搜索且无效正则返回结构化错误', async () => {
    await writeFile(join(rootPath, 'src', 'app.ts'), 'const item42 = true\n')

    const regexResult = await searchWorkspaceFiles(rootPath, {
      query: 'item\\d+',
      isRegex: true,
      caseSensitive: true,
    })
    const invalidResult = await searchWorkspaceFiles(rootPath, { query: '[', isRegex: true })

    expect(regexResult).toMatchObject({ success: true, count: 1 })
    expect(invalidResult).toMatchObject({ success: false })
    expect(invalidResult.error).toContain('无效正则表达式')
  })

  it('解析 TypeScript/JavaScript 的函数、类、变量及导出状态', async () => {
    await writeFile(join(rootPath, 'src', 'symbols.ts'), [
      'export function exportedFunction(): void {}',
      'class InternalClass {}',
      'export const exportedValue = 1',
    ].join('\n'))

    const result = await findWorkspaceSymbols(rootPath, { glob: 'src/**/*.ts' })

    expect(result.success).toBe(true)
    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'exportedFunction', kind: 'function', exported: true, file_path: 'src/symbols.ts' }),
      expect.objectContaining({ name: 'InternalClass', kind: 'class', exported: false, file_path: 'src/symbols.ts' }),
      expect.objectContaining({ name: 'exportedValue', kind: 'variable', exported: true, file_path: 'src/symbols.ts' }),
    ]))
  })

  it('在结果达到上限时标记 truncated', async () => {
    await writeFile(join(rootPath, 'src', 'many.ts'), Array.from({ length: 3 }, (_, index) => `const match${index} = true`).join('\n'))

    const result = await searchWorkspaceFiles(rootPath, { query: 'match', maxResults: 2 })

    expect(result).toMatchObject({ success: true, count: 2, truncated: true })
  })
})
