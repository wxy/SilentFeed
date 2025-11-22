/**
 * RecommendationService 单元测试
 * 
 * 注意：由于 RecommendationService 依赖复杂，测试主要验证：
 * 1. 基本实例化
 * 2. 错误处理逻辑
 * 3. cleanup 方法
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { RecommendationService } from './RecommendationService'

describe('RecommendationService', () => {
  let service: RecommendationService

  beforeEach(() => {
    service = new RecommendationService()
  })

  describe('基本功能', () => {
    test('应该能创建实例', () => {
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(RecommendationService)
    })

    test('应该有 generateRecommendations 方法', () => {
      expect(service.generateRecommendations).toBeDefined()
      expect(typeof service.generateRecommendations).toBe('function')
    })

    test('应该有 cleanup 方法', () => {
      expect(service.cleanup).toBeDefined()
      expect(typeof service.cleanup).toBe('function')
    })

    test('cleanup 应该能正常调用', () => {
      expect(() => service.cleanup()).not.toThrow()
    })
  })

  describe('generateRecommendations', () => {
    test('应该返回 Promise', () => {
      const result = service.generateRecommendations()
      expect(result).toBeInstanceOf(Promise)
    })

    test('应该在失败时返回错误信息', async () => {
      // 在没有 mock 的情况下，会因为缺少用户画像而失败
      const result = await service.generateRecommendations()
      
      expect(result).toBeDefined()
      expect(result.recommendations).toBeDefined()
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(result.stats).toBeDefined()
      expect(typeof result.stats.processingTimeMs).toBe('number')
      
      // 失败时应该有错误信息
      if (result.recommendations.length === 0) {
        expect(result.errors).toBeDefined()
        expect(Array.isArray(result.errors)).toBe(true)
      }
    })

    test('应该接受可选参数', async () => {
      // 测试默认参数
      const result1 = await service.generateRecommendations()
      expect(result1).toBeDefined()
      
      // 测试自定义参数
      const result2 = await service.generateRecommendations(10, 'all', 20)
      expect(result2).toBeDefined()
    })
  })

  describe('返回值结构', () => {
    test('应该返回正确的数据结构', async () => {
      const result = await service.generateRecommendations()
      
      // 验证返回值结构
      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('stats')
      expect(result.stats).toHaveProperty('totalArticles')
      expect(result.stats).toHaveProperty('processedArticles')
      expect(result.stats).toHaveProperty('recommendedCount')
      expect(result.stats).toHaveProperty('processingTimeMs')
    })
  })

  describe('单例导出', () => {
    test('应该导出单例实例', async () => {
      const { recommendationService } = await import('./RecommendationService')
      expect(recommendationService).toBeDefined()
      expect(recommendationService).toBeInstanceOf(RecommendationService)
    })
  })
})

