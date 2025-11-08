import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getAIConfig,
  saveAIConfig,
  deleteAIConfig,
  isAIConfigured,
  validateApiKey,
  getProviderDisplayName,
  getProviderEndpoint,
  getProviderModel,
  type AIConfig
} from "./ai-config"

// Mock chrome.storage.sync
const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn()
  }
}

global.chrome = {
  storage: mockChromeStorage
} as any

describe("ai-config", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChromeStorage.sync.get.mockResolvedValue({})
    mockChromeStorage.sync.set.mockResolvedValue(undefined)
    mockChromeStorage.sync.remove.mockResolvedValue(undefined)
  })
  
  describe("getAIConfig", () => {
    it("应该返回默认配置（未配置时）", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({})
      
      const config = await getAIConfig()
      
      expect(config).toEqual({
        provider: null,
        apiKey: "",
        enabled: false,
        monthlyBudget: 5
      })
    })
    
    it("应该读取已保存的配置", async () => {
      const savedConfig: AIConfig = {
        provider: "openai",
        apiKey: btoa("sk-test-123"), // 加密存储
        enabled: true,
        monthlyBudget: 10
      }
      
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: savedConfig
      })
      
      const config = await getAIConfig()
      
      expect(config.provider).toBe("openai")
      expect(config.apiKey).toBe("sk-test-123") // 应该解密
      expect(config.enabled).toBe(true)
      expect(config.monthlyBudget).toBe(10)
    })
    
    it("应该处理加载失败的情况", async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error("Storage error"))
      
      const config = await getAIConfig()
      
      // 应该返回默认配置
      expect(config.provider).toBe(null)
      expect(config.enabled).toBe(false)
    })
  })
  
  describe("saveAIConfig", () => {
    it("应该保存配置并加密 API Key", async () => {
      const config: AIConfig = {
        provider: "openai",
        apiKey: "sk-test-123",
        enabled: true,
        monthlyBudget: 10
      }
      
      await saveAIConfig(config)
      
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        aiConfig: {
          provider: "openai",
          apiKey: btoa("sk-test-123"), // 应该加密
          enabled: true,
          monthlyBudget: 10
        }
      })
    })
    
    it("应该处理保存失败的情况", async () => {
      mockChromeStorage.sync.set.mockRejectedValue(new Error("Storage error"))
      
      const config: AIConfig = {
        provider: "openai",
        apiKey: "sk-test-123",
        enabled: true,
        monthlyBudget: 10
      }
      
      await expect(saveAIConfig(config)).rejects.toThrow()
    })
  })
  
  describe("deleteAIConfig", () => {
    it("应该删除配置", async () => {
      await deleteAIConfig()
      
      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith("aiConfig")
    })
  })
  
  describe("isAIConfigured", () => {
    it("未配置时应该返回 false", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({})
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(false)
    })
    
    it("已配置时应该返回 true", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          provider: "openai",
          apiKey: btoa("sk-test-123"),
          enabled: true
        }
      })
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(true)
    })
    
    it("禁用时应该返回 false", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          provider: "openai",
          apiKey: btoa("sk-test-123"),
          enabled: false
        }
      })
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(false)
    })
  })
  
  describe("validateApiKey", () => {
    it("应该验证 OpenAI API Key", () => {
      expect(validateApiKey("openai", "sk-test-123456789")).toBe(true)
      expect(validateApiKey("openai", "sk-proj-test-123")).toBe(true)
      expect(validateApiKey("openai", "invalid-key")).toBe(false)
      expect(validateApiKey("openai", "")).toBe(false)
    })
    
    it("应该验证 Anthropic API Key", () => {
      expect(validateApiKey("anthropic", "sk-ant-test-123456789")).toBe(true)
      expect(validateApiKey("anthropic", "sk-test-123")).toBe(false)
      expect(validateApiKey("anthropic", "")).toBe(false)
    })
    
    it("应该验证 DeepSeek API Key", () => {
      expect(validateApiKey("deepseek", "a".repeat(25))).toBe(true)
      expect(validateApiKey("deepseek", "short")).toBe(false)
      expect(validateApiKey("deepseek", "")).toBe(false)
    })
  })
  
  describe("getProviderDisplayName", () => {
    it("应该返回正确的显示名称", () => {
      expect(getProviderDisplayName("openai")).toBe("OpenAI (GPT-4o-mini)")
      expect(getProviderDisplayName("anthropic")).toBe(
        "Anthropic (Claude-3-Haiku)"
      )
      expect(getProviderDisplayName("deepseek")).toBe("DeepSeek")
      expect(getProviderDisplayName(null)).toBe("未配置")
    })
  })
  
  describe("getProviderEndpoint", () => {
    it("应该返回正确的 API 端点", () => {
      expect(getProviderEndpoint("openai")).toBe(
        "https://api.openai.com/v1/chat/completions"
      )
      expect(getProviderEndpoint("anthropic")).toBe(
        "https://api.anthropic.com/v1/messages"
      )
      expect(getProviderEndpoint("deepseek")).toBe(
        "https://api.deepseek.com/v1/chat/completions"
      )
    })
  })
  
  describe("getProviderModel", () => {
    it("应该返回正确的模型名称", () => {
      expect(getProviderModel("openai")).toBe("gpt-4o-mini")
      expect(getProviderModel("anthropic")).toBe("claude-3-haiku-20240307")
      expect(getProviderModel("deepseek")).toBe("deepseek-chat")
    })
  })
})
