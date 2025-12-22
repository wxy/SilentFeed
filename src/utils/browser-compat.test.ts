/**
 * 浏览器兼容性检测工具测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  detectBrowser,
  getBrowserVersion,
  isReadingListAvailable,
  isAlarmsAvailable,
  isDeclarativeNetRequestAvailable,
  isNotificationsAvailable,
  isSidePanelAvailable,
  getBrowserCompatInfo,
  isFeatureAvailable,
  getUnsupportedFeatures,
  clearCompatCache,
} from './browser-compat'

describe('browser-compat', () => {
  // 保存原始的 navigator 和 chrome
  const originalNavigator = global.navigator
  const originalChrome = global.chrome

  beforeEach(() => {
    clearCompatCache()
  })

  afterEach(() => {
    // 恢复原始值
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
    global.chrome = originalChrome
    clearCompatCache()
  })

  describe('detectBrowser', () => {
    it('应该检测 Chrome 浏览器', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        writable: true,
      })

      expect(detectBrowser()).toBe('chrome')
    })

    it('应该检测 Edge 浏览器', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        },
        writable: true,
      })

      expect(detectBrowser()).toBe('edge')
    })

    it('应该返回 other 对于未知浏览器', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
        writable: true,
      })

      expect(detectBrowser()).toBe('other')
    })
  })

  describe('getBrowserVersion', () => {
    it('应该获取 Chrome 版本号', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        writable: true,
      })

      expect(getBrowserVersion()).toBe(120)
    })

    it('应该获取 Edge 版本号', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/119.0.0.0',
        },
        writable: true,
      })

      expect(getBrowserVersion()).toBe(119)
    })

    it('应该返回 0 对于未知浏览器', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        },
        writable: true,
      })

      expect(getBrowserVersion()).toBe(0)
    })
  })

  describe('isReadingListAvailable', () => {
    it('应该在 Chrome 89+ 且有 API 时返回 true', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
      } as unknown as typeof chrome

      expect(isReadingListAvailable()).toBe(true)
    })

    it('应该在 Edge 浏览器中返回 false', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0 Edg/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
      } as unknown as typeof chrome

      expect(isReadingListAvailable()).toBe(false)
    })

    it('应该在 Chrome 89 以下返回 false', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/88.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
      } as unknown as typeof chrome

      expect(isReadingListAvailable()).toBe(false)
    })

    it('应该在没有 readingList API 时返回 false', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {} as unknown as typeof chrome

      expect(isReadingListAvailable()).toBe(false)
    })
  })

  describe('isAlarmsAvailable', () => {
    it('应该在有 alarms API 时返回 true', () => {
      global.chrome = {
        alarms: {},
      } as unknown as typeof chrome

      expect(isAlarmsAvailable()).toBe(true)
    })

    it('应该在没有 alarms API 时返回 false', () => {
      global.chrome = {} as unknown as typeof chrome

      expect(isAlarmsAvailable()).toBe(false)
    })
  })

  describe('isDeclarativeNetRequestAvailable', () => {
    it('应该在有 declarativeNetRequest API 时返回 true', () => {
      global.chrome = {
        declarativeNetRequest: {},
      } as unknown as typeof chrome

      expect(isDeclarativeNetRequestAvailable()).toBe(true)
    })

    it('应该在没有 declarativeNetRequest API 时返回 false', () => {
      global.chrome = {} as unknown as typeof chrome

      expect(isDeclarativeNetRequestAvailable()).toBe(false)
    })
  })

  describe('isNotificationsAvailable', () => {
    it('应该在有 notifications API 时返回 true', () => {
      global.chrome = {
        notifications: {},
      } as unknown as typeof chrome

      expect(isNotificationsAvailable()).toBe(true)
    })

    it('应该在没有 notifications API 时返回 false', () => {
      global.chrome = {} as unknown as typeof chrome

      expect(isNotificationsAvailable()).toBe(false)
    })
  })

  describe('isSidePanelAvailable', () => {
    it('应该在有 sidePanel API 时返回 true', () => {
      global.chrome = {
        sidePanel: {},
      } as unknown as typeof chrome

      expect(isSidePanelAvailable()).toBe(true)
    })

    it('应该在没有 sidePanel API 时返回 false', () => {
      global.chrome = {} as unknown as typeof chrome

      expect(isSidePanelAvailable()).toBe(false)
    })
  })

  describe('getBrowserCompatInfo', () => {
    it('应该返回完整的兼容性信息', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
        alarms: {},
        declarativeNetRequest: {},
        notifications: {},
        sidePanel: {},
      } as unknown as typeof chrome

      const info = getBrowserCompatInfo()

      expect(info.browser).toBe('chrome')
      expect(info.version).toBe(120)
      expect(info.features.readingList).toBe(true)
      expect(info.features.alarms).toBe(true)
      expect(info.features.declarativeNetRequest).toBe(true)
      expect(info.features.notifications).toBe(true)
      expect(info.features.sidePanel).toBe(true)
    })

    it('应该缓存结果', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
        alarms: {},
      } as unknown as typeof chrome

      const info1 = getBrowserCompatInfo()
      const info2 = getBrowserCompatInfo()

      expect(info1).toBe(info2) // 同一个对象引用
    })
  })

  describe('isFeatureAvailable', () => {
    it('应该检查指定功能是否可用', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
        alarms: {},
      } as unknown as typeof chrome

      expect(isFeatureAvailable('readingList')).toBe(true)
      expect(isFeatureAvailable('alarms')).toBe(true)
      expect(isFeatureAvailable('sidePanel')).toBe(false)
    })
  })

  describe('getUnsupportedFeatures', () => {
    it('应该返回不支持的功能列表', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
        alarms: {},
      } as unknown as typeof chrome

      const unsupported = getUnsupportedFeatures()

      expect(unsupported).toContain('declarativeNetRequest')
      expect(unsupported).toContain('notifications')
      expect(unsupported).toContain('sidePanel')
      expect(unsupported).not.toContain('readingList')
      expect(unsupported).not.toContain('alarms')
    })
  })

  describe('clearCompatCache', () => {
    it('应该清除缓存', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Chrome/120.0.0.0',
        },
        writable: true,
      })
      global.chrome = {
        readingList: {},
      } as unknown as typeof chrome

      const info1 = getBrowserCompatInfo()
      
      clearCompatCache()
      
      // 修改 chrome 对象
      global.chrome = {
        alarms: {},
      } as unknown as typeof chrome
      
      const info2 = getBrowserCompatInfo()

      // 缓存清除后，应该重新检测
      expect(info1.features.readingList).toBe(true)
      expect(info2.features.readingList).toBe(false)
    })
  })
})
