/**
 * 推荐通知模块测试
 * 使用分段生成+合并的方法创建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Chrome APIs
const mockNotifications = {
  create: vi.fn(),
  clear: vi.fn(),
  getAll: vi.fn()
} as any

const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn()
  }
} as any

const mockRuntime = {
  getManifest: vi.fn(() => ({
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png", 
      "128": "icons/icon-128.png"
    }
  })),
  getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`)
} as any

// @ts-ignore
global.chrome = {
  notifications: mockNotifications,
  storage: mockStorage,
  runtime: mockRuntime
}

describe('NotificationManager - 推荐通知模块', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage.local.get.mockResolvedValue({})
    mockStorage.local.set.mockResolvedValue(undefined)
    mockNotifications.create.mockResolvedValue('test-id')
    mockNotifications.clear.mockResolvedValue(true)
    mockNotifications.getAll.mockResolvedValue([])
    
    // 重置 runtime mock
    mockRuntime.getManifest.mockReturnValue({
      icons: {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png", 
        "128": "icons/icon-128.png"
      }
    })
    mockRuntime.getURL.mockImplementation((path: string) => `chrome-extension://test-id/${path}`)
  })

  describe('sendRecommendationNotification', () => {
    it('应该创建推荐通知', async () => {
      // 设置通知配置：启用通知且没有静默时段
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { 
          enabled: true,
          quietHours: undefined, // 关闭静默时段
          minInterval: 60 
        },
        'last-notification-time': 0 // 设置上次通知时间为很久以前
      })
      
      const { sendRecommendationNotification } = await import('./notification')
      
      const mockRecommendation = {
        title: '测试文章标题',
        source: '测试来源',
        url: 'https://example.com/test'
      }
      
      await sendRecommendationNotification(5, mockRecommendation)
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.stringMatching(/recommendation-/),
        expect.objectContaining({
          type: 'basic',
          iconUrl: expect.any(String),
          title: expect.stringContaining('推荐'),
          message: expect.any(String)
        })
      )
    })

    it('应该处理通知配置', async () => {
      // 设置通知已禁用
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: false }
      })
      
      const { sendRecommendationNotification } = await import('./notification')
      
      const mockRecommendation = {
        title: '测试文章',
        source: '测试源',
        url: 'https://example.com'
      }
      
      await sendRecommendationNotification(3, mockRecommendation)
      
      // 通知禁用时不应该创建通知
      expect(mockNotifications.create).not.toHaveBeenCalled()
    })
  })

  describe('testNotification', () => {
    it('应该发送测试通知', async () => {
      const { testNotification } = await import('./notification')
      
      await testNotification()
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.stringMatching(/test-/),
        expect.objectContaining({
          type: 'basic',
          title: expect.stringContaining('测试'),
          message: expect.any(String)
        })
      )
    })
  })
})