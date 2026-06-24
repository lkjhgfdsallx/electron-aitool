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
  }
]
