import { describe, it, expect, beforeEach, vi } from "vitest"
import { OpenAIProvider } from "./OpenAIProvider"
import type { DeepSeekResponse, UserProfileGenerationRequest } from "@/types/ai"

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
    
    it("应该在 API Key 为空时返回 false", async () => {
      const emptyProvider = new OpenAIProvider({ apiKey: "" })
      const available = await emptyProvider.isAvailable()
      expect(available).toBe(false)
    })
    
    it("应该接受任意长度的有效 API Key", async () => {
      const shortProvider = new OpenAIProvider({ apiKey: "sk-test" })
      const available = await shortProvider.isAvailable()
      expect(available).toBe(true)
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
              },
              summary: "这是一段用于测试的AI摘要"
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
      expect((result as any).summary).toBe("这是一段用于测试的AI摘要")
      
      expect(result.metadata.provider).toBe("openai")
      expect(result.metadata.model).toBe("gpt-5-mini")
      expect(result.metadata.tokensUsed?.total).toBe(150)
      expect(result.metadata.cost).toBeGreaterThan(0)
    })

    it("应该解析 summary 字段", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      } as Response)

      const res = await provider.analyzeContent("任意内容")
      expect((res as any).summary).toBe("这是一段用于测试的AI摘要")
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
      it("gpt-5-nano 应该正确计算成本（无缓存数据时假设全部未命中，USD）", async () => {
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
        
        // gpt-5-nano 价格（无缓存数据，全部按未命中计算，USD）:
        // 输入: 100 tokens * 0.050 / 1M = $0.000005
        // 输出: 50 tokens * 0.400 / 1M = $0.00002
        // 总计: $0.000025
        expect(result.metadata.cost).toBeCloseTo(0.000025, 6)
      })
      
      it("gpt-5-nano 应该使用 API 返回的缓存数据精确计费", async () => {
        const nanoProvider = new OpenAIProvider({
          apiKey: mockApiKey,
          model: "gpt-5-nano"
        })
        
        // 模拟包含缓存统计的 API 响应
        const responseWithCache = {
          ...mockSuccessResponse,
          model: "gpt-5-nano",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: {
              cached_tokens: 80  // 80 tokens 缓存命中
            }
          }
        }
        
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => responseWithCache
        } as Response)
        
        const result = await nanoProvider.analyzeContent("测试")
        
        // gpt-5-nano 价格（使用真实缓存数据，USD）:
        // 缓存命中: 80 tokens * 0.005 / 1M = $0.0000004
        // 缓存未命中: 20 tokens * 0.050 / 1M = $0.000001
        // 输出: 50 tokens * 0.400 / 1M = $0.00002
        // 总计: $0.0000214
        expect(result.metadata.cost).toBeCloseTo(0.0000214, 7)
      })
      
      it("gpt-5-mini 应该正确计算成本（无缓存数据，USD）", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse
        } as Response)
        
        const result = await provider.analyzeContent("测试")
        
        // gpt-5-mini 价格（无缓存数据，全部按未命中计算，USD）:
        // 输入: 100 tokens * 0.250 / 1M = $0.000025
        // 输出: 50 tokens * 2.0 / 1M = $0.0001
        // 总计: $0.000125
        expect(result.metadata.cost).toBeCloseTo(0.000125, 6)
      })
      
      it("gpt-5 应该正确计算成本（无缓存数据，USD）", async () => {
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
        
        // gpt-5 价格（无缓存数据，全部按未命中计算，USD）:
        // 输入: 100 tokens * 1.25 / 1M = $0.000125
        // 输出: 50 tokens * 10.0 / 1M = $0.0005
        // 总计: $0.000625
        expect(result.metadata.cost).toBeCloseTo(0.000625, 6)
      })
      
      it("o4-mini 应该正确计算成本（无缓存数据，USD）", async () => {
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
        
        // o4-mini 价格（无缓存数据，全部按未命中计算，USD）:
        // 输入: 100 tokens * 4.0 / 1M = $0.0004
        // 输出: 50 tokens * 16.0 / 1M = $0.0008
        // 总计: $0.0012
        expect(result.metadata.cost).toBeCloseTo(0.0012, 6)
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
  
  describe("generateUserProfile", () => {
    const mockProfileRequest: UserProfileGenerationRequest = {
      behaviors: {
        reads: [
          {
            title: "React Hooks 深入解析",
            keywords: ["React", "Hooks", "JavaScript"],
            topics: ["technology"],
            readDuration: 300,
            scrollDepth: 0.9,
            weight: 0.8,
            timestamp: Date.now()
          },
          {
            title: "TypeScript 高级技巧",
            keywords: ["TypeScript", "编程"],
            topics: ["technology"],
            readDuration: 240,
            scrollDepth: 0.85,
            weight: 0.7,
            timestamp: Date.now()
          }
        ],
        dismisses: [
          {
            title: "NBA 总决赛回顾",
            keywords: ["篮球", "体育"],
            topics: ["sports"],
            weight: 0.5,
            timestamp: Date.now()
          }
        ]
      },
      topKeywords: [
        { word: "技术", weight: 0.95 },
        { word: "前端", weight: 0.88 },
        { word: "React", weight: 0.82 }
      ],
      topicDistribution: {
        technology: 0.85,
        design: 0.15
      },
      totalCounts: {
        browses: 100,
        reads: 20,
        dismisses: 5
      }
    }
    
    const mockProfileResponse: DeepSeekResponse = {
      id: "profile-test-id",
      object: "chat.completion",
      created: Date.now(),
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              interests: "用户对前端开发和 TypeScript 有浓厚兴趣，喜欢深度技术文章和实战教程。",
              preferences: ["深度技术解析", "代码实践教程", "开源项目分析"],
              avoidTopics: ["体育赛事", "娱乐资讯"]
            })
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 500,
        completion_tokens: 120,
        total_tokens: 620
      }
    }
    
    it("应该成功生成用户画像", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      const result = await provider.generateUserProfile(mockProfileRequest)
      
      expect(result.interests).toContain("前端开发")
      expect(result.interests).toContain("TypeScript")
      expect(result.preferences).toHaveLength(3)
      expect(result.preferences).toContain("深度技术解析")
      expect(result.avoidTopics).toHaveLength(2)
      expect(result.avoidTopics).toContain("体育赛事")
      
      expect(result.metadata.provider).toBe("openai")
      expect(result.metadata.model).toBe("gpt-5-mini")
      // Phase 8.2: basedOn 现在来自 totalCounts
      expect(result.metadata.basedOn.browses).toBe(100)
      expect(result.metadata.basedOn.reads).toBe(20)
      expect(result.metadata.basedOn.dismisses).toBe(5)
      // UserProfileGenerationResult 类型只有 input/output，没有 total
      expect(result.metadata.tokensUsed?.input).toBe(500)
      expect(result.metadata.tokensUsed?.output).toBe(120)
      expect(result.metadata.cost).toBeGreaterThan(0)
    })
    
    it("应该使用 Structured Outputs API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      await provider.generateUserProfile(mockProfileRequest)
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      
      expect(requestBody.response_format).toBeDefined()
      expect(requestBody.response_format.type).toBe("json_schema")
      expect(requestBody.response_format.json_schema.name).toBe("user_profile")
      expect(requestBody.response_format.json_schema.strict).toBe(true)
      expect(requestBody.response_format.json_schema.schema.properties).toHaveProperty("interests")
      expect(requestBody.response_format.json_schema.schema.properties).toHaveProperty("preferences")
      expect(requestBody.response_format.json_schema.schema.properties).toHaveProperty("avoidTopics")
      expect(requestBody.response_format.json_schema.schema.required).toEqual([
        "interests",
        "preferences",
        "avoidTopics"
      ])
    })
    
    it("应该使用正确的模型和参数", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      await provider.generateUserProfile(mockProfileRequest)
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      
      expect(requestBody.model).toBe("gpt-5-mini")
      expect(requestBody.temperature).toBe(0.3)  // 低温度保证一致性
      expect(requestBody.max_tokens).toBe(8000)
    })
    
    it("应该处理空行为记录", async () => {
      const emptyRequest: UserProfileGenerationRequest = {
        behaviors: {
          reads: [],
          dismisses: []
        },
        topKeywords: [],
        topicDistribution: {},
        totalCounts: {
          browses: 0,
          reads: 0,
          dismisses: 0
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockProfileResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  interests: "正在学习您的兴趣偏好",
                  preferences: ["技术文章", "新闻资讯"],
                  avoidTopics: []
                })
              },
              finish_reason: "stop"
            }
          ]
        })
      } as Response)
      
      const result = await provider.generateUserProfile(emptyRequest)
      
      expect(result.interests).toBeTruthy()
      expect(result.preferences).toBeInstanceOf(Array)
      expect(result.avoidTopics).toBeInstanceOf(Array)
      expect(result.metadata.basedOn.reads).toBe(0)
      expect(result.metadata.basedOn.dismisses).toBe(0)
    })
    
    it("应该正确计算成本（无缓存数据，USD）", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      const result = await provider.generateUserProfile(mockProfileRequest)
      
      // gpt-5-mini 价格（无缓存数据，全部按未命中计算，USD）:
      // 输入: 500 tokens * 0.250 / 1M = $0.000125
      // 输出: 120 tokens * 2.0 / 1M = $0.00024
      // 总计: $0.000365
      expect(result.metadata.cost).toBeCloseTo(0.000365, 6)
    })
    
    it("应该处理 API 错误", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error"
      } as Response)
      
      await expect(provider.generateUserProfile(mockProfileRequest)).rejects.toThrow()
    })
    
    it("应该处理空响应", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockProfileResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: ""
              },
              finish_reason: "stop"
            }
          ]
        })
      } as Response)
      
      // Phase 12: 错误被容错机制包装
      await expect(provider.generateUserProfile(mockProfileRequest)).rejects.toThrow("OpenAI generateUserProfile failed")
    })
    
    it("应该处理无效 JSON", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockProfileResponse,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "不是有效的 JSON"
              },
              finish_reason: "stop"
            }
          ]
        })
      } as Response)
      
      await expect(provider.generateUserProfile(mockProfileRequest)).rejects.toThrow()
    })
    
    it("应该限制阅读记录数量（最多 10 条）", async () => {
      const manyReadsRequest: UserProfileGenerationRequest = {
        behaviors: {
          reads: Array.from({ length: 20 }, (_, i) => ({
            title: `文章 ${i + 1}`,
            keywords: ["技术"],
            topics: ["technology"],
            readDuration: 120,
            scrollDepth: 0.8,
            weight: 0.5,
            timestamp: Date.now()
          })),
          dismisses: []
        },
        topKeywords: [],
        topicDistribution: {},
        totalCounts: {
          browses: 0,
          reads: 20,
          dismisses: 0
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      await provider.generateUserProfile(manyReadsRequest)
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      const prompt = requestBody.messages[0].content
      
      // 检查 prompt 中只包含前 10 篇
      expect(prompt).toContain("文章 1")
      expect(prompt).toContain("文章 10")
      expect(prompt).not.toContain("文章 11")
      expect(prompt).not.toContain("文章 20")
    })
    
    it("应该限制拒绝记录数量（最多 5 条）", async () => {
      const manyDismissesRequest: UserProfileGenerationRequest = {
        behaviors: {
          reads: [],
          dismisses: Array.from({ length: 10 }, (_, i) => ({
            title: `拒绝文章 ${i + 1}`,
            keywords: ["娱乐"],
            topics: ["entertainment"],
            weight: 0.5,
            timestamp: Date.now()
          }))
        },
        topKeywords: [],
        topicDistribution: {},
        totalCounts: {
          browses: 0,
          reads: 0,
          dismisses: 10
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      await provider.generateUserProfile(manyDismissesRequest)
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      const prompt = requestBody.messages[0].content
      
      // 检查 prompt 中只包含前 5 条
      expect(prompt).toContain("拒绝文章 1")
      expect(prompt).toContain("拒绝文章 5")
      expect(prompt).not.toContain("拒绝文章 6")
      expect(prompt).not.toContain("拒绝文章 10")
    })
    
    it("应该限制关键词数量（最多 20 个）", async () => {
      const manyKeywordsRequest: UserProfileGenerationRequest = {
        behaviors: { reads: [], dismisses: [] },
        topKeywords: Array.from({ length: 50 }, (_, i) => ({
          word: `关键词${i + 1}`,
          weight: 0.5
        })),
        topicDistribution: {},
        totalCounts: {
          browses: 0,
          reads: 0,
          dismisses: 0
        }
      }
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse
      } as Response)
      
      await provider.generateUserProfile(manyKeywordsRequest)
      
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestBody = JSON.parse(fetchCall[1]?.body as string)
      const prompt = requestBody.messages[0].content
      
      // 检查 prompt 中只包含前 20 个关键词
      expect(prompt).toContain("关键词1")
      expect(prompt).toContain("关键词20")
      expect(prompt).not.toContain("关键词21")
      expect(prompt).not.toContain("关键词50")
    })
  })
})