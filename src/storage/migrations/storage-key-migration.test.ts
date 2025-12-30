/**
 * Storage Key 迁移测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateStorageKeys, needsStorageKeyMigration } from './storage-key-migration'

describe('storage-key-migration', () => {
  beforeEach(() => {
    // 清空 storage mock
    vi.clearAllMocks()
  })
  
  describe('needsStorageKeyMigration', () => {
    it('应该检测到需要迁移（有旧 key）', async () => {
      // Mock 返回旧 key
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({
        'recommendation-config': { maxRecommendations: 3 }
      })
      
      const result = await needsStorageKeyMigration()
      expect(result).toBe(true)
    })
    
    it('应该检测到不需要迁移（无旧 key）', async () => {
      // Mock 返回空
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({})
      
      const result = await needsStorageKeyMigration()
      expect(result).toBe(false)
    })
  })
  
  describe('migrateStorageKeys', () => {
    it('应该成功迁移 recommendation-config', async () => {
      const oldConfig = {
        maxRecommendations: 5,
        batchSize: 20
      }
      
      let callCount = 0
      // Mock get 返回旧配置
      vi.spyOn(chrome.storage.sync, 'get').mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({}) // 检查新 key 不存在
        } else if (callCount === 2) {
          return Promise.resolve({ 'recommendation-config': oldConfig }) // 读取旧 key
        }
        return Promise.resolve({}) // 其他检查
      })
      
      const setSpy = vi.spyOn(chrome.storage.sync, 'set').mockResolvedValue()
      const removeSpy = vi.spyOn(chrome.storage.sync, 'remove').mockResolvedValue()
      
      const result = await migrateStorageKeys()
      
      expect(result.success).toBe(true)
      expect(result.migratedKeys).toContain('recommendationConfig')
      
      // 验证保存了新配置（检查是否包含旧配置内容）
      expect(setSpy).toHaveBeenCalled()
      const setCall = setSpy.mock.calls[0][0]
      expect(setCall).toHaveProperty('recommendationConfig')
      
      // 验证删除了旧配置
      expect(removeSpy).toHaveBeenCalledWith('recommendation-config')
    })
    
    it('应该成功迁移 ui_style + auto_translate → uiConfig', async () => {
      // Mock get 返回旧 UI 配置
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({
        ui_style: 'sketchy',
        auto_translate: false
      })
      
      const setSpy = vi.spyOn(chrome.storage.sync, 'set').mockResolvedValue()
      const removeSpy = vi.spyOn(chrome.storage.sync, 'remove').mockResolvedValue()
      
      const result = await migrateStorageKeys()
      
      expect(result.migratedKeys).toContain('uiConfig')
      
      // 验证合并成 uiConfig
      expect(setSpy).toHaveBeenCalled()
      const setCall = setSpy.mock.calls.find(call => call[0].uiConfig)
      expect(setCall).toBeDefined()
      expect(setCall![0].uiConfig).toEqual({
        style: 'sketchy',
        autoTranslate: false
      })
      
      // 验证删除了旧配置
      expect(removeSpy).toHaveBeenCalledWith(['ui_style', 'auto_translate'])
    })
    
    it('应该跳过已存在的新配置', async () => {
      let callCount = 0
      // Mock 新 key 已存在
      vi.spyOn(chrome.storage.sync, 'get').mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ recommendationConfig: {} }) // 新 key 存在
        }
        return Promise.resolve({}) // 其他检查
      })
      
      const removeSpy = vi.spyOn(chrome.storage.sync, 'remove').mockResolvedValue()
      
      const result = await migrateStorageKeys()
      
      // 不应该覆盖已存在的配置
      expect(removeSpy).not.toHaveBeenCalledWith('recommendation-config')
    })
    
    it('应该在迁移失败时使用默认值', async () => {
      let callCount = 0
      // Mock storage.get 第一次检查新key时失败，然后允许set成功
      vi.spyOn(chrome.storage.sync, 'get').mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // 第一次检查新key - 返回不存在
          return Promise.resolve({})
        } else if (callCount === 2) {
          // 第二次读取旧key - 失败
          return Promise.reject(new Error('Storage error'))
        }
        // 后续的检查都返回空
        return Promise.resolve({})
      })
      
      const setSpy = vi.spyOn(chrome.storage.sync, 'set').mockResolvedValue()
      
      const result = await migrateStorageKeys()
      
      // 即使失败也应该确保配置存在（使用默认值）
      expect(setSpy).toHaveBeenCalled()
      // 应该有部分失败
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
