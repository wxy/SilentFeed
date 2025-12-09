/**
 * ProfileUpdateScheduler 测试
 * Phase 12.7: 简化版 - 仅测试首次画像生成和手动更新
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

    it("Phase 12.7: 应该在首次但页面不足10时不建议更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      // 首次场景：lastUpdateTime = 0, lastUpdatePageCount = 0
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = 0
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 0
      
      vi.mocked(getPageCount).mockResolvedValue(5)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      // Phase 12.7: 移除了策略2（新增5页），不足10页不触发
      expect(result.shouldUpdate).toBe(false)
      expect(result.reason).toBe("暂不需要更新")
    })

    it("Phase 12.7: 应该在非首次时不建议更新（由 SemanticProfileBuilder 控制）", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      // 设置上次更新时的页面数（非首次场景）
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = Date.now()
      
      // 当前有105页面（新增5页）
      vi.mocked(getPageCount).mockResolvedValue(105)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      // Phase 12.7: 移除了策略2，浏览行为由 SemanticProfileBuilder 控制
      expect(result.shouldUpdate).toBe(false)
      expect(result.reason).toBe("暂不需要更新")
    })

    it("Phase 12.7: 应该在6小时后不自动更新（移除定期更新策略）", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      const sixHoursAgo = Date.now() - 7 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = sixHoursAgo
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      
      vi.mocked(getPageCount).mockResolvedValue(102)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      // Phase 12.7: 移除了策略3，定期更新由 SemanticProfileBuilder 控制
      expect(result.shouldUpdate).toBe(false)
      expect(result.reason).toBe("暂不需要更新")
    })

    it("Phase 12.7: 应该在24小时后不强制更新（移除强制更新策略）", async () => {
      const { getPageCount } = await import("@/storage/db")
      
      const oneDayAgo = Date.now() - 25 * 60 * 60 * 1000
      ;(ProfileUpdateScheduler as any).schedule.lastUpdateTime = oneDayAgo
      ;(ProfileUpdateScheduler as any).schedule.lastUpdatePageCount = 100
      
      vi.mocked(getPageCount).mockResolvedValue(100)

      const result = await ProfileUpdateScheduler.shouldUpdateProfile()

      // Phase 12.7: 移除了策略4，强制更新由 SemanticProfileBuilder 控制
      expect(result.shouldUpdate).toBe(false)
      expect(result.reason).toBe("暂不需要更新")
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
      vi.mocked(getPageCount).mockResolvedValue(102) // Phase 12.7: 新增2页不触发

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      expect(profileManager.updateProfile).not.toHaveBeenCalled()
    })

    it("应该在首次构建时立即执行更新", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(getPageCount).mockResolvedValue(15)
      vi.mocked(profileManager.rebuildProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.checkAndScheduleUpdate()

      expect(profileManager.rebuildProfile).toHaveBeenCalled()
    })
  })

  describe("executeUpdate", () => {
    it("应该执行画像更新并更新状态", async () => {
      const { getPageCount } = await import("@/storage/db")
      const { profileManager } = await import("@/core/profile/ProfileManager")
      
      vi.mocked(getPageCount).mockResolvedValue(100)
      vi.mocked(profileManager.rebuildProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.executeUpdate("测试更新")

      expect(profileManager.rebuildProfile).toHaveBeenCalled()
      
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
      
      vi.mocked(profileManager.rebuildProfile).mockRejectedValue(new Error("Update failed"))

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
      vi.mocked(profileManager.rebuildProfile).mockResolvedValue({} as any)

      await ProfileUpdateScheduler.forceUpdate()

      expect(profileManager.rebuildProfile).toHaveBeenCalled()
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

    it("Phase 12.7: 应该说明由 SemanticProfileBuilder 控制", () => {
      const status = ProfileUpdateScheduler.getScheduleStatus()

      // Phase 12.7: 自动更新由 SemanticProfileBuilder 控制
      expect(status.nextUpdateETA).toBe("由 SemanticProfileBuilder 控制")
    })
  })
})
