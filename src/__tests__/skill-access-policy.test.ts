import type { Skill } from '../types'
import {
  findAccessibleSkillByName,
  getAccessibleSkills,
  isSkillAccessible,
} from '../services/skill-access-policy'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-id',
    dirPath: 'skill-id',
    name: 'example-skill',
    description: 'Example skill',
    content: 'Instructions',
    rawContent: 'Instructions',
    location: 'global',
    resourceFiles: [],
    enabled: true,
    updatedAt: 1,
    ...overrides,
  }
}

describe('skill access policy', () => {
  it('allows any enabled skill regardless of binding or workspace', () => {
    expect(isSkillAccessible(makeSkill())).toBe(true)
    expect(isSkillAccessible(makeSkill({
      location: 'project',
      projectWorkspaceId: 'workspace-a',
    }))).toBe(true)
  })

  it('rejects disabled skills', () => {
    expect(isSkillAccessible(makeSkill({ enabled: false }))).toBe(false)
  })

  it('filters inventories to enabled skills only', () => {
    const enabledGlobal = makeSkill()
    const enabledProject = makeSkill({
      id: 'project-id',
      dirPath: 'project-id',
      name: 'project-skill',
      location: 'project',
      projectWorkspaceId: 'workspace-a',
    })
    const disabled = makeSkill({
      id: 'disabled-id',
      dirPath: 'disabled-id',
      name: 'disabled-skill',
      enabled: false,
    })

    expect(getAccessibleSkills([enabledGlobal, enabledProject, disabled]).map((skill) => skill.name))
      .toEqual(['example-skill', 'project-skill'])
  })

  it('does not select an arbitrary skill when names are ambiguous', () => {
    const duplicate = makeSkill({ id: 'second-id', dirPath: 'second-id' })
    expect(findAccessibleSkillByName(
      [makeSkill(), duplicate],
      'example-skill',
    )).toEqual({ status: 'ambiguous' })
  })
})
