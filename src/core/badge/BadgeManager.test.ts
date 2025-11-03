/**
 * BadgeManager 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BadgeManager, ProgressStage } from './BadgeManager'

describe('BadgeManager', () => {
  // Mock chrome.action API
  const mockSetBadgeText = vi.fn()
  const mockSetBadgeBackgroundColor = vi.fn()

  beforeEach(() => {
    // 重置 mock
    mockSetBadgeText.mockClear()
    mockSetBadgeBackgroundColor.mockClear()

    // 设置 chrome.action mock
    global.chrome = {
      action: {
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor
      }
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getStage', () => {
    it('应该返回探索者阶段 (0-250 页)', () => {
      expect(BadgeManager.getStage(0)).toBe(ProgressStage.EXPLORER)
      expect(BadgeManager.getStage(100)).toBe(ProgressStage.EXPLORER)
      expect(BadgeManager.getStage(250)).toBe(ProgressStage.EXPLORER)
    })

    it('应该返回学习者阶段 (251-600 页)', () => {
      expect(BadgeManager.getStage(251)).toBe(ProgressStage.LEARNER)
      expect(BadgeManager.getStage(400)).toBe(ProgressStage.LEARNER)
      expect(BadgeManager.getStage(600)).toBe(ProgressStage.LEARNER)
    })

    it('应该返回成长者阶段 (601-1000 页)', () => {
      expect(BadgeManager.getStage(601)).toBe(ProgressStage.GROWER)
      expect(BadgeManager.getStage(800)).toBe(ProgressStage.GROWER)
      expect(BadgeManager.getStage(1000)).toBe(ProgressStage.GROWER)
    })

    it('应该返回大师阶段 (1001+ 页)', () => {
      expect(BadgeManager.getStage(1001)).toBe(ProgressStage.MASTER)
      expect(BadgeManager.getStage(2000)).toBe(ProgressStage.MASTER)
      expect(BadgeManager.getStage(10000)).toBe(ProgressStage.MASTER)
    })
  })

  describe('getStageConfig', () => {
    it('应该返回探索者阶段配置', () => {
      const config = BadgeManager.getStageConfig(ProgressStage.EXPLORER)
      expect(config.emoji).toBe('🌱')
      expect(config.minPages).toBe(0)
      expect(config.maxPages).toBe(250)
      expect(config.name).toBe('探索者')
    })

    it('应该返回学习者阶段配置', () => {
      const config = BadgeManager.getStageConfig(ProgressStage.LEARNER)
      expect(config.emoji).toBe('🌿')
      expect(config.minPages).toBe(251)
      expect(config.maxPages).toBe(600)
      expect(config.name).toBe('学习者')
    })

    it('应该返回成长者阶段配置', () => {
      const config = BadgeManager.getStageConfig(ProgressStage.GROWER)
      expect(config.emoji).toBe('🌳')
      expect(config.minPages).toBe(601)
      expect(config.maxPages).toBe(1000)
      expect(config.name).toBe('成长者')
    })

    it('应该返回大师阶段配置', () => {
      const config = BadgeManager.getStageConfig(ProgressStage.MASTER)
      expect(config.emoji).toBe('🌲')
      expect(config.minPages).toBe(1001)
      expect(config.maxPages).toBe(Infinity)
      expect(config.name).toBe('大师')
    })
  })

  describe('updateBadge - 冷启动阶段', () => {
    it('应该为 0 页设置探索者徽章', async () => {
      await BadgeManager.updateBadge(0)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '🌱' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF93' })
    })

    it('应该为 300 页设置学习者徽章', async () => {
      await BadgeManager.updateBadge(300)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '🌿' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF93' })
    })

    it('应该为 700 页设置成长者徽章', async () => {
      await BadgeManager.updateBadge(700)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '🌳' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF93' })
    })

    it('应该为 999 页设置成长者徽章（冷启动最后一页）', async () => {
      await BadgeManager.updateBadge(999)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '🌳' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF93' })
    })
  })

  describe('updateBadge - 推荐阶段', () => {
    it('应该为 1000 页显示空徽章（无未读推荐）', async () => {
      await BadgeManager.updateBadge(1000, 0)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#9CA3AF' })
    })

    it('应该为 1500 页显示未读数量（有推荐）', async () => {
      await BadgeManager.updateBadge(1500, 3)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '3' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF6B35' })
    })

    it('应该正确处理大量未读推荐', async () => {
      await BadgeManager.updateBadge(2000, 99)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '99' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF6B35' })
    })

    it('应该在推荐阶段默认显示空徽章（未传 unreadCount）', async () => {
      await BadgeManager.updateBadge(1500)
      
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#9CA3AF' })
    })
  })

  describe('isColdStart', () => {
    it('应该正确判断冷启动阶段', () => {
      expect(BadgeManager.isColdStart(0)).toBe(true)
      expect(BadgeManager.isColdStart(500)).toBe(true)
      expect(BadgeManager.isColdStart(999)).toBe(true)
    })

    it('应该正确判断推荐阶段', () => {
      expect(BadgeManager.isColdStart(1000)).toBe(false)
      expect(BadgeManager.isColdStart(1500)).toBe(false)
      expect(BadgeManager.isColdStart(10000)).toBe(false)
    })
  })

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      mockSetBadgeText.mockRejectedValue(new Error('API Error'))
      
      // 不应该抛出错误
      await expect(BadgeManager.updateBadge(100)).resolves.toBeUndefined()
    })
  })

  describe('clearBadge', () => {
    it('应该清除徽章文本', async () => {
      await BadgeManager.clearBadge()
      
      expect(mockSetBadgeText).toHaveBeenCalledTimes(1)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
    })

    it('应该处理清除错误', async () => {
      mockSetBadgeText.mockRejectedValue(new Error('Clear Error'))
      
      // 不应该抛出错误
      await expect(BadgeManager.clearBadge()).resolves.toBeUndefined()
    })
  })

  describe('边界情况', () => {
    it('应该正确处理阶段边界值', () => {
      // 探索者 -> 学习者边界
      expect(BadgeManager.getStage(250)).toBe(ProgressStage.EXPLORER)
      expect(BadgeManager.getStage(251)).toBe(ProgressStage.LEARNER)

      // 学习者 -> 成长者边界
      expect(BadgeManager.getStage(600)).toBe(ProgressStage.LEARNER)
      expect(BadgeManager.getStage(601)).toBe(ProgressStage.GROWER)

      // 成长者 -> 大师边界
      expect(BadgeManager.getStage(1000)).toBe(ProgressStage.GROWER)
      expect(BadgeManager.getStage(1001)).toBe(ProgressStage.MASTER)
    })

    it('应该正确处理负数（边缘情况）', () => {
      // 虽然实际不应该出现负数，但确保健壮性
      expect(BadgeManager.getStage(-1)).toBe(ProgressStage.EXPLORER)
    })
  })
})
