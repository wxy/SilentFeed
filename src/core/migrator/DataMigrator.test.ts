/**
 * DataMigrator 测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataMigrator } from "./DataMigrator"

// Mock dependencies
vi.mock("@/storage/db", () => ({
  db: {
    confirmedVisits: {
      orderBy: vi.fn().mockReturnValue({
        toArray: vi.fn()
      }),
      update: vi.fn(),
      toArray: vi.fn()
    }
  }
}))

vi.mock("@/core/analyzer", () => ({
  textAnalyzer: {
    extractKeywords: vi.fn(),
    detectLanguage: vi.fn()
  }
}))

vi.mock("@/core/profile/TopicClassifier", () => ({
  topicClassifier: {
    classify: vi.fn()
  }
}))

vi.mock("@/core/profile/ProfileManager", () => ({
  profileManager: {
    rebuildProfile: vi.fn()
  }
}))

describe("DataMigrator", () => {
  let migrator: DataMigrator

  beforeEach(() => {
    migrator = new DataMigrator()
    vi.clearAllMocks()
  })

  describe("getMigrationStats", () => {
    it("应该计算正确的迁移统计", async () => {
      const mockVisits = [
        { analysis: { keywords: ['test'] } },
        { analysis: { keywords: [] } },
        { analysis: null },
        { analysis: { keywords: ['valid'] } }
      ]

      const { db } = await import("@/storage/db")
      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)

      const stats = await migrator.getMigrationStats()

      expect(stats.totalVisits).toBe(4)
      expect(stats.visitesWithAnalysis).toBe(2)
      expect(stats.visitesWithoutAnalysis).toBe(2)
      expect(stats.analysisCompleteness).toBe(50)
    })
  })

  describe("rebuildUserProfile", () => {
    it("应该调用 ProfileManager 重建画像", async () => {
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      await migrator.rebuildUserProfile()

      expect(profileManager.rebuildProfile).toHaveBeenCalled()
    })
  })
})