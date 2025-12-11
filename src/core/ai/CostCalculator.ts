/**
 * AI 成本计算器
 * 
 * 抽象计费模型，便于统计和限额管理
 * 
 * 设计原则：
 * 1. 各 Provider 保持各自的货币（DeepSeek→CNY，OpenAI→USD，Ollama→FREE）
 * 2. 使用 API 返回的真实缓存数据进行精确计费
 * 3. 统一的成本计算接口，便于扩展新的 Provider
 */

/**
 * 货币类型
 */
export type Currency = 'CNY' | 'USD' | 'FREE'

/**
 * Token 用量数据（来自 API 响应）
 */
export interface TokenUsage {
  /** 输入 tokens 总数 */
  input: number
  /** 输出 tokens 总数 */
  output: number
  /** 缓存命中的输入 tokens（可选，用于精确计费） */
  cachedInput?: number
}

/**
 * 成本计算结果
 */
export interface CostBreakdown {
  /** 输入成本 */
  input: number
  /** 输出成本 */
  output: number
  /** 总成本 */
  total: number
  /** 货币类型 */
  currency: Currency
}

/**
 * 模型定价信息
 */
export interface ModelPricing {
  /** 模型 ID */
  modelId: string
  /** 输入价格（每 1M tokens） */
  inputPrice: number
  /** 缓存输入价格（每 1M tokens，可选） */
  cachedInputPrice?: number
  /** 输出价格（每 1M tokens） */
  outputPrice: number
  /** 货币类型 */
  currency: Currency
}

/**
 * 成本计算器接口
 * 
 * 所有 Provider 都应该实现此接口
 */
export interface ICostCalculator {
  /**
   * 获取成本计算器名称（Provider 名称）
   */
  readonly providerName: string
  
  /**
   * 获取货币类型
   */
  readonly currency: Currency
  
  /**
   * 计算成本
   * 
   * @param usage Token 用量数据
   * @param modelId 模型 ID（可选，用于区分不同模型的定价）
   * @returns 成本明细
   */
  calculateCost(usage: TokenUsage, modelId?: string): CostBreakdown
  
  /**
   * 获取模型定价信息
   * 
   * @param modelId 模型 ID
   * @returns 定价信息，如果模型不存在则返回 null
   */
  getPricing(modelId: string): ModelPricing | null
  
  /**
   * 获取所有支持的模型定价
   */
  getAllPricing(): ModelPricing[]
}

/**
 * 基础成本计算器实现
 * 
 * 提供默认的计算逻辑，子类可以覆盖特定行为
 */
export abstract class BaseCostCalculator implements ICostCalculator {
  abstract readonly providerName: string
  abstract readonly currency: Currency
  
  /**
   * 定价表（子类需要实现）
   */
  protected abstract readonly pricingTable: Map<string, Omit<ModelPricing, 'modelId'>>
  
  /**
   * 默认模型 ID（当未指定模型时使用）
   */
  protected abstract readonly defaultModelId: string
  
  /**
   * 计算成本
   */
  calculateCost(usage: TokenUsage, modelId?: string): CostBreakdown {
    const pricing = this.getPricing(modelId || this.defaultModelId)
    
    if (!pricing) {
      // 未知模型，返回 0 成本
      return {
        input: 0,
        output: 0,
        total: 0,
        currency: this.currency
      }
    }
    
    // 计算输入成本
    let inputCost: number
    if (usage.cachedInput !== undefined && pricing.cachedInputPrice !== undefined) {
      // 有缓存数据，精确计算
      const uncachedInput = usage.input - usage.cachedInput
      inputCost = (usage.cachedInput / 1_000_000) * pricing.cachedInputPrice +
                  (uncachedInput / 1_000_000) * pricing.inputPrice
    } else {
      // 无缓存数据，全部按未命中计算（保守估计）
      inputCost = (usage.input / 1_000_000) * pricing.inputPrice
    }
    
    // 计算输出成本
    const outputCost = (usage.output / 1_000_000) * pricing.outputPrice
    
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
      currency: this.currency
    }
  }
  
  /**
   * 获取模型定价
   */
  getPricing(modelId: string): ModelPricing | null {
    const pricing = this.pricingTable.get(modelId)
    if (!pricing) {
      return null
    }
    return {
      modelId,
      ...pricing
    }
  }
  
  /**
   * 获取所有定价
   */
  getAllPricing(): ModelPricing[] {
    return Array.from(this.pricingTable.entries()).map(([modelId, pricing]) => ({
      modelId,
      ...pricing
    }))
  }
}

/**
 * DeepSeek 成本计算器
 * 
 * 定价来源: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 * 
 * deepseek-chat (DeepSeek-V3.2 非思考模式):
 * - 输入（缓存命中）: ¥0.2/M
 * - 输入（缓存未命中）: ¥2/M
 * - 输出: ¥3/M
 * 
 * deepseek-reasoner (DeepSeek-V3.2 思考模式):
 * - 输入: ¥4/M (无缓存)
 * - 输出: ¥16/M
 */
export class DeepSeekCostCalculator extends BaseCostCalculator {
  readonly providerName = 'DeepSeek'
  readonly currency: Currency = 'CNY'
  protected readonly defaultModelId = 'deepseek-chat'
  
  protected readonly pricingTable = new Map<string, Omit<ModelPricing, 'modelId'>>([
    ['deepseek-chat', {
      inputPrice: 2.0,        // ¥2/M (缓存未命中)
      cachedInputPrice: 0.2,  // ¥0.2/M (缓存命中)
      outputPrice: 3.0,       // ¥3/M
      currency: 'CNY'
    }],
    ['deepseek-reasoner', {
      inputPrice: 4.0,        // ¥4/M (无缓存)
      outputPrice: 16.0,      // ¥16/M
      currency: 'CNY'
    }]
  ])
}

/**
 * OpenAI 成本计算器
 * 
 * 定价来源: https://openai.com/api/pricing/
 * 注意: 保持 USD，不转换货币
 */
export class OpenAICostCalculator extends BaseCostCalculator {
  readonly providerName = 'OpenAI'
  readonly currency: Currency = 'USD'
  protected readonly defaultModelId = 'gpt-4o-mini'
  
  protected readonly pricingTable = new Map<string, Omit<ModelPricing, 'modelId'>>([
    // GPT-4o 系列
    ['gpt-4o', {
      inputPrice: 2.50,
      cachedInputPrice: 1.25,
      outputPrice: 10.0,
      currency: 'USD'
    }],
    ['gpt-4o-mini', {
      inputPrice: 0.15,
      cachedInputPrice: 0.075,
      outputPrice: 0.60,
      currency: 'USD'
    }],
    // o1 系列（推理模型）
    ['o1', {
      inputPrice: 15.0,
      cachedInputPrice: 7.50,
      outputPrice: 60.0,
      currency: 'USD'
    }],
    ['o1-mini', {
      inputPrice: 3.0,
      cachedInputPrice: 1.50,
      outputPrice: 12.0,
      currency: 'USD'
    }],
    // GPT-5 系列（代号，实际定价需确认）
    ['gpt-5-nano', {
      inputPrice: 0.050,
      cachedInputPrice: 0.005,
      outputPrice: 0.400,
      currency: 'USD'
    }],
    ['gpt-5-mini', {
      inputPrice: 0.250,
      cachedInputPrice: 0.025,
      outputPrice: 2.0,
      currency: 'USD'
    }],
    ['gpt-5', {
      inputPrice: 1.25,
      cachedInputPrice: 0.125,
      outputPrice: 10.0,
      currency: 'USD'
    }],
    ['o4-mini', {
      inputPrice: 4.0,
      cachedInputPrice: 1.0,
      outputPrice: 16.0,
      currency: 'USD'
    }]
  ])
}

/**
 * Ollama 成本计算器
 * 
 * 本地模型免费，但仍然跟踪 token 用量
 */
export class OllamaCostCalculator extends BaseCostCalculator {
  readonly providerName = 'Ollama'
  readonly currency: Currency = 'FREE'
  protected readonly defaultModelId = 'local'
  
  protected readonly pricingTable = new Map<string, Omit<ModelPricing, 'modelId'>>([
    // 所有本地模型都是免费的
    ['local', {
      inputPrice: 0,
      cachedInputPrice: 0,
      outputPrice: 0,
      currency: 'FREE'
    }]
  ])
  
  /**
   * Ollama 覆盖 getPricing，所有模型返回免费定价
   */
  getPricing(modelId: string): ModelPricing {
    // 所有本地模型都是免费的
    return {
      modelId,
      inputPrice: 0,
      cachedInputPrice: 0,
      outputPrice: 0,
      currency: 'FREE'
    }
  }
  
  /**
   * Ollama 覆盖 calculateCost，始终返回 0
   */
  calculateCost(usage: TokenUsage, modelId?: string): CostBreakdown {
    return {
      input: 0,
      output: 0,
      total: 0,
      currency: 'FREE'
    }
  }
}

/**
 * 成本计算器工厂
 * 
 * 根据 Provider 名称获取对应的成本计算器
 */
export class CostCalculatorFactory {
  private static readonly calculators = new Map<string, ICostCalculator>([
    ['deepseek', new DeepSeekCostCalculator()],
    ['openai', new OpenAICostCalculator()],
    ['ollama', new OllamaCostCalculator()]
  ])
  
  /**
   * 获取成本计算器
   * 
   * @param providerName Provider 名称（不区分大小写）
   * @returns 对应的成本计算器，如果不存在则返回 Ollama 计算器（返回 0）
   */
  static getCalculator(providerName: string): ICostCalculator {
    const calculator = this.calculators.get(providerName.toLowerCase())
    if (!calculator) {
      // 未知 Provider，返回 Ollama 计算器（免费）
      return this.calculators.get('ollama')!
    }
    return calculator
  }
  
  /**
   * 注册自定义成本计算器
   * 
   * @param providerName Provider 名称
   * @param calculator 成本计算器实例
   */
  static registerCalculator(providerName: string, calculator: ICostCalculator): void {
    this.calculators.set(providerName.toLowerCase(), calculator)
  }
  
  /**
   * 获取所有已注册的 Provider 名称
   */
  static getRegisteredProviders(): string[] {
    return Array.from(this.calculators.keys())
  }
}
