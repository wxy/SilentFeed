/**
 * 系统阈值配置测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSystemThresholds,
  updateSystemThresholds,
  resetSystemThresholds,
  invalidateThresholdsCache,
  DEFAULT_SYSTEM_THRESHOLDS
} from './system-thresholds'

describe('system-thresholds', () => {
  beforeEach(() => {
    // 清空 storage mock
    vi.clearAllMocks()
    // 清空内存缓存
    invalidateThresholdsCache()
  })

  describe('getSystemThresholds', () => {
    it('应该从 local storage 读取阈值', async () => {
      const customThresholds = {
        ...DEFAULT_SYSTEM_THRESHOLDS,
        learningCompletePages: 20
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: customThresholds
      })
      
      const result = await getSystemThresholds()
      
      expect(result.learningCompletePages).toBe(20)
    })
    
    it('应该使用内存缓存（5分钟内）', async () => {
      const customThresholds = {
        ...DEFAULT_SYSTEM_THRESHOLDS,
        learningCompletePages: 20
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      const getSpy = vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: customThresholds
      })
      
      // 第一次调用
      const result1 = await getSystemThresholds()
      expect(result1.learningCompletePages).toBe(20)
      
      // 第二次调用（应该使用缓存，不再调用 storage）
      getSpy.mockClear()
      const result2 = await getSystemThresholds()
      expect(result2.learningCompletePages).toBe(20)
      
      // 验证没有调用 storage
      expect(getSpy).not.toHaveBeenCalled()
    })
    
    it('应该在 storage 失败时返回默认值', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('Storage error'))
      
      const result = await getSystemThresholds()
      
      expect(result).toEqual(DEFAULT_SYSTEM_THRESHOLDS)
    })
  })
  
  describe('updateSystemThresholds', () => {
    it('应该部分更新阈值', async () => {
      const updates = {
        learningCompletePages: 150
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: DEFAULT_SYSTEM_THRESHOLDS
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await updateSystemThresholds(updates)
      
      // 验证保存了更新
      expect(setSpy).toHaveBeenCalled()
      const setCall = setSpy.mock.calls[0][0]
      expect(setCall.systemThresholds.learningCompletePages).toBe(150)
      // 其他字段应该保持不变
      expect(setCall.systemThresholds.feedFetchIntervals).toEqual(
        DEFAULT_SYSTEM_THRESHOLDS.feedFetchIntervals
      )
    })
    
    it('应该深度合并嵌套对象', async () => {
      const existingThresholds = {
        ...DEFAULT_SYSTEM_THRESHOLDS,
        feedFetchIntervals: {
          ...DEFAULT_SYSTEM_THRESHOLDS.feedFetchIntervals,
          highFrequency: 3
        }
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: existingThresholds
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      const updates = {
        feedFetchIntervals: {
          ...DEFAULT_SYSTEM_THRESHOLDS.feedFetchIntervals,
          mediumFrequency: 8
        }
      }
      
      await updateSystemThresholds(updates)
      
      // 验证保持了其他字段
      expect(setSpy).toHaveBeenCalled()
      const setCall = setSpy.mock.calls[0][0]
      expect(setCall.systemThresholds.feedFetchIntervals.highFrequency).toBe(3) // 保持原有修改
      expect(setCall.systemThresholds.feedFetchIntervals.mediumFrequency).toBe(8) // 新的更新
    })
  })
  
  describe('resetSystemThresholds', () => {
    it('应该重置为默认值', async () => {
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await resetSystemThresholds()
      
      expect(setSpy).toHaveBeenCalledWith({
        systemThresholds: DEFAULT_SYSTEM_THRESHOLDS
      })
    })
  })
  
  describe('invalidateThresholdsCache', () => {
    it('应该清空内存缓存，强制重新读取', async () => {
      // 先读取一次缓存
      // @ts-expect-error - Mock 返回值类型不兼容
      const getSpy = vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: DEFAULT_SYSTEM_THRESHOLDS
      })
      await getSystemThresholds()
      
      // 清空缓存
      invalidateThresholdsCache()
      
      // 再次读取应该重新调用 storage
      getSpy.mockClear()
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemThresholds: DEFAULT_SYSTEM_THRESHOLDS
      })
      await getSystemThresholds()
      
      expect(getSpy).toHaveBeenCalled()
    })
  })
})
