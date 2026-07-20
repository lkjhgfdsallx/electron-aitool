import type { AgentSessionContext } from '../services/agent/tool-executor'
import type { Skill } from '../types'

const ensureSkillsLoaded = jest.fn()
let skills: Skill[] = []

jest.mock('../stores/skill-store', () => ({
  useSkillStore: {
    getState: () => ({ skills, ensureSkillsLoaded }),
  },
}))

import { SkillToolExecutor } from '../services/agent/executors/skill-executor'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'allowed',
    dirPath: 'allowed',
    name: 'allowed-skill',
    description: 'Allowed skill',
    content: 'secret instructions',
    rawContent: 'secret instructions',
    location: 'global',
    resourceFiles: [],
    enabled: true,
    updatedAt: 1,
    ...overrides,
  }
}

function makeSession(overrides: Partial<AgentSessionContext> = {}): AgentSessionContext {
  return {
    agentId: 'agent-1',
    agentName: 'Agent',
    runId: 'run-1',
    conversationId: 'conversation-1',
    agentTools: [],
    resolvedConfig: {
      baseUrl: 'https://example.test/v1',
      apiKey: 'key',
      model: 'test',
      temperature: 0.7,
      maxTokens: 1024,
      streamEnabled: true,
    },
    signal: new AbortController().signal,
    callbacks: {} as AgentSessionContext['callbacks'],
    stepCounter: { value: 0 },
    steps: [],
    artifacts: [],
    ...overrides,
  }
}

describe('SkillToolExecutor', () => {
  beforeEach(() => {
    ensureSkillsLoaded.mockClear()
    skills = []
  })

  it('lists and loads all enabled skills', async () => {
    skills = [
      makeSkill(),
      makeSkill({
        id: 'project',
        dirPath: 'project',
        name: 'project-skill',
        description: 'Project skill',
        content: 'project instructions',
        location: 'project',
        projectWorkspaceId: 'workspace-b',
      }),
      makeSkill({
        id: 'disabled',
        dirPath: 'disabled',
        name: 'disabled-skill',
        enabled: false,
      }),
    ]
    const executor = new SkillToolExecutor()
    const session = makeSession()

    const listed = await executor.execute('list_skills', {}, {}, session)
    const loaded = await executor.execute('use_skill', { skill_name: 'allowed-skill' }, {}, session)
    const loadedProject = await executor.execute('use_skill', { skill_name: 'project-skill' }, {}, session)
    const rejected = await executor.execute('use_skill', { skill_name: 'disabled-skill' }, {}, session)

    expect(JSON.parse(listed.data)).toEqual({
      skills_count: 2,
      skills: [
        { name: 'allowed-skill', description: 'Allowed skill', location: 'global' },
        { name: 'project-skill', description: 'Project skill', location: 'project' },
      ],
    })
    expect(JSON.parse(loaded.data).content).toBe('secret instructions')
    expect(JSON.parse(loadedProject.data).content).toBe('project instructions')
    expect(rejected).toMatchObject({ success: false })
    expect(rejected.error).toBe('请求的技能不存在或已被禁用')
  })

  it('rejects missing skill names without leaking details', async () => {
    skills = [makeSkill()]
    const executor = new SkillToolExecutor()
    const session = makeSession()

    const rejected = await executor.execute('use_skill', { skill_name: 'missing-skill' }, {}, session)

    expect(rejected.success).toBe(false)
    expect(rejected.error).toBe('请求的技能不存在或已被禁用')
    expect(rejected.error).not.toContain('missing-skill')
  })
})
