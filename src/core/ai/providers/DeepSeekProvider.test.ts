import { describe, it, expect, beforeEach, vi } from "vitest"
import { DeepSeekProvider } from "./DeepSeekProvider"
import type { DeepSeekResponse } from "@/types/ai"

// Mock fetch
global.fetch = vi.fn()

describe("DeepSeekProvider", () => {
  let provider: DeepSeekProvider
  const mockApiKey = "sk-test-deepseek-123456789012345678901234567890"
  
  beforeEach(() => {
    vi.clearAllMocks()
    provider = new DeepSeekProvider({ apiKey: mockApiKey })
  })
  
  describe("isAvailable", () => {
    it("应该在 API Key 有效时返回 true", async () => {
      const available = await provider.isAvailable()
      expect(available).toBe(true)
    })
    
    it("应该在 API Key 无效时返回 false", async () => {
      const invalidProvider = new DeepSeekProvider({ apiKey: "short" })
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
        model: "deepseek-chat",
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
      // latency 应该是数字，可能为 0（mock 很快）
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
      model: "deepseek-chat",
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
      
      // 使用近似比较，避免浮点数精度问题
      expect(Object.keys(result.topicProbabilities)).toEqual(["技术", "开源", "教程"])
      expect(result.topicProbabilities["技术"]).toBeCloseTo(0.7, 5)
      expect(result.topicProbabilities["开源"]).toBeCloseTo(0.2, 5)
      expect(result.topicProbabilities["教程"]).toBeCloseTo(0.1, 5)
      
      expect(result.metadata.provider).toBe("deepseek")
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
      
      // 应该归一化为 [0, 1]
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
    
    it("应该处理无效的 JSON 响应", async () => {
      const invalidResponse = {
        ...mockSuccessResponse,
        choices: [
          {
            ...mockSuccessResponse.choices[0],
            message: {
              role: "assistant",
              content: "这不是 JSON"
            }
          }
        ]
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse
      } as Response)
      
      await expect(provider.analyzeContent("测试")).rejects.toThrow("No JSON found")
    })
    
    it("应该正确计算成本", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试")
      
      // DeepSeek 正确价格（10% 缓存命中率）:
      // 输入: 100 tokens * (0.1 * 0.2 + 0.9 * 2.0) / 1M = ¥0.000182
      // 输出: 50 tokens * 3.0 / 1M = ¥0.000150
      // 总计: ¥0.000332
      expect(result.metadata.cost).toBeCloseTo(0.000332, 6)
    })
  })
})
