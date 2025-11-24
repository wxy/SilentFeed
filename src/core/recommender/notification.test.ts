/**
 * 推荐通知模块测试
 * 使用分段生成+合并的方法创建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  sendRecommendationNotification,
  setupNotificationListeners,
  canSendNotification,
  testNotification
} from './notification'

// Mock Chrome APIs
const mockNotifications = {
  create: vi.fn(),
  clear: vi.fn(),
  getAll: vi.fn(),
  onClicked: { addListener: vi.fn() },
  onButtonClicked: { addListener: vi.fn() },
  onClosed: { addListener: vi.fn() }
} as any

const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn()
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
  getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  openOptionsPage: vi.fn()
} as any

const mockAction = {
  openPopup: vi.fn()
} as any

const mockTabs = {
  create: vi.fn()
} as any

// @ts-ignore
global.chrome = {
  notifications: mockNotifications,
  storage: mockStorage,
  runtime: mockRuntime,
  action: mockAction,
  tabs: mockTabs
}

describe('NotificationManager - 推荐通知模块', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 默认配置：通知启用，无静默时段
    mockStorage.local.get.mockImplementation(async (keys) => {
      if (keys === 'notification-config') {
        return {
          'notification-config': {
            enabled: true,
            quietHours: undefined,
            minInterval: 60
          }
        }
      }
      if (keys === 'last-notification-time') {
        return { 'last-notification-time': 0 }
      }
      // 处理数组或单个 key 的情况
      if (Array.isArray(keys)) {
        const result: any = {}
        keys.forEach(key => {
          if (key === 'notification-config') {
            result[key] = { enabled: true, quietHours: undefined, minInterval: 60 }
          } else if (key === 'last-notification-time') {
            result[key] = 0
          }
        })
        return result
      }
      return {}
    })
    
    mockStorage.local.set.mockResolvedValue(undefined)
    mockStorage.local.remove.mockResolvedValue(undefined)
    mockNotifications.create.mockResolvedValue('test-id')
    mockNotifications.clear.mockResolvedValue(true)
    mockNotifications.getAll.mockResolvedValue([])
    mockAction.openPopup.mockResolvedValue(undefined)
    mockTabs.create.mockResolvedValue({ id: 1 })
    
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
          message: expect.stringContaining('测试文章标题')
        })
      )
      
      // 应该记录通知时间
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'last-notification-time': expect.any(Number)
        })
      )
    })

    it('应该在单条推荐时显示完整标题', async () => {
      const mockRecommendation = {
        title: '唯一的推荐',
        source: '测试源',
        url: 'https://example.com'
      }
      
      await sendRecommendationNotification(1, mockRecommendation)
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: '唯一的推荐'
        })
      )
    })

    it('应该在多条推荐时显示数量', async () => {
      const mockRecommendation = {
        title: '第一条推荐',
        source: '测试源',
        url: 'https://example.com'
      }
      
      await sendRecommendationNotification(3, mockRecommendation)
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: expect.stringContaining('还有 2 篇推荐')
        })
      )
    })

    it('应该处理通知配置', async () => {
      // 设置通知已禁用
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: false }
      })
      
      
      const mockRecommendation = {
        title: '测试文章',
        source: '测试源',
        url: 'https://example.com'
      }
      
      await sendRecommendationNotification(3, mockRecommendation)
      
      // 通知禁用时不应该创建通知
      expect(mockNotifications.create).not.toHaveBeenCalled()
    })

    it('应该在静默时段跳过通知', async () => {
      // Mock 当前时间为凌晨2点（在静默时段内）
      vi.setSystemTime(new Date('2025-01-01T02:00:00'))
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': {
          enabled: true,
          quietHours: { start: 22, end: 8 }
        }
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).not.toHaveBeenCalled()
      
      vi.useRealTimers()
    })

    it('应该在非静默时段发送通知', async () => {
      // Mock 当前时间为下午2点（不在静默时段）
      vi.setSystemTime(new Date('2025-01-01T14:00:00'))
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': {
          enabled: true,
          quietHours: { start: 22, end: 8 }
        },
        'last-notification-time': 0
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).toHaveBeenCalled()
      
      vi.useRealTimers()
    })

    it('应该检查最小通知间隔', async () => {
      // 设置上次通知时间为30分钟前（小于默认60分钟间隔）
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true, minInterval: 60 },
        'last-notification-time': thirtyMinutesAgo
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      // 间隔不足，不应发送通知
      expect(mockNotifications.create).not.toHaveBeenCalled()
    })

    it('应该在间隔足够时发送通知', async () => {
      // 设置上次通知时间为2小时前（大于60分钟间隔）
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true, minInterval: 60 },
        'last-notification-time': twoHoursAgo
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).toHaveBeenCalled()
    })

    it('应该处理加载配置失败的情况', async () => {
      // Mock storage.get 失败
      mockStorage.local.get.mockRejectedValue(new Error('Storage error'))
      
      
      // 使用默认配置（enabled: true），应该尝试发送通知
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      // 应该使用默认配置继续执行
      expect(mockNotifications.create).toHaveBeenCalled()
    })

    it('应该处理通知创建失败的情况', async () => {
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true },
        'last-notification-time': 0
      })
      
      // Mock notifications.create 失败
      mockNotifications.create.mockRejectedValue(new Error('Notification error'))
      
      
      // 不应该抛出错误
      await expect(
        sendRecommendationNotification(1, {
          title: '测试',
          source: '测试',
          url: 'https://example.com'
        })
      ).resolves.toBeUndefined()
    })

    it('应该存储推荐URL用于按钮点击', async () => {
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true },
        'last-notification-time': 0
      })
      
      
      const testUrl = 'https://example.com/article'
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: testUrl
      })
      
      // 应该保存URL（第二次调用set）
      const setCalls = mockStorage.local.set.mock.calls
      const urlCall = setCalls.find(call => 
        Object.keys(call[0])[0]?.startsWith('notification-url-')
      )
      expect(urlCall).toBeDefined()
      expect(Object.values(urlCall![0])[0]).toBe(testUrl)
    })
  })

  describe('testNotification', () => {
    it('应该发送测试通知', async () => {
      
      await testNotification()
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.stringMatching(/test-/),
        expect.objectContaining({
          type: 'basic',
          title: expect.stringContaining('测试'),
          message: expect.any(String),
          requireInteraction: true
        })
      )
    })

    it('应该保存测试URL', async () => {
      
      await testNotification()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'notification-url-test-notification': 'https://example.com'
        })
      )
    })
  })

  describe('setupNotificationListeners', () => {
    it('应该设置通知点击监听器', async () => {
      
      setupNotificationListeners()
      
      expect(mockNotifications.onClicked.addListener).toHaveBeenCalled()
      expect(mockNotifications.onButtonClicked.addListener).toHaveBeenCalled()
      expect(mockNotifications.onClosed.addListener).toHaveBeenCalled()
    })

    it('应该处理通知点击事件', async () => {
      
      setupNotificationListeners()
      
      // 获取onClicked的回调函数
      const clickCallback = mockNotifications.onClicked.addListener.mock.calls[0][0]
      
      await clickCallback('test-notification-id')
      
      // 应该尝试打开popup
      expect(mockAction.openPopup).toHaveBeenCalled()
      // 应该清除通知
      expect(mockNotifications.clear).toHaveBeenCalledWith('test-notification-id')
    })

    it('应该在无法打开popup时打开选项页', async () => {
      mockAction.openPopup.mockRejectedValue(new Error('Cannot open popup'))
      
      
      setupNotificationListeners()
      
      const clickCallback = mockNotifications.onClicked.addListener.mock.calls[0][0]
      await clickCallback('test-notification-id')
      
      // 应该尝试打开选项页
      expect(mockRuntime.openOptionsPage).toHaveBeenCalled()
    })

    it('应该处理"查看"按钮点击', async () => {
      const testUrl = 'https://example.com/article'
      mockStorage.local.get.mockResolvedValue({
        'notification-url-test-id': testUrl
      })
      
      
      setupNotificationListeners()
      
      const buttonCallback = mockNotifications.onButtonClicked.addListener.mock.calls[0][0]
      await buttonCallback('test-id', 0) // 0 = "查看"按钮
      
      // 应该打开推荐文章
      expect(mockTabs.create).toHaveBeenCalledWith({ url: testUrl })
      // 应该清理存储
      expect(mockStorage.local.remove).toHaveBeenCalledWith('notification-url-test-id')
      // 应该清除通知
      expect(mockNotifications.clear).toHaveBeenCalledWith('test-id')
    })

    it('应该处理"不想看"按钮点击', async () => {
      
      setupNotificationListeners()
      
      const buttonCallback = mockNotifications.onButtonClicked.addListener.mock.calls[0][0]
      await buttonCallback('test-id', 1) // 1 = "不想看"按钮
      
      // 应该清理存储
      expect(mockStorage.local.remove).toHaveBeenCalledWith('notification-url-test-id')
      // 应该清除通知
      expect(mockNotifications.clear).toHaveBeenCalledWith('test-id')
      // 不应该打开标签页
      expect(mockTabs.create).not.toHaveBeenCalled()
    })

    it('应该处理URL不存在的情况', async () => {
      mockStorage.local.get.mockResolvedValue({})
      
      
      setupNotificationListeners()
      
      const buttonCallback = mockNotifications.onButtonClicked.addListener.mock.calls[0][0]
      
      // 不应该抛出错误
      await expect(buttonCallback('test-id', 0)).resolves.toBeUndefined()
      
      // 不应该打开标签页
      expect(mockTabs.create).not.toHaveBeenCalled()
    })

    it('应该处理打开标签页失败的情况', async () => {
      mockStorage.local.get.mockResolvedValue({
        'notification-url-test-id': 'https://example.com'
      })
      mockTabs.create.mockRejectedValue(new Error('Cannot create tab'))
      
      
      setupNotificationListeners()
      
      const buttonCallback = mockNotifications.onButtonClicked.addListener.mock.calls[0][0]
      
      // 不应该抛出错误
      await expect(buttonCallback('test-id', 0)).resolves.toBeUndefined()
    })

    it('应该处理通知关闭事件', async () => {
      
      setupNotificationListeners()
      
      const closedCallback = mockNotifications.onClosed.addListener.mock.calls[0][0]
      await closedCallback('test-id', true)
      
      // 应该清理存储
      expect(mockStorage.local.remove).toHaveBeenCalledWith('notification-url-test-id')
    })
  })

  describe('图标处理', () => {
    it('应该使用128x128图标', async () => {
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true },
        'last-notification-time': 0
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          iconUrl: 'chrome-extension://test-id/icons/icon-128.png'
        })
      )
    })

    it('应该在128图标不存在时降级到48图标', async () => {
      mockRuntime.getManifest.mockReturnValue({
        icons: {
          "16": "icons/icon-16.png",
          "48": "icons/icon-48.png"
        }
      })
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true },
        'last-notification-time': 0
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          iconUrl: 'chrome-extension://test-id/icons/icon-48.png'
        })
      )
    })

    it('应该在没有图标时使用空字符串', async () => {
      mockRuntime.getManifest.mockReturnValue({
        icons: {}
      })
      
      mockStorage.local.get.mockResolvedValue({
        'notification-config': { enabled: true },
        'last-notification-time': 0
      })
      
      
      await sendRecommendationNotification(1, {
        title: '测试',
        source: '测试',
        url: 'https://example.com'
      })
      
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          iconUrl: ''
        })
      )
    })
  })
})