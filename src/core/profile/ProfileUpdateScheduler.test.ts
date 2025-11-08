/**
 * ProfileUpdateScheduler 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ProfileUpdateScheduler } from "./ProfileUpdateScheduler"

// Mock dependencies
vi.mock("@/core/profile/ProfileManager")
vi.mock("@/storage/db")

describe("ProfileUpdateScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // 重置调度器状态（访问私有属性用于测试）
    ;(ProfileUpdateScheduler as any).schedule = {
      lastUpdateTime: 0,
      lastUpdatePageCount: 0,
      pendingUpdateCount: 0,
      isUpdating: false,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("shouldUpdateProfile", () => {
    it("应该在首次且有10+页面时建议更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      vi.mocked(getPageCount).mockResolvedValue(15)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      expect(result.shouldUpdate).toBe(true)
      expect(result.reason).toBe("首次构建画像")
      expect(result.priority).toBe("high")
    })

    it("应该在首次但页面不足10时仍可能建议更新（如果新增页面≥5）", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      // 首次场景：lastUpdateTime = 0, lastUpdatePageCount = 0
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = 0
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 0
      
      vi.mocked(getPageCount).mockResolvedValue(5)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      // 虽然不足10页不触发首次构建，但新增5页会触发策略2
      expect(result.shouldUpdate).toBe(true)
      expect(result.reason).toBe("新增5页面")
      expect(result.priority).toBe("medium")
    })

    it("应该在新增5+页面时建议更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      // 设置上次更新时的页面数
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = Date.now()
      
      // 当前有105页面（新增5页）
      vi.mocked(getPageCount).mockResolvedValue(105)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      expect(result.shouldUpdate).toBe(true)
      expect(result.reason).toContain("新增5页面")
      expect(result.priority).toBe("medium")
    })

    it("应该在6小时后且有新内容时建议更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      const sixHoursAgo = Date.now() - 7 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = sixHoursAgo
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      
      vi.mocked(getPageCount).mockResolvedValue(102)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      expect(result.shouldUpdate).toBe(true)
      expect(result.reason).toBe("定期更新")
      expect(result.priority).toBe("low")
    })

    it("应该在24小时后强制更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      const oneDayAgo = Date.now() - 25 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = oneDayAgo
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      
      vi.mocked(getPageCount).mockResolvedValue(100)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      expect(result.shouldUpdate).toBe(true)
      expect(result.reason).toBe("强制定期更新")
      expect(result.priority).toBe("medium")
    })
  })

  describe("checkAndScheduleUpdate", () => {
    it("应该在正在更新时跳过调度", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      ;(ProfileUpdateScheduler as any).schedule.isUpdating = true
      vi.mocked(getPageCount).mockResolvedValue(100)

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      expect(profileManager.updateProfile).not.toHaveBeenCalled()
    })

    it("应该在不需要更新时跳过", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = Date.now()
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      vi.mocked(getPageCount).mockResolvedValue(102) // 只新增2页，不足5页

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      expect(profileManager.updateProfile).not.toHaveBeenCalled()
    })

    it("应该在高优先级时立即执行更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(getPageCount).mockResolvedValue(15)
      vi.mocked(profileManager.updateProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      expect(profileManager.updateProfile).toHaveBeenCalled()
    })

    it("应该在中优先级时延迟执行更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = Date.now()
      vi.mocked(getPageCount).mockResolvedValue(105)
      vi.mocked(profileManager.updateProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      // 应该不会立即执行
      expect(profileManager.updateProfile).not.toHaveBeenCalled()

      // 快进2秒
      await vi.advanceTimersByTimeAsync(2000)

      // 现在应该执行了
      expect(profileManager.updateProfile).toHaveBeenCalled()
    })
  })

  describe("executeUpdate", () => {
    it("应该执行画像更新并更新状态", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(getPageCount).mockResolvedValue(100)
      vi.mocked(profileManager.updateProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.executeUpdate("测试更新")

      expect(profileManager.updateProfile).toHaveBeenCalled()
      
      const status = ProfileUpdateScheduler.getScheduleStatus()
      expect(status.lastUpdatePageCount).toBe(100)
      expect(status.isUpdating).toBe(false)
    })

    it("应该在已经在更新时跳过", async () => {
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      ;(ProfileUpdateScheduler as any).schedule.isUpdating = true

      await ProfileUpdateScheduler.executeUpdate("测试更新")

      expect(profileManager.updateProfile).not.toHaveBeenCalled()
    })

    it("应该在更新失败后重置状态", async () => {
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(profileManager.updateProfile).mockRejectedValue(new Error("Update failed"))

      await ProfileUpdateScheduler.executeUpdate("测试更新")

      const status = ProfileUpdateScheduler.getScheduleStatus()
      expect(status.isUpdating).toBe(false)
    })
  })

  describe("forceUpdate", () => {
    it("应该强制执行画像更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(getPageCount).mockResolvedValue(100)
      vi.mocked(profileManager.updateProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.forceUpdate()

      expect(profileManager.updateProfile).toHaveBeenCalled()
    })
  })

  describe("isGoodTimeToUpdate", () => {
    it("应该在页面数较少时总是返回true", async () => {
      const { getAnalysisStats } = await import("@/storage/db")
      
      vi.mocked(getAnalysisStats).mockResolvedValue({
        analyzedPages: 50,
        totalKeywords: 500,
        avgKeywordsPerPage: 10,
        languageDistribution: [],
        topKeywords: [],
      })

      const result = await ProfileUpdateScheduler.isGoodTimeToUpdate()

      expect(result).toBe(true)
    })

    it("应该在页面数较多时降低概率", async () => {
      const { getAnalysisStats } = await import("@/storage/db")
      
      vi.mocked(getAnalysisStats).mockResolvedValue({
        analyzedPages: 1500,
        totalKeywords: 15000,
        avgKeywordsPerPage: 10,
        languageDistribution: [],
        topKeywords: [],
      })

      // 运行多次检查概率（应该大约30%返回true）
      const results = await Promise.all(
        Array.from({ length: 100 }, () => ProfileUpdateScheduler.isGoodTimeToUpdate())
      )
      
      const trueCount = results.filter(Boolean).length
      
      // 应该在10-50之间（30% ± 20%）
      expect(trueCount).toBeGreaterThan(10)
      expect(trueCount).toBeLessThan(50)
    })

    it("应该在发生错误时返回false", async () => {
      const { getAnalysisStats } = await import("@/storage/db")
      
      vi.mocked(getAnalysisStats).mockRejectedValue(new Error("DB error"))

      const result = await ProfileUpdateScheduler.isGoodTimeToUpdate()

      expect(result).toBe(false)
    })
  })

  describe("getScheduleStatus", () => {
    it("应该返回当前调度状态", () => {
      const now = Date.now()
      ;(ProfileUpdateScheduler as any).schedule = {
        lastUpdateTime: now,
        lastUpdatePageCount: 100,
        pendingUpdateCount: 0,
        isUpdating: false,
      }

      const status = ProfileUpdateScheduler.getScheduleStatus()

      expect(status.lastUpdateTime).toBe(now)
      expect(status.lastUpdatePageCount).toBe(100)
      expect(status.isUpdating).toBe(false)
      expect(status.nextUpdateETA).toBeDefined()
    })

    it("应该估算下次更新时间", () => {
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = sixHoursAgo

      const status = ProfileUpdateScheduler.getScheduleStatus()

      expect(status.nextUpdateETA).toBe("随时可能更新")
    })

    it("应该正确计算剩余时间", () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = twoHoursAgo

      const status = ProfileUpdateScheduler.getScheduleStatus()

      expect(status.nextUpdateETA).toContain("小时")
    })
  })
})
