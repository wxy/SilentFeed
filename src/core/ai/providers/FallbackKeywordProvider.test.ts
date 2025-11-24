/**
 * FallbackKeywordProvider 测试
 * 测试基于关键词的降级分析方案
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { FallbackKeywordProvider } from "./FallbackKeywordProvider"
import { TextAnalyzer } from "@/core/analyzer/TextAnalyzer"
import { TopicClassifier } from "@/core/profile/TopicClassifier"
import { Topic } from "@/core/profile/topics"

describe("FallbackKeywordProvider", () => {
  let provider: FallbackKeywordProvider

  beforeEach(() => {
    provider = new FallbackKeywordProvider()
    vi.clearAllMocks()
  })

  describe("基本属性", () => {
    it("应该有正确的名称", () => {
      expect(provider.name).toBe("Keyword Analysis")
    })
  })

  describe("isAvailable", () => {
    it("应该始终返回 true（关键词分析总是可用）", async () => {
      const available = await provider.isAvailable()
      expect(available).toBe(true)
    })
  })

  describe("testConnection", () => {
    it("应该返回成功状态（无需网络连接）", async () => {
      const result = await provider.testConnection()

      expect(result.success).toBe(true)
      expect(result.message).toBe("关键词分析无需连接，始终可用")
      expect(result.latency).toBe(0)
    })
  })

  describe("analyzeContent", () => {
    it("应该成功分析技术内容", async () => {
      const content = `
        JavaScript 是一种高级编程语言，广泛用于 Web 开发。
        React 是一个流行的前端框架，用于构建用户界面。
        TypeScript 为 JavaScript 添加了类型系统。
      `

      const result = await provider.analyzeContent(content)

      // 验证结果结构
      expect(result).toHaveProperty("topicProbabilities")
      expect(result).toHaveProperty("metadata")

      // 验证主题分布
      expect(typeof result.topicProbabilities).toBe("object")
      expect(Object.keys(result.topicProbabilities).length).toBeGreaterThan(0)

      // 验证元数据
      expect(result.metadata.provider).toBe("keyword")
      expect(result.metadata.model).toBe("TextAnalyzer + TopicClassifier")
      expect(result.metadata.timestamp).toBeGreaterThan(0)

      // 验证概率值
      const probabilities = Object.values(result.topicProbabilities)
      probabilities.forEach((prob) => {
        expect(prob).toBeGreaterThanOrEqual(0)
        expect(prob).toBeLessThanOrEqual(1)
      })
    })

    it("应该分析科技类文章", async () => {
      const content = `
        人工智能和机器学习正在改变世界。
        深度学习算法可以识别图像和语音。
        神经网络是 AI 的核心技术。
      `

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(Object.keys(result.topicProbabilities).length).toBeGreaterThan(0)

      // 应该有合理的主题分布（不检查具体主题名称，因为可能是英文 key）
      const values = Object.values(result.topicProbabilities)
      values.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      })
    })

    it("应该分析商业类文章", async () => {
      const content = `
        公司发布了最新的财报，营收增长显著。
        市场份额持续扩大，投资者信心增强。
        管理层宣布新的战略计划。
      `

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(Object.keys(result.topicProbabilities).length).toBeGreaterThan(0)
    })

    it("应该处理空内容", async () => {
      const result = await provider.analyzeContent("")

      expect(result.topicProbabilities).toBeDefined()
      // 空内容可能返回默认主题或空对象
      expect(result.metadata.provider).toBe("keyword")
    })

    it("应该处理短文本", async () => {
      const content = "JavaScript"

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
    })

    it("应该过滤低概率主题（< 0.01）", async () => {
      const content = "测试内容"

      const result = await provider.analyzeContent(content)

      // 所有返回的主题概率都应该 >= 0.01
      const probabilities = Object.values(result.topicProbabilities)
      probabilities.forEach((prob) => {
        expect(prob).toBeGreaterThanOrEqual(0.01)
      })
    })

    it("应该处理分析错误并返回默认主题", async () => {
      // Mock TextAnalyzer.extractKeywords 抛出错误
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(TextAnalyzer.prototype, "extractKeywords").mockImplementation(() => {
        throw new Error("Analysis error")
      })

      const result = await provider.analyzeContent("test content")

      // 应该返回降级结果
      expect(result.topicProbabilities).toEqual({
        未分类: 1.0,
      })
      expect(result.metadata.model).toBe("fallback")
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })

    it("应该在没有有效主题时返回默认主题", async () => {
      // Mock TopicClassifier 返回全零分布
      vi.spyOn(TopicClassifier.prototype, "classify").mockReturnValue({
        [Topic.TECHNOLOGY]: 0.001,
        [Topic.SCIENCE]: 0.001,
        [Topic.BUSINESS]: 0.001,
        [Topic.DESIGN]: 0.001,
        [Topic.ARTS]: 0.001,
        [Topic.HEALTH]: 0.001,
        [Topic.SPORTS]: 0.001,
        [Topic.ENTERTAINMENT]: 0.001,
        [Topic.NEWS]: 0.001,
        [Topic.EDUCATION]: 0.001,
        [Topic.OTHER]: 0.001,
      })

      const result = await provider.analyzeContent("test")

      // 所有主题都 < 0.01，应该返回默认
      expect(result.topicProbabilities).toEqual({
        未分类: 1.0,
      })
    })

    it("应该正确转换主题分布格式", async () => {
      // 验证当 classify 返回特定分布时的过滤逻辑
      // 使用实际数据而不是 mock，确保真实行为
      const content = `
        技术 科学 商业 设计 艺术 健康 
        技术 科学 商业 设计 艺术 健康
        技术 科学 商业 设计 艺术 健康
        技术 科学 商业
        技术 科学
        技术
      `.repeat(3)

      const result = await provider.analyzeContent(content)

      // 验证返回的主题概率都 >= 0.01（过滤阈值）
      const probabilities = Object.values(result.topicProbabilities)
      probabilities.forEach((prob) => {
        expect(prob).toBeGreaterThanOrEqual(0.01)
      })

      // 验证概率总和合理
      const total = probabilities.reduce((sum, p) => sum + p, 0)
      expect(total).toBeGreaterThan(0)
      expect(total).toBeLessThanOrEqual(1.1)
    })
  })

  describe("集成测试", () => {
    it("应该完整处理真实文章内容", async () => {
      // 创建新实例避免之前 mock 的影响
      const newProvider = new FallbackKeywordProvider()
      
      const content = `
        React 18 引入了新的并发渲染功能，显著提升了应用性能。
        开发者可以使用 Suspense 来处理异步加载，
        同时新的 Hooks API 让状态管理更加简单。
        TypeScript 的类型系统帮助我们在编译时发现错误。
      `

      const result = await newProvider.analyzeContent(content)

      // 验证基本结构
      expect(result.topicProbabilities).toBeDefined()
      expect(result.metadata).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
      // model 可能是 "TextAnalyzer + TopicClassifier" 或 "fallback"
      expect(result.metadata.model).toMatch(/TextAnalyzer|fallback/)

      // 验证有有效的主题分布
      const topics = Object.keys(result.topicProbabilities)
      expect(topics.length).toBeGreaterThan(0)

      // 验证概率和为合理值（可能不完全等于 1，因为过滤了低概率主题）
      const totalProb = Object.values(result.topicProbabilities).reduce(
        (sum, prob) => sum + prob,
        0
      )
      expect(totalProb).toBeGreaterThan(0)
      expect(totalProb).toBeLessThanOrEqual(1.1) // 允许浮点误差
    })

    it("应该支持分析选项参数（即使不使用）", async () => {
      const content = "测试内容"
      const options = {
        maxLength: 1000,
        timeout: 5000,
      }

      // 应该接受 options 参数但不报错
      const result = await provider.analyzeContent(content, options)

      expect(result).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
    })

    it("应该处理多语言混合内容", async () => {
      const content = `
        Hello World! 你好世界！
        JavaScript is awesome. JavaScript 很棒。
        React, Vue, Angular are popular frameworks.
      `

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(Object.keys(result.topicProbabilities).length).toBeGreaterThan(0)
    })

    it("应该处理包含特殊字符的内容", async () => {
      const content = `
        编程语言: JavaScript, Python, Go
        框架: React, Vue.js, Angular
        工具: VS Code, Git, Docker
        符号: @#$%^&*()
      `

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
    })
  })

  describe("性能测试", () => {
    it("应该快速完成分析（< 100ms）", async () => {
      const content = "测试内容".repeat(100)

      const startTime = Date.now()
      await provider.analyzeContent(content)
      const duration = Date.now() - startTime

      // 关键词分析应该很快
      expect(duration).toBeLessThan(100)
    })
  })

  describe("边界情况", () => {
    it("应该处理极长文本", async () => {
      const content = "JavaScript 编程语言框架开发 ".repeat(1000)

      const result = await provider.analyzeContent(content)

      expect(result.topicProbabilities).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
    })

    it("应该处理仅包含标点符号的内容", async () => {
      const content = "... !!! ??? ### @@@"

      const result = await provider.analyzeContent(content)

      expect(result).toBeDefined()
      // 可能返回默认主题或空主题
    })

    it("应该处理数字内容", async () => {
      const content = "123 456 789 0.5 3.14 100%"

      const result = await provider.analyzeContent(content)

      expect(result).toBeDefined()
      expect(result.metadata.provider).toBe("keyword")
    })

    it("应该处理 undefined 内容（通过类型强制转换）", async () => {
      // 虽然类型系统不允许，但测试运行时健壮性
      const result = await provider.analyzeContent(undefined as any)

      expect(result).toBeDefined()
      // 应该有降级处理
    })
  })

  describe("generateUserProfile", () => {
    it("应该基于关键词生成用户画像", async () => {
      const request = {
        behaviors: {
          browses: [
            { keywords: ['React', 'JavaScript'], topics: ['technology'], weight: 0.8, timestamp: Date.now() }
          ],
          reads: [
            { title: 'React 18 新特性', keywords: ['React'], topics: ['technology'], readDuration: 120, scrollDepth: 0.9, weight: 0.9, timestamp: Date.now() }
          ],
          dismisses: [
            { title: '娱乐八卦', keywords: ['娱乐', '明星'], topics: ['entertainment'], weight: 0.5, timestamp: Date.now() }
          ]
        },
        topKeywords: [
          { word: 'React', weight: 0.95 },
          { word: 'JavaScript', weight: 0.88 },
          { word: 'TypeScript', weight: 0.75 }
        ],
        topicDistribution: {
          technology: 0.85,
          design: 0.15
        }
      }

      const result = await provider.generateUserProfile(request)

      expect(result.interests).toContain('React')
      expect(result.interests).toContain('JavaScript')
      expect(result.interests).toContain('technology')
      expect(result.preferences).toContain('技术文章')
      expect(result.avoidTopics).toContain('娱乐')
      expect(result.metadata.provider).toBe('keyword')
      expect(result.metadata.cost).toBe(0) // 降级方案无成本
    })

    it("应该在没有数据时返回默认画像", async () => {
      const request = {
        behaviors: {},
        topKeywords: [],
        topicDistribution: {}
      }

      const result = await provider.generateUserProfile(request)

      expect(result.interests).toBe('正在学习您的兴趣偏好')
      expect(result.preferences).toEqual(['深度文章', '专业内容', '高质量资讯'])
      expect(result.avoidTopics).toEqual([])
      expect(result.metadata.provider).toBe('keyword')
    })

    it("应该正确统计数据量", async () => {
      const request = {
        behaviors: {
          browses: [
            { keywords: [], topics: [], weight: 0.5, timestamp: Date.now() },
            { keywords: [], topics: [], weight: 0.5, timestamp: Date.now() },
            { keywords: [], topics: [], weight: 0.5, timestamp: Date.now() }
          ],
          reads: [
            { title: 'Test', keywords: [], topics: [], readDuration: 60, scrollDepth: 0.8, weight: 0.7, timestamp: Date.now() },
            { title: 'Test 2', keywords: [], topics: [], readDuration: 120, scrollDepth: 0.9, weight: 0.8, timestamp: Date.now() }
          ],
          dismisses: [
            { title: 'Bad', keywords: ['bad'], topics: [], weight: 0.3, timestamp: Date.now() }
          ]
        },
        topKeywords: [{ word: 'test', weight: 0.5 }],
        topicDistribution: { technology: 0.5 }
      }

      const result = await provider.generateUserProfile(request)

      expect(result.metadata.basedOn).toEqual({
        browses: 3,
        reads: 2,
        dismisses: 1
      })
    })
  })
})
