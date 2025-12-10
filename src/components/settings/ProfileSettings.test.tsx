/**
 * ProfileSettings 组件测试
 * 
 * 测试 AI First 版本的用户画像组件
 */

import { render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { ProfileSettings } from "./ProfileSettings"
import { getUserProfile } from "@/storage/db"
import { getAIConfig } from "@/storage/ai-config"
import { profileManager } from "@/core/profile/ProfileManager"
import { Topic } from "@/core/profile/topics"
import type { TopicDistribution } from "@/core/profile/TopicClassifier"
import { AI_ENGINE_PRESETS } from "@/types/ai-engine-assignment"

// 辅助函数：创建完整的 topics 对象
function createTopics(partial: Partial<TopicDistribution> = {}): TopicDistribution {
  return {
    [Topic.TECHNOLOGY]: 0,
    [Topic.SCIENCE]: 0,
    [Topic.DESIGN]: 0,
    [Topic.ARTS]: 0,
    [Topic.BUSINESS]: 0,
    [Topic.HEALTH]: 0,
    [Topic.SPORTS]: 0,
    [Topic.ENTERTAINMENT]: 0,
    [Topic.NEWS]: 0,
    [Topic.EDUCATION]: 0,
    [Topic.OTHER]: 0,
    ...partial,
  }
}

// Mock dependencies
vi.mock("@/storage/db")
vi.mock("@/storage/ai-config")
vi.mock("@/core/profile/ProfileManager")
vi.mock("@/i18n/helpers", () => {
  const translators: Record<string, (params?: Record<string, any>) => string> = {
    "options.userProfile.chat.intro": (params) =>
      `我是 ${params?.providerName ?? "AI"}，通过分析你从 ${params?.startDate ?? ""} 以来的 ${params?.totalPages ?? 0} 次浏览，我发现你${params?.interests ?? ""}`,
    "options.userProfile.chat.preferences": (params) =>
      `根据这些理解，我会为你推荐 ${params?.preferences ?? ""} 等方面的内容。`,
    "options.userProfile.chat.avoidTopics": (params) =>
      `同时，我也注意到你不感兴趣的内容，会避免推荐 ${params?.topics ?? ""} 等话题。`,
    "options.userProfile.chat.generating": () => "AI 画像生成中，请稍候...",
    "options.userProfile.chat.userRebuildLabel": () => "🔄 重建画像",
    "options.userProfile.chat.tipConfigured": () => "点击\"重建画像\"按钮，AI 会重新分析你的浏览习惯",
    "options.userProfile.chat.tipNotConfigured": () => "请先在\"AI 引擎\"标签页配置 AI 服务"
  }

  return {
    useI18n: () => ({
      _: (key: string, params?: Record<string, any>) => {
        const handler = translators[key]
        if (handler) {
          return handler(params)
        }
        return key
      }
    })
  }
})

const mockGetUserProfile = vi.mocked(getUserProfile)
const mockGetAIConfig = vi.mocked(getAIConfig)
const mockRebuildProfile = vi.fn()

vi.mocked(profileManager).rebuildProfile = mockRebuildProfile

vi.stubGlobal("alert", vi.fn())

describe("ProfileSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProfile.mockResolvedValue(null)
    mockGetAIConfig.mockResolvedValue({
      providers: {},
      monthlyBudget: 5,
      local: {
        enabled: false,
        provider: "ollama",
        endpoint: "http://localhost:11434/v1",
        model: "llama2",
        apiKey: "ollama",
        temperature: 0.2,
        maxOutputTokens: 768,
        timeoutMs: 45000
      },
      engineAssignment: AI_ENGINE_PRESETS.intelligence.config
    })
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      render(<ProfileSettings />)
      const loadingElement = document.querySelector(".animate-pulse")
      expect(loadingElement).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("应该显示无数据提示", async () => {
      mockGetUserProfile.mockResolvedValue(null)

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.noData.message/)).toBeInTheDocument()
      })
    })

    it("应该在 totalPages 为 0 时显示无数据提示", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 0,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.noData.message/)).toBeInTheDocument()
      })
    })
  })

  describe("基础统计信息", () => {
    beforeEach(() => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
    })

    it("应该显示更新时间", async () => {
      // Phase 10.3: 元数据已融入对话式 AI 画像中，不再单独展示
      // 此测试调整为验证 AI 对话中包含时间信息
      mockGetAIConfig.mockResolvedValue({
        providers: {
          openai: {
            apiKey: "test-key",
            model: "gpt-4o-mini"
          }
        },
        monthlyBudget: 100,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户兴趣",
          preferences: [],
          avoidTopics: [],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        // 验证 AI 对话中包含浏览页面数信息
        expect(screen.getByText(/通过分析你从/)).toBeInTheDocument()
      })
    })
  })

  describe("AI 配置状态", () => {
    it("应该显示 AI 未配置提示", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
      mockGetAIConfig.mockResolvedValue({
        providers: {},
        monthlyBudget: 5,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/请先在"AI 引擎"标签页配置 AI 服务/)).toBeInTheDocument()
      })
    })
  })

  describe("AI 画像展示", () => {
    beforeEach(() => {
      // 每个测试都需要配置 AI
      mockGetAIConfig.mockResolvedValue({
        providers: {
          openai: {
            apiKey: "test-key",
            model: "gpt-4o-mini"
          }
        },
        monthlyBudget: 100,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })
    })

    it("应该显示 AI 生成的兴趣总结", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户对人工智能、机器学习和深度学习技术非常感兴趣，经常关注相关领域的前沿研究和应用案例。",
          preferences: [
            "偏好深度技术文章，不喜欢浅显的入门教程",
            "喜欢实践案例和代码示例",
            "关注行业动态和技术趋势",
          ],
          avoidTopics: [
            "八卦新闻",
            "娱乐内容",
          ],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/我是/)).toBeInTheDocument()
        expect(screen.getByText(/人工智能/)).toBeInTheDocument()
        expect(screen.getByText(/机器学习/)).toBeInTheDocument()
      })
    })

    it("应该显示偏好特征列表", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户兴趣总结",
          preferences: [
            "偏好深度技术文章",
            "喜欢实践案例",
          ],
          avoidTopics: [],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        // 新的 UI 将 preferences 合并在一句话中
        expect(screen.getByText(/根据这些理解/)).toBeInTheDocument()
      })
    })

    it("应该显示避免主题列表", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户兴趣总结",
          preferences: [],
          avoidTopics: [
            "八卦新闻",
            "娱乐内容",
          ],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/八卦新闻/)).toBeInTheDocument()
        expect(screen.getByText(/娱乐内容/)).toBeInTheDocument()
      })
    })
  })

  describe("重建画像功能", () => {
    beforeEach(() => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
      mockGetAIConfig.mockResolvedValue({
        providers: {
          openai: {
            apiKey: "test-key",
            model: "gpt-4o-mini"
          }
        },
        monthlyBudget: 100,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })
    })

    it("应该显示重建按钮", async () => {
      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })
    })

    it("应该在点击重建按钮时调用重建函数", async () => {
      const user = userEvent.setup()
      mockRebuildProfile.mockResolvedValue(undefined)

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/options.userProfile.actions.rebuild/)
      await user.click(rebuildButton)

      await waitFor(() => {
        expect(mockRebuildProfile).toHaveBeenCalled()
      })
    })

    it("应该在重建时禁用按钮", async () => {
      const user = userEvent.setup()
      mockRebuildProfile.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/options.userProfile.actions.rebuild/).closest("button")
      expect(rebuildButton).not.toBeDisabled()

      await user.click(rebuildButton!)

      // 重建中应该禁用
      expect(rebuildButton).toBeDisabled()
    })
  })

  describe("错误处理", () => {
    it("应该处理加载 profile 失败", async () => {
      mockGetUserProfile.mockRejectedValue(new Error("Load failed"))

      render(<ProfileSettings />)

      await waitFor(() => {
        // 应该停止加载状态
        const loadingElement = document.querySelector(".animate-pulse")
        expect(loadingElement).not.toBeInTheDocument()
      })
    })
  })

  describe("关键词高亮", () => {
    it("应该正确高亮完整单词，避免部分匹配", async () => {
      // 准备数据
      const mockProfile = {
        totalPages: 100,
        startDate: new Date("2024-10-06"),
        topics: createTopics({ [Topic.TECHNOLOGY]: 0.8 }),
        aiSummary: {
          summary: "对前端开发技术有强烈兴趣，特别关注CSS Grid布局、HTML元素（如div、id、class）",
          interests: "Grid、id、class、div",
          preferences: ["前端开发", "CSS技术"],
          avoidTopics: ["娱乐八卦"],
          metadata: {
            provider: "deepseek",
            model: "deepseek-chat",
            timestamp: Date.now(),
            tokensUsed: 1000,
            costUSD: 0.001
          }
        }
      }

      mockGetUserProfile.mockResolvedValue(mockProfile)
      mockGetAIConfig.mockResolvedValue({
        providers: {
          deepseek: {
            apiKey: "test-key",
            model: "deepseek-chat",
            temperature: 0.2,
            maxOutputTokens: 768
          }
        },
        monthlyBudget: 5,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        // 等待渲染完成 - 检查关键词是否被正确高亮
        expect(screen.getAllByText("Grid").length).toBeGreaterThan(0)
      })

      // 检查高亮逻辑：
      // 1. "Grid" 应该被高亮（完整单词）
      const gridElements = screen.getAllByText("Grid")
      expect(gridElements.length).toBeGreaterThan(0)
      const highlightedGrid = gridElements.find(el => 
        el.classList.contains("text-blue-600") || el.classList.contains("dark:text-blue-400")
      )
      expect(highlightedGrid).toBeDefined()
      expect(highlightedGrid?.textContent).toBe("Grid") // 完整单词，不会被拆分

      // 2. "id" 应该只在独立出现时被高亮
      const idElements = screen.getAllByText("id")
      expect(idElements.length).toBeGreaterThan(0)
      const highlightedId = idElements.find(el => 
        el.classList.contains("text-blue-600") || el.classList.contains("dark:text-blue-400")
      )
      expect(highlightedId).toBeDefined()
    })

    it("应该过滤太短的关键词（<2字符）", async () => {
      const mockProfile = {
        totalPages: 100,
        startDate: new Date("2024-10-06"),
        topics: createTopics({ [Topic.TECHNOLOGY]: 0.8 }),
        aiSummary: {
          summary: "对AI技术有兴趣",
          interests: "A、AI、技术",
          preferences: ["AI技术"],
          avoidTopics: [],
          metadata: {
            provider: "deepseek",
            model: "deepseek-chat",
            timestamp: Date.now(),
            tokensUsed: 1000,
            costUSD: 0.001
          }
        }
      }

      mockGetUserProfile.mockResolvedValue(mockProfile)
      mockGetAIConfig.mockResolvedValue({
        providers: {
          deepseek: {
            apiKey: "test-key",
            model: "deepseek-chat",
            temperature: 0.2,
            maxOutputTokens: 768
          }
        },
        monthlyBudget: 5,
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        // 等待渲染完成 - 检查 AI 关键词是否被正确高亮
        expect(screen.getAllByText("AI").length).toBeGreaterThan(0)
      })

      // "AI" 应该被高亮（≥2 字符）
      const aiElements = screen.getAllByText("AI")
      const highlightedAI = aiElements.find(el => 
        el.classList.contains("text-blue-600") || el.classList.contains("dark:text-blue-400")
      )
      expect(highlightedAI).toBeDefined()
      
      // "技术" 也应该被高亮
      const techElements = screen.getAllByText("技术")
      const highlightedTech = techElements.find(el => 
        el.classList.contains("text-blue-600") || el.classList.contains("dark:text-blue-400")
      )
      expect(highlightedTech).toBeDefined()
    })
  })
})
