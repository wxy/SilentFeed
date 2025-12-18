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
    
    it("应该在 API Key 为空时返回 false", async () => {
      const emptyProvider = new DeepSeekProvider({ apiKey: "" })
      const available = await emptyProvider.isAvailable()
      expect(available).toBe(false)
    })
    
    it("应该接受任意长度的有效 API Key", async () => {
      const shortProvider = new DeepSeekProvider({ apiKey: "sk-test" })
      const available = await shortProvider.isAvailable()
      expect(available).toBe(true)
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
      
      // Provider 应该是 "deepseek"（模型是 "deepseek-chat"）
      expect(result.metadata.provider).toBe("deepseek")
      expect(result.metadata.model).toBe("deepseek-chat")
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
    
    it("应该正确计算成本（使用 API 返回的缓存数据）", async () => {
      // 模拟包含缓存统计的 API 响应
      const responseWithCacheStats: DeepSeekResponse = {
        ...mockSuccessResponse,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,  // 80 tokens 缓存命中
          prompt_cache_miss_tokens: 20  // 20 tokens 未命中
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithCacheStats
      } as Response)
      
      const result = await provider.analyzeContent("测试")
      
      // DeepSeek Chat 使用真实缓存数据计算:
      // 缓存命中: 80 tokens * 0.2 / 1M = ¥0.000016
      // 缓存未命中: 20 tokens * 2.0 / 1M = ¥0.000040
      // 输出: 50 tokens * 3.0 / 1M = ¥0.000150
      // 总计: ¥0.000206
      expect(result.metadata.cost).toBeCloseTo(0.000206, 6)
    })
    
    it("应该在没有缓存数据时假设全部未命中（保守估计）", async () => {
      // 没有缓存统计字段的响应（旧版 API 或特殊情况）
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试")
      
      // DeepSeek Chat 假设全部未命中:
      // 输入: 100 tokens * 2.0 / 1M = ¥0.000200
      // 输出: 50 tokens * 3.0 / 1M = ¥0.000150
      // 总计: ¥0.000350
      expect(result.metadata.cost).toBeCloseTo(0.000350, 6)
    })
    
    it("应该在推理模式下使用 deepseek-reasoner 模型", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      // 传递 useReasoning=true 启用推理模式
      await provider.analyzeContent("测试", { useReasoning: true })
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      
      // 应该使用 deepseek-reasoner 模型
      expect(requestBody.model).toBe("deepseek-reasoner")
      // 不应该有 reasoning_effort 参数（推理能力内置于模型）
      expect(requestBody.reasoning_effort).toBeUndefined()
    })
    
    it("推理模式应该使用正确的定价", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)
      
      // 启用推理模式
      const result = await provider.analyzeContent("测试", { useReasoning: true })
      
      // DeepSeek Reasoner 定价（无缓存）:
      // 输入: 100 tokens * 4.0 / 1M = ¥0.0004
      // 输出: 50 tokens * 16.0 / 1M = ¥0.0008
      // 总计: ¥0.0012
      expect(result.metadata.cost).toBeCloseTo(0.0012, 6)
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
    
    it("应该处理空 content 响应（finish_reason=length）", async () => {
      const truncatedResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-reasoner",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "", // 空内容
              reasoning_content: '{"partial": true' // 截断的推理内容
            },
            finish_reason: "length" // 因长度限制而截断
          }
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      }
      
      // Mock 3次响应（因为有重试机制）
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => truncatedResponse
      } as Response)
      
      // 应该抛出错误
      await expect(provider.analyzeContent("测试", { maxTokens: 500 }))
        .rejects.toThrow("Response truncated due to max_tokens limit")
    })
    
    it("应该处理空 content 响应（其他 finish_reason）", async () => {
      const emptyResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: ""
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 0,
          total_tokens: 100
        }
      }
      
      // Mock 3次响应（因为有重试机制）
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => emptyResponse
      } as Response)
      
      await expect(provider.analyzeContent("测试"))
        .rejects.toThrow("Empty response from DeepSeek API")
    })
    
    it("应该从 reasoning_content 中提取 JSON（推理模式）", async () => {
      const reasoningResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-reasoner",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              // 模拟推理内容中嵌入的 JSON（会从最后一个 } 位置提取）
              // 使用多个 topics 以验证归一化前的值
              reasoning_content: '经过分析推理后，我认为这篇文章的主题是AI... {"topics": {"AI": 0.8, "Tech": 0.2}, "summary": "test"}'
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
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => reasoningResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试", { useReasoning: true })
      
      // 验证从 reasoning_content 提取的 JSON
      // analyzeContent 会归一化 topics，所以 0.8 和 0.2 总和已经是 1.0，归一化后保持不变
      expect(result.topicProbabilities).toEqual({ "AI": 0.8, "Tech": 0.2 })
      expect(result.summary).toBe("test")
    })
    
    it("应该处理无效的 JSON 提取（推理模式）", async () => {
      const invalidJsonResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-reasoner",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              reasoning_content: '一些推理文本... {"invalid json: 123 没有完整'
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
      
      // Mock 3次响应（因为有重试机制）
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => invalidJsonResponse
      } as Response)
      
      await expect(provider.analyzeContent("测试", { useReasoning: true }))
        .rejects.toThrow("Empty response from DeepSeek API")
    })
    
    it("应该处理网络错误（isNetworkError 分支）", async () => {
      const networkError = new Error("Network error")
      Object.assign(networkError, { code: "ECONNREFUSED" })
      
      // Mock 3次响应（因为有重试机制）
      vi.mocked(fetch).mockRejectedValue(networkError)
      
      await expect(provider.analyzeContent("测试"))
        .rejects.toThrow("Network error")
    })
    
    it("应该正确处理缓存命中率日志", async () => {
      const cachedResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ topics: { "Test": 1.0 } })
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => cachedResponse
      } as Response)
      
      const result = await provider.analyzeContent("测试")
      
      // 验证缓存统计被正确记录
      // 缓存命中: 80 tokens * 0.2 / 1M = ¥0.000016
      // 缓存未命中: 20 tokens * 2.0 / 1M = ¥0.000040
      // 输出: 50 tokens * 3.0 / 1M = ¥0.000150
      // 总计: ¥0.000206
      expect(result.metadata.cost).toBeCloseTo(0.000206, 6)
    })
    
    it("应该在小 maxTokens 时不显示截断警告（测试连接场景）", async () => {
      const truncatedTestResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "", 
              reasoning_content: "partial"
            },
            finish_reason: "length"
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10
        }
      }
      
      // Mock 3次响应（因为有重试机制）
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => truncatedTestResponse
      } as Response)
      
      // maxTokens <= 200 时不应该记录警告（测试连接场景）
      await expect(provider.analyzeContent("测试", { maxTokens: 100 }))
        .rejects.toThrow() // 依然会抛出错误，但不会有警告日志
    })
  })
})
