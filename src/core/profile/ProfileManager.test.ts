/**
 * ProfileManager 测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Topic } from "./topics"
import type { UserProfile } from "./types"
import type { ConfirmedVisit } from "@/storage/types"

// Mock dependencies
vi.mock("@/storage/db")
vi.mock("@/core/profile/ProfileBuilder")
vi.mock("@/core/profile/InterestSnapshotManager")

describe("ProfileManager", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  describe("rebuildProfile", () => {
    it("应该从访问记录重建用户画像", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")
      const { profileBuilder } = await import("@/core/profile/ProfileBuilder")
      const { InterestSnapshotManager } = await import("@/core/profile/InterestSnapshotManager")

      const manager = new ProfileManager()

      // Mock 访问记录
      const mockVisits: ConfirmedVisit[] = [
        {
          id: "visit1",
          url: "https://example.com/1",
          title: "Test Page 1",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: ["test", "react"],
            topics: [Topic.TECHNOLOGY],
            language: "en",
          },
          duration: 120,
          interactionCount: 5,
          visitTime: Date.now(),
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
      ]

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits),
      } as any)

      const mockProfile: UserProfile = {
        id: "singleton",
        totalPages: 1,
        topics: {
          [Topic.TECHNOLOGY]: 0.8,
          [Topic.DESIGN]: 0.2,
          [Topic.SCIENCE]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [{ word: "react", weight: 0.9 }],
        domains: [{ domain: "example.com", count: 1, avgDwellTime: 120 }],
        lastUpdated: Date.now(),
        version: 1,
      }

      vi.mocked(profileBuilder.buildFromVisits).mockResolvedValue(mockProfile)

      const result = await manager.rebuildProfile()

      expect(db.confirmedVisits.orderBy).toHaveBeenCalledWith("visitTime")
      expect(profileBuilder.buildFromVisits).toHaveBeenCalledWith(mockVisits)
      expect(db.userProfile.put).toHaveBeenCalledWith(mockProfile)
      expect(InterestSnapshotManager.handleProfileUpdate).toHaveBeenCalledWith(mockProfile, "rebuild")
      expect(result).toEqual(mockProfile)
    })

    it("应该在没有访问记录时创建空画像", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")
      const { profileBuilder } = await import("@/core/profile/ProfileBuilder")

      const manager = new ProfileManager()

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      } as any)

      vi.mocked(profileBuilder.buildFromVisits).mockResolvedValue({
        id: "singleton",
        totalPages: 0,
        topics: {},
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      } as any)

      const result = await manager.rebuildProfile()

      expect(profileBuilder.buildFromVisits).toHaveBeenCalledWith([])
      expect(result.totalPages).toBe(0)
    })
  })

  describe("getProfileStats", () => {
    it("应该返回画像统计信息", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      const mockProfile: UserProfile = {
        id: "singleton",
        totalPages: 200,
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
        keywords: [
          { word: "react", weight: 0.9 },
          { word: "vue", weight: 0.8 },
        ],
        domains: [
          { domain: "github.com", count: 100, avgDwellTime: 120 },
        ],
        lastUpdated: 1234567890,
        version: 1,
      }

      vi.mocked(db.userProfile.get).mockResolvedValue(mockProfile)

      const stats = await manager.getProfileStats()

      expect(stats.hasProfile).toBe(true)
      expect(stats.totalPages).toBe(200)
      expect(stats.keywordCount).toBe(2)
      expect(stats.domainCount).toBe(1)
      expect(stats.lastUpdated).toBe(1234567890)
      expect(stats.topTopics).toHaveLength(3)
    })

    it("应该在没有画像时返回空统计", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      vi.mocked(db.userProfile.get).mockResolvedValue(null)

      const stats = await manager.getProfileStats()

      expect(stats.hasProfile).toBe(false)
      expect(stats.totalPages).toBe(0)
    })
  })

  describe("clearProfile", () => {
    it("应该清除用户画像", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      await manager.clearProfile()

      expect(db.userProfile.delete).toHaveBeenCalledWith("singleton")
    })

    it("应该在清除失败时抛出错误", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      vi.mocked(db.userProfile.delete).mockRejectedValue(new Error("Database error"))

      await expect(manager.clearProfile()).rejects.toThrow("Database error")
    })
  })

  describe("updateProfile", () => {
    it("应该在没有现有画像时重建画像", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")
      const { profileBuilder } = await import("@/core/profile/ProfileBuilder")
      const { InterestSnapshotManager } = await import("@/core/profile/InterestSnapshotManager")

      const manager = new ProfileManager()

      // Mock 没有现有画像
      vi.mocked(db.userProfile.get).mockResolvedValue(null)

      const mockVisits: ConfirmedVisit[] = [
        {
          id: "visit1",
          url: "https://example.com/1",
          title: "Test Page 1",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: ["test", "react"],
            topics: [Topic.TECHNOLOGY],
            language: "en",
          },
          duration: 120,
          interactionCount: 5,
          visitTime: Date.now(),
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
      ]

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits),
      } as any)

      const mockProfile: UserProfile = {
        id: "singleton",
        totalPages: 1,
        topics: {
          [Topic.TECHNOLOGY]: 0.8,
          [Topic.DESIGN]: 0.2,
          [Topic.SCIENCE]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [{ word: "react", weight: 0.9 }],
        domains: [{ domain: "example.com", count: 1, avgDwellTime: 120 }],
        lastUpdated: Date.now(),
        version: 1,
      }

      vi.mocked(profileBuilder.buildFromVisits).mockResolvedValue(mockProfile)

      await manager.updateProfile(mockVisits)

      // 应该调用 rebuildProfile 逻辑
      expect(db.userProfile.get).toHaveBeenCalledWith("singleton")
      expect(db.confirmedVisits.orderBy).toHaveBeenCalledWith("visitTime")
      expect(profileBuilder.buildFromVisits).toHaveBeenCalled()
      expect(InterestSnapshotManager.handleProfileUpdate).toHaveBeenCalledWith(
        mockProfile,
        "rebuild"
      )
    })

    it("应该在有现有画像时增量更新", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")
      const { profileBuilder } = await import("@/core/profile/ProfileBuilder")
      const { InterestSnapshotManager } = await import("@/core/profile/InterestSnapshotManager")

      const manager = new ProfileManager()

      const existingProfile: UserProfile = {
        id: "singleton",
        totalPages: 50,
        topics: {
          [Topic.TECHNOLOGY]: 0.6,
          [Topic.DESIGN]: 0.4,
          [Topic.SCIENCE]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [{ word: "javascript", weight: 0.8 }],
        domains: [{ domain: "github.com", count: 50, avgDwellTime: 150 }],
        lastUpdated: Date.now() - 1000,
        version: 1,
      }

      vi.mocked(db.userProfile.get).mockResolvedValue(existingProfile)

      const allVisits: ConfirmedVisit[] = [
        {
          id: "visit1",
          url: "https://example.com/1",
          title: "Test Page 1",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: ["test", "react"],
            topics: [Topic.TECHNOLOGY],
            language: "en",
          },
          duration: 120,
          interactionCount: 5,
          visitTime: Date.now(),
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
        {
          id: "visit2",
          url: "https://github.com/test",
          title: "GitHub Repo",
          domain: "github.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: ["javascript", "code"],
            topics: [Topic.TECHNOLOGY],
            language: "en",
          },
          duration: 180,
          interactionCount: 10,
          visitTime: Date.now() - 1000,
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
      ]

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(allVisits),
      } as any)

      const updatedProfile: UserProfile = {
        ...existingProfile,
        totalPages: 52,
        lastUpdated: Date.now(),
      }

      vi.mocked(profileBuilder.buildFromVisits).mockResolvedValue(updatedProfile)

      const newVisits = [allVisits[0]]
      const result = await manager.updateProfile(newVisits)

      expect(db.userProfile.get).toHaveBeenCalledWith("singleton")
      expect(db.confirmedVisits.orderBy).toHaveBeenCalledWith("visitTime")
      expect(profileBuilder.buildFromVisits).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "visit1" }),
          expect.objectContaining({ id: "visit2" }),
        ])
      )
      expect(db.userProfile.put).toHaveBeenCalledWith(updatedProfile)
      expect(InterestSnapshotManager.handleProfileUpdate).toHaveBeenCalledWith(
        updatedProfile,
        "manual"
      )
      expect(result).toEqual(updatedProfile)
    })

    it("应该过滤掉没有分析数据的访问记录", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")
      const { profileBuilder } = await import("@/core/profile/ProfileBuilder")

      const manager = new ProfileManager()

      const existingProfile: UserProfile = {
        id: "singleton",
        totalPages: 10,
        topics: {} as any,
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      vi.mocked(db.userProfile.get).mockResolvedValue(existingProfile)

      const allVisits: ConfirmedVisit[] = [
        {
          id: "visit1",
          url: "https://example.com/1",
          title: "Valid Visit",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: ["test"],
            topics: [Topic.TECHNOLOGY],
            language: "en",
          },
          duration: 120,
          interactionCount: 5,
          visitTime: Date.now(),
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
        {
          id: "visit2",
          url: "https://example.com/2",
          title: "No Keywords",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: null as any, // 模拟无效的 keywords
            topics: [],
            language: "en",
          },
          duration: 60,
          interactionCount: 2,
          visitTime: Date.now() - 1000,
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
        {
          id: "visit3",
          url: "https://example.com/3",
          title: "Empty Keywords",
          domain: "example.com",
          meta: null,
          contentSummary: null,
          analysis: {
            keywords: [],
            topics: [],
            language: "en",
          },
          duration: 90,
          interactionCount: 3,
          visitTime: Date.now() - 2000,
          status: "qualified",
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1,
        },
      ]

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(allVisits),
      } as any)

      vi.mocked(profileBuilder.buildFromVisits).mockResolvedValue(existingProfile)

      await manager.updateProfile([allVisits[0]])

      // 应该只传递有有效分析数据的记录
      expect(profileBuilder.buildFromVisits).toHaveBeenCalledWith([
        expect.objectContaining({ id: "visit1" }),
      ])
    })

    it("应该在更新失败时抛出错误", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      vi.mocked(db.userProfile.get).mockRejectedValue(new Error("Database error"))

      await expect(manager.updateProfile([])).rejects.toThrow("Database error")
    })
  })

  describe("错误处理", () => {
    it("rebuildProfile 应该在数据库错误时抛出异常", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockRejectedValue(new Error("Database error")),
      } as any)

      await expect(manager.rebuildProfile()).rejects.toThrow("Database error")
    })

    it("getProfileStats 应该在错误时返回空统计", async () => {
      const { ProfileManager } = await import("./ProfileManager")
      const { db } = await import("@/storage/db")

      const manager = new ProfileManager()

      vi.mocked(db.userProfile.get).mockRejectedValue(new Error("Database error"))

      const stats = await manager.getProfileStats()

      expect(stats.hasProfile).toBe(false)
      expect(stats.totalPages).toBe(0)
      expect(stats.keywordCount).toBe(0)
      expect(stats.domainCount).toBe(0)
      expect(stats.topTopics).toEqual([])
    })
  })
})
