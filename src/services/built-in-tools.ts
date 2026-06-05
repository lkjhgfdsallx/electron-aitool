import type { Tool } from '../types'

/**
 * 内置工具定义（符合 OpenAI Function Calling 格式）
 * 包含所有内置工具，供 Agent 模式使用
 */
export const BUILT_IN_TOOLS: Tool[] = [
  {
    id: 'builtin:get_current_time',
    name: 'get_current_time',
    description: '获取当前的日期和时间信息',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:calculate',
    name: 'calculate',
    description: '执行数学计算。支持四则运算、幂(^)、取模(%)、括号、科学计数法、常见数学函数(sin/cos/tan/sqrt/log/exp/pow/min/max/abs/ceil/floor/fact等)和常量(pi/e)。',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '要计算的数学表达式，例如 "2 + 3 * 4" 或 "(10 - 2) / 4"'
        }
      },
      required: ['expression']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  }
]

/**
 * Agent 专用内置工具
 * 这些工具在 Agent 模式下自动可用，不需要用户手动启用
 */
export const AGENT_BUILTIN_TOOLS: Tool[] = [
  {
    id: 'agent-builtin:remember',
    name: 'remember',
    description: '记住一条关键事实，用于长期记忆。在对话中发现重要信息时调用。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '记忆的键名，如"用户姓名"' },
        value: { type: 'string', description: '记忆的值，如"张三"' }
      },
      required: ['key', 'value']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:recall',
    name: 'recall',
    description: '回忆之前记住的关键事实。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '要回忆的键名' }
      },
      required: ['key']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },

  // ==================== 需求分析专用工具 ====================
  // 这些工具让 Agent 能通过 function calling 驱动内部多轮推理
  // Agent 自己提问、自己回答、自己审查，直到需求完整

  {
    id: 'agent-builtin:ask_self',
    name: 'ask_self',
    description: '向自己提出一个需求分析问题，并给出你的推断性回答。用于在内部模拟"追问-回答"循环，补全模糊信息。每次调用代表一轮自问自答，你的回答将作为已知信息记录下来。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '你需要澄清的问题，例如"目标平台是什么？"或"是否需要用户账号系统？"'
        },
        answer: {
          type: 'string',
          description: '你基于经验和上下文推断的合理回答，例如"基于项目技术栈，目标平台为Web网页版"或"联机对战需要用户账号系统来标识玩家"'
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: '你对这个回答的信心等级。high=有充分依据，medium=合理推断，low=猜测需用户确认'
        }
      },
      required: ['question', 'answer', 'confidence']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:define_requirement',
    name: 'define_requirement',
    description: '定义一个具体的需求点。用于将分析结果结构化记录，每个需求点包含名称、描述、详细规则和优先级。在需求分析过程中逐步调用此工具构建完整需求列表。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '需求点名称，例如"用户登录"、"AI对战"、"联机匹配"'
        },
        description: {
          type: 'string',
          description: '需求点的详细描述'
        },
        details: {
          type: 'string',
          description: '需求点的具体规则和约束，JSON字符串格式，例如{"rules":["支持15x15和19x19棋盘"],"constraints":["AI响应时间不超过2秒"]}'
        },
        priority: {
          type: 'string',
          enum: ['must_have', 'should_have', 'nice_to_have'],
          description: '需求优先级：must_have=核心必须，should_have=重要但非核心，nice_to_have=锦上添花'
        }
      },
      required: ['name', 'description', 'priority']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:review_requirements',
    name: 'review_requirements',
    description: '审查当前已收集的需求是否完整。检查是否有遗漏的功能点、模糊的描述、矛盾的需求或缺失的非功能需求。返回审查结果和需要补充的内容。',
    parameters: {
      type: 'object',
      properties: {
        original_request: {
          type: 'string',
          description: '用户的原始需求描述'
        },
        current_summary: {
          type: 'string',
          description: '当前已收集的需求摘要'
        },
        check_dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: '要检查的维度，例如["功能完整性","交互流程","数据模型","非功能需求","边界条件"]'
        }
      },
      required: ['original_request', 'current_summary', 'check_dimensions']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },

  // ==================== 人机交互工具 ====================
  // 当 Agent 对某个点不确定时，通过此工具向用户提供选项
  // 用户只需点击选择即可，降低交互成本

  {
    id: 'agent-builtin:ask_human',
    name: 'ask_human',
    description: '向用户提出一个选择题，提供几个预设选项让用户点击选择。当你对某个需求点不确定、多个方案难以决策时使用。用户选择后，你会收到其选择结果。系统会自动在选项末尾添加"以上都不是"选项，允许用户自行输入，因此你只需提供你建议的选项即可。请确保每个选项都有清晰的标签和简短说明。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要询问用户的问题，例如"游戏的目标平台是什么？"'
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: '选项显示文本，例如"Web网页版"'
              },
              value: {
                type: 'string',
                description: '选项的值，例如"web"'
              },
              description: {
                type: 'string',
                description: '选项的补充说明，例如"浏览器访问，跨平台，开发成本低"'
              }
            },
            required: ['label', 'value']
          },
          description: '供用户选择的选项列表，至少提供2个选项。系统会自动追加"以上都不是"选项，无需手动添加。'
        },
        allow_multiple: {
          type: 'boolean',
          description: '是否允许用户选择多个选项。仅当问题本身允许多个答案时设为true（例如"你需要哪些功能模块？"），大多数情况下应为false（单选）。默认为false。'
        }
      },
      required: ['question', 'options']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  }
]
