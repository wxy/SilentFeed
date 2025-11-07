/**
 * CollectionStats 组件测试
 * 测试采集统计的展示和格式化
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { CollectionStats } from "./CollectionStats"
import type { StorageStats } from "@/storage/types"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "options.collectionStats.noData": "暂无数据",
        "options.collectionStats.overview": "采集概览",
        "options.collectionStats.totalPages": "累计采集",
        "options.collectionStats.pagesCollected": "页面已采集",
        "options.collectionStats.validRecords": "有效记录",
        "options.collectionStats.dwellTimeOver30s": "停留超过 30 秒",
        "options.collectionStats.avgDwellTime": "平均停留",
        "options.collectionStats.perPage": "每页平均",
        "options.collectionStats.textAnalysis": "文本分析统计",
        "options.collectionStats.comingSoonInPhase3": "Phase 3 完成后显示",
        "options.collectionStats.textAnalysisHint":
          "将展示关键词提取、主题分类等统计",
        "options.collectionStats.userProfile": "用户画像统计",
        "options.collectionStats.profileHint":
          "将展示兴趣主题、关键词权重等信息",
        "options.collectionStats.storage": "存储占用",
        "options.collectionStats.totalSize": "总大小",
        "options.collectionStats.pendingVisits": "临时记录（待确认）",
        "options.collectionStats.confirmedVisits": "有效记录（已确认）",
        "options.collectionStats.recommendations": "推荐记录",
        "options.collectionStats.records": "条",
        "options.collectionStats.storageHint":
          "推荐记录数据将在推荐功能启用后显示",
        "options.collectionStats.topDomains": "常访问域名 (Top 10)",
        "options.collectionStats.noDomains": "暂无数据",
        "options.collectionStats.visits": "次访问",
        "options.collectionStats.dataManagement": "数据管理",
        "options.collectionStats.clearHistory": "清空浏览历史",
        "options.collectionStats.resetProfile": "重置用户画像",
        "options.collectionStats.clearAll": "清空所有数据",
        "options.collectionStats.comingSoon": "即将推出",
        "options.collectionStats.dataManagementHint":
          "数据管理功能将在后续版本中提供",
      }
      return translations[key] || key
    },
  }),
}))

// Mock storage
const mockGetStorageStats = vi.fn()
const mockGetAnalysisStats = vi.fn()
vi.mock("@/storage/db", () => ({
  getStorageStats: () => mockGetStorageStats(),
  getAnalysisStats: () => mockGetAnalysisStats(),
}))

// Mock UserProfileDisplay component
vi.mock("./UserProfileDisplay", () => ({
  UserProfileDisplay: () => (
    <div data-testid="user-profile-display">用户画像统计</div>
  ),
}))

describe("CollectionStats 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      mockGetStorageStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )
      mockGetAnalysisStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )

      render(<CollectionStats />)

      const skeleton = document.querySelector(".animate-pulse")
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("当没有统计数据时应该显示提示", async () => {
      mockGetStorageStats.mockResolvedValue(null)
      mockGetAnalysisStats.mockResolvedValue({
        analyzedPages: 0,
        totalKeywords: 0,
        avgKeywordsPerPage: 0,
        languageDistribution: [],
        topKeywords: [],
      })

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })
    })
  })

  describe("有数据状态 - 采集概览", () => {
    const mockStats: StorageStats = {
      pageCount: 637,
      pendingCount: 5,
      confirmedCount: 425,
      avgDwellTime: 127.5,
      totalSizeMB: 12.34,
      recommendationCount: 0,
      topDomains: [
        { domain: "github.com", count: 120 },
        { domain: "stackoverflow.com", count: 85 },
        { domain: "mozilla.org", count: 67 },
      ],
    }

    const mockAnalysisStats = {
      analyzedPages: 100,
      totalKeywords: 1200,
      avgKeywordsPerPage: 12,
      languageDistribution: [
        { language: "中文", count: 60 },
        { language: "英文", count: 40 },
      ],
      topKeywords: [
        { word: "JavaScript", frequency: 25 },
        { word: "React", frequency: 20 },
        { word: "TypeScript", frequency: 15 },
      ],
    }

    beforeEach(() => {
      mockGetStorageStats.mockResolvedValue(mockStats)
      mockGetAnalysisStats.mockResolvedValue(mockAnalysisStats)
    })

    it("应该显示累计采集的页面数", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("累计采集")).toBeInTheDocument()
        expect(screen.getByText("637")).toBeInTheDocument()
        expect(screen.getByText("页面已采集")).toBeInTheDocument()
      })
    })

    it("应该显示有效记录数", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("有效记录")).toBeInTheDocument()
        expect(screen.getByText("632")).toBeInTheDocument()
        expect(screen.getByText("停留超过 30 秒")).toBeInTheDocument()
      })
    })

    it("应该正确格式化平均停留时间", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("平均停留")).toBeInTheDocument()
        // 125.5秒 = 2分6秒
        expect(screen.getByText("2分6秒")).toBeInTheDocument()
        expect(screen.getByText("每页平均")).toBeInTheDocument()
      })
    })

    it("当停留时间小于 60 秒时应该只显示秒", async () => {
      const statsWithShortTime: StorageStats = {
        ...mockStats,
        avgDwellTime: 45,
      }

      mockGetStorageStats.mockResolvedValue(statsWithShortTime)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("45秒")).toBeInTheDocument()
      })
    })

    it("应该使用蓝色卡片显示累计采集", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        const blueCard = screen
          .getByText("累计采集")
          .closest(".bg-blue-50")
        expect(blueCard).toBeInTheDocument()
      })
    })

    it("应该使用绿色卡片显示有效记录", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        const greenCard = screen
          .getByText("有效记录")
          .closest(".bg-green-50")
        expect(greenCard).toBeInTheDocument()
      })
    })

    it("应该使用紫色卡片显示平均停留", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        const purpleCard = screen
          .getByText("平均停留")
          .closest(".bg-purple-50")
        expect(purpleCard).toBeInTheDocument()
      })
    })
  })

  describe("Phase 3 占位符", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 0,
      confirmedCount: 100,
      recommendationCount: 0,
      avgDwellTime: 60,
      totalSizeMB: 1.0,
      topDomains: [],
    }

    it("应该显示文本分析统计占位符", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("文本分析统计")).toBeInTheDocument()
        // Phase 3 提示出现两次（文本分析 + 用户画像）
        const phase3Hints = screen.getAllByText(/Phase 3 完成后显示/)
        expect(phase3Hints.length).toBe(2)
        expect(
          screen.getByText("将展示关键词提取、主题分类等统计")
        ).toBeInTheDocument()
      })
    })

    it("应该显示用户画像统计占位符", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("用户画像统计")).toBeInTheDocument()
        expect(
          screen.getByText("将展示兴趣主题、关键词权重等信息")
        ).toBeInTheDocument()
      })
    })

    it("占位符应该使用虚线边框样式", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const dashedBorders = container.querySelectorAll(".border-dashed")
        expect(dashedBorders.length).toBe(2)
      })
    })
  })

  describe("存储占用", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 5,
      confirmedCount: 95,
      recommendationCount: 10,
      avgDwellTime: 60,
      totalSizeMB: 2.45,
      topDomains: [],
    }

    it("应该显示存储占用信息", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("存储占用")).toBeInTheDocument()
        expect(screen.getByText("总大小")).toBeInTheDocument()
        expect(screen.getByText("2.45 MB")).toBeInTheDocument()
      })
    })

    it("应该显示各类记录数", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("临时记录（待确认）")).toBeInTheDocument()
        expect(screen.getByText("有效记录（已确认）")).toBeInTheDocument()
        expect(screen.getByText("推荐记录")).toBeInTheDocument()

        // 使用 container 查询来更精确地匹配
        const allText = screen.getAllByText(/\d+\s+条/)
        expect(allText.length).toBeGreaterThanOrEqual(3)
        // 验证包含特定数量
        expect(screen.getByText(/^5\s+条$/)).toBeInTheDocument()
        expect(screen.getByText(/^95\s+条$/)).toBeInTheDocument()
        expect(screen.getByText(/^10\s+条$/)).toBeInTheDocument()
      })
    })

    it("应该显示存储提示", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(
          screen.getByText(/推荐记录数据将在推荐功能启用后显示/)
        ).toBeInTheDocument()
      })
    })

    it("应该正确格式化存储大小", async () => {
      const statsWithSmallSize: StorageStats = {
        ...mockStats,
        totalSizeMB: 0.001,
      }

      mockGetStorageStats.mockResolvedValue(statsWithSmallSize)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("0.00 MB")).toBeInTheDocument()
      })
    })
  })

  describe("Top 域名", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 0,
      confirmedCount: 100,
      recommendationCount: 0,
      avgDwellTime: 60,
      totalSizeMB: 1.0,
      topDomains: [
        { domain: "github.com", count: 120 },
        { domain: "stackoverflow.com", count: 85 },
        { domain: "medium.com", count: 60 },
      ],
    }

    it("应该显示 Top 域名列表", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("常访问域名 (Top 10)")).toBeInTheDocument()
      })
    })

    it("应该显示域名和访问次数", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("github.com")).toBeInTheDocument()
        expect(screen.getByText("stackoverflow.com")).toBeInTheDocument()
        expect(screen.getByText("medium.com")).toBeInTheDocument()

        expect(screen.getByText("120 次访问")).toBeInTheDocument()
        expect(screen.getByText("85 次访问")).toBeInTheDocument()
        expect(screen.getByText("60 次访问")).toBeInTheDocument()
      })
    })

    it("应该显示域名排名", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("#1")).toBeInTheDocument()
        expect(screen.getByText("#2")).toBeInTheDocument()
        expect(screen.getByText("#3")).toBeInTheDocument()
      })
    })

    it("应该渲染进度条", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const progressBars = container.querySelectorAll(
          ".bg-gradient-to-r.from-blue-500.to-cyan-500"
        )
        expect(progressBars.length).toBe(3)
      })
    })

    it("进度条宽度应该与访问次数成比例", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const progressBars = container.querySelectorAll(
          ".bg-gradient-to-r.from-blue-500.to-cyan-500"
        )

        // 第一个应该是 100%（最大值）
        expect(progressBars[0]).toHaveStyle({ width: "100%" })

        // 第二个应该是 85/120 ≈ 70.83%
        const width2 = progressBars[1].getAttribute("style")
        expect(width2).toContain("70.83")

        // 第三个应该是 60/120 = 50%
        const width3 = progressBars[2].getAttribute("style")
        expect(width3).toContain("50")
      })
    })

    it("当没有域名数据时应该显示提示", async () => {
      const statsWithoutDomains: StorageStats = {
        ...mockStats,
        topDomains: [],
      }

      mockGetStorageStats.mockResolvedValue(statsWithoutDomains)

      render(<CollectionStats />)

      await waitFor(() => {
        // "暂无数据" 会出现两次（一次在可能的空数据状态，一次在域名部分）
        const noDataTexts = screen.getAllByText("暂无数据")
        expect(noDataTexts.length).toBeGreaterThan(0)
      })
    })
  })

  describe("数据管理", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 0,
      confirmedCount: 100,
      recommendationCount: 0,
      avgDwellTime: 60,
      totalSizeMB: 1.0,
      topDomains: [],
    }

    it("应该显示数据管理标题", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("数据管理")).toBeInTheDocument()
      })
    })

    it("应该显示三个管理按钮", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清空浏览历史/)).toBeInTheDocument()
        expect(screen.getByText(/重置用户画像/)).toBeInTheDocument()
        expect(screen.getByText(/清空所有数据/)).toBeInTheDocument()
      })
    })

    it("所有按钮都应该显示即将推出标签", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        const comingSoonLabels = screen.getAllByText(/即将推出/)
        expect(comingSoonLabels.length).toBe(3)
      })
    })

    it("所有按钮都应该是禁用状态", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const buttons = container.querySelectorAll("button[disabled]")
        expect(buttons.length).toBe(3)
      })
    })

    it("应该显示数据管理提示", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(
          screen.getByText(/数据管理功能将在后续版本中提供/)
        ).toBeInTheDocument()
      })
    })
  })

  describe("边界情况", () => {
    it("应该正确处理 0 秒停留时间", async () => {
      const stats: StorageStats = {
        pageCount: 10,
        pendingCount: 0,
        confirmedCount: 10,
        recommendationCount: 0,
        avgDwellTime: 0,
        totalSizeMB: 0.05,
        topDomains: [],
      }

      mockGetStorageStats.mockResolvedValue(stats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("0秒")).toBeInTheDocument()
      })
    })

    it("应该正确处理恰好 60 秒的停留时间", async () => {
      const stats: StorageStats = {
        pageCount: 10,
        pendingCount: 0,
        confirmedCount: 10,
        recommendationCount: 0,
        avgDwellTime: 60,
        totalSizeMB: 0.1,
        topDomains: [],
      }

      mockGetStorageStats.mockResolvedValue(stats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("1分0秒")).toBeInTheDocument()
      })
    })

    it("应该正确处理大数值", async () => {
      const stats: StorageStats = {
        pageCount: 10000,
        pendingCount: 50,
        confirmedCount: 9950,
        recommendationCount: 500,
        avgDwellTime: 3600, // 60分钟
        totalSizeMB: 125.67,
        topDomains: [{ domain: "example.com", count: 5000 }],
      }

      mockGetStorageStats.mockResolvedValue(stats)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("10000")).toBeInTheDocument()
        expect(screen.getByText("9950")).toBeInTheDocument()
        expect(screen.getByText(/500\s+条/)).toBeInTheDocument()
        expect(screen.getByText("60分0秒")).toBeInTheDocument()
        expect(screen.getByText("125.67 MB")).toBeInTheDocument()
      })
    })
  })

  describe("错误处理", () => {
    it("当加载失败时应该显示无数据状态", async () => {
      mockGetStorageStats.mockRejectedValue(new Error("Database error"))

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[CollectionStats] 加载统计失败:",
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe("UI 布局", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 5,
      confirmedCount: 95,
      recommendationCount: 10,
      avgDwellTime: 60,
      totalSizeMB: 1.5,
      topDomains: [{ domain: "test.com", count: 50 }],
    }

    it("应该使用响应式网格布局（3列）", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const gridElement = container.querySelector(
          ".grid-cols-1.md\\:grid-cols-3"
        )
        expect(gridElement).toBeInTheDocument()
      })
    })

    it("各个卡片应该有间距", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<CollectionStats />)

      await waitFor(() => {
        const spaceY6 = container.querySelector(".space-y-6")
        expect(spaceY6).toBeInTheDocument()
      })
    })
  })
})