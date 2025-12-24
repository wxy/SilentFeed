/**
 * 分析引擎能力检测工具测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkEngineCapability,
  checkAllEngineCapabilities,
  getRecommendedEngine
} from './analysis-engine-capability'
import type { AIConfig } from '@/storage/ai-config'

const encodeApiKey = (key?: string): string | undefined => {
  if (!key) return undefined
  return Buffer.from(key, 'utf-8').toString('base64')
}

const createAIConfig = (overrides: Partial<AIConfig> = {}): AIConfig => {
  const { local: localOverride, providers: providersOverride, ...rest } = overrides
  
  return {
    providers: providersOverride || {},
    monthlyBudget: 5,
    local: {
      enabled: false,
      provider: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'llama2',  // 不再硬编码 qwen2.5:7b
      temperature: 0.2,
      maxOutputTokens: 768,
      timeoutMs: 45000,
      ...(localOverride || {})
    },
    engineAssignment: {
      pageAnalysis: { provider: 'deepseek', useReasoning: false },
      articleAnalysis: { provider: 'deepseek', useReasoning: false },
      profileGeneration: { provider: 'deepseek', useReasoning: false }
    },
    ...rest
  }
}

const createModelsResponse = () => ({
  ok: true,
  json: () => Promise.resolve({ data: [{ id: 'llama2' }] })
})

// Mock storage
const mockStorage = {
  sync: {
    data: {} as Record<string, any>,
    get: vi.fn((keys) => {
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: mockStorage.sync.data[keys] })
      }
      return Promise.resolve(mockStorage.sync.data)
    }),
    set: vi.fn((items) => {
      Object.assign(mockStorage.sync.data, items)
      return Promise.resolve()
    }),
    remove: vi.fn((keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys]
      keysArray.forEach(key => delete mockStorage.sync.data[key])
      return Promise.resolve()
    })
  }
}

// Mock chrome API
global.chrome = {
  storage: mockStorage
} as any

// Mock fetch
global.fetch = vi.fn()

describe('analysis-engine-capability', () => {
  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks()
    mockStorage.sync.data = {}
    
    // 重置 window.ai
    if ('ai' in window) {
      delete (window as any).ai
    }
  })
  
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkEngineCapability', () => {
    it('keyword 引擎始终可用', async () => {
      const result = await checkEngineCapability('keyword')
      
      expect(result.available).toBe(true)
      expect(result.reason).toContain('TF-IDF')
    })

    it('remoteAI 未配置时不可用', async () => {
      const result = await checkEngineCapability('remoteAI')
      
      expect(result.available).toBe(false)
      expect(result.reason).toContain('未配置')
    })

    it('remoteAI 已配置时可用', async () => {
      // 设置 AI 配置
      const aiConfig = createAIConfig({
        providers: {
          openai: {
            apiKey: 'sk-test123456789',
            model: 'gpt-4o-mini'
          }
        }
      })
      mockStorage.sync.data.aiConfig = aiConfig
      
      const result = await checkEngineCapability('remoteAI')
      
      expect(result.available).toBe(true)
      expect(result.reason).toContain('openai')
    })

    it('remoteAIWithReasoning 需要启用推理能力', async () => {
      // 使用 OpenAI，推理未启用
      mockStorage.sync.data.aiConfig = createAIConfig({
        providers: {
          openai: {
            apiKey: 'sk-test123456789',
            model: 'gpt-4o-mini',
            enableReasoning: false
          }
        }
      })
      
      let result = await checkEngineCapability('remoteAIWithReasoning')
      expect(result.available).toBe(false)
      expect(result.reason).toContain('推理能力未启用')
      
      // OpenAI 启用推理（但暂不支持）
      mockStorage.sync.data.aiConfig.providers.openai!.enableReasoning = true
      
      result = await checkEngineCapability('remoteAIWithReasoning')
      expect(result.available).toBe(false)
      expect(result.reason).toContain('暂不支持推理模式')
      
      // 切换到 DeepSeek 并启用推理
      mockStorage.sync.data.aiConfig = createAIConfig({
        providers: {
          deepseek: {
            apiKey: 'sk-test123456789012345678901234567890',
            model: 'deepseek-chat',
            enableReasoning: true
          }
        }
      })
      
      result = await checkEngineCapability('remoteAIWithReasoning')
      expect(result.available).toBe(true)
      expect(result.reason).toContain('DeepSeek-R1')
    })

    it('localAI 未启用时即使检测到 Chrome AI 也不可用', async () => {
      // Mock Chrome AI
      ;(window as any).ai = {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: 'readily' })
        }
      }

      mockStorage.sync.data.aiConfig = createAIConfig()
      
      const result = await checkEngineCapability('localAI')
      
      expect(result.available).toBe(false)
      expect(result.reason).toContain('未启用')
    })

    it('localAI 检测 Ollama', async () => {
      // Mock Ollama API
      ;(global.fetch as any).mockResolvedValue(createModelsResponse())

      mockStorage.sync.data.aiConfig = createAIConfig({
        local: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: 'llama2',
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        }
      })
      
      const result = await checkEngineCapability('localAI')
      
      expect(result.available).toBe(true)
      expect(result.reason).toContain('Ollama')
      // Phase 11.2: 使用 /v1 接口模式
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.any(Object)
      )
    })

    it('localAI 同时检测到两个服务', async () => {
      // Mock Chrome AI
      ;(window as any).ai = {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: 'readily' })
        }
      }
      
      // Mock Ollama API
      ;(global.fetch as any).mockResolvedValue(createModelsResponse())

      mockStorage.sync.data.aiConfig = createAIConfig({
        local: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: 'llama2',
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        }
      })
      
      const result = await checkEngineCapability('localAI')
      
      expect(result.available).toBe(true)
      expect(result.reason).toContain('Ollama')
    })

    it('localAI 无可用服务时返回不可用', async () => {
      // Mock Ollama 不可用
      ;(global.fetch as any).mockRejectedValue(new Error('Connection refused'))

      mockStorage.sync.data.aiConfig = createAIConfig({
        local: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: 'llama2',
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        }
      })
      
      const result = await checkEngineCapability('localAI')
      
      expect(result.available).toBe(false)
      expect(result.reason).toContain('无法连接到 Ollama')
    })
  })

  describe('checkAllEngineCapabilities', () => {
    it('返回所有引擎的能力检测结果', async () => {
      // 配置远程 AI
      mockStorage.sync.data.aiConfig = createAIConfig({
        providers: {
          openai: {
            apiKey: 'sk-test123456789',
            model: 'gpt-4o-mini',
            enableReasoning: false
          }
        }
      })
      
      const result = await checkAllEngineCapabilities()
      
      expect(result).toHaveProperty('remoteAI')
      expect(result).toHaveProperty('remoteAIWithReasoning')
      expect(result).toHaveProperty('localAI')
      expect(result).toHaveProperty('keyword')
      
      // keyword 始终可用
      expect(result.keyword.available).toBe(true)
      
      // remoteAI 已配置
      expect(result.remoteAI.available).toBe(true)
      
      // remoteAIWithReasoning 需要 DeepSeek
      expect(result.remoteAIWithReasoning.available).toBe(false)
    })
  })

  describe('getRecommendedEngine', () => {
    it('优先推荐远程 AI', async () => {
      // 配置远程 AI
      mockStorage.sync.data.aiConfig = createAIConfig({
        providers: {
          openai: {
            apiKey: 'sk-test123456789',
            model: 'gpt-4o-mini',
            enableReasoning: false
          }
        }
      })
      
      const result = await getRecommendedEngine()
      
      expect(result.engine).toBe('remoteAI')
      expect(result.reason).toContain('远程 AI')
    })

    it('远程 AI 不可用时推荐本地 AI', async () => {
      // Mock Chrome AI
      ;(window as any).ai = {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: 'readily' })
        }
      }
      ;(global.fetch as any).mockResolvedValue(createModelsResponse())

      mockStorage.sync.data.aiConfig = createAIConfig({
        local: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: 'llama2',
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        }
      })
      
      const result = await getRecommendedEngine()
      
      expect(result.engine).toBe('localAI')
      expect(result.reason).toContain('Ollama')
    })

    it('无 AI 可用时推荐关键字', async () => {
      // Mock Ollama 不可用
      ;(global.fetch as any).mockRejectedValue(new Error('Connection refused'))
      
      const result = await getRecommendedEngine()
      
      expect(result.engine).toBe('keyword')
      expect(result.reason).toContain('TF-IDF')
    })

    it('不主动推荐推理模式（成本考虑）', async () => {
      // 配置 DeepSeek 并启用推理
      mockStorage.sync.data.aiConfig = createAIConfig({
        providers: {
          deepseek: {
            apiKey: 'sk-test123456789012345678901234567890',
            model: 'deepseek-chat',
            enableReasoning: true
          }
        }
      })
      
      const result = await getRecommendedEngine()
      
      // 即使推理模式可用，也不主动推荐
      expect(result.engine).toBe('remoteAI')
      expect(result.engine).not.toBe('remoteAIWithReasoning')
    })
  })
})
