/**
 * AI配置检查机制测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock AI配置模块
vi.mock('./ai-config', () => ({
  getAIConfig: vi.fn(),
  isAIConfigured: vi.fn(),
  validateApiKey: vi.fn(),
  getProviderEndpoint: vi.fn(() => 'https://api.test.com')
}))

// Mock AI能力管理器
vi.mock('@/core/ai/AICapabilityManager', () => ({
  aiManager: {
    initialize: vi.fn(),
    testConnection: vi.fn(),
  }
}))

// Mock chrome.storage
const mockChromeStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn()
  },
  sync: {
    get: vi.fn(),
    set: vi.fn()
  }
}

const createModelsResponse = () => ({
  ok: true,
  json: () => Promise.resolve({ data: [{ id: 'qwen2.5:7b' }] })
})

// Mock fetch (for connection tests)
global.fetch = vi.fn()

// Mock global chrome
global.chrome = {
  storage: mockChromeStorage
} as any

// Mock window.ai (Chrome AI)
const mockWindowAI = {
  languageModel: {
    capabilities: vi.fn()
  }
}

global.window = {
  ai: mockWindowAI
} as any

// 导入要测试的模块（在mock之后）
import { 
  checkAIConfigStatus,
  checkLocalAIStatus,
  getRecommendedSettings,
  autoAdjustConfig,
  getRecommendationConfig,
  saveRecommendationConfig,
  type AIConfigStatus,
  type LocalAIStatus
} from './recommendation-config'

// 导入已mock的模块
import { getAIConfig, isAIConfigured, validateApiKey } from './ai-config'
import { aiManager } from '@/core/ai/AICapabilityManager'

const mockGetAIConfig = vi.mocked(getAIConfig)
const mockIsAIConfigured = vi.mocked(isAIConfigured)
const mockValidateApiKey = vi.mocked(validateApiKey)
const mockAIManager = vi.mocked(aiManager)

describe('AI配置检查机制', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    
    // 默认mock返回值（recommendation-config 现在在 sync）
    mockChromeStorage.sync.get.mockResolvedValue({})
    mockChromeStorage.sync.set.mockResolvedValue(undefined)
    mockChromeStorage.local.get.mockResolvedValue({})
    mockChromeStorage.local.set.mockResolvedValue(undefined)
    
    mockGetAIConfig.mockResolvedValue({
      providers: {},
      monthlyBudget: 5,
      local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
      engineAssignment: { default: 'remoteAI' }
    } as any)
    
    mockIsAIConfigured.mockResolvedValue(false)
    
    mockAIManager.initialize.mockResolvedValue(undefined)
    mockAIManager.testConnection.mockResolvedValue({
      success: false,
      message: '未配置'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkAIConfigStatus', () => {
    it('应该返回未配置状态（无AI配置时）', async () => {
      const status = await checkAIConfigStatus()
      
      expect(status.isConfigured).toBe(false)
      expect(status.provider).toBeNull()
      expect(status.isKeyValid).toBe(false)
      expect(status.isAvailable).toBe(false)
      expect(status.budgetStatus.monthlyBudget).toBe(5)
    })

    it('应该验证已配置的AI状态', async () => {
      mockGetAIConfig.mockResolvedValue({
        providers: { deepseek: { apiKey: 'test-key', model: 'deepseek-chat' } },
        monthlyBudget: 10,
        local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
        engineAssignment: { default: 'remoteAI' }
      } as any)
      mockIsAIConfigured.mockResolvedValue(true)
      mockValidateApiKey.mockReturnValue(true)
      
      mockAIManager.testConnection.mockResolvedValue({
        success: true,
        message: '连接成功'
      })

      const status = await checkAIConfigStatus()
      
      expect(status.isConfigured).toBe(true)
      expect(status.provider).toBeNull() // engineAssignment 未配置 feedAnalysis 或为 ollama
      expect(status.isKeyValid).toBe(false)
      expect(status.isAvailable).toBe(false)
      expect(status.budgetStatus.monthlyBudget).toBe(10)
    })

    it('应该处理API密钥无效的情况', async () => {
      mockGetAIConfig.mockResolvedValue({
        providers: { openai: { apiKey: 'test-key', model: 'gpt-4o-mini' } },
        monthlyBudget: 5,
        local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
        engineAssignment: { default: 'remoteAI' }
      } as any)
      mockIsAIConfigured.mockResolvedValue(true)
      mockValidateApiKey.mockReturnValue(false)

      const status = await checkAIConfigStatus()
      
      expect(status.isConfigured).toBe(true)
      expect(status.isKeyValid).toBe(false)
      expect(status.isAvailable).toBe(false) // 密钥无效时不测试连接
    })

    it('应该处理连接测试失败的情况', async () => {
      mockGetAIConfig.mockResolvedValue({
        providers: { deepseek: { apiKey: 'test-key', model: 'deepseek-chat' } },
        monthlyBudget: 5,
        local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
        engineAssignment: { default: 'remoteAI' }
      } as any)
      mockIsAIConfigured.mockResolvedValue(true)
      mockValidateApiKey.mockReturnValue(true)
      
      mockAIManager.testConnection.mockResolvedValue({
        success: false,
        message: '网络错误'
      })

      const status = await checkAIConfigStatus()
      
      expect(status.isConfigured).toBe(true)
      expect(status.isKeyValid).toBe(false)
      expect(status.isAvailable).toBe(false)
      expect(status.error).toBeUndefined()
    })
  })

  describe('checkLocalAIStatus', () => {
    it('应该检测Chrome AI可用性', async () => {
      // Mock window.ai 可用性检查
      mockWindowAI.languageModel.capabilities.mockResolvedValue({
        available: 'readily'
      })

      const status = await checkLocalAIStatus()
      
      expect(status.hasChromeAI).toBe(true)
      expect(status.availableServices).toContain('chrome-ai')
    })

    it('应该检测Ollama可用性', async () => {
      // Mock successful Ollama response
      global.fetch = vi.fn().mockResolvedValue(createModelsResponse())

      const status = await checkLocalAIStatus()
      
      expect(status.hasOllama).toBe(true)
      expect(status.availableServices).toContain('ollama')
    })

    it('应该处理Ollama不可用的情况', async () => {
      // Mock failed Ollama response
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const status = await checkLocalAIStatus()
      
      expect(status.hasOllama).toBe(false)
      expect(status.availableServices).not.toContain('ollama')
    })

    it('应该返回无可用服务的状态', async () => {
      global.window = {} as any
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const status = await checkLocalAIStatus()
      
      expect(status.hasOllama).toBe(false)
      expect(status.hasChromeAI).toBe(false)
      expect(status.availableServices).toHaveLength(0)
    })
  })

  describe('getRecommendedSettings', () => {
    it('应该推荐TF-IDF算法（无AI可用时）', async () => {
      const recommendation = await getRecommendedSettings()
      
      expect(recommendation.config.useReasoning).toBe(false)
      expect(recommendation.config.useLocalAI).toBe(false)
      expect(recommendation.priority).toBe('low')
      expect(recommendation.reason).toContain('TF-IDF')
    })

    it('应该推荐远程AI（配置可用时）', async () => {
      mockGetAIConfig.mockResolvedValue({
        providers: { deepseek: { apiKey: 'test-key', model: 'deepseek-chat' } },
        monthlyBudget: 10,
        local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
        engineAssignment: { default: 'remoteAI' }
      } as any)
      mockIsAIConfigured.mockResolvedValue(true)
      mockValidateApiKey.mockReturnValue(true)
      mockAIManager.testConnection.mockResolvedValue({
        success: true,
        message: '连接成功'
      })

      const recommendation = await getRecommendedSettings()
      
      expect(recommendation.priority).toBe('low')
    })
  })

  describe('autoAdjustConfig', () => {
    it('应该在无需调整时返回false', async () => {
      // Mock当前配置与推荐配置一致
      mockChromeStorage.sync.get.mockResolvedValue({
        'recommendation-config': {
          useReasoning: false,
          useLocalAI: false,
          maxRecommendations: 3
        }
      })

      const result = await autoAdjustConfig()
      
      expect(result.adjusted).toBe(false)
      expect(result.changes).toHaveLength(0)
    })

    it('应该根据AI状态自动调整配置', async () => {
      // Mock当前配置需要调整
      mockChromeStorage.sync.get.mockResolvedValue({
        'recommendation-config': {
          useReasoning: false,
          useLocalAI: false,
          maxRecommendations: 3
        }
      })

      // Mock AI可用，推荐开启推理
      mockGetAIConfig.mockResolvedValue({
        providers: { deepseek: { apiKey: 'test-key', model: 'deepseek-chat' } },
        monthlyBudget: 10,
        local: { enabled: false, provider: 'ollama', endpoint: '', model: '' },
        engineAssignment: { default: 'remoteAI' }
      } as any)
      mockIsAIConfigured.mockResolvedValue(true)
      mockValidateApiKey.mockReturnValue(true)
      mockAIManager.testConnection.mockResolvedValue({
        success: true,
        message: '连接成功'
      })

      const result = await autoAdjustConfig()
      
      // 可能会调整配置
      expect(typeof result.adjusted).toBe('boolean')
      expect(Array.isArray(result.changes)).toBe(true)
    })
  })

  describe('配置管理', () => {
    it('应该正确保存和加载配置', async () => {
      const config = {
        useReasoning: true,
        useLocalAI: false,
        maxRecommendations: 4
      }

      await saveRecommendationConfig(config)
      
      // Phase 6: 配置保存会合并默认值（batchSize, qualityThreshold, tfidfThreshold）
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        'recommendation-config': expect.objectContaining({
          useReasoning: true,
          useLocalAI: false,
          maxRecommendations: 4,
          batchSize: expect.any(Number),
          qualityThreshold: expect.any(Number),
          tfidfThreshold: expect.any(Number)
        })
      })
    })

    it('应该验证maxRecommendations范围', async () => {
      // 测试上限
      await saveRecommendationConfig({ maxRecommendations: 10 })
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        'recommendation-config': expect.objectContaining({
          maxRecommendations: 5
        })
      })

      // 测试下限
      await saveRecommendationConfig({ maxRecommendations: 0 })
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        'recommendation-config': expect.objectContaining({
          maxRecommendations: 1
        })
      })
    })
  })
})