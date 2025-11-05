/**
 * DataStats 组件测试
 * 测试数据统计的展示和格式化
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { DataStats } from "./DataStats"
import type { StorageStats } from "@/storage/types"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "options.dataStats.noData": "暂无数据",
        "options.dataStats.overview": "数据概览",
        "options.dataStats.totalPages": "总页面数",
        "options.dataStats.confirmedVisits": "正式记录",
        "options.dataStats.recommendations": "推荐数",
        "options.dataStats.avgDwellTime": "平均停留",
        "options.dataStats.storage": "存储占用",
        "options.dataStats.totalSize": "总大小",
        "options.dataStats.pendingVisits": "临时记录",
        "options.dataStats.confirmedVisitsLabel": "正式记录",
        "options.dataStats.recommendationsLabel": "推荐记录",
        "options.dataStats.records": "条",
        "options.dataStats.topDomains": "常访问域名",
        "options.dataStats.noDomains": "暂无数据",
        "options.dataStats.visits": "次访问",
        "options.dataStats.dataManagement": "数据管理",
        "options.dataStats.clearHistory": "清空访问历史",
        "options.dataStats.resetProfile": "重置用户画像",
        "options.dataStats.clearAll": "清空所有数据",
        "options.dataStats.comingSoon": "即将推出",
        "options.dataStats.dataManagementHint": "数据管理功能将在 Phase 3 实现",
      }
      return translations[key] || key
    },
  }),
}))

// Mock storage
const mockGetStorageStats = vi.fn()
vi.mock("@/storage/db", () => ({
  getStorageStats: () => mockGetStorageStats(),
}))

describe("DataStats 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      mockGetStorageStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )

      render(<DataStats />)

      const skeleton = document.querySelector(".animate-pulse")
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("当没有统计数据时应该显示提示", async () => {
      mockGetStorageStats.mockResolvedValue(null)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })
    })
  })

  describe("有数据状态", () => {
    const mockStats: StorageStats = {
      pageCount: 637,
      pendingCount: 5,
      confirmedCount: 632,
      recommendationCount: 12,
      avgDwellTime: 125.5,
      totalSizeMB: 2.45,
      topDomains: [
        { domain: "github.com", count: 120 },
        { domain: "stackoverflow.com", count: 85 },
        { domain: "medium.com", count: 60 },
      ],
    }

    it("应该显示数据概览", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("数据概览")).toBeInTheDocument()
      })

      // 检查总页面数
      expect(screen.getByText("总页面数")).toBeInTheDocument()
      expect(screen.getByText("637")).toBeInTheDocument()

      // 检查正式记录（出现在两个地方，使用 getAllByText）
      const confirmedLabels = screen.getAllByText("正式记录")
      expect(confirmedLabels.length).toBe(2) // 数据概览 + 存储占用
      expect(screen.getByText("632")).toBeInTheDocument()

      // 检查推荐数
      expect(screen.getByText("推荐数")).toBeInTheDocument()
      expect(screen.getByText("12")).toBeInTheDocument()
    })

    it("应该正确格式化平均停留时间", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        // 125.5秒 = 2分5秒
        expect(screen.getByText("2分6秒")).toBeInTheDocument()
      })
    })

    it("当停留时间小于 60 秒时应该只显示秒", async () => {
      const statsWithShortTime: StorageStats = {
        ...mockStats,
        avgDwellTime: 45,
      }

      mockGetStorageStats.mockResolvedValue(statsWithShortTime)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("45秒")).toBeInTheDocument()
      })
    })

    it("应该显示存储占用信息", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("存储占用")).toBeInTheDocument()
        expect(screen.getByText("2.45 MB")).toBeInTheDocument()
      })

      // 检查各类记录数
      expect(screen.getAllByText("5 条")).toHaveLength(1) // 临时记录
      expect(screen.getAllByText("632 条")).toHaveLength(1) // 正式记录
      expect(screen.getAllByText("12 条")).toHaveLength(1) // 推荐记录
    })

    it("应该显示 Top 域名列表", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("常访问域名")).toBeInTheDocument()
      })

      // 检查域名
      expect(screen.getByText("github.com")).toBeInTheDocument()
      expect(screen.getByText("stackoverflow.com")).toBeInTheDocument()
      expect(screen.getByText("medium.com")).toBeInTheDocument()

      // 检查访问次数
      expect(screen.getByText("120 次访问")).toBeInTheDocument()
      expect(screen.getByText("85 次访问")).toBeInTheDocument()
      expect(screen.getByText("60 次访问")).toBeInTheDocument()
    })

    it("应该为 Top 域名显示排名", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("#1")).toBeInTheDocument()
        expect(screen.getByText("#2")).toBeInTheDocument()
        expect(screen.getByText("#3")).toBeInTheDocument()
      })
    })

    it("应该为 Top 域名渲染进度条", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        const progressBars = document.querySelectorAll(".bg-gradient-to-r")
        expect(progressBars.length).toBe(3)
      })
    })

    it("当没有域名数据时应该显示提示", async () => {
      const statsWithoutDomains: StorageStats = {
        ...mockStats,
        topDomains: [],
      }

      mockGetStorageStats.mockResolvedValue(statsWithoutDomains)

      render(<DataStats />)

      await waitFor(() => {
        const noDomains = screen.getAllByText("暂无数据")
        // 应该在域名部分显示
        expect(noDomains.length).toBeGreaterThan(0)
      })
    })

    it("应该显示数据管理按钮", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("数据管理")).toBeInTheDocument()
      })

      // 检查三个按钮（都是禁用状态）
      expect(
        screen.getByText(/清空访问历史/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/重置用户画像/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/清空所有数据/)
      ).toBeInTheDocument()

      // 检查"即将推出"标签
      const comingSoonButtons = screen.getAllByText(/即将推出/)
      expect(comingSoonButtons.length).toBe(3)
    })

    it("数据管理按钮应该是禁用状态", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        const buttons = document.querySelectorAll("button[disabled]")
        expect(buttons.length).toBe(3)
      })
    })

    it("应该显示数据管理提示", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        expect(
          screen.getByText("数据管理功能将在 Phase 3 实现")
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

      render(<DataStats />)

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

      render(<DataStats />)

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

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("10000")).toBeInTheDocument()
        expect(screen.getByText("9950")).toBeInTheDocument()
        expect(screen.getByText("500")).toBeInTheDocument()
        expect(screen.getByText("60分0秒")).toBeInTheDocument()
        expect(screen.getByText("125.67 MB")).toBeInTheDocument()
      })
    })

    it("应该正确处理小数存储大小", async () => {
      const stats: StorageStats = {
        pageCount: 5,
        pendingCount: 0,
        confirmedCount: 5,
        recommendationCount: 0,
        avgDwellTime: 30,
        totalSizeMB: 0.001, // 非常小的值
        topDomains: [],
      }

      mockGetStorageStats.mockResolvedValue(stats)

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("0.00 MB")).toBeInTheDocument()
      })
    })
  })

  describe("错误处理", () => {
    it("当加载失败时应该显示无数据状态", async () => {
      mockGetStorageStats.mockRejectedValue(new Error("Database error"))

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      render(<DataStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[DataStats] 加载统计失败:",
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe("UI 样式", () => {
    const mockStats: StorageStats = {
      pageCount: 100,
      pendingCount: 5,
      confirmedCount: 95,
      recommendationCount: 10,
      avgDwellTime: 60,
      totalSizeMB: 1.5,
      topDomains: [{ domain: "test.com", count: 50 }],
    }

    it("应该使用不同颜色区分数据类型", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      render(<DataStats />)

      await waitFor(() => {
        // 正式记录 - 绿色
        const confirmedElement = screen
          .getByText("95")
          .closest(".text-green-600")
        expect(confirmedElement).toBeInTheDocument()

        // 推荐数 - 蓝色
        const recsElement = screen
          .getByText("10")
          .closest(".text-blue-600")
        expect(recsElement).toBeInTheDocument()

        // 平均停留 - 紫色
        const avgElement = screen
          .getByText("1分0秒")
          .closest(".text-purple-600")
        expect(avgElement).toBeInTheDocument()
      })
    })

    it("应该有响应式网格布局", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<DataStats />)

      await waitFor(() => {
        const gridElement = container.querySelector(
          ".grid-cols-1.md\\:grid-cols-4"
        )
        expect(gridElement).toBeInTheDocument()
      })
    })

    it("域名进度条应该使用渐变色", async () => {
      mockGetStorageStats.mockResolvedValue(mockStats)

      const { container } = render(<DataStats />)

      await waitFor(() => {
        const gradientBar = container.querySelector(
          ".bg-gradient-to-r.from-purple-500.to-pink-500"
        )
        expect(gradientBar).toBeInTheDocument()
      })
    })
  })
})
