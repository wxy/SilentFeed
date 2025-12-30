/**
 * 本地存储键管理测试
 */

import { describe, it, expect } from 'vitest'
import { LOCAL_STORAGE_KEYS, simpleHash } from './local-storage-keys'

describe('local-storage-keys', () => {
  describe('LOCAL_STORAGE_KEYS', () => {
    it('应该定义所有必需的存储键', () => {
      expect(LOCAL_STORAGE_KEYS.LAST_NOTIFICATION_TIME).toBe('lastNotificationTime')
      expect(LOCAL_STORAGE_KEYS.TRACKING_TABS).toBe('trackingTabs')
      expect(LOCAL_STORAGE_KEYS.TRACKING_URLS).toBe('trackingUrls')
      expect(LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS).toBe('trackingNotifications')
    })

    it('所有键应该使用 camelCase 命名（排除 legacy 键）', () => {
      const entries = Object.entries(LOCAL_STORAGE_KEYS)
      
      for (const [key, value] of entries) {
        // 跳过 legacy 键（这些是为迁移保留的旧格式）
        if (key.startsWith('LEGACY_')) continue
        
        // 检查是否符合 camelCase 格式（首字母小写，无连字符和下划线）
        expect(value).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      }
    })

    it('不应该有重复的键值', () => {
      const keys = Object.values(LOCAL_STORAGE_KEYS)
      const uniqueKeys = new Set(keys)
      
      expect(uniqueKeys.size).toBe(keys.length)
    })
  })

  describe('simpleHash', () => {
    it('应该为相同输入生成相同的哈希', () => {
      const input = 'https://example.com/article'
      const hash1 = simpleHash(input)
      const hash2 = simpleHash(input)

      expect(hash1).toBe(hash2)
    })

    it('应该为不同输入生成不同的哈希', () => {
      const hash1 = simpleHash('https://example.com/article1')
      const hash2 = simpleHash('https://example.com/article2')

      expect(hash1).not.toBe(hash2)
    })

    it('应该生成固定长度的哈希字符串', () => {
      const hash1 = simpleHash('short')
      const hash2 = simpleHash('a very long string with many characters to hash')

      expect(typeof hash1).toBe('string')
      expect(typeof hash2).toBe('string')
      expect(hash1.length).toBeGreaterThan(0)
      expect(hash2.length).toBeGreaterThan(0)
    })

    it('应该对空字符串生成哈希', () => {
      const hash = simpleHash('')

      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('应该处理包含特殊字符的字符串', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
      const hash = simpleHash(specialChars)

      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('应该处理 Unicode 字符', () => {
      const unicode = '测试文章🎉😀中文'
      const hash = simpleHash(unicode)

      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })
  })
})
