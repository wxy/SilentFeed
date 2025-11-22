import { describe, it, expect, beforeEach, vi } from "vitest"
import { OpenAIProvider } from "./OpenAIProvider"
import type { DeepSeekResponse } from "@/types/ai"

// Mock fetch
global.fetch = vi.fn()

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider
  const mockApiKey = "sk-test-openai-123456789012345678901234567890"
  
  beforeEach(() => {
    vi.clearAllMocks()
    provider = new OpenAIProvider({ apiKey: mockApiKey })
  })
  
  describe("constructor", () => {
    it("应该使用默认模型 gpt-5-mini", () => {
      const defaultProvider = new OpenAIProvider({ apiKey: mockApiKey })
      expect(defaultProvider.name).toBe("OpenAI")
    })
    
    it("应该支持自定义模型", () => {
      const customProvider = new OpenAIProvider({ 
        apiKey: mockApiKey,
        model: "gpt-5-nano"
      })
      expect(customProvider.name).toBe("OpenAI")
    })
    
    it("应该支持自定义端点", () => {
      const customProvider = new OpenAIProvider({
        apiKey: mockApiKey,
        endpoint: "https://custom.openai.com/v1/chat/completions"
      })
      expect(customProvider.name).toBe("OpenAI")
    })
  })
  
  describe("isAvailable", () => {
    it("应该在 API Key 有效时返回 true", async () => {
      const available = await provider.isAvailable()
      expect(available).toBe(true)
    })
    
    it("应该在 API Key 无效时返回 false", async () => {
      const invalidProvider = new OpenAIProvider({ apiKey: "short" })
      const available = await invalidProvider.isAvailable()
      expect(available).toBe(false)
    })
  })
  
  describe("testConnection", () => {
    it("应该成功测试 gpt-5-mini 连接", async () => {
      const mockResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "gpt-5-mini",
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
      expect(result.message).toContain("gpt-5-mini")
      expect(typeof result.latency).toBe("number")
    })
    
    it("应该成功测试 o4-mini 连接", async () => {
      const o4Provider = new OpenAIProvider({ 
        apiKey: mockApiKey,
        model: "o4-mini"
      })
      
      const mockResponse: DeepSeekResponse = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "o4-mini",
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
      
      const result = await o4Provider.testConnection()
      
      expect(result.success).toBe(true)
      expect(result.message).toContain("o4-mini")
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
      model: "gpt-5-mini",
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
      
      expect(result.metadata.provider).toBe("openai")
      expect(result.metadata.model).toBe("gpt-5-mini")
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
    
    describe("成本计算", () => {
      it("gpt-5-nano 应该正确计算成本", async () => {
        const nanoProvider = new OpenAIProvider({
          apiKey: mockApiKey,
          model: "gpt-5-nano"
        })
        
        const nanoResponse = {
          ...mockSuccessResponse,
          model: "gpt-5-nano"
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => nanoResponse
        } as Response)
        
        const result = await nanoProvider.analyzeContent("测试")
        
        // gpt-5-nano 价格（10% 缓存命中率，USD → CNY，汇率 7.2）:
        // 输入: 100 tokens * (0.1 * 0.005 + 0.9 * 0.050) / 1M * 7.2 = ￥0.00003276
        // 输出: 50 tokens * 0.400 / 1M * 7.2 = ￥0.000144
        // 总计: ￥0.00017676
        expect(result.metadata.cost).toBeCloseTo(0.00017676, 5)
      })
      
      it("gpt-5-mini 应该正确计算成本", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse
        } as Response)
        
        const result = await provider.analyzeContent("测试")
        
        // gpt-5-mini 价格（10% 缓存命中率，USD → CNY，汇率 7.2）:
        // 输入: 100 tokens * (0.1 * 0.025 + 0.9 * 0.250) / 1M * 7.2 = ￥0.00016380
        // 输出: 50 tokens * 2.0 / 1M * 7.2 = ￥0.00072
        // 总计: ￥0.0008838
        expect(result.metadata.cost).toBeCloseTo(0.0008838, 5)
      })
      
      it("gpt-5 应该正确计算成本", async () => {
        const gpt5Provider = new OpenAIProvider({
          apiKey: mockApiKey,
          model: "gpt-5"
        })
        
        const gpt5Response = {
          ...mockSuccessResponse,
          model: "gpt-5"
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => gpt5Response
        } as Response)
        
        const result = await gpt5Provider.analyzeContent("测试")
        
        // gpt-5 价格（10% 缓存命中率，USD → CNY，汇率 7.2）:
        // 输入: 100 tokens * (0.1 * 0.125 + 0.9 * 1.25) / 1M * 7.2 = ￥0.00081900
        // 输出: 50 tokens * 10.0 / 1M * 7.2 = ￥0.00360
        // 总计: ￥0.004419
        expect(result.metadata.cost).toBeCloseTo(0.004419, 5)
      })
      
      it("o4-mini 应该正确计算成本", async () => {
        const o4Provider = new OpenAIProvider({
          apiKey: mockApiKey,
          model: "o4-mini"
        })
        
        const o4Response = {
          ...mockSuccessResponse,
          model: "o4-mini"
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => o4Response
        } as Response)
        
        const result = await o4Provider.analyzeContent("测试")
        
        // o4-mini 价格（10% 缓存命中率，USD → CNY，汇率 7.2）:
        // 输入: 100 tokens * (0.1 * 1.0 + 0.9 * 4.0) / 1M * 7.2 = ¥0.002664
        // 输出: 50 tokens * 16.0 / 1M * 7.2 = ¥0.00576
        // 总计: ¥0.008424
        expect(result.metadata.cost).toBeCloseTo(0.008424, 6)
      })
    })
    
    describe("模型选择", () => {
      it("应该使用 o4-mini 推理模型", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockSuccessResponse,
            model: "o4-mini"
          })
        } as Response)
        
        await provider.analyzeContent("测试", { useReasoning: true })
        
        const fetchCall = vi.mocked(fetch).mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        
        expect(requestBody.model).toBe("o4-mini")
        expect(requestBody.max_tokens).toBe(4000) // 推理模型需要更多 tokens
        expect(requestBody.response_format).toBeUndefined() // 推理模型不支持 JSON mode
      })
      
      it("默认应该使用 gpt-5-mini 标准模型", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse
        } as Response)
        
        await provider.analyzeContent("测试")
        
        const fetchCall = vi.mocked(fetch).mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        
        expect(requestBody.model).toBe("gpt-5-mini")
        expect(requestBody.max_tokens).toBe(500)
        expect(requestBody.response_format).toEqual({ type: "json_object" })
      })
      
      it("useReasoning=false 应该使用标准模型", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse
        } as Response)
        
        await provider.analyzeContent("测试", { useReasoning: false })
        
        const fetchCall = vi.mocked(fetch).mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        
        expect(requestBody.model).toBe("gpt-5-mini")
        expect(requestBody.response_format).toEqual({ type: "json_object" })
      })
    })
    
    describe("响应解析", () => {
      it("应该处理推理内容（reasoning_content）", async () => {
        const reasoningResponse = {
          ...mockSuccessResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  topics: {
                    "AI": 0.8,
                    "技术": 0.2
                  }
                }),
                reasoning_content: "Let me think... This is about AI and technology..."
              },
              finish_reason: "stop"
            }
          ]
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => reasoningResponse
        } as Response)
        
        const result = await provider.analyzeContent("测试")
        
        expect(result.topicProbabilities["AI"]).toBeCloseTo(0.8, 5)
        expect(result.topicProbabilities["技术"]).toBeCloseTo(0.2, 5)
      })
      
      it("应该处理空响应", async () => {
        const emptyResponse = {
          ...mockSuccessResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: ""
              },
              finish_reason: "length"
            }
          ]
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => emptyResponse
        } as Response)
        
        await expect(provider.analyzeContent("测试")).rejects.toThrow()
      })
      
      it("应该处理无效 JSON", async () => {
        const invalidJsonResponse = {
          ...mockSuccessResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "这不是 JSON"
              },
              finish_reason: "stop"
            }
          ]
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => invalidJsonResponse
        } as Response)
        
        await expect(provider.analyzeContent("测试")).rejects.toThrow()
      })
    })
    
    describe("预处理", () => {
      it("应该截取超长文本", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse
        } as Response)
        
        const longText = "a".repeat(5000)
        await provider.analyzeContent(longText)
        
        const fetchCall = vi.mocked(fetch).mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        const promptContent = requestBody.messages[0].content
        
        // 应该被截取到 3000 字符以内
        expect(promptContent.length).toBeLessThan(3500)
      })
    })
  })
})
