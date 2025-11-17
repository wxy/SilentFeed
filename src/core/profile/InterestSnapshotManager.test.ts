/**
 * InterestSnapshotManager 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InterestSnapshotManager } from "./InterestSnapshotManager"
import { Topic } from "./topics"
import type { UserProfile } from "@/types/profile"
import type { InterestSnapshot } from "@/types/profile"

// Mock storage
const mockSaveInterestSnapshot = vi.fn()
const mockGetInterestHistory = vi.fn()

vi.mock("@/storage/db", () => ({
  saveInterestSnapshot: (snapshot: InterestSnapshot) => mockSaveInterestSnapshot(snapshot),
  getInterestHistory: (limit: number) => mockGetInterestHistory(limit),
}))

describe("InterestSnapshotManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("handleProfileUpdate", () => {
    it("应该在首次更新时创建快照", async () => {
      // 模拟首次更新（没有历史快照）
      mockGetInterestHistory.mockResolvedValue([])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 100,
        topics: {
          [Topic.TECHNOLOGY]: 0.6,
          [Topic.SCIENCE]: 0.2,
          [Topic.DESIGN]: 0.1,
          [Topic.OTHER]: 0.1,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
        },
        keywords: [
          { word: "react", weight: 0.9 },
          { word: "javascript", weight: 0.8 },
        ],
        domains: [{ domain: "github.com", count: 50, avgDwellTime: 120 }],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      // 验证创建了快照
      expect(mockSaveInterestSnapshot).toHaveBeenCalledTimes(1)
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.primaryTopic).toBe(Topic.TECHNOLOGY)
      expect(snapshot.primaryScore).toBe(0.6)
      expect(snapshot.basedOnPages).toBe(100)
      expect(snapshot.trigger).toBe("manual")
      expect(snapshot.changeNote).toContain("首次建立兴趣画像")
    })

    it("应该在主导兴趣变化时创建快照", async () => {
      // 模拟已有一个旧快照
      const oldSnapshot: InterestSnapshot = {
        id: "old_snapshot",
        timestamp: Date.now() - 10000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
        topics: { [Topic.TECHNOLOGY]: 0.6, [Topic.DESIGN]: 0.4 },
        topKeywords: [{ word: "react", weight: 0.9 }],
        basedOnPages: 100,
        trigger: "manual",
      }
      mockGetInterestHistory.mockResolvedValue([oldSnapshot])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 200,
        topics: {
          [Topic.DESIGN]: 0.7, // 主导兴趣变为设计
          [Topic.TECHNOLOGY]: 0.2,
          [Topic.SCIENCE]: 0.1,
          [Topic.OTHER]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
        },
        keywords: [{ word: "design", weight: 0.9 }],
        domains: [{ domain: "dribbble.com", count: 80, avgDwellTime: 150 }],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      // 验证创建了新快照
      expect(mockSaveInterestSnapshot).toHaveBeenCalledTimes(1)
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.primaryTopic).toBe(Topic.DESIGN)
      expect(snapshot.trigger).toBe("primary_change") // 应该自动识别为主导变化
      expect(snapshot.changeNote).toContain("主导兴趣变化")
      expect(snapshot.changeNote).toContain("技术")
      expect(snapshot.changeNote).toContain("设计")
    })

    it("应该在主导兴趣未变化时跳过快照", async () => {
      // 模拟已有快照，主导兴趣相同
      const oldSnapshot: InterestSnapshot = {
        id: "old_snapshot",
        timestamp: Date.now() - 10000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
        topics: { [Topic.TECHNOLOGY]: 0.6 },
        topKeywords: [{ word: "react", weight: 0.9 }],
        basedOnPages: 100,
        trigger: "manual",
      }
      mockGetInterestHistory.mockResolvedValue([oldSnapshot])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 150,
        topics: {
          [Topic.TECHNOLOGY]: 0.55, // 仍然是技术主导，只是分数略有变化
          [Topic.DESIGN]: 0.25,
          [Topic.SCIENCE]: 0.2,
          [Topic.OTHER]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
        },
        keywords: [{ word: "react", weight: 0.9 }],
        domains: [{ domain: "github.com", count: 75, avgDwellTime: 120 }],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      // 不应该创建新快照
      expect(mockSaveInterestSnapshot).not.toHaveBeenCalled()
    })

    it("应该在强制重建时创建快照", async () => {
      // 模拟已有快照，主导兴趣相同
      const oldSnapshot: InterestSnapshot = {
        id: "old_snapshot",
        timestamp: Date.now() - 10000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
        topics: { [Topic.TECHNOLOGY]: 0.6 },
        topKeywords: [],
        basedOnPages: 100,
        trigger: "manual",
      }
      mockGetInterestHistory.mockResolvedValue([oldSnapshot])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 150,
        topics: {
          [Topic.TECHNOLOGY]: 0.5,
          [Topic.DESIGN]: 0.3,
          [Topic.SCIENCE]: 0.2,
          [Topic.OTHER]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      // 使用 rebuild 触发器
      await InterestSnapshotManager.handleProfileUpdate(profile, "rebuild")

      // 应该创建快照
      expect(mockSaveInterestSnapshot).toHaveBeenCalledTimes(1)
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.trigger).toBe("rebuild")
      expect(snapshot.changeNote).toContain("用户主动重建画像")
    })

    it("应该在没有主导兴趣时跳过快照", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      // 所有兴趣分数很低且平均
      const profile: UserProfile = {
        id: "singleton",
        totalPages: 50,
        topics: {
          [Topic.TECHNOLOGY]: 0.15,
          [Topic.DESIGN]: 0.15,
          [Topic.SCIENCE]: 0.15,
          [Topic.BUSINESS]: 0.15,
          [Topic.ARTS]: 0.1,
          [Topic.HEALTH]: 0.1,
          [Topic.SPORTS]: 0.1,
          [Topic.ENTERTAINMENT]: 0.05,
          [Topic.NEWS]: 0.05,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      // 不应该创建快照
      expect(mockSaveInterestSnapshot).not.toHaveBeenCalled()
    })
  })

  describe("getChangeHistory", () => {
    it("应该返回兴趣变化历史", async () => {
      const snapshots: InterestSnapshot[] = [
        {
          id: "snapshot_3",
          timestamp: Date.now(),
          primaryTopic: Topic.SCIENCE,
          primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
          topics: { [Topic.SCIENCE]: 0.6 },
          topKeywords: [],
          basedOnPages: 300,
          trigger: "primary_change",
          changeNote: "主导兴趣变化：设计 → 科学",
        },
        {
          id: "snapshot_2",
          timestamp: Date.now() - 10000,
          primaryTopic: Topic.DESIGN,
          primaryScore: 0.7,
          primaryLevel: 'absolute' as const,
          topics: { [Topic.DESIGN]: 0.7 },
          topKeywords: [],
          basedOnPages: 200,
          trigger: "primary_change",
          changeNote: "主导兴趣变化：技术 → 设计",
        },
        {
          id: "snapshot_1",
          timestamp: Date.now() - 20000,
          primaryTopic: Topic.TECHNOLOGY,
          primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
          topics: { [Topic.TECHNOLOGY]: 0.6 },
          topKeywords: [],
          basedOnPages: 100,
          trigger: "manual",
          changeNote: "首次建立兴趣画像：技术",
        },
      ]

      mockGetInterestHistory.mockResolvedValue(snapshots)

      const history = await InterestSnapshotManager.getChangeHistory(5)

      expect(history.totalSnapshots).toBe(3)
      expect(history.changes.length).toBe(3)

      // 验证第一个变化（最新）
      expect(history.changes[0].to).toBe("科学")
      expect(history.changes[0].from).toBe("设计")
      expect(history.changes[0].basedOnPages).toBe(300)

      // 验证第二个变化
      expect(history.changes[1].to).toBe("设计")
      expect(history.changes[1].from).toBe("技术")
      expect(history.changes[1].basedOnPages).toBe(200)

      // 验证首次建立
      expect(history.changes[2].to).toBe("技术")
      expect(history.changes[2].from).toBe("无")
      expect(history.changes[2].basedOnPages).toBe(100)
    })

    it("应该限制返回数量", async () => {
      const snapshots: InterestSnapshot[] = Array.from({ length: 10 }, (_, i) => ({
        id: `snapshot_${i}`,
        timestamp: Date.now() - i * 1000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
        topics: { [Topic.TECHNOLOGY]: 0.6 },
        topKeywords: [],
        basedOnPages: 100 + i * 10,
        trigger: "primary_change" as const,
      }))

      mockGetInterestHistory.mockResolvedValue(snapshots)

      const history = await InterestSnapshotManager.getChangeHistory(3)

      expect(history.changes.length).toBeLessThanOrEqual(3)
      expect(history.totalSnapshots).toBe(10)
    })

    it("应该处理空历史", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      const history = await InterestSnapshotManager.getChangeHistory(5)

      expect(history.totalSnapshots).toBe(0)
      expect(history.changes).toEqual([])
    })

    it("应该处理数据库错误", async () => {
      mockGetInterestHistory.mockRejectedValue(new Error("Database error"))

      const history = await InterestSnapshotManager.getChangeHistory(5)

      expect(history.totalSnapshots).toBe(0)
      expect(history.changes).toEqual([])
    })
  })

  describe("cleanupOldSnapshots", () => {
    it("应该跳过清理少量快照", async () => {
      const snapshots: InterestSnapshot[] = Array.from({ length: 5 }, (_, i) => ({
        id: `snapshot_${i}`,
        timestamp: Date.now() - i * 1000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
        topics: { [Topic.TECHNOLOGY]: 0.6 },
        topKeywords: [],
        basedOnPages: 100,
        trigger: "manual" as const,
      }))

      mockGetInterestHistory.mockResolvedValue(snapshots)

      // 应该不抛出错误
      await expect(InterestSnapshotManager.cleanupOldSnapshots()).resolves.toBeUndefined()
    })

    it("应该识别需要清理的旧快照", async () => {
      const now = Date.now()
      const sevenMonthsAgo = now - 7 * 30 * 24 * 60 * 60 * 1000

      // 创建15个快照：5个最近，10个旧的
      const snapshots: InterestSnapshot[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `recent_${i}`,
          timestamp: now - i * 1000,
          primaryTopic: Topic.TECHNOLOGY,
          primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
          topics: { [Topic.TECHNOLOGY]: 0.6 },
          topKeywords: [],
          basedOnPages: 100,
          trigger: "manual" as const,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `old_${i}`,
          timestamp: sevenMonthsAgo - i * 1000,
          primaryTopic: Topic.TECHNOLOGY,
          primaryScore: 0.6,
          primaryLevel: 'absolute' as const,
          topics: { [Topic.TECHNOLOGY]: 0.6 },
          topKeywords: [],
          basedOnPages: 100,
          trigger: "manual" as const,
        })),
      ]

      mockGetInterestHistory.mockResolvedValue(snapshots)

      // 应该不抛出错误
      await expect(InterestSnapshotManager.cleanupOldSnapshots()).resolves.toBeUndefined()
    })

    it("应该处理数据库错误", async () => {
      mockGetInterestHistory.mockRejectedValue(new Error("Database error"))

      // 应该不抛出错误（内部捕获）
      await expect(InterestSnapshotManager.cleanupOldSnapshots()).resolves.toBeUndefined()
    })
  })

  describe("主导兴趣计算策略", () => {
    it("应该识别绝对主导（>33.3%）", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 100,
        topics: {
          [Topic.TECHNOLOGY]: 0.5, // 绝对主导
          [Topic.DESIGN]: 0.3,
          [Topic.SCIENCE]: 0.2,
          [Topic.OTHER]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      expect(mockSaveInterestSnapshot).toHaveBeenCalled()
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.primaryTopic).toBe(Topic.TECHNOLOGY)
    })

    it("应该识别相对主导（最高比第二高多50%，且>20%）", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 100,
        topics: {
          [Topic.TECHNOLOGY]: 0.3, // 30% > 20%，且 0.3/0.15 = 2 > 1.5
          [Topic.DESIGN]: 0.15,
          [Topic.SCIENCE]: 0.1,
          [Topic.BUSINESS]: 0.1,
          [Topic.ARTS]: 0.1,
          [Topic.HEALTH]: 0.1,
          [Topic.SPORTS]: 0.1,
          [Topic.ENTERTAINMENT]: 0.05,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      expect(mockSaveInterestSnapshot).toHaveBeenCalled()
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.primaryTopic).toBe(Topic.TECHNOLOGY)
    })

    it("应该识别显著领先（>25%，且比平均值高2倍）", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 100,
        topics: {
          [Topic.TECHNOLOGY]: 0.28, // 28% > 25%，且远高于其他
          [Topic.DESIGN]: 0.12,
          [Topic.SCIENCE]: 0.12,
          [Topic.BUSINESS]: 0.12,
          [Topic.ARTS]: 0.12,
          [Topic.HEALTH]: 0.12,
          [Topic.SPORTS]: 0.12,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      expect(mockSaveInterestSnapshot).toHaveBeenCalled()
      const snapshot = mockSaveInterestSnapshot.mock.calls[0][0]
      expect(snapshot.primaryTopic).toBe(Topic.TECHNOLOGY)
    })

    it("应该拒绝无明确主导的情况", async () => {
      mockGetInterestHistory.mockResolvedValue([])

      const profile: UserProfile = {
        id: "singleton",
        totalPages: 100,
        topics: {
          // 分布过于平均，没有明确主导
          [Topic.TECHNOLOGY]: 0.2,
          [Topic.DESIGN]: 0.18,
          [Topic.SCIENCE]: 0.16,
          [Topic.BUSINESS]: 0.14,
          [Topic.ARTS]: 0.12,
          [Topic.HEALTH]: 0.1,
          [Topic.SPORTS]: 0.05,
          [Topic.ENTERTAINMENT]: 0.05,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await InterestSnapshotManager.handleProfileUpdate(profile, "manual")

      // 不应该创建快照
      expect(mockSaveInterestSnapshot).not.toHaveBeenCalled()
    })
  })
})
