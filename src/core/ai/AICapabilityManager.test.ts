import { describe, it, expect, beforeEach, vi } from "vitest"
import { AICapabilityManager } from "./AICapabilityManager"
import type { UnifiedAnalysisResult } from "@/types/ai"

// Mock chrome.storage
const mockStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn()
  }
}
global.chrome = { storage: mockStorage } as any

describe("AICapabilityManager", () => {
  let manager: AICapabilityManager
  
  beforeEach(() => {
    vi.clearAllMocks()
    manager = new AICapabilityManager()
  })
  
  describe("initialize", () => {
    it("应该使用关键词提供者（未配置 AI）", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({ aiConfig: null })
      
      await manager.initialize()
      
      // 未配置时 primaryProvider 为 null，使用 fallbackProvider
      expect(manager["primaryProvider"]).toBeNull()
      expect(manager["fallbackProvider"]).toBeDefined()
      expect(manager["fallbackProvider"].constructor.name).toBe("FallbackKeywordProvider")
    })
    
    it("应该创建 DeepSeek 提供者（已配置）", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "sk-test-deepseek-123456789012345678901234567890"
        }
      })
      
      await manager.initialize()
      
      expect(manager["primaryProvider"]).toBeDefined()
      // Phase 6: 统一使用 DeepSeekReasonerProvider（支持动态模型切换）
      expect(manager["primaryProvider"]?.constructor.name).toBe("DeepSeekReasonerProvider")
    })
    
    it("应该在 AI 不可用时回退到关键词", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "invalid-key" // 太短，无效
        }
      })
      
      await manager.initialize()
      
      // 会创建 DeepSeekReasonerProvider 但标记为不可用
      // 实际调用时会使用 fallback
      expect(manager["primaryProvider"]?.constructor.name).toBe("DeepSeekReasonerProvider")
      expect(await manager["primaryProvider"]!.isAvailable()).toBe(false)
    })
  })
  
  describe("analyzeContent", () => {
    it("应该使用 fallback 提供者分析内容（未配置 AI）", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({ aiConfig: null })
      await manager.initialize()
      
      const mockAnalyze = vi.spyOn(manager["fallbackProvider"], "analyzeContent")
      mockAnalyze.mockResolvedValueOnce({
        topicProbabilities: { "技术": 0.8, "教程": 0.2 },
        metadata: {
          provider: "keyword",
          model: "keyword-analyzer",
          timestamp: Date.now()
        }
      })
      
      const result = await manager.analyzeContent("测试内容")
      
      expect(mockAnalyze).toHaveBeenCalledWith("测试内容", undefined)
      expect(result.topicProbabilities).toEqual({ "技术": 0.8, "教程": 0.2 })
    })
    
    it("应该在主提供者失败时回退到关键词", async () => {
      // 模拟 DeepSeek 配置
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "sk-test-deepseek-123456789012345678901234567890"
        }
      })
      await manager.initialize()
      
      // 主提供者抛出错误
      const mockPrimaryAnalyze = vi.spyOn(manager["primaryProvider"]!, "analyzeContent")
      mockPrimaryAnalyze.mockRejectedValueOnce(new Error("API Error"))
      
      // 回退提供者成功
      const mockFallbackAnalyze = vi.spyOn(manager["fallbackProvider"], "analyzeContent")
      mockFallbackAnalyze.mockResolvedValueOnce({
        topicProbabilities: { "技术": 0.7, "开源": 0.3 },
        metadata: {
          provider: "keyword",
          model: "keyword-analyzer",
          timestamp: Date.now()
        }
      })
      
      const result = await manager.analyzeContent("测试内容")
      
      expect(mockPrimaryAnalyze).toHaveBeenCalled()
      expect(mockFallbackAnalyze).toHaveBeenCalled()
      expect(result.topicProbabilities).toEqual({ "技术": 0.7, "开源": 0.3 })
      expect(result.metadata.provider).toBe("keyword")
    })
  })
  
  describe("testConnection", () => {
    it("应该测试主提供者连接", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "sk-test-deepseek-123456789012345678901234567890"
        }
      })
      await manager.initialize()
      
      const mockTest = vi.spyOn(manager["primaryProvider"]!, "testConnection")
      mockTest.mockResolvedValueOnce({
        success: true,
        message: "连接成功",
        latency: 123
      })
      
      const result = await manager.testConnection()
      
      expect(mockTest).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.latency).toBe(123)
    })
  })
  
  describe("recordUsage", () => {
    it("应该记录使用情况（当前仅日志）", () => {
      const result: UnifiedAnalysisResult = {
        topicProbabilities: { "技术": 1.0 },
        metadata: {
          provider: "deepseek",
          model: "deepseek-chat",
          timestamp: Date.now(),
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          cost: 0.000332 // DeepSeek 正确价格（10% 缓存命中率）
        }
      }
      
      // 验证方法不抛出错误
      expect(() => {
        manager["recordUsage"](result)
      }).not.toThrow()
    })
  })
})
