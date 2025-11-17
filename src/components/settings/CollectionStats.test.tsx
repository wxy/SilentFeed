/**
 * CollectionStats 组件测试
 * 测试采集统计的展示和格式化
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { CollectionStats } from "./CollectionStats"
import type { StorageStats } from "@/types/database"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        "options.collectionStats.noData": "暂无数据",
        "options.collectionStats.overview": "采集概览",
        "options.collectionStats.textAnalysis": "文本分析统计",
        "options.collectionStats.dataManagement": "数据管理",
        "options.collectionStats.rebuildProfile": "重建用户画像",
        "options.collectionStats.rebuildingProfile": "重建画像中...",
        "options.collectionStats.clearDataRestart": "清除数据重新开始",
        "options.collectionStats.clearAll": "清除所有数据",
        // Overview section
        "options.collectionStats.totalPagesLabel": "累计采集页面",
        "options.collectionStats.dwellTimeHint": "停留超过30秒的页面",
        "options.collectionStats.storageLabel": "存储占用",
        "options.collectionStats.storageSizeMB": "{{size}} MB",
        "options.collectionStats.storageHint": "预估存储空间使用",
        "options.collectionStats.firstCollectionLabel": "开始采集时间",
        "options.collectionStats.avgDailyPages": "平均每日 {{count}} 页",
        // Text analysis
        "options.collectionStats.textAnalysisNoData": "暂无文本分析数据",
        "options.collectionStats.textAnalysisHint": "继续浏览网页，系统将自动提取和分析内容",
        "options.collectionStats.totalKeywordsLabel": "总关键词数",
        "options.collectionStats.avgKeywordsLabel": "平均每页关键词",
        "options.collectionStats.languageDistributionTitle": "语言分布",
        "options.collectionStats.languagePages": "{{count}} 页面",
        // Alert messages
        "options.collectionStats.alerts.analyzeFailed": "分析失败，请稍后重试",
        "options.collectionStats.alerts.rebuildSuccess": "用户画像重建成功！",
        "options.collectionStats.alerts.rebuildFailed": "重建失败，请稍后重试",
        "options.collectionStats.alerts.clearDataSuccess": "数据清除成功！\n现在可以重新开始浏览，系统将自动构建新的用户画像。",
        "options.collectionStats.alerts.clearDataFailed": "清除失败，请稍后重试",
        "options.collectionStats.alerts.clearAllSuccess": "所有数据清除成功！\n扩展已恢复到初始状态。",
        "options.collectionStats.alerts.clearAllFailed": "清除失败，请稍后重试",
      }
      
      // 如果有参数，进行简单的模板替换
      let result = translations[key] || key
      if (params) {
        Object.keys(params).forEach(paramKey => {
          result = result.replace(`{{${paramKey}}}`, String(params[paramKey]))
        })
      }
      return result
    },
  }),
}))

// Mock storage functions
vi.mock("@/storage/db", () => ({
  getStorageStats: vi.fn(),
  getAnalysisStats: vi.fn(),
  getAIAnalysisStats: vi.fn(),
  db: {
    pendingVisits: { clear: vi.fn() },
    confirmedVisits: { clear: vi.fn() },
    userProfile: { clear: vi.fn() },
    recommendations: { clear: vi.fn() },
  },
}))

// Mock migrator
vi.mock("@/core/migrator/DataMigrator", () => ({
  dataMigrator: {
    getMigrationStats: vi.fn(),
    analyzeHistoricalPages: vi.fn(),
    rebuildUserProfile: vi.fn(),
    cleanInvalidRecords: vi.fn(),
  }
}))

// Mock scheduler
vi.mock("@/core/profile/ProfileUpdateScheduler", () => ({
  ProfileUpdateScheduler: {
    forceUpdate: vi.fn(),
  }
}))

// Mock UserProfileDisplay component
vi.mock("./UserProfileDisplay", () => ({
  UserProfileDisplay: () => (
    <div data-testid="user-profile-display">用户画像统计</div>
  ),
}))

// Mock AnalysisDebugger
vi.mock("@/debug/AnalysisDebugger", () => ({
  AnalysisDebugger: {
    getUnanalyzableRecords: vi.fn().mockResolvedValue([]),
    checkDataIntegrity: vi.fn().mockResolvedValue({}),
  }
}))

// Import mocked modules
import { getStorageStats, getAnalysisStats, getAIAnalysisStats } from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"

const mockGetStorageStats = vi.mocked(getStorageStats)
const mockGetAnalysisStats = vi.mocked(getAnalysisStats)
const mockGetAIAnalysisStats = vi.mocked(getAIAnalysisStats)
const mockDataMigrator = vi.mocked(dataMigrator)

describe("CollectionStats 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDataMigrator.getMigrationStats.mockResolvedValue({
      totalVisits: 0,
      visitesWithAnalysis: 0,
      visitesWithoutAnalysis: 0,
      analysisCompleteness: 0,
    })
    
    // Mock AI 分析统计
    mockGetAIAnalysisStats.mockResolvedValue({
      totalPages: 0,
      aiAnalyzedPages: 0,
      keywordAnalyzedPages: 0,
      aiPercentage: 0,
      providerDistribution: [],
      totalCostUSD: 0,
      totalCostCNY: 0,
      totalTokens: 0,
      avgCostPerPage: 0,
      primaryCurrency: null
    })
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      mockGetStorageStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )
      mockGetAnalysisStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )
      mockGetAIAnalysisStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )

      render(<CollectionStats />)

      const skeleton = document.querySelector(".animate-pulse")
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("当没有统计数据时应该显示提示", async () => {
      // 模拟空数据状态（页面数为0）
      const emptyStats: StorageStats = {
        pageCount: 0,
        pendingCount: 0,
        confirmedCount: 0,
        recommendationCount: 0,
        totalSizeMB: 0,
        firstCollectionTime: undefined,
        avgDailyPages: 0,
      }
      
      mockGetStorageStats.mockResolvedValue(emptyStats)
      mockGetAnalysisStats.mockResolvedValue({
        analyzedPages: 0,
        totalKeywords: 0,
        avgKeywordsPerPage: 0,
        languageDistribution: [],
        topKeywords: [],
      })

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("累计采集页面")).toBeInTheDocument()
        expect(screen.getByText("0")).toBeInTheDocument()
      })
    })
  })

  describe("有数据状态 - 采集概览", () => {
    const mockStats: StorageStats = {
      pageCount: 637,
      pendingCount: 5,
      confirmedCount: 425,
      totalSizeMB: 12.34,
      recommendationCount: 0,
      firstCollectionTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7天前
      avgDailyPages: 91.0,
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

    it("应该显示累计采集页面数", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("累计采集页面")).toBeInTheDocument()
        expect(screen.getByText("637")).toBeInTheDocument()
        expect(screen.getByText("停留超过30秒的页面")).toBeInTheDocument()
      })
    })

    it("应该显示存储占用", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("存储占用")).toBeInTheDocument()
        expect(screen.getByText("12.34 MB")).toBeInTheDocument()
        expect(screen.getByText("预估存储空间使用")).toBeInTheDocument()
      })
    })

    it("应该显示开始采集时间", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("开始采集时间")).toBeInTheDocument()
        expect(screen.getByText("平均每日 91.0 页")).toBeInTheDocument()
      })
    })

    it("应该显示文本分析统计", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("🔤")).toBeInTheDocument()
        expect(screen.getByText("总关键词数")).toBeInTheDocument()
        expect(screen.getByText("1200")).toBeInTheDocument()
        expect(screen.getByText("平均每页关键词")).toBeInTheDocument()
        expect(screen.getByText("12.0")).toBeInTheDocument()
      })
    })

    it("应该显示语言分布", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("语言分布")).toBeInTheDocument()
        expect(screen.getByText("中文")).toBeInTheDocument()
        expect(screen.getByText("英文")).toBeInTheDocument()
        expect(screen.getByText("60 页面")).toBeInTheDocument()
        expect(screen.getByText("40 页面")).toBeInTheDocument()
      })
    })

    it("应该显示用户画像组件", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByTestId("user-profile-display")).toBeInTheDocument()
      })
    })

    it("应该显示数据管理功能", async () => {
      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("数据管理")).toBeInTheDocument()
        expect(screen.getByText(/重建用户画像/)).toBeInTheDocument()
        expect(screen.getByText(/清除数据重新开始/)).toBeInTheDocument()
        expect(screen.getByText(/清除所有数据/)).toBeInTheDocument()
      })
    })
  })

  describe("无文本分析数据状态", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 0,
      confirmedCount: 100,
      recommendationCount: 0,
      totalSizeMB: 1.0,
      firstCollectionTime: Date.now(),
      avgDailyPages: 10.0,
    }

    it("应该显示无文本分析数据提示", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)
      mockGetAnalysisStats.mockResolvedValue({
        analyzedPages: 0,
        totalKeywords: 0,
        avgKeywordsPerPage: 0,
        languageDistribution: [],
        topKeywords: [],
      })

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无文本分析数据")).toBeInTheDocument()
        expect(screen.getByText("继续浏览网页，系统将自动提取和分析内容")).toBeInTheDocument()
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

  describe("数据管理功能", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 0,
      confirmedCount: 100,
      recommendationCount: 0,
      totalSizeMB: 1.0,
      firstCollectionTime: Date.now(),
      avgDailyPages: 10.0,
    }

    beforeEach(() => {
      mockGetStorageStats.mockResolvedValue(mockStats)
      mockGetAnalysisStats.mockResolvedValue({
        analyzedPages: 50,
        totalKeywords: 500,
        avgKeywordsPerPage: 10,
        languageDistribution: [],
        topKeywords: [],
      })
    })

    it("应该能重建用户画像", async () => {
      const { ProfileUpdateScheduler } = await import(
        "@/core/profile/ProfileUpdateScheduler"
      )

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/重建用户画像/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/重建用户画像/)
      rebuildButton.click()

      await waitFor(() => {
        expect(ProfileUpdateScheduler.forceUpdate).toHaveBeenCalled()
      })
    })

    it("重建画像时应该禁用按钮并显示加载状态", async () => {
      const { ProfileUpdateScheduler } = await import(
        "@/core/profile/ProfileUpdateScheduler"
      )
      
      vi.mocked(ProfileUpdateScheduler.forceUpdate).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/重建用户画像/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/重建用户画像/)
      rebuildButton.click()

      await waitFor(() => {
        expect(screen.getByText("重建画像中...")).toBeInTheDocument()
      })

      await waitFor(
        () => {
          expect(screen.getByText(/重建用户画像/)).toBeInTheDocument()
        },
        { timeout: 200 }
      )
    })

    it("重建画像失败时应该显示错误", async () => {
      const { ProfileUpdateScheduler } = await import(
        "@/core/profile/ProfileUpdateScheduler"
      )

      vi.mocked(ProfileUpdateScheduler.forceUpdate).mockRejectedValue(
        new Error("Rebuild failed")
      )

      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/重建用户画像/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/重建用户画像/)
      rebuildButton.click()

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("重建失败，请稍后重试")
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[CollectionStats] 重建用户画像失败:",
          expect.any(Error)
        )
      })

      alertSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("应该能清除数据并重建", async () => {
      const { db } = await import("@/storage/db")

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除数据重新开始/)).toBeInTheDocument()
      })

      const clearButton = screen.getByText(/清除数据重新开始/)
      clearButton.click()

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled()
        expect(db.pendingVisits.clear).toHaveBeenCalled()
        expect(db.confirmedVisits.clear).toHaveBeenCalled()
        expect(db.userProfile.clear).toHaveBeenCalled()
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining("数据清除成功")
        )
      })

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it("清除数据时用户取消确认应该不执行", async () => {
      const { db } = await import("@/storage/db")

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除数据重新开始/)).toBeInTheDocument()
      })

      const clearButton = screen.getByText(/清除数据重新开始/)
      clearButton.click()

      expect(confirmSpy).toHaveBeenCalled()
      expect(db.pendingVisits.clear).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it("清除数据失败时应该显示错误", async () => {
      const { db } = await import("@/storage/db")

      vi.mocked(db.pendingVisits.clear).mockRejectedValue(
        new Error("Clear failed")
      )

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除数据重新开始/)).toBeInTheDocument()
      })

      const clearButton = screen.getByText(/清除数据重新开始/)
      clearButton.click()

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("清除失败，请稍后重试")
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[CollectionStats] 清除数据失败:",
          expect.any(Error)
        )
      })

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("应该能清除所有数据（包括推荐）", async () => {
      const { db } = await import("@/storage/db")

      // 重置所有 mock
      vi.mocked(db.pendingVisits.clear).mockReset().mockResolvedValue(undefined)
      vi.mocked(db.confirmedVisits.clear).mockReset().mockResolvedValue(undefined)
      vi.mocked(db.userProfile.clear).mockReset().mockResolvedValue(undefined)
      vi.mocked(db.recommendations.clear).mockReset().mockResolvedValue(undefined)

      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(true) // 第一次确认
        .mockReturnValueOnce(true) // 第二次确认

      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除所有数据/)).toBeInTheDocument()
      })

      const clearAllButton = screen.getByText(/清除所有数据/)
      clearAllButton.click()

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(2)
        expect(db.pendingVisits.clear).toHaveBeenCalled()
        expect(db.confirmedVisits.clear).toHaveBeenCalled()
        expect(db.userProfile.clear).toHaveBeenCalled()
        expect(db.recommendations.clear).toHaveBeenCalled()
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining("所有数据清除成功")
        )
      })

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it("清除所有数据时第一次取消应该不执行", async () => {
      const { db } = await import("@/storage/db")

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false)

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除所有数据/)).toBeInTheDocument()
      })

      const clearAllButton = screen.getByText(/清除所有数据/)
      clearAllButton.click()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(db.pendingVisits.clear).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it("清除所有数据时第二次取消应该不执行", async () => {
      const { db } = await import("@/storage/db")

      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(true) // 第一次确认
        .mockReturnValueOnce(false) // 第二次取消

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除所有数据/)).toBeInTheDocument()
      })

      const clearAllButton = screen.getByText(/清除所有数据/)
      clearAllButton.click()

      expect(confirmSpy).toHaveBeenCalledTimes(2)
      expect(db.pendingVisits.clear).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it("清除所有数据失败时应该显示错误", async () => {
      const { db } = await import("@/storage/db")

      vi.mocked(db.pendingVisits.clear).mockRejectedValue(
        new Error("Clear all failed")
      )

      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)

      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      render(<CollectionStats />)

      await waitFor(() => {
        expect(screen.getByText(/清除所有数据/)).toBeInTheDocument()
      })

      const clearAllButton = screen.getByText(/清除所有数据/)
      clearAllButton.click()

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("清除失败，请稍后重试")
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[CollectionStats] 清除所有数据失败:",
          expect.any(Error)
        )
      })

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })
})