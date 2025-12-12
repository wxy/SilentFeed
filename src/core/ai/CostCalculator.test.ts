/**
 * CostCalculator 单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  DeepSeekCostCalculator,
  OpenAICostCalculator,
  OllamaCostCalculator,
  CostCalculatorFactory,
  type TokenUsage
} from './CostCalculator'

describe('DeepSeekCostCalculator', () => {
  const calculator = new DeepSeekCostCalculator()
  
  it('应该返回正确的 Provider 名称和货币', () => {
    expect(calculator.providerName).toBe('DeepSeek')
    expect(calculator.currency).toBe('CNY')
  })
  
  describe('deepseek-chat 成本计算', () => {
    it('无缓存数据时应该按全部未命中计算', () => {
      const usage: TokenUsage = {
        input: 1000000,  // 1M tokens
        output: 500000   // 0.5M tokens
      }
      
      const result = calculator.calculateCost(usage, 'deepseek-chat')
      
      // 输入: 1M * ¥2/M = ¥2
      // 输出: 0.5M * ¥3/M = ¥1.5
      // 总计: ¥3.5
      expect(result.input).toBeCloseTo(2.0, 4)
      expect(result.output).toBeCloseTo(1.5, 4)
      expect(result.total).toBeCloseTo(3.5, 4)
      expect(result.currency).toBe('CNY')
    })
    
    it('有缓存数据时应该使用精确计算', () => {
      const usage: TokenUsage = {
        input: 1000000,      // 1M tokens
        output: 500000,      // 0.5M tokens
        cachedInput: 800000  // 80% 缓存命中
      }
      
      const result = calculator.calculateCost(usage, 'deepseek-chat')
      
      // 缓存命中: 0.8M * ¥0.2/M = ¥0.16
      // 缓存未命中: 0.2M * ¥2/M = ¥0.4
      // 输入总计: ¥0.56
      // 输出: 0.5M * ¥3/M = ¥1.5
      // 总计: ¥2.06
      expect(result.input).toBeCloseTo(0.56, 4)
      expect(result.output).toBeCloseTo(1.5, 4)
      expect(result.total).toBeCloseTo(2.06, 4)
    })
  })
  
  describe('deepseek-reasoner 成本计算', () => {
    it('应该使用推理模型定价（无缓存）', () => {
      const usage: TokenUsage = {
        input: 1000000,      // 1M tokens
        output: 500000,      // 0.5M tokens
        cachedInput: 800000  // 即使有缓存数据也忽略
      }
      
      const result = calculator.calculateCost(usage, 'deepseek-reasoner')
      
      // 输入: 1M * ¥4/M = ¥4（推理模型无缓存）
      // 输出: 0.5M * ¥16/M = ¥8
      // 总计: ¥12
      expect(result.input).toBeCloseTo(4.0, 4)
      expect(result.output).toBeCloseTo(8.0, 4)
      expect(result.total).toBeCloseTo(12.0, 4)
    })
  })
  
  describe('定价信息', () => {
    it('应该返回正确的定价信息', () => {
      const chatPricing = calculator.getPricing('deepseek-chat')
      expect(chatPricing).not.toBeNull()
      expect(chatPricing!.inputPrice).toBe(2.0)
      expect(chatPricing!.cachedInputPrice).toBe(0.2)
      expect(chatPricing!.outputPrice).toBe(3.0)
      
      const reasonerPricing = calculator.getPricing('deepseek-reasoner')
      expect(reasonerPricing).not.toBeNull()
      expect(reasonerPricing!.inputPrice).toBe(4.0)
      expect(reasonerPricing!.outputPrice).toBe(16.0)
    })
    
    it('未知模型应该返回 null', () => {
      const pricing = calculator.getPricing('unknown-model')
      expect(pricing).toBeNull()
    })
  })
})

describe('OpenAICostCalculator', () => {
  const calculator = new OpenAICostCalculator()
  
  it('应该返回正确的 Provider 名称和货币', () => {
    expect(calculator.providerName).toBe('OpenAI')
    expect(calculator.currency).toBe('USD')
  })
  
  describe('gpt-4o-mini 成本计算', () => {
    it('无缓存数据时应该按全部未命中计算', () => {
      const usage: TokenUsage = {
        input: 1000000,  // 1M tokens
        output: 500000   // 0.5M tokens
      }
      
      const result = calculator.calculateCost(usage, 'gpt-4o-mini')
      
      // 输入: 1M * $0.15/M = $0.15
      // 输出: 0.5M * $0.60/M = $0.30
      // 总计: $0.45
      expect(result.input).toBeCloseTo(0.15, 4)
      expect(result.output).toBeCloseTo(0.30, 4)
      expect(result.total).toBeCloseTo(0.45, 4)
      expect(result.currency).toBe('USD')
    })
    
    it('有缓存数据时应该使用精确计算', () => {
      const usage: TokenUsage = {
        input: 1000000,      // 1M tokens
        output: 500000,      // 0.5M tokens
        cachedInput: 800000  // 80% 缓存命中
      }
      
      const result = calculator.calculateCost(usage, 'gpt-4o-mini')
      
      // 缓存命中: 0.8M * $0.075/M = $0.06
      // 缓存未命中: 0.2M * $0.15/M = $0.03
      // 输入总计: $0.09
      // 输出: 0.5M * $0.60/M = $0.30
      // 总计: $0.39
      expect(result.input).toBeCloseTo(0.09, 4)
      expect(result.output).toBeCloseTo(0.30, 4)
      expect(result.total).toBeCloseTo(0.39, 4)
    })
  })
  
  describe('定价信息', () => {
    it('应该返回所有支持的模型定价', () => {
      const allPricing = calculator.getAllPricing()
      expect(allPricing.length).toBeGreaterThan(0)
      
      const modelIds = allPricing.map(p => p.modelId)
      expect(modelIds).toContain('gpt-4o')
      expect(modelIds).toContain('gpt-4o-mini')
      expect(modelIds).toContain('o1')
      expect(modelIds).toContain('o1-mini')
    })
  })
})

describe('OllamaCostCalculator', () => {
  const calculator = new OllamaCostCalculator()
  
  it('应该返回正确的 Provider 名称和货币', () => {
    expect(calculator.providerName).toBe('Ollama')
    expect(calculator.currency).toBe('FREE')
  })
  
  it('应该始终返回 0 成本', () => {
    const usage: TokenUsage = {
      input: 1000000,
      output: 500000,
      cachedInput: 800000
    }
    
    const result = calculator.calculateCost(usage, 'any-model')
    
    expect(result.input).toBe(0)
    expect(result.output).toBe(0)
    expect(result.total).toBe(0)
    expect(result.currency).toBe('FREE')
  })
  
  it('任何模型都应该返回免费定价', () => {
    const pricing = calculator.getPricing('llama3.2')
    expect(pricing).not.toBeNull()
    expect(pricing!.inputPrice).toBe(0)
    expect(pricing!.outputPrice).toBe(0)
    expect(pricing!.currency).toBe('FREE')
  })
})

describe('CostCalculatorFactory', () => {
  it('应该返回正确的计算器', () => {
    expect(CostCalculatorFactory.getCalculator('deepseek').providerName).toBe('DeepSeek')
    expect(CostCalculatorFactory.getCalculator('DeepSeek').providerName).toBe('DeepSeek')
    expect(CostCalculatorFactory.getCalculator('openai').providerName).toBe('OpenAI')
    expect(CostCalculatorFactory.getCalculator('OpenAI').providerName).toBe('OpenAI')
    expect(CostCalculatorFactory.getCalculator('ollama').providerName).toBe('Ollama')
    expect(CostCalculatorFactory.getCalculator('Ollama').providerName).toBe('Ollama')
  })
  
  it('未知 Provider 应该返回 Ollama 计算器（免费）', () => {
    const calculator = CostCalculatorFactory.getCalculator('unknown-provider')
    expect(calculator.providerName).toBe('Ollama')
    expect(calculator.currency).toBe('FREE')
  })
  
  it('应该返回所有已注册的 Provider', () => {
    const providers = CostCalculatorFactory.getRegisteredProviders()
    expect(providers).toContain('deepseek')
    expect(providers).toContain('openai')
    expect(providers).toContain('ollama')
  })
})
