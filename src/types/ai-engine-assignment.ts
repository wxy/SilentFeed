/**
 * AI 引擎分配类型定义
 * 
 * 允许用户为不同用途分配不同的 AI 引擎，优化成本、性能和隐私的平衡
 */

/** AI 提供商类型 - 具体实现 */
export type ConcreteAIProvider = "ollama" | "deepseek" | "openai"

/** AI 提供商类型 - 包含抽象类型 remote/local */
export type AIProvider = ConcreteAIProvider | "remote" | "local"

/** AI 引擎配置 */
export interface AIEngineConfig {
  /** AI 提供商 */
  provider: AIProvider
  /** 模型名称（可选，如果为空则使用默认模型） */
  model?: string
  /** 是否启用推理模式（仅低频任务支持） */
  useReasoning?: boolean
}

/** AI 引擎分配配置 */
export interface AIEngineAssignment {
  /** 页面浏览学习（浏览历史分析） - 高频任务 */
  pageAnalysis: AIEngineConfig
  
  /** 文章内容分析（推荐文章打分） - 高频任务 */
  articleAnalysis: AIEngineConfig
  
  /** 
   * 低频任务统一配置
   * 
   * 包括：
   * - 用户画像生成（每周1-2次）
   * - 订阅源质量分析（添加订阅源时）
   * - 推荐池策略决策（每天1次）
   * - 未来的其他优化任务
   * 
   * 低频任务调用频率低，可以使用更强大的模型（如推理模式），
   * 因为成本影响小，同时能提供更好的质量。
   */
  lowFrequencyTasks: AIEngineConfig
  
  /** 
   * @deprecated 兼容旧配置，保留用于配置迁移
   * 请使用 lowFrequencyTasks 替代
   */
  profileGeneration?: AIEngineConfig
  
  /** 
   * @deprecated 兼容旧配置，保留用于配置迁移
   * 请使用 lowFrequencyTasks 替代
   */
  sourceAnalysis?: AIEngineConfig
}

/** 预设方案名称 */
export type PresetName = "privacy" | "intelligence" | "economic"

/** 预设方案定义 */
export interface PresetDefinition {
  /** 方案名称 */
  name: string
  /** 图标 */
  icon: string
  /** 描述 */
  description: string
  /** 是否为推荐方案 */
  recommended?: boolean
  /** 预估月成本 */
  estimatedCost: string
  /** 性能影响说明 */
  performanceImpact: string
  /** 引擎配置 */
  config: AIEngineAssignment
  /** 优势说明 */
  benefits: string[]
  /** 注意事项 */
  warnings: string[]
}

/**
 * AI 引擎预设方案
 */
export const AI_ENGINE_PRESETS: Record<PresetName, PresetDefinition> = {
  // 🔒 隐私优先 - 全部本地AI
  privacy: {
    name: "隐私优先",
    icon: "🔒",
    description: "所有数据在本地处理，绝不上传",
    estimatedCost: "¥0/月",
    performanceImpact: "🔥🔥🔥 高",
    config: {
      pageAnalysis: {
        provider: "local",  // 抽象：使用本地 AI（默认 Ollama）
        useReasoning: false
      },
      articleAnalysis: {
        provider: "local",  // 抽象：使用本地 AI（默认 Ollama）
        useReasoning: false
      },
      lowFrequencyTasks: {
        provider: "local",  // 低频任务也使用本地 AI
        useReasoning: false
      }
    },
    benefits: [
      "✅ 完全隐私保护，数据不离开设备",
      "✅ 零API成本",
      "✅ 无需网络连接"
    ],
    warnings: [
      "⚠️ 学习文章时每次等待3-5秒，CPU占用30-50%",
      "⚠️ 订阅源批量分析时设备会明显卡顿",
      "⚠️ 建议仅在高性能设备上使用"
    ]
  },

  // 🧠 智能优先 - 远程AI + 推理引擎 (推荐)
  intelligence: {
    name: "智能优先",
    icon: "🧠",
    description: "最佳AI能力，推理模式保证质量",
    recommended: true,
    estimatedCost: "¥5-8/月",
    performanceImpact: "🔥 低（仅低频任务稍慢）",
    config: {
      pageAnalysis: {
        provider: "remote",  // 抽象：使用远程 AI（默认 DeepSeek）
        useReasoning: false
      },
      articleAnalysis: {
        provider: "remote",  // 抽象：使用远程 AI（默认 DeepSeek）
        useReasoning: false
      },
      lowFrequencyTasks: {
        provider: "remote",  // 低频任务使用远程 AI
        useReasoning: true  // 低频任务使用推理模式提高准确性
      }
    },
    benefits: [
      "✅ 零本机性能消耗",
      "✅ 推理模式深度理解用户兴趣",
      "✅ 推荐质量最高，个性化最精准",
      "✅ 低频任务慢一点可接受"
    ],
    warnings: [
      "⚠️ 画像生成和推荐理由耗时会增加2-3倍（3-5秒）",
      "⚠️ 每月API成本约¥5-8"
    ]
  },

  // 💰 经济优先 - 远程AI标准模式
  economic: {
    name: "经济优先",
    icon: "💰",
    description: "成本最低，标准质量足够好",
    estimatedCost: "¥0.5-1/月",
    performanceImpact: "✅ 无",
    config: {
      pageAnalysis: {
        provider: "remote",  // 抽象：使用远程 AI（默认 DeepSeek）
        useReasoning: false
      },
      articleAnalysis: {
        provider: "remote",  // 抽象：使用远程 AI（默认 DeepSeek）
        useReasoning: false
      },
      lowFrequencyTasks: {
        provider: "remote",  // 低频任务使用远程 AI
        useReasoning: false  // 不用推理，省钱
      }
    },
    benefits: [
      "✅ 零本机性能消耗",
      "✅ 成本极低（<¥1/月）",
      "✅ 标准质量对大多数场景足够",
      "✅ 响应速度快（无推理耗时）"
    ],
    warnings: [
      "⚠️ 画像和推荐精度略低于智能优先方案"
    ]
  }
}

/**
 * 获取默认引擎分配（智能优先）
 */
export function getDefaultEngineAssignment(): AIEngineAssignment {
  return AI_ENGINE_PRESETS.intelligence.config
}

/**
 * 迁移旧配置到新格式
 * 
 * 将 profileGeneration 和 sourceAnalysis 合并为 lowFrequencyTasks
 */
export function migrateEngineAssignment(oldConfig: Partial<AIEngineAssignment>): AIEngineAssignment {
  // 如果已有 lowFrequencyTasks，直接返回（已迁移）
  if (oldConfig.lowFrequencyTasks) {
    return {
      pageAnalysis: oldConfig.pageAnalysis || getDefaultEngineAssignment().pageAnalysis,
      articleAnalysis: oldConfig.articleAnalysis || getDefaultEngineAssignment().articleAnalysis,
      lowFrequencyTasks: oldConfig.lowFrequencyTasks
    }
  }
  
  // 迁移逻辑：使用 profileGeneration 作为 lowFrequencyTasks
  const defaultAssignment = getDefaultEngineAssignment()
  return {
    pageAnalysis: oldConfig.pageAnalysis || defaultAssignment.pageAnalysis,
    articleAnalysis: oldConfig.articleAnalysis || defaultAssignment.articleAnalysis,
    lowFrequencyTasks: oldConfig.profileGeneration || oldConfig.sourceAnalysis || defaultAssignment.lowFrequencyTasks
  }
}

/**
 * 验证引擎配置是否有效
 */
export function validateEngineConfig(config: AIEngineConfig): boolean {
  // 检查 provider 是否有效（包括抽象类型 remote/local）
  const validProviders: AIProvider[] = ["ollama", "deepseek", "openai", "remote", "local"]
  if (!validProviders.includes(config.provider)) {
    return false
  }

  return true
}

/**
 * 验证引擎分配是否有效
 */
export function validateEngineAssignment(assignment: AIEngineAssignment): boolean {
  // 验证每个任务的配置
  if (!validateEngineConfig({ ...assignment.pageAnalysis, useReasoning: false })) {
    return false
  }
  if (!validateEngineConfig({ ...assignment.articleAnalysis, useReasoning: false })) {
    return false
  }
  if (!validateEngineConfig(assignment.lowFrequencyTasks)) {
    return false
  }

  return true
}

/**
 * 获取预设方案的显示信息
 */
export function getPresetDisplayInfo(presetName: PresetName) {
  const preset = AI_ENGINE_PRESETS[presetName]
  return {
    name: preset.name,
    icon: preset.icon,
    description: preset.description,
    recommended: preset.recommended,
    estimatedCost: preset.estimatedCost,
    performanceImpact: preset.performanceImpact
  }
}
