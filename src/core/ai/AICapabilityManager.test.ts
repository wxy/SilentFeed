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

const mockFetch = vi.fn()
global.fetch = mockFetch as any

describe("AICapabilityManager", () => {
  let manager: AICapabilityManager
  
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) })
    manager = new AICapabilityManager()
  })
  
  describe("initialize", () => {
    it("应该使用关键词提供者（未配置 AI）", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({ aiConfig: null })
      
      await manager.initialize()
      
      // 未配置时 remoteProvider 为 null，使用 fallbackProvider
      expect(manager["remoteProvider"]).toBeNull()
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
      
      expect(manager["remoteProvider"]).toBeDefined()
      // Phase 6: 统一使用 DeepSeekProvider（支持动态模型切换）
      expect(manager["remoteProvider"]?.constructor.name).toBe("DeepSeekProvider")
    })
    
    it("应该在 AI 不可用时回退到关键词", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "" // 空的 API Key，无效
        }
      })
      
      await manager.initialize()
      
      // API Key 为空，不会创建 Provider
      expect(manager["remoteProvider"]).toBeNull()
    })

    it("应该初始化本地 Ollama 提供者", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: false,
          provider: null,
          apiKey: "",
          local: {
            enabled: true,
            provider: "ollama",
            endpoint: "http://localhost:11434/v1",
            model: "qwen2.5:7b"
          }
        }
      })

      await manager.initialize()

      expect(manager["localProvider"]).toBeDefined()
      expect(manager["localProvider"]?.constructor.name).toBe("OllamaProvider")
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
      const mockPrimaryAnalyze = vi.spyOn(manager["remoteProvider"]!, "analyzeContent")
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

    it("task 路由: profileGeneration 优先使用任务指定引擎", async () => {
      // 加载引擎分配与远端 provider
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "sk-test-deepseek-123456789012345678901234567890"
        }
      })
      await manager.initialize()

      // 模拟 engineAssignment 存在并指定使用 remote 引擎 deepseek
      manager["engineAssignment"] = {
        pageAnalysis: { provider: "deepseek", useReasoning: true },
        feedAnalysis: { provider: "ollama", useReasoning: false },
        profileGeneration: { provider: "deepseek", useReasoning: false }
      } as any

      const spy = vi.spyOn(manager["remoteProvider"]!, "analyzeContent")
      spy.mockResolvedValueOnce({
        topicProbabilities: { A: 0.6 },
        metadata: { provider: "deepseek", model: "deepseek-chat", timestamp: Date.now() }
      })

      const result = await manager.analyzeContent("content", { useReasoning: false }, "pageAnalysis")
      expect(spy).toHaveBeenCalled()
      expect(result.metadata.provider).toBe("deepseek")
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
      
      const mockTest = vi.spyOn(manager["remoteProvider"]!, "testConnection")
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

  describe("多提供商与本地回退", () => {
    it("在本地启用且远端未配置时应使用本地提供者", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          providers: {},
          local: { enabled: true, provider: "ollama", endpoint: "http://localhost:11434/v1", model: "qwen2.5:7b" }
        }
      })

      await manager.initialize()
      const conn = await manager.testConnection("local")
      // testConnection 返回 {success, message, latency?}
      expect(conn && conn.success === true).toBeTruthy()
    })

    it("远端失败且本地不可用时应回退关键词", async () => {
      // 远端配置但故意使 analyze 抛错
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          providers: {
            deepseek: {
              apiKey: "sk-test-deepseek-123456789012345678901234567890",
              model: "deepseek-chat"
            }
          },
          local: { enabled: false }
        }
      })

      await manager.initialize()
      const mockPrimaryAnalyze = vi.spyOn(manager["remoteProvider"]!, "analyzeContent")
      mockPrimaryAnalyze.mockRejectedValueOnce(new Error("API Error"))

      const result = await manager.analyzeContent("unrelated content")
      expect(result.metadata.provider).toBe("keyword")
    })
  })

  describe("generateUserProfile", () => {
    it("任务配置失败时走旧链路并可回退到关键词", async () => {
      // 初始化远端但让 generateUserProfile 抛错
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: {
          enabled: true,
          provider: "deepseek",
          apiKey: "sk-test-deepseek-123456789012345678901234567890"
        }
      })
      await manager.initialize()

      // 任务配置指向 deepseek，但我们模拟 generateUserProfile 不存在或抛错
      manager["engineAssignment"] = {
        profileGeneration: { provider: "deepseek", useReasoning: false }
      } as any

      // 如果 provider 没实现 generateUserProfile，则会走旧链路，再失败后回退
      // 保守做法：强制旧链路失败以触发 fallback
      const remote = manager["remoteProvider"]!
      ;(remote as any).generateUserProfile = vi.fn().mockRejectedValue(new Error("not implemented"))

      const result = await manager.generateUserProfile({
        topKeywords: [{ word: "AI", weight: 1 }],
        totalCounts: { browses: 5, reads: 3, dismisses: 1 },
        // 提供最小的主题分布以满足 FallbackKeywordProvider 的需求
        topicDistribution: { AI: 0.8, 技术: 0.2 }
      } as any)

      expect(result.metadata.provider).toBe("keyword")
      expect(typeof result.interests).toBe("string")
    })
  })

  describe("testConnection 错误信息", () => {
    it("未选择远端提供商时返回详细错误", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({ aiConfig: { enabled: true, provider: null, apiKey: "" } })
      await manager.initialize()

      const res = await manager.testConnection("remote")
      expect(res.success).toBe(false)
      expect(res.message).toMatch(/未配置 AI 提供商/)
    })

    it("未设置 API Key 时返回提示", async () => {
      mockStorage.sync.get.mockResolvedValueOnce({
        aiConfig: { enabled: true, provider: "deepseek", providers: { deepseek: { apiKey: "" } } }
      })
      await manager.initialize()

      const res = await manager.testConnection("remote")
      expect(res.success).toBe(false)
      // 不同配置读取路径下的信息可能不同：接受两种提示
      expect(/API Key 未设置|未选择提供商/.test(res.message)).toBeTruthy()
    })
  })
})
