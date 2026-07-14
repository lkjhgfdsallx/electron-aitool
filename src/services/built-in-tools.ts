import type { Tool } from '../types'

/**
 * 内置工具定义（符合 OpenAI Function Calling 格式）
 * 包含所有内置工具，供 Agent 模式使用
 */
export const BUILT_IN_TOOLS: Tool[] = [
  {
    id: 'builtin:web_search',
    name: 'web_search',
    description: '在互联网上搜索最新信息。当用户询问需要实时信息的问题时使用，如新闻、天气、股价、技术文档、最新事件等。返回搜索结果列表，包含标题、摘要和链接。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，应简洁明确，例如 "2025年AI最新进展"'
        },
        max_results: {
          type: 'number',
          description: '返回结果数量，默认5，最大10'
        }
      },
      required: ['query']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:fetch_webpage',
    name: 'fetch_webpage',
    description: '通过 URL 抓取网页内容并提取正文文本。当需要查看某个网页的详细内容时使用，例如在搜索后想深入了解某个结果页面，或用户提供了具体网址需要读取。返回网页的纯文本内容（自动去除广告、导航栏等无关内容）。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要抓取的网页 URL，必须以 http:// 或 https:// 开头'
        },
        max_length: {
          type: 'number',
          description: '返回内容的最大字符数，默认 8000，最大 20000'
        }
      },
      required: ['url']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
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
  },
  {
    id: 'builtin:knowledge_search',
    name: 'knowledge_search',
    description: '搜索本地知识库中的文档内容。当用户提问涉及已上传的文档、笔记、代码规范等本地资料时使用。返回最相关的文档片段，包含来源文件名和匹配内容。支持指定知识库集合进行定向搜索。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询，描述你要查找的内容，例如 "产品定价策略" 或 "React 性能优化"'
        },
        top_k: {
          type: 'number',
          description: '返回结果数量，默认 5，最大 10'
        },
        collection_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '限定搜索范围的知识库集合 ID 列表。不提供则搜索全部知识库。'
        }
      },
      required: ['query']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },

  // ==================== 高级数学工具 ====================
  // 让小模型也能在 Agent 模式下解答复杂数学问题

  {
    id: 'builtin:math_analyze',
    name: 'math_analyze',
    description: '数学分析工具。支持：极限计算(limit)、级数求和与收敛判断(series)、数值微分(derivative)、数值积分(integrate)、Taylor展开(taylor)。用于分析学、微积分相关问题。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['limit', 'series', 'derivative', 'integrate', 'taylor'],
          description: '分析操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数。limit:{expression,approach,direction?}; series:{expression,N?}; derivative:{expression,x0,order?}; integrate:{expression,a,b,n?}; taylor:{expression,x0?,order?}',
          properties: {
            expression: { type: 'string', description: '数学表达式，如 "sin(x)/x", "1/n^2"' },
            approach: { type: 'number', description: '极限趋近值' },
            direction: { type: 'string', enum: ['both', 'left', 'right'], description: '极限方向' },
            x0: { type: 'number', description: '求导/展开点' },
            order: { type: 'number', description: '导数阶数或Taylor展开阶数' },
            a: { type: 'number', description: '积分下限' },
            b: { type: 'number', description: '积分上限' },
            n: { type: 'number', description: '级数/积分项数' },
            N: { type: 'number', description: '级数求和项数' }
          }
        }
      },
      required: ['operation', 'params']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:math_algebra',
    name: 'math_algebra',
    description: '代数运算工具。支持：矩阵行列式(matrix_det)、特征值(matrix_eigenvalues)、逆矩阵(matrix_inverse)、矩阵乘法(matrix_multiply)、多项式求根(polynomial_roots)。用于线性代数、多项式等问题。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['matrix_det', 'matrix_eigenvalues', 'matrix_inverse', 'matrix_multiply', 'polynomial_roots'],
          description: '代数操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数。matrix_*:{matrix/matrix_a/matrix_b}; polynomial_roots:{coefficients}',
          properties: {
            matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '矩阵(二维数组)' },
            matrix_a: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '矩阵A' },
            matrix_b: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '矩阵B' },
            coefficients: { type: 'array', items: { type: 'number' }, description: '多项式系数(从高次到低次)，如[1,-3,2]表示x²-3x+2' }
          }
        }
      },
      required: ['operation', 'params']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:math_geometry',
    name: 'math_geometry',
    description: '几何计算工具。支持：距离(distance)、三角形面积(triangle_area)、多边形面积(polygon_area)、曲率(curvature)、Euler示性数(euler_characteristic)、向量运算(vector_ops)。用于几何、拓扑相关问题。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['distance', 'triangle_area', 'polygon_area', 'curvature', 'euler_characteristic', 'vector_ops'],
          description: '几何操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数。各操作参数不同，详见各operation说明',
          properties: {
            point1: { type: 'array', items: { type: 'number' }, description: '点1坐标' },
            point2: { type: 'array', items: { type: 'number' }, description: '点2坐标' },
            a: { type: 'number', description: '三角形边长a' },
            b: { type: 'number', description: '三角形边长b' },
            c: { type: 'number', description: '三角形边长c' },
            vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '多边形顶点列表' },
            expression: { type: 'string', description: '曲线表达式(用于曲率计算)' },
            x: { type: 'number', description: '曲率计算点' },
            V: { type: 'number', description: '顶点数' },
            E: { type: 'number', description: '边数' },
            F: { type: 'number', description: '面数' },
            vector_a: { type: 'array', items: { type: 'number' }, description: '向量A' },
            vector_b: { type: 'array', items: { type: 'number' }, description: '向量B' },
            vec_op: { type: 'string', enum: ['dot', 'cross'], description: '向量运算类型' }
          }
        }
      },
      required: ['operation', 'params']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:math_number',
    name: 'math_number',
    description: '数论计算工具。支持：素性测试(prime_test)、素数筛(prime_sieve)、素因子分解(factorize)、Euler函数(euler_phi)、Möbius函数(mobius)、模运算(mod_arithmetic)、Legendre符号(legendre)、Jacobi符号(jacobi)、原根(primitive_root)、狄利克雷特征(dirichlet_chars)、L函数计算(l_function)、L函数欧拉乘积(l_function_euler)、L函数乘积分析(product_l)、正交性验证(orthogonality)。这是解决数论和解析数论问题的核心工具。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['prime_test', 'prime_sieve', 'factorize', 'euler_phi', 'mobius', 'mod_arithmetic', 'legendre', 'jacobi', 'primitive_root', 'dirichlet_chars', 'l_function', 'l_function_euler', 'product_l', 'orthogonality'],
          description: '数论操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数。各操作参数不同',
          properties: {
            n: { type: 'number', description: '输入整数' },
            a: { type: 'number', description: '运算数a' },
            b: { type: 'number', description: '运算数b' },
            m: { type: 'number', description: '模数' },
            p: { type: 'number', description: '素数(用于Legendre符号)' },
            q: { type: 'number', description: '模数(用于狄利克雷特征/L函数)' },
            s: { type: 'number', description: 'L函数的s值' },
            chi_index: { type: 'number', description: '特征索引' },
            N: { type: 'number', description: '求和项数' },
            max_prime: { type: 'number', description: '欧拉乘积最大素数' },
            mod_op: { type: 'string', enum: ['power', 'inverse', 'crt'], description: '模运算子类型' },
            remainders: { type: 'array', items: { type: 'number' }, description: '中国剩余定理余数' },
            moduli: { type: 'array', items: { type: 'number' }, description: '中国剩余定理模数' }
          }
        }
      },
      required: ['operation', 'params']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:math_symbolic',
    name: 'math_symbolic',
    description: '符号数学工具。支持：符号微分(derivative)、表达式展开(expand)、表达式化简(simplify)。用于符号运算和公式推导。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['derivative', 'expand', 'simplify'],
          description: '符号操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数',
          properties: {
            expression: { type: 'string', description: '数学表达式，如 "x^3 + 2*x^2 - x + 1"' },
            variable: { type: 'string', description: '求导变量，默认"x"' },
            x0: { type: 'number', description: '数值验证点' }
          }
        }
      },
      required: ['operation', 'params']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'builtin:math_verify',
    name: 'math_verify',
    description: '数学验证工具。支持：等式验证(equality)、不等式验证(inequality)、数论命题验证(number_theory)、反例搜索(counter_example)、L函数非零验证(l_function_nonzero)。核心功能：通过大量随机数值检验来验证数学命题的正确性，或寻找反例。l_function_nonzero是专门验证L(1,χ)≠0的工具，使用乘积论证法。',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['equality', 'inequality', 'number_theory', 'counter_example', 'l_function_nonzero'],
          description: '验证操作类型'
        },
        params: {
          type: 'object',
          description: '操作参数',
          properties: {
            lhs: { type: 'string', description: '等式/不等式左边表达式' },
            rhs: { type: 'string', description: '等式/不等式右边表达式' },
            variables: { type: 'array', items: { type: 'string' }, description: '变量列表，如["x","y"]' },
            tolerance: { type: 'number', description: '容差，默认1e-6' },
            test_count: { type: 'number', description: '测试次数，默认1000' },
            predicate: { type: 'string', description: '数论命题表达式或反例搜索谓词' },
            range: { type: 'array', items: { type: 'number' }, description: '数论验证范围[min,max]' },
            q: { type: 'number', description: 'L函数非零验证的模数q' },
            N: { type: 'number', description: 'L函数计算项数' }
          }
        }
      },
      required: ['operation', 'params']
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

  // ==================== Skills 技能工具 ====================

  {
    id: 'agent-builtin:list_skills',
    name: 'list_skills',
    description: '列出当前可用的专业技能（Skills）。返回每个技能的名称和描述，帮助你判断是否需要加载某个技能来处理当前任务。当遇到特定领域任务时，先调用此工具查看可用技能。',
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
    id: 'agent-builtin:use_skill',
    name: 'use_skill',
    description: '加载指定的专业技能。技能包含特定领域的专家知识和指令，加载后你将获得处理该领域任务的专业能力。使用前请先调用 list_skills 查看可用技能。',
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: '要加载的技能名称，例如 "pdf-processing" 或 "api-docs-generator"'
        }
      },
      required: ['skill_name']
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
  },

  // ==================== 网站分析工具 ====================
  // 用于自动化分析网站功能模块和API接口

  {
    id: 'agent-builtin:site_analyzer_start',
    name: 'site_analyzer_start',
    description: '启动网站功能分析。使用Playwright浏览器自动化爬取目标网站，捕获网络请求，并通过AI分析识别功能模块和API接口。分析完成后会生成可交互的HTML报告。需要提供目标网址和AI服务配置。登录方式支持：manual(手动登录,默认)、password(账号密码自动登录)、cookie(导入Cookie/Token)。',
    parameters: {
      type: 'object',
      properties: {
        target_url: {
          type: 'string',
          description: '目标网站URL，如 "https://example.com"'
        },
        login_type: {
          type: 'string',
          enum: ['manual', 'password', 'cookie'],
          description: '登录方式。manual=手动登录(默认,浏览器打开后用户自己登录)、password=自动账号密码登录、cookie=通过Cookie/Token登录'
        },
        username: {
          type: 'string',
          description: '登录用户名（仅password模式需要）'
        },
        password: {
          type: 'string',
          description: '登录密码（仅password模式需要）'
        },
        cookie: {
          type: 'string',
          description: 'Cookie字符串（仅cookie模式需要）'
        },
        token: {
          type: 'string',
          description: 'Bearer Token（仅cookie模式，与cookie二选一）'
        },
        ai_base_url: {
          type: 'string',
          description: 'AI服务地址，如 "https://api.openai.com"。如不提供则使用当前对话的AI配置'
        },
        ai_api_key: {
          type: 'string',
          description: 'AI服务API Key。如不提供则使用当前对话的AI配置'
        },
        ai_model_id: {
          type: 'string',
          description: 'AI模型ID，如 "gpt-4o"。如不提供则使用当前对话的AI配置'
        },
        max_depth: {
          type: 'number',
          description: '最大爬取深度，默认3。首页深度为0'
        },
        max_pages: {
          type: 'number',
          description: '最大爬取页面数，默认100'
        },
        url_include_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'URL包含过滤规则（正则表达式），只爬取匹配的URL'
        },
        url_exclude_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'URL排除过滤规则（正则表达式），排除匹配的URL'
        },
        crawl_delay: {
          type: 'number',
          description: '爬取间隔（毫秒），默认1000。增大此值可降低对目标服务器的压力'
        },
        proxy_server: {
          type: 'string',
          description: '代理服务器地址，如 "http://proxy:8080" 或 "socks5://proxy:1080"'
        },
        user_agent: {
          type: 'string',
          description: '自定义User-Agent'
        },
        simulate_human: {
          type: 'boolean',
          description: '是否模拟人类行为（随机滚动、鼠标移动等），默认false'
        }
      },
      required: ['target_url']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:site_analyzer_cancel',
    name: 'site_analyzer_cancel',
    description: '取消正在进行的网站分析任务。',
    parameters: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: '要取消的分析任务ID'
        }
      },
      required: ['task_id']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },

  // ==================== 结构化任务规划工具 ====================
  // 让 LLM 通过 function calling 产出结构化 Plan，引擎写入并发布事件
  // UI（AgentTodoPanel）展示任务列表，用户可查看/确认计划

  {
    id: 'agent-builtin:create_plan',
    name: 'create_plan',
    description: '创建结构化任务计划。将复杂任务拆解为有序子任务列表，每个任务可指定依赖关系和分派目标。创建后返回每个任务的 id，后续用 update_task 工具传入任务 id 来推进任务状态。使用此工具能让任务执行更有条理、可跟踪。',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: '任务的总体目标，一句话描述要达成什么。例如"完成一个待办事项应用的前后端开发"'
        },
        tasks: {
          type: 'array',
          description: '任务列表，按执行顺序排列',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '任务标题，简短概括该任务，例如"设计数据库模型"'
              },
              description: {
                type: 'string',
                description: '任务详细描述，包括要做什么、预期产出'
              },
              dependsOnIndexes: {
                type: 'array',
                items: { type: 'number' },
                description: '该任务依赖的任务序号（从0开始的数组下标）。被依赖的任务完成后此任务才能执行。无依赖则留空。例如[0,1]表示依赖第1和第2个任务'
              },
              assigneeId: {
                type: 'string',
                description: '（可选）分派给哪个 Agent 执行（多 Agent 工作区场景）。为空表示由当前 Agent 自行执行'
              }
            },
            required: ['title', 'description']
          }
        }
      },
      required: ['goal', 'tasks']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:update_task',
    name: 'update_task',
    description: '更新计划中某个任务的状态、备注或产物。在执行任务过程中调用此工具标记进度。任务状态包括：pending(待执行)、in_progress(进行中)、completed(已完成)、failed(失败)、blocked(阻塞)。',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '要更新的任务 ID。必须是 create_plan 工具返回值中标注的任务 id（格式如 task-xxxxxxxx）。不要使用序号或自行编造。'
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
          description: '新的任务状态'
        },
        notes: {
          type: 'string',
          description: '（可选）追加的备注信息，如执行过程中的发现、遇到的问题'
        },
        artifacts: {
          type: 'array',
          items: { type: 'string' },
          description: '（可选）该任务产出的文件路径列表'
        }
      },
      required: ['taskId']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'agent-builtin:get_plan',
    name: 'get_plan',
    description: '获取当前任务计划的完整状态，包括所有任务的进度、状态、依赖关系。在需要回顾整体进度或确认下一步时调用。',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  }
]

/**
 * 工作区专用工具（需要工作区上下文才能执行）
 * 仅当 Agent 的 enabledToolIds 勾选了对应工具 ID，且运行时存在 workspaceContext 时才会加入可用列表
 */
export const WORKSPACE_TOOLS: Tool[] = [
  {
    id: 'workspace:read_file',
    name: 'workspace_read_file',
    description: '读取工作区中的文件内容。返回文件的文本内容（大文件自动截断到512KB）。用于查看代码、配置文件、文档等。',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '相对于工作区根目录的文件路径，例如 "src/index.ts" 或 "package.json"'
        }
      },
      required: ['file_path']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'workspace:write_file',
    name: 'workspace_write_file',
    description: '向工作区写入文件。如果文件不存在会自动创建（包括父目录）。如果文件已存在则覆盖。用于创建新文件、修改代码、写入配置等。',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '相对于工作区根目录的文件路径，例如 "src/components/NewComponent.tsx"'
        },
        content: {
          type: 'string',
          description: '要写入的文件内容'
        }
      },
      required: ['file_path', 'content']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'workspace:list_files',
    name: 'workspace_list_files',
    description: '列出工作区中指定目录下的文件和子目录。返回每个条目的名称、路径、是否为目录、大小和扩展名。用于了解项目结构、浏览代码目录。',
    parameters: {
      type: 'object',
      properties: {
        dir_path: {
          type: 'string',
          description: '相对于工作区根目录的目录路径。留空或 "." 表示根目录，例如 "src" 或 "src/components"'
        }
      },
      required: []
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'workspace:execute_command',
    name: 'workspace_execute_command',
    description: '在工作区目录下执行 shell 命令。用于运行构建、测试、lint、git 操作、安装依赖等。命令会在工作区根目录下执行。注意：危险命令（如 rm -rf /）会被安全策略拦截。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 shell 命令，例如 "npm install lodash" 或 "git status"'
        }
      },
      required: ['command']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'workspace:dispatch_task',
    name: 'workspace_dispatch_task',
    description: '将任务分派给团队中的某个 Agent 执行（Boomerang 模式）。你可以为不同的子任务指定不同的 Agent，实现并行协作。被分派的 Agent 会收到任务描述与上下文摘要，在其隔离的上下文中独立执行，完成后结构化结果回流给你（含 status/content/stepCount/artifacts 等字段）。结果回流后，你应基于结果进行整合与决策。',
    parameters: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: '要分派任务的 Agent ID。必须是当前工作区团队中的 Agent。'
        },
        task_description: {
          type: 'string',
          description: '对任务的详细描述，包含足够的上下文信息让 Agent 能独立完成任务。例如："请检查 src/utils 目录下的所有工具函数，找出没有单元测试覆盖的函数，并为每个函数编写测试用例。"'
        },
        context_summary: {
          type: 'string',
          description: '（可选）传递给子 Agent 的上下文摘要。建议包含：当前整体目标、已完成的进展、相关文件路径、约定与约束。这能显著提升子 Agent 在隔离上下文中的产出质量。'
        }
      },
      required: ['agent_id', 'task_description']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },
  {
    id: 'workspace:create_agent',
    name: 'workspace_create_agent',
    description: '创建一个工作区专属 Agent 并将其加入当前工作区团队。新 Agent 仅存储在当前工作区的 .ai-workspace-vcs/agents.json 中，不会污染全局 Agent 列表。当现有团队成员无法胜任某项任务时使用此工具。创建后可通过 workspace_dispatch_task 将任务分派给它。用户也可在设置中将其提升为全局 Agent。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Agent 的名称，简短且能体现专业领域，例如 "前端开发工程师"、"数据库专家"、"测试工程师"'
        },
        description: {
          type: 'string',
          description: 'Agent 的职责描述，说明该 Agent 擅长什么、适合处理哪些任务'
        },
        system_prompt: {
          type: 'string',
          description: 'Agent 的系统提示词，定义其身份、专业技能、行为准则和工作方式。应足够详细以便 Agent 能独立高效地完成任务。'
        },
        avatar: {
          type: 'string',
          description: 'Agent 的 emoji 头像，例如 "💻"、"🎨"、"🧪"'
        },
        enabled_tool_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '该 Agent 可使用的工具 ID 列表，必须使用工具 ID（例如 builtin:knowledge_search、workspace:read_file、workspace:write_file、workspace:list_files、workspace:execute_command）。如果提供该字段，将精确使用该列表；如不提供则使用默认工作区工具。'
        },
        enabled_skill_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '可选。绑定的 Skills ID 列表，应使用设置页中 Skill 的 dirPath/id。与用户在 Agent 设置中勾选 Skills 等价。'
        },
        enabled: {
          type: 'boolean',
          description: '可选。是否启用该 Agent，默认 true。'
        },
        // ---- 与用户手动配置 Agent 保持一致的增强字段（全部可选） ----
        planning_strategy: {
          type: 'string',
          enum: ['react', 'plan-and-execute', 'trial-and-error'],
          description: '可选。规划策略：react=ReAct思考-行动-观察循环（默认），plan-and-execute=先拆解子任务再逐步执行，trial-and-error=允许试错重试。复杂任务建议用 plan-and-execute。'
        },
        memory_config: {
          type: 'object',
          description: '可选。记忆配置。historyTurns=对话历史保留轮数（默认10），longTermEnabled=是否启用长期记忆（默认false），crossSession=是否跨会话记忆（默认false）。',
          properties: {
            historyTurns: { type: 'number', description: '对话历史保留轮数' },
            longTermEnabled: { type: 'boolean', description: '是否启用长期记忆' },
            crossSession: { type: 'boolean', description: '是否跨会话记忆' }
          }
        },
        termination_config: {
          type: 'object',
          description: '可选。终止条件。maxSteps=最大推理步数（默认50，0=无限），timeoutSeconds=超时秒数（0=不超时），autoStopOnGoal=达到目标后自动结束（默认true）。',
          properties: {
            maxSteps: { type: 'number', description: '最大推理步数（0=无限）' },
            timeoutSeconds: { type: 'number', description: '超时时间秒数（0=不超时）' },
            autoStopOnGoal: { type: 'boolean', description: '达到目标后自动结束' }
          }
        },
        model_config: {
          type: 'object',
          description: '可选。模型配置，可覆盖全局配置。providerId=绑定AI源ID，modelId=绑定模型ID，temperature=温度，maxTokens=最大token数。留空则使用对话/全局配置。',
          properties: {
            providerId: { type: 'string', description: '绑定的 AI 源 ID' },
            modelId: { type: 'string', description: '绑定的模型 ID' },
            temperature: { type: 'number', description: 'temperature 参数' },
            maxTokens: { type: 'number', description: 'max_tokens 参数' }
          }
        },
        knowledge_base_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '可选。绑定的知识库集合 ID 列表。为空则搜索全部知识库。指定后 Agent 的 knowledge_search 工具仅在这些集合中检索。'
        },
        context_policy: {
          type: 'object',
          description: '可选。上下文管理策略。strategy=fixed(固定截断)或compress(摘要压缩)，maxTokens=触发阈值，keepRecentTurns=保留最近轮数。',
          properties: {
            strategy: { type: 'string', enum: ['fixed', 'compress'], description: '策略：fixed=固定截断，compress=摘要压缩' },
            maxTokens: { type: 'number', description: '触发压缩/截断的 token 阈值' },
            keepRecentTurns: { type: 'number', description: '保留的原始最近轮数' }
          }
        },
        approval_policy: {
          type: 'object',
          description: '可选。工具审批策略。requireApprovalFor=需要审批的工具名列表，autoApproveRead=自动批准只读工具，autoApproveWrite=自动批准写工具。',
          properties: {
            requireApprovalFor: { type: 'array', items: { type: 'string' }, description: '需要审批的工具名列表' },
            autoApproveRead: { type: 'boolean', description: '自动批准只读类工具' },
            autoApproveWrite: { type: 'boolean', description: '自动批准写类工具' }
          }
        },
        max_parallel_subtasks: {
          type: 'number',
          description: '可选。并行子任务度上限。控制 workspace_dispatch_parallel 同时执行的最大子任务数。'
        },
        prompt_sections: {
          type: 'array',
          description: '可选。Prompt 段落配置，与设置页的 Prompt 段落等价。每项通常包含 id、type、title、content、enabled、order 等字段。',
          items: { type: 'object' }
        },
        prompt_template_id: {
          type: 'string',
          description: '可选。引用已有 Prompt 模板 ID。'
        },
        variables: {
          type: 'array',
          description: '可选。Prompt 变量定义列表。',
          items: { type: 'object' }
        },
        workflow: {
          type: 'object',
          description: '可选。Agent 工作流状态机配置，与设置页高级策略中的工作流状态机等价。'
        }
      },
      required: ['name', 'description', 'system_prompt']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  },

  // ==================== 并行子任务派发工具 ====================
  // Leader Agent 一次输出多个子任务，引擎用 Promise.all 并行执行
  // 结合 Plan 的 dependsOn，引擎自动按拓扑序批量并行

  {
    id: 'workspace:dispatch_parallel',
    name: 'workspace_dispatch_parallel',
    description: '并行分派多个子任务给团队成员执行。适用于多个无依赖或可并行的子任务场景，能显著缩短总执行时间。引擎会自动处理依赖关系：有依赖的任务会等待前置完成后再执行。每个子任务的结果按入参顺序返回。',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: '要并行执行的子任务列表',
          items: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: '执行此子任务的 Agent ID（必须是当前工作区团队成员）'
              },
              task_description: {
                type: 'string',
                description: '子任务的详细描述'
              },
              context_summary: {
                type: 'string',
                description: '（可选）传递给子 Agent 的上下文摘要'
              },
              depends_on_indexes: {
                type: 'array',
                items: { type: 'number' },
                description: '（可选）此子任务依赖的其他子任务序号（从0开始）。被依赖的子任务完成后此任务才会执行，实现拓扑排序调度'
              }
            },
            required: ['agent_id', 'task_description']
          }
        }
      },
      required: ['tasks']
    },
    isBuiltIn: true,
    isMCP: false,
    enabled: true
  }
]
