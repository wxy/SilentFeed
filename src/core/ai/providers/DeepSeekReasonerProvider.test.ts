import { describe, it, expect, beforeEach, vi } from "vitest"
import { DeepSeekReasonerProvider } from "./DeepSeekReasonerProvider"
import type { DeepSeekResponse } from "../types"

// Mock fetch
global.fetch = vi.fn()

describe("DeepSeekReasonerProvider", () => {
  let provider: DeepSeekReasonerProvider
  const mockApiKey = "sk-test-deepseek-123456789012345678901234567890"
  
  beforeEach(() => {
    vi.clearAllMocks()
    provider = new DeepSeekReasonerProvider({ apiKey: mockApiKey })
  })
  
  describe("isAvailable", () => {
    it("应该在 API Key 有效时返回 true", async () => {
      const available = await provider.isAvailable()
      expect(available).toBe(true)
    })
    
    it("应该在 API Key 无效时返回 false", async () => {
      const invalidProvider = new DeepSeekReasonerProvider({ apiKey: "short" })
      const available = await invalidProvider.isAvailable()
      expect(available).toBe(false)
    })
  })
  
  describe("testConnection", () => {
    it("应该成功测试连接", async () => {
      const mockResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-reasoner",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello!"
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 5,
          total_tokens: 10
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)
      
      const result = await provider.testConnection()
      
      expect(result.success).toBe(true)
      expect(result.message).toContain("成功")
      expect(typeof result.latency).toBe("number")
    })
    
    it("应该处理连接失败", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))
      
      const result = await provider.testConnection()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain("失败")
    })
  })
  
  describe("analyzeContent", () => {
    const mockSuccessResponse: DeepSeekResponse = {
      id: "test-id",
      object: "chat.completion",
      created: Date.now(),
      model: "deepseek-reasoner",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              topics: {
                "技术": 0.7,
                "开源": 0.2,
                "教程": 0.1
              }
            })
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    }
    
    it("应该成功分析内容", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试文本内容")
      
      expect(Object.keys(result.topicProbabilities)).toEqual(["技术", "开源", "教程"])
      expect(result.topicProbabilities["技术"]).toBeCloseTo(0.7, 5)
      expect(result.topicProbabilities["开源"]).toBeCloseTo(0.2, 5)
      expect(result.topicProbabilities["教程"]).toBeCloseTo(0.1, 5)
      
      // Provider 应该是 "deepseek"（模型是 "deepseek-reasoner"）
      expect(result.metadata.provider).toBe("deepseek")
      expect(result.metadata.model).toBe("deepseek-reasoner")
      expect(result.metadata.tokensUsed?.total).toBe(150)
      expect(result.metadata.cost).toBeGreaterThan(0)
    })
    
    it("应该归一化概率分布", async () => {
      const unnormalizedResponse = {
        ...mockSuccessResponse,
        choices: [
          {
            ...mockSuccessResponse.choices[0],
            message: {
              role: "assistant",
              content: JSON.stringify({
                topics: {
                  "技术": 70,
                  "开源": 20,
                  "教程": 10
                }
              })
            }
          }
        ]
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => unnormalizedResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试文本")
      
      const probabilities = Object.values(result.topicProbabilities)
      const sum = probabilities.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 5)
    })
    
    it("应该处理 API 错误", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized"
      } as Response)
      
      await expect(provider.analyzeContent("测试")).rejects.toThrow()
    })
    
    it("应该正确计算成本（分开计算输入输出）", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试")
      
      // DeepSeek Reasoner 正确价格（10% 缓存命中率）:
      // 输入: 100 tokens * (0.1 * 0.2 + 0.9 * 2.0) / 1M = ¥0.000182
      // 输出: 50 tokens * 3.0 / 1M = ¥0.000150
      // 总计: ¥0.000332
      expect(result.metadata.cost).toBeCloseTo(0.000332, 6)
    })
    
    it("应该使用 deepseek-reasoner 模型", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      // Phase 6: 需要传递 useReasoning=true 才会使用 deepseek-reasoner 模型
      await provider.analyzeContent("测试", { useReasoning: true })
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      
      expect(requestBody.model).toBe("deepseek-reasoner")
    })
  
    it("默认应该使用 deepseek-chat 模型", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      // 不传 useReasoning 或传 false 时使用 deepseek-chat
      await provider.analyzeContent("测试")
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      
      expect(requestBody.model).toBe("deepseek-chat")
    })
  })
})
