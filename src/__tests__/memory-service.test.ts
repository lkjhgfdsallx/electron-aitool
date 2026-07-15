/**
 * memory-service 作用域 / 注入上限 / CRUD 单测
 */

import {
  memoryService,
  DEFAULT_MAX_INJECT_ENTRIES,
  DEFAULT_MAX_INJECT_CHARS,
  type MemoryEntry,
} from '../services/memory-service'

const STORAGE_KEY = 'agent-memory'

describe('memoryService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('remember / recall / forget 作用域', () => {
    it('crossSession=true 时应写入 agent 作用域并可跨 conversation 读取', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'name',
        value: 'Alice',
        crossSession: true,
        conversationId: 'c1',
      })

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'name',
          crossSession: true,
          conversationId: 'c2',
        })
      ).toBe('Alice')

      // 关闭跨会话时，agent 作用域条目对 conversation 读取不可见
      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'name',
          crossSession: false,
          conversationId: 'c1',
        })
      ).toBeNull()
    })

    it('crossSession=false 时应仅当前 conversation 可见', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'topic',
        value: 'alpha',
        crossSession: false,
        conversationId: 'c1',
      })

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'topic',
          crossSession: false,
          conversationId: 'c1',
        })
      ).toBe('alpha')

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'topic',
          crossSession: false,
          conversationId: 'c2',
        })
      ).toBeNull()

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'topic',
          crossSession: true,
        })
      ).toBeNull()
    })

    it('forget 应按当前作用域删除', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'k',
        value: 'global',
        crossSession: true,
      })
      memoryService.remember({
        agentId: 'a1',
        key: 'k',
        value: 'local',
        crossSession: false,
        conversationId: 'c1',
      })

      expect(
        memoryService.forget({
          agentId: 'a1',
          key: 'k',
          crossSession: false,
          conversationId: 'c1',
        })
      ).toBe(true)

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'k',
          crossSession: false,
          conversationId: 'c1',
        })
      ).toBeNull()
      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'k',
          crossSession: true,
        })
      ).toBe('global')
    })
  })

  describe('管理 API', () => {
    it('getAllMemories / updateMemory / deleteMemoryById / clearMemories', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'x',
        value: '1',
        crossSession: true,
      })
      memoryService.remember({
        agentId: 'a2',
        key: 'y',
        value: '2',
        crossSession: true,
      })

      const list = memoryService.getAllMemories('a1')
      expect(list).toHaveLength(1)
      expect(list[0].key).toBe('x')
      expect(list[0].scope).toBe('agent')

      expect(memoryService.updateMemory(list[0].id, '1-updated')).toBe(true)
      expect(memoryService.getAllMemories('a1')[0].value).toBe('1-updated')
      expect(memoryService.getAllMemories('a1')[0].userEdited).toBe(true)

      expect(memoryService.deleteMemoryById(list[0].id)).toBe(true)
      expect(memoryService.getAllMemories('a1')).toHaveLength(0)
      expect(memoryService.getAllMemories('a2')).toHaveLength(1)

      memoryService.clearMemories('a2')
      expect(memoryService.getAllMemories('a2')).toHaveLength(0)
    })

    it('clearAllMemories / countAll', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'a',
        value: '1',
        crossSession: true,
      })
      memoryService.remember({
        agentId: 'a1',
        key: 'b',
        value: '2',
        crossSession: true,
      })
      expect(memoryService.countAll()).toBe(2)
      expect(memoryService.clearAllMemories()).toBe(2)
      expect(memoryService.countAll()).toBe(0)
    })
  })

  describe('formatMemoriesAsContext', () => {
    it('兼容旧 string 签名（按 agent 跨会话注入）', () => {
      memoryService.remember({
        agentId: 'a1',
        key: 'name',
        value: 'Bob',
        crossSession: true,
      })
      const text = memoryService.formatMemoriesAsContext('a1')
      expect(text).toContain('## 长期记忆')
      expect(text).toContain('跨会话')
      expect(text).toContain('name: Bob')
      expect(text).toContain('以当前用户指令')
    })

    it('应按 maxEntries / maxChars 截断', () => {
      for (let i = 0; i < 5; i++) {
        memoryService.remember({
          agentId: 'a1',
          key: `k${i}`,
          value: 'v'.repeat(20),
          crossSession: true,
        })
      }

      const byCount = memoryService.formatMemoriesAsContext({
        agentId: 'a1',
        crossSession: true,
        maxEntries: 2,
        maxChars: 10000,
      })
      expect(byCount.match(/^- /gm)?.length ?? 0).toBe(2)
      expect(byCount).toContain('注入最近 2 条')

      const byChars = memoryService.formatMemoriesAsContext({
        agentId: 'a1',
        crossSession: true,
        maxEntries: 30,
        maxChars: 40,
      })
      const lines = byChars.match(/^- /gm)?.length ?? 0
      expect(lines).toBeGreaterThanOrEqual(1)
      expect(lines).toBeLessThan(5)
    })

    it('默认上限常量应存在', () => {
      expect(DEFAULT_MAX_INJECT_ENTRIES).toBe(30)
      expect(DEFAULT_MAX_INJECT_CHARS).toBe(4000)
    })

    it('无记忆时返回空字符串', () => {
      expect(
        memoryService.formatMemoriesAsContext({
          agentId: 'missing',
          crossSession: true,
        })
      ).toBe('')
    })
  })

  describe('旧数据兼容', () => {
    it('无 scope 的旧条目应视为 agent 作用域', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          entries: [
            {
              id: 'legacy-1',
              agentId: 'a1',
              key: 'legacy',
              value: 'old',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        })
      )

      expect(
        memoryService.recall({
          agentId: 'a1',
          key: 'legacy',
          crossSession: true,
        })
      ).toBe('old')

      const items = memoryService.getAllMemories('a1')
      expect(items[0].scope).toBe('agent')
    })
  })

  describe('listMemories', () => {
    it('应按作用域过滤并限制条数', () => {
      memoryService.remember({ agentId: 'a1', key: 'k1', value: 'v1', crossSession: true })
      memoryService.remember({ agentId: 'a1', key: 'k2', value: 'v2', crossSession: false, conversationId: 'c1' })
      memoryService.remember({ agentId: 'a1', key: 'k3', value: 'v3', crossSession: true })

      const agentItems = memoryService.listMemories({ agentId: 'a1', crossSession: true })
      expect(agentItems).toHaveLength(2)
      expect(agentItems.map((i) => i.key).sort()).toEqual(['k1', 'k3'])
      expect(agentItems[0].scope).toBe('agent')

      const convItems = memoryService.listMemories({
        agentId: 'a1',
        crossSession: false,
        conversationId: 'c1',
      })
      expect(convItems).toHaveLength(1)
      expect(convItems[0].key).toBe('k2')
      expect(convItems[0].scope).toBe('conversation')
    })

    it('query 应过滤 key/value', () => {
      memoryService.remember({ agentId: 'a1', key: 'name', value: 'Alice', crossSession: true })
      memoryService.remember({ agentId: 'a1', key: 'topic', value: 'discussion about Alice', crossSession: true })

      const byKey = memoryService.listMemories({ agentId: 'a1', crossSession: true, query: 'name' })
      expect(byKey).toHaveLength(1)
      expect(byKey[0].key).toBe('name')

      const byValue = memoryService.listMemories({ agentId: 'a1', crossSession: true, query: 'alice' })
      expect(byValue).toHaveLength(2) // both entries contain "alice" in key or value
    })

    it('limit 应截断结果', () => {
      for (let i = 0; i < 5; i++) {
        memoryService.remember({ agentId: 'a1', key: `k${i}`, value: `v${i}`, crossSession: true })
      }
      const limited = memoryService.listMemories({ agentId: 'a1', crossSession: true, limit: 2 })
      expect(limited).toHaveLength(2)
    })
  })

  describe('exportStore / importStore', () => {
    it('应导出完整存储并原样恢复', () => {
      memoryService.remember({ agentId: 'a1', key: 'x', value: '100', crossSession: true, sourceRunId: 'r1' })
      const exported = memoryService.exportStore()
      expect(exported.entries).toHaveLength(1)

      memoryService.clearAllMemories()
      expect(memoryService.countAll()).toBe(0)

      const count = memoryService.importStore(exported)
      expect(count).toBe(1)
      expect(memoryService.recall({ agentId: 'a1', key: 'x', crossSession: true })).toBe('100')
    })

    it('importStore 应兼容数组格式', () => {
      const count = memoryService.importStore([
        { id: 'i1', agentId: 'a2', key: 'k', value: 'v', createdAt: 1, updatedAt: 1, scope: 'agent' },
      ])
      expect(count).toBe(1)
      expect(memoryService.recall({ agentId: 'a2', key: 'k', crossSession: true })).toBe('v')
    })

    it('importStore 应过滤无效条目', () => {
      const count = memoryService.importStore([
        { id: 'i1', agentId: '', key: '', value: '' } as unknown as MemoryEntry,
        { id: 'i2', agentId: 'a3', key: 'valid', value: 'ok', createdAt: 1, updatedAt: 1, scope: 'agent' },
      ])
      expect(count).toBe(1)
    })
  })
})
