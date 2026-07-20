import { formatSkillArguments, isUseSkillCall, parseSkillCallDetails } from '../utils/skill-call'

describe('skill-call utilities', () => {
  it('identifies only use_skill tool calls', () => {
    expect(isUseSkillCall('use_skill')).toBe(true)
    expect(isUseSkillCall('list_skills')).toBe(false)
    expect(isUseSkillCall()).toBe(false)
  })

  it('uses the loaded skill result for the name and description', () => {
    const result = JSON.stringify({
      name: 'ui-ux-pro-max',
      description: 'UI/UX design intelligence for web and mobile.',
      content: '# Omitted from display'
    })

    expect(parseSkillCallDetails('{"skill_name":"fallback-name"}', result)).toEqual({
      skillName: 'ui-ux-pro-max',
      description: 'UI/UX design intelligence for web and mobile.'
    })
  })

  it('falls back to the requested skill name while a result is unavailable', () => {
    expect(parseSkillCallDetails({ skill_name: 'ui-ux-pro-max' })).toEqual({
      skillName: 'ui-ux-pro-max',
      description: undefined
    })
  })

  it('formats raw and object arguments for the details section', () => {
    expect(formatSkillArguments('{"skill_name":"ui-ux-pro-max"}')).toBe('{\n  "skill_name": "ui-ux-pro-max"\n}')
    expect(formatSkillArguments({ skill_name: 'ui-ux-pro-max' })).toBe('{\n  "skill_name": "ui-ux-pro-max"\n}')
  })
})
