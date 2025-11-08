/**
 * DataMigrator 测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataMigrator } from "./DataMigrator"
import { Topic } from "@/core/profile/topics"

// Mock dependencies
vi.mock("@/storage/db", () => ({
  db: {
    confirmedVisits: {
      orderBy: vi.fn().mockReturnValue({
        toArray: vi.fn()
      }),
      update: vi.fn(),
      toArray: vi.fn(),
      bulkDelete: vi.fn()
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
        { analysis: { keywords: ['test'], language: 'en', topics: [] } },        // 有效分析
        { analysis: { keywords: [], language: 'en', topics: [] } },              // 无效：keywords 为空
        { analysis: null },                                                       // 无效：analysis 为 null
        { analysis: { keywords: ['valid'], language: 'zh', topics: [] } }        // 有效分析
      ]

      const { db } = await import("@/storage/db")
      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)

      const stats = await migrator.getMigrationStats()

      expect(stats.totalVisits).toBe(4)
      expect(stats.visitesWithAnalysis).toBe(2)
      expect(stats.visitesWithoutAnalysis).toBe(2)
      expect(stats.analysisCompleteness).toBe(50)
    })

    it("应该处理空数据", async () => {
      const { db } = await import("@/storage/db")
      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue([])

      const stats = await migrator.getMigrationStats()

      expect(stats.totalVisits).toBe(0)
      expect(stats.visitesWithAnalysis).toBe(0)
      expect(stats.visitesWithoutAnalysis).toBe(0)
      expect(stats.analysisCompleteness).toBe(0)
    })

    it("应该识别各种无效的分析数据", async () => {
      const mockVisits = [
        { analysis: { keywords: ['valid'], language: 'en', topics: [] } },    // 有效
        { analysis: { keywords: null, language: 'en', topics: [] } },         // 无效：keywords 为 null
        { analysis: { keywords: 'not-array', language: 'en', topics: [] } },  // 无效：keywords 不是数组
        { analysis: { keywords: ['valid'], language: null, topics: [] } },    // 无效：缺少 language
        { analysis: { keywords: ['valid'], language: '', topics: [] } }       // 无效：language 为空
      ]

      const { db } = await import("@/storage/db")
      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)

      const stats = await migrator.getMigrationStats()

      expect(stats.totalVisits).toBe(5)
      expect(stats.visitesWithAnalysis).toBe(1)  // 只有第一个有效
      expect(stats.visitesWithoutAnalysis).toBe(4)
    })
  })

  describe("rebuildUserProfile", () => {
    it("应该调用 ProfileManager 重建画像", async () => {
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      await migrator.rebuildUserProfile()

      expect(profileManager.rebuildProfile).toHaveBeenCalled()
    })

    it("应该在重建失败时抛出错误", async () => {
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(profileManager.rebuildProfile).mockRejectedValue(new Error("Rebuild failed"))

      await expect(migrator.rebuildUserProfile()).rejects.toThrow("Rebuild failed")
    })
  })

  describe("analyzeHistoricalPages", () => {
    it("应该返回正确的统计信息当没有需要分析的记录时", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "Valid Visit",
          analysis: { keywords: ['test'], language: 'en', topics: [] }
        }
      ]

      const { db } = await import("@/storage/db")
      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      const result = await migrator.analyzeHistoricalPages()

      expect(result.total).toBe(1)
      expect(result.analyzed).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.updated).toBe(0)
    })

    it("应该分析没有分析数据的记录", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "需要分析的页面",
          url: "https://example.com",
          analysis: null,
          contentSummary: {
            extractedText: "这是一段测试文本",
            firstParagraph: "测试段落"
          }
        }
      ]

      const { db } = await import("@/storage/db")
      const { textAnalyzer } = await import("@/core/analyzer")
      const { topicClassifier } = await import("@/core/profile/TopicClassifier")

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      vi.mocked(textAnalyzer.extractKeywords).mockReturnValue([
        { word: "测试", weight: 0.9 },
        { word: "文本", weight: 0.8 }
      ])
      vi.mocked(textAnalyzer.detectLanguage).mockReturnValue("zh")
      vi.mocked(topicClassifier.classify).mockReturnValue({
        [Topic.TECHNOLOGY]: 0.5,
        [Topic.DESIGN]: 0.3,
        [Topic.SCIENCE]: 0.0,
        [Topic.BUSINESS]: 0.0,
        [Topic.ARTS]: 0.0,
        [Topic.HEALTH]: 0.0,
        [Topic.SPORTS]: 0.0,
        [Topic.ENTERTAINMENT]: 0.0,
        [Topic.NEWS]: 0.0,
        [Topic.EDUCATION]: 0.0,
        [Topic.OTHER]: 0.0
      })

      const result = await migrator.analyzeHistoricalPages()

      expect(result.total).toBe(1)
      expect(result.analyzed).toBe(1)
      expect(result.updated).toBe(1)
      expect(db.confirmedVisits.update).toHaveBeenCalledWith("visit1", {
        analysis: {
          keywords: ["测试", "文本"],
          topics: [Topic.TECHNOLOGY, Topic.DESIGN],
          language: "zh"
        }
      })
    })

    it("应该处理只有标题的记录", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "JavaScript 教程",
          url: "https://example.com",
          analysis: { keywords: [], language: 'en', topics: [] },
          contentSummary: null
        }
      ]

      const { db } = await import("@/storage/db")
      const { textAnalyzer } = await import("@/core/analyzer")
      const { topicClassifier } = await import("@/core/profile/TopicClassifier")

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      vi.mocked(textAnalyzer.extractKeywords).mockReturnValue([
        { word: "JavaScript", weight: 0.9 }
      ])
      vi.mocked(textAnalyzer.detectLanguage).mockReturnValue("zh")
      vi.mocked(topicClassifier.classify).mockReturnValue({
        [Topic.TECHNOLOGY]: 0.8,
        [Topic.SCIENCE]: 0.0,
        [Topic.BUSINESS]: 0.0,
        [Topic.DESIGN]: 0.0,
        [Topic.ARTS]: 0.0,
        [Topic.HEALTH]: 0.0,
        [Topic.SPORTS]: 0.0,
        [Topic.ENTERTAINMENT]: 0.0,
        [Topic.NEWS]: 0.0,
        [Topic.EDUCATION]: 0.0,
        [Topic.OTHER]: 0.0
      })

      const result = await migrator.analyzeHistoricalPages()

      expect(result.analyzed).toBe(1)
      expect(textAnalyzer.extractKeywords).toHaveBeenCalledWith(
        "JavaScript 教程",
        { topK: 20 }
      )
    })

    it("应该跳过空内容的记录", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "",
          url: "https://example.com",
          analysis: null,
          contentSummary: null
        }
      ]

      const { db } = await import("@/storage/db")

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      const result = await migrator.analyzeHistoricalPages()

      expect(result.analyzed).toBe(1)
      expect(result.updated).toBe(0)
      // 应该设置空分析结果
      expect(db.confirmedVisits.update).toHaveBeenCalledWith("visit1", {
        analysis: {
          keywords: [],
          topics: [],
          language: 'other'
        }
      })
    })

    it("应该处理分析失败的情况", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "测试页面",
          url: "https://example.com",
          analysis: null,
          contentSummary: { extractedText: "测试", firstParagraph: "测试" }
        }
      ]

      const { db } = await import("@/storage/db")
      const { textAnalyzer } = await import("@/core/analyzer")

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      vi.mocked(textAnalyzer.extractKeywords).mockImplementation(() => {
        throw new Error("Analysis failed")
      })

      const result = await migrator.analyzeHistoricalPages()

      // 分析失败后会设置空分析结果，所以 analyzed = 1
      expect(result.analyzed).toBe(1)
      expect(result.failed).toBe(0)  // 没有真正失败，只是设置了空结果
      expect(result.updated).toBe(0) // 设置了空结果但没有实际更新
    })

    it("应该过滤低相关性的主题", async () => {
      const mockVisits = [
        {
          id: "visit1",
          title: "技术文章",
          url: "https://example.com",
          analysis: { keywords: null, language: 'en', topics: [] },
          contentSummary: { extractedText: "内容", firstParagraph: "段落" }
        }
      ]

      const { db } = await import("@/storage/db")
      const { textAnalyzer } = await import("@/core/analyzer")
      const { topicClassifier } = await import("@/core/profile/TopicClassifier")

      vi.mocked(db.confirmedVisits.orderBy).mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockVisits)
      } as any)

      vi.mocked(textAnalyzer.extractKeywords).mockReturnValue([
        { word: "技术", weight: 0.9 }
      ])
      vi.mocked(textAnalyzer.detectLanguage).mockReturnValue("zh")
      vi.mocked(topicClassifier.classify).mockReturnValue({
        [Topic.TECHNOLOGY]: 0.5,  // 保留
        [Topic.DESIGN]: 0.05,     // 过滤掉 (< 0.1)
        [Topic.SCIENCE]: 0.0,
        [Topic.BUSINESS]: 0.0,
        [Topic.ARTS]: 0.0,
        [Topic.HEALTH]: 0.0,
        [Topic.SPORTS]: 0.0,
        [Topic.ENTERTAINMENT]: 0.0,
        [Topic.NEWS]: 0.0,
        [Topic.EDUCATION]: 0.0,
        [Topic.OTHER]: 0.02       // 过滤掉 (< 0.1)
      })

      const result = await migrator.analyzeHistoricalPages()

      expect(db.confirmedVisits.update).toHaveBeenCalledWith("visit1", {
        analysis: expect.objectContaining({
          topics: [Topic.TECHNOLOGY]  // 只包含高相关性的主题
        })
      })
    })
  })

  describe("cleanInvalidRecords", () => {
    it("应该删除无效记录并重建画像", async () => {
      const mockVisits = [
        {
          id: "valid1",
          title: "Valid",
          url: "https://valid.com",
          analysis: { keywords: ['test'], language: 'en', topics: [] }
        },
        {
          id: "invalid1",
          title: "Invalid - Empty Keywords",
          url: "https://invalid1.com",
          analysis: { keywords: [], language: 'en', topics: [] }
        },
        {
          id: "invalid2",
          title: "Invalid - Null Keywords",
          url: "https://invalid2.com",
          analysis: { keywords: null, language: 'en', topics: [] }
        }
      ]

      const { db } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")

      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)
      vi.mocked(profileManager.rebuildProfile).mockResolvedValue({} as any)  // 确保 mock 成功

      const result = await migrator.cleanInvalidRecords()

      expect(result.total).toBe(3)
      expect(result.cleaned).toBe(2)
      expect(result.remaining).toBe(1)
      expect(db.confirmedVisits.bulkDelete).toHaveBeenCalledWith(["invalid1", "invalid2"])
      expect(profileManager.rebuildProfile).toHaveBeenCalled()
    })

    it("当没有无效记录时不应该删除任何数据", async () => {
      const mockVisits = [
        {
          id: "valid1",
          title: "Valid",
          url: "https://valid.com",
          analysis: { keywords: ['test'], language: 'en', topics: [] }
        }
      ]

      const { db } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")

      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)

      const result = await migrator.cleanInvalidRecords()

      expect(result.total).toBe(1)
      expect(result.cleaned).toBe(0)
      expect(result.remaining).toBe(1)
      expect(db.confirmedVisits.bulkDelete).not.toHaveBeenCalled()
      expect(profileManager.rebuildProfile).not.toHaveBeenCalled()
    })

    it("应该识别非数组的 keywords", async () => {
      const mockVisits = [
        {
          id: "invalid",
          title: "Invalid",
          url: "https://invalid.com",
          analysis: { keywords: 'not-array', language: 'en', topics: [] }
        }
      ]

      const { db } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")

      vi.mocked(db.confirmedVisits.toArray).mockResolvedValue(mockVisits as any)
      vi.mocked(profileManager.rebuildProfile).mockResolvedValue({} as any)  // 确保 mock 成功

      const result = await migrator.cleanInvalidRecords()

      expect(result.cleaned).toBe(1)
      expect(db.confirmedVisits.bulkDelete).toHaveBeenCalledWith(["invalid"])
    })

    it("应该在清理失败时抛出错误", async () => {
      const { db } = await import("@/storage/db")

      vi.mocked(db.confirmedVisits.toArray).mockRejectedValue(new Error("Database error"))

      await expect(migrator.cleanInvalidRecords()).rejects.toThrow("Database error")
    })
  })
})