/**
 * 追踪数据管理模块测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveTabTracking,
  consumeTabTracking,
  saveUrlTracking,
  consumeUrlTracking,
  saveNotificationTracking,
  consumeNotificationTracking,
  clearNotificationTracking,
  type TrackingInfo,
  type NotificationTrackingInfo
} from './tracking-storage'
import { LOCAL_STORAGE_KEYS, simpleHash } from './local-storage-keys'

describe('tracking-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Tab 追踪', () => {
    it('应该保存和消费 Tab 追踪数据', async () => {
      const tabId = 123
      const trackingInfo: Omit<TrackingInfo, 'createdAt'> = {
        recommendationId: 'rec-1',
        title: '测试文章',
        source: 'popup',
        action: 'original'
      }

      // Mock storage
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      // 保存
      await saveTabTracking(tabId, trackingInfo)

      expect(setSpy).toHaveBeenCalled()
      const savedData = setSpy.mock.calls[0][0]
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_TABS]).toBeDefined()
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_TABS][tabId]).toMatchObject(trackingInfo)

      // Mock 读取
      const mockTracking: TrackingInfo = { ...trackingInfo, createdAt: Date.now() }
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        [LOCAL_STORAGE_KEYS.TRACKING_TABS]: { [tabId]: mockTracking }
      })

      // 消费
      const result = await consumeTabTracking(tabId)
      expect(result).toEqual(mockTracking)
    })

    it('应该处理不存在的 Tab', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})

      const result = await consumeTabTracking(999)
      expect(result).toBeNull()
    })
  })

  describe('URL 追踪', () => {
    it('应该保存和消费 URL 追踪数据', async () => {
      const url = 'https://example.com/article'
      const trackingInfo: Omit<TrackingInfo, 'createdAt'> = {
        recommendationId: 'rec-2',
        title: 'URL 测试',
        source: 'readingList'
      }

      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      await saveUrlTracking(url, trackingInfo)

      expect(setSpy).toHaveBeenCalled()

      // Mock 读取 - 使用 simpleHash 计算 URL hash
      const mockTracking: TrackingInfo = { ...trackingInfo, createdAt: Date.now() }
      const urlHash = simpleHash(url)
      
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        [LOCAL_STORAGE_KEYS.TRACKING_URLS]: { [urlHash]: mockTracking }
      })

      // Mock set for cleanup
      vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      const result = await consumeUrlTracking(url)
      expect(result).toBeTruthy()
      if (result) {
        expect(result.recommendationId).toBe(trackingInfo.recommendationId)
        expect(result.title).toBe(trackingInfo.title)
      }
    })

  })

  describe('通知追踪', () => {
    it('应该保存和消费通知追踪数据', async () => {
      const notificationId = 'notif-1'
      const url = 'https://example.com/news'
      const recommendationId = 'rec-3'

      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      await saveNotificationTracking(notificationId, url, recommendationId)

      expect(setSpy).toHaveBeenCalled()
      const savedData = setSpy.mock.calls[0][0]
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]).toBeDefined()
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS][notificationId]).toMatchObject({
        url,
        recommendationId
      })

      // Mock 读取
      const mockTracking: NotificationTrackingInfo = {
        url,
        recommendationId,
        createdAt: Date.now()
      }
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: { [notificationId]: mockTracking }
      })

      const result = await consumeNotificationTracking(notificationId)
      expect(result).toEqual(mockTracking)
    })

    it('应该支持没有 recommendationId 的通知', async () => {
      const notificationId = 'test-notif'
      const url = 'https://example.com/test'

      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      await saveNotificationTracking(notificationId, url)

      const savedData = setSpy.mock.calls[0][0]
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS][notificationId]).toMatchObject({
        url,
        recommendationId: undefined
      })
    })

    it('应该清除通知追踪数据', async () => {
      const notificationId = 'notif-1'

      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: {
          [notificationId]: { url: 'https://example.com', createdAt: Date.now() }
        }
      })

      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()

      await clearNotificationTracking(notificationId)

      expect(setSpy).toHaveBeenCalled()
      const savedData = setSpy.mock.calls[0][0]
      expect(savedData[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS][notificationId]).toBeUndefined()
    })

    it('应该处理不存在的通知', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})

      const result = await consumeNotificationTracking('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('错误处理', () => {
    it('应该处理 storage 读取失败', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('Storage error'))

      const result = await consumeTabTracking(123)
      expect(result).toBeNull()
    })

    it('应该处理 storage 写入失败', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('Storage error'))

      // 写入失败会抛出错误
      await expect(saveTabTracking(123, {
        recommendationId: 'rec-1',
        title: 'test',
        source: 'popup'
      })).rejects.toThrow('Storage error')
    })
  })
})
