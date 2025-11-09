/**
 * ProfileBuilder 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import { ProfileBuilder } from "./ProfileBuilder"
import { Topic } from "./topics"
import type { ConfirmedVisit } from "../../storage/types"

describe("ProfileBuilder", () => {
  let builder: ProfileBuilder

  beforeEach(() => {
    builder = new ProfileBuilder()
  })

  describe("空数据处理", () => {
    it("应该创建空画像", async () => {
      const profile = await builder.buildFromVisits([])

      expect(profile.id).toBe('singleton')
      expect(profile.totalPages).toBe(0)
      expect(profile.keywords).toHaveLength(0)
      expect(profile.domains).toHaveLength(0)
      expect(profile.topics[Topic.OTHER]).toBe(1.0)
      expect(profile.version).toBe(1)
    })
  })

  describe("单页面构建", () => {
    it("应该从单个技术页面构建画像", async () => {
      const visits: ConfirmedVisit[] = [
        {
          id: '1',
          url: 'https://blog.example.com/react-hooks',
          title: 'React Hooks 深入解析',
          domain: 'blog.example.com',
          visitTime: Date.now() - 24 * 60 * 60 * 1000, // 1天前
          duration: 180, // 3分钟
          interactionCount: 10,
          analysis: {
            keywords: ['react', 'hooks', 'javascript'],
            topics: ['technology'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      expect(profile.totalPages).toBe(1)
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(profile.keywords.some(kw => kw.word === 'react')).toBe(true)
      expect(profile.domains).toHaveLength(1)
      expect(profile.domains[0].domain).toBe('blog.example.com')
    })
  })

  describe("多页面聚合", () => {
    it("应该正确聚合多个页面的主题", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 技术页面
        {
          id: '1',
          url: 'https://tech.example.com/react',
          title: 'React 教程',
          domain: 'tech.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 240,
          interactionCount: 15,
          analysis: {
            keywords: ['react', 'javascript', 'programming'],
            topics: ['technology'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 设计页面
        {
          id: '2',
          url: 'https://design.example.com/ui-principles',
          title: 'UI 设计原则',
          domain: 'design.example.com',
          visitTime: now - 12 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 8,
          analysis: {
            keywords: ['design', 'ui', 'interface'],
            topics: ['design'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 科学页面
        {
          id: '3',
          url: 'https://science.example.com/research',
          title: '科学研究方法',
          domain: 'science.example.com',
          visitTime: now - 6 * 60 * 60 * 1000,
          duration: 300,
          interactionCount: 20,
          analysis: {
            keywords: ['research', 'scientific', 'study'],
            topics: ['science'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      expect(profile.totalPages).toBe(3)
      
      // 应该包含所有主题
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(profile.topics[Topic.DESIGN]).toBeGreaterThan(0)
      expect(profile.topics[Topic.SCIENCE]).toBeGreaterThan(0)
      
      // 关键词应该被聚合
      const allKeywords = profile.keywords.map(kw => kw.word)
      expect(allKeywords).toContain('react')
      expect(allKeywords).toContain('design')
      expect(allKeywords).toContain('research')
      
      // 域名统计
      expect(profile.domains).toHaveLength(3)
      const domains = profile.domains.map(d => d.domain)
      expect(domains).toContain('tech.example.com')
      expect(domains).toContain('design.example.com')
      expect(domains).toContain('science.example.com')
    })
  })

  describe("时间衰减", () => {
    it("近期页面权重应该更高", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 旧页面 - 30天前
        {
          id: '1',
          url: 'https://old.example.com',
          title: '旧文章',
          domain: 'old.example.com',
          visitTime: now - 30 * 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['old', 'content'],
            topics: ['other'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 新页面 - 1天前
        {
          id: '2',
          url: 'https://new.example.com',
          title: '新文章',
          domain: 'new.example.com',
          visitTime: now - 1 * 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['new', 'content'],
            topics: ['other'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 找到 new 和 old 关键词的权重
      const newKeyword = profile.keywords.find(kw => kw.word === 'new')
      const oldKeyword = profile.keywords.find(kw => kw.word === 'old')

      expect(newKeyword).toBeDefined()
      expect(oldKeyword).toBeDefined()
      
      if (newKeyword && oldKeyword) {
        // 新关键词权重应该更高
        expect(newKeyword.weight).toBeGreaterThan(oldKeyword.weight)
      }
    })
  })

  describe("行为权重", () => {
    it("停留时间长的页面权重应该更高", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 短停留
        {
          id: '1',
          url: 'https://quick.example.com',
          title: '快速浏览',
          domain: 'quick.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 45, // 45秒
          interactionCount: 5,
          analysis: {
            keywords: ['quick', 'browse'],
            topics: ['other'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 长停留
        {
          id: '2',
          url: 'https://deep.example.com',
          title: '深度阅读',
          domain: 'deep.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 600, // 10分钟
          interactionCount: 30,
          analysis: {
            keywords: ['deep', 'reading'],
            topics: ['other'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 找到相关关键词
      const deepKeyword = profile.keywords.find(kw => kw.word === 'deep')
      const quickKeyword = profile.keywords.find(kw => kw.word === 'quick')

      expect(deepKeyword).toBeDefined()
      expect(quickKeyword).toBeDefined()

      if (deepKeyword && quickKeyword) {
        // 深度阅读的关键词权重应该更高
        expect(deepKeyword.weight).toBeGreaterThan(quickKeyword.weight)
      }
    })
  })

  describe("域名聚合", () => {
    it("应该正确统计域名访问", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 同一域名的两次访问
        {
          id: '1',
          url: 'https://blog.example.com/post1',
          title: '文章1',
          domain: 'blog.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 120,
          interactionCount: 10,
          analysis: { keywords: ['test'], topics: ['other'], language: 'zh' },
          meta: null, contentSummary: null, source: 'organic', status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000, analysisRetainUntil: -1
        },
        {
          id: '2',
          url: 'https://blog.example.com/post2',
          title: '文章2',
          domain: 'blog.example.com',
          visitTime: now - 12 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 15,
          analysis: { keywords: ['test'], topics: ['other'], language: 'zh' },
          meta: null, contentSummary: null, source: 'organic', status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000, analysisRetainUntil: -1
        },
        // 另一个域名
        {
          id: '3',
          url: 'https://news.example.com/article',
          title: '新闻',
          domain: 'news.example.com',
          visitTime: now - 6 * 60 * 60 * 1000,
          duration: 90,
          interactionCount: 5,
          analysis: { keywords: ['news'], topics: ['news'], language: 'zh' },
          meta: null, contentSummary: null, source: 'organic', status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000, analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      expect(profile.domains).toHaveLength(2)
      
      // 找到 blog.example.com 的统计
      const blogDomain = profile.domains.find(d => d.domain === 'blog.example.com')
      const newsDomain = profile.domains.find(d => d.domain === 'news.example.com')
      
      expect(blogDomain).toBeDefined()
      expect(newsDomain).toBeDefined()
      
      if (blogDomain && newsDomain) {
        expect(blogDomain.count).toBe(2)
        expect(newsDomain.count).toBe(1)
        expect(blogDomain.avgDwellTime).toBe((120 + 180) / 2) // 平均停留时间
        expect(newsDomain.avgDwellTime).toBe(90)
        
        // 访问次数多的域名应该排在前面
        expect(profile.domains[0].domain).toBe('blog.example.com')
      }
    })
  })

  describe("配置选项", () => {
    it("应该遵循最大关键词数量限制", async () => {
      const customBuilder = new ProfileBuilder({ maxKeywords: 5 })
      
      const visits: ConfirmedVisit[] = [
        {
          id: '1',
          url: 'https://test.example.com',
          title: '测试页面',
          domain: 'test.example.com',
          visitTime: Date.now() - 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7'],
            topics: ['other'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await customBuilder.buildFromVisits(visits)

      expect(profile.keywords.length).toBeLessThanOrEqual(5)
    })
  })

  describe("AI 概率云聚合 (Phase 4)", () => {
    it("应该使用 AI 分析的主题概率", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        {
          id: '1',
          url: 'https://ai.example.com/article',
          title: 'AI 分析的文章',
          domain: 'ai.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['ai', 'machine', 'learning'],
            topics: ['technology'],
            language: 'zh',
            aiAnalysis: {
              topics: {
                '技术': 0.8,
                '科学': 0.2
              },
              provider: 'deepseek',
              model: 'deepseek-chat',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 应该优先使用 AI 概率分布
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0.5)
      expect(profile.topics[Topic.SCIENCE]).toBeGreaterThan(0)
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(profile.topics[Topic.SCIENCE])
    })

    it("应该正确聚合多个 AI 分析结果", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 技术页面 80%
        {
          id: '1',
          url: 'https://tech.example.com',
          title: '技术文章',
          domain: 'tech.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 300, // 5分钟，高权重
          interactionCount: 20,
          analysis: {
            keywords: ['tech'],
            topics: ['technology'],
            language: 'zh',
            aiAnalysis: {
              topics: { '技术': 0.9, '设计': 0.1 },
              provider: 'deepseek',
              model: 'deepseek-chat',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 设计页面 70%
        {
          id: '2',
          url: 'https://design.example.com',
          title: '设计文章',
          domain: 'design.example.com',
          visitTime: now - 12 * 60 * 60 * 1000,
          duration: 240, // 4分钟
          interactionCount: 15,
          analysis: {
            keywords: ['design'],
            topics: ['design'],
            language: 'zh',
            aiAnalysis: {
              topics: { '设计': 0.7, '艺术': 0.3 },
              provider: 'openai',
              model: 'gpt-4o-mini',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 应该聚合所有 AI 概率
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(profile.topics[Topic.DESIGN]).toBeGreaterThan(0)
      expect(profile.topics[Topic.ARTS]).toBeGreaterThan(0)
      
      // 所有概率之和应该约为 1（允许浮点误差）
      const sum = Object.values(profile.topics).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 2)
    })

    it("AI 分析和关键词分析混合时应优先使用 AI", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 有 AI 分析
        {
          id: '1',
          url: 'https://ai.example.com',
          title: 'AI 文章',
          domain: 'ai.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['ai'],
            topics: ['technology'],
            language: 'zh',
            aiAnalysis: {
              topics: { '技术': 1.0 },
              provider: 'deepseek',
              model: 'deepseek-chat',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 仅关键词分析（应被忽略）
        {
          id: '2',
          url: 'https://keyword.example.com',
          title: '关键词文章',
          domain: 'keyword.example.com',
          visitTime: now - 12 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['design', 'ui', 'interface'],
            topics: ['design'],
            language: 'zh'
            // 没有 aiAnalysis
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 应该只使用 AI 分析的页面
      expect(profile.topics[Topic.TECHNOLOGY]).toBeCloseTo(1.0, 1)
      // 关键词分析的设计主题不应该出现
      expect(profile.topics[Topic.DESIGN]).toBe(0)
    })

    it("没有 AI 分析时应回退到关键词分类", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        {
          id: '1',
          url: 'https://keyword.example.com',
          title: '关键词文章',
          domain: 'keyword.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['react', 'javascript', 'programming'],
            topics: ['technology'],
            language: 'zh'
            // 没有 aiAnalysis
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 应该使用关键词分类
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(profile.keywords.some(kw => kw.word === 'react')).toBe(true)
    })

    it("应该正确映射中英文主题名称", async () => {
      const now = Date.now()
      const visits: ConfirmedVisit[] = [
        // 中文主题
        {
          id: '1',
          url: 'https://chinese.example.com',
          title: '中文主题',
          domain: 'chinese.example.com',
          visitTime: now - 24 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['test'],
            topics: ['technology'],
            language: 'zh',
            aiAnalysis: {
              topics: { '技术': 0.5, '科学': 0.5 },
              provider: 'deepseek',
              model: 'deepseek-chat',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        // 英文主题
        {
          id: '2',
          url: 'https://english.example.com',
          title: 'English Topics',
          domain: 'english.example.com',
          visitTime: now - 12 * 60 * 60 * 1000,
          duration: 180,
          interactionCount: 10,
          analysis: {
            keywords: ['test'],
            topics: ['business'],
            language: 'en',
            aiAnalysis: {
              topics: { 'business': 0.6, 'technology': 0.4 },
              provider: 'openai',
              model: 'gpt-4o-mini',
              timestamp: now
            }
          },
          meta: null,
          contentSummary: null,
          source: 'organic',
          status: 'qualified',
          contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      const profile = await builder.buildFromVisits(visits)

      // 应该正确映射到枚举
      expect(profile.topics[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(profile.topics[Topic.SCIENCE]).toBeGreaterThan(0)
      expect(profile.topics[Topic.BUSINESS]).toBeGreaterThan(0)
    })
  })
})
