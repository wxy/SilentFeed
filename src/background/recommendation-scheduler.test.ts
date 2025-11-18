/**
 * recommendation-scheduler.ts 测试
 * 
 * 测试推荐生成调度器的核心功能 + Phase 7 动态频率
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecommendationScheduler } from './recommendation-scheduler'
import { getPageCount, getUnrecommendedArticleCount } from '../storage/db'
import { recommendationService } from '../core/recommender/RecommendationService'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'

// Mock dependencies
vi.mock('../storage/db', () => ({
  getPageCount: vi.fn(),
  getUnrecommendedArticleCount: vi.fn()
}))

vi.mock('../core/recommender/RecommendationService', () => ({
  recommendationService: {
    generateRecommendations: vi.fn()
  }
}))

// Mock chrome.alarms API
global.chrome = {
  alarms: {
    create: vi.fn(),
    clear: vi.fn()
  }
} as any

describe('RecommendationScheduler', () => {
  let scheduler: RecommendationScheduler

  beforeEach(() => {
    vi.clearAllMocks()
    scheduler = new RecommendationScheduler()
  })

  afterEach(async () => {
    await scheduler.stop()
  })

  describe('start()', () => {
    it('应该根据待推荐数量动态启动调度器', async () => {
      // 模拟有 25 条待推荐 → 应该是 1 分钟
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(25)
      
      await scheduler.start()

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 1 }  // 动态间隔
      )

      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(true)
    })
    
    it('应该在待推荐数量少时使用较长间隔', async () => {
      // 模拟只有 3 条待推荐 → 应该是 10 分钟
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(3)
      
      await scheduler.start()

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 10 }
      )
    })
    
    it('应该在无待推荐时使用最长间隔', async () => {
      // 模拟没有待推荐 → 应该是 20 分钟
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(0)
      
      await scheduler.start()

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 20 }
      )
    })

    it('应该在已运行时拒绝重复启动', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)
      
      await scheduler.start()
      const createCallCount = (chrome.alarms.create as any).mock.calls.length

      await scheduler.start()

      // 没有第二次调用 create
      expect((chrome.alarms.create as any).mock.calls.length).toBe(createCallCount)
    })

    it('应该支持自定义配置', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)
      
      const customScheduler = new RecommendationScheduler({
        minIntervalMinutes: 2,
        maxIntervalMinutes: 30,
        recommendationsPerRun: 2
      })

      await customScheduler.start()

      // 10 条待推荐应该是 3 分钟
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 3 }
      )

      await customScheduler.stop()
    })
  })

  describe('stop()', () => {
    it('应该成功停止调度器', async () => {
      await scheduler.start()
      await scheduler.stop()

      expect(chrome.alarms.clear).toHaveBeenCalledWith('generate-recommendation')

      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(false)
    })

    it('应该在未运行时静默处理', async () => {
      await scheduler.stop()

      // 不应该调用 clear
      expect(chrome.alarms.clear).not.toHaveBeenCalled()
    })
  })

  describe('triggerNow()', () => {
    it('应该在学习阶段返回失败', async () => {
      vi.mocked(getPageCount).mockResolvedValue(50)

      const result = await scheduler.triggerNow()

      expect(result.success).toBe(false)
      expect(result.recommendedCount).toBe(0)
      expect(result.message).toContain('跳过推荐生成')
    })

    it('应该在学习完成后成功生成推荐', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [
          { title: 'Test Article', score: 0.9 } as any
        ],
        stats: {
          totalArticles: 10,
          processedArticles: 5,
          recommendedCount: 1,
          processingTimeMs: 100
        }
      })

      const result = await scheduler.triggerNow()

      expect(result.success).toBe(true)
      expect(result.recommendedCount).toBe(1)
      expect(recommendationService.generateRecommendations).toHaveBeenCalledWith(
        1,  // recommendationsPerRun
        'subscribed',
        10  // batchSize
      )
    })

    it('应该处理生成失败的情况', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(recommendationService.generateRecommendations).mockRejectedValue(
        new Error('Generation failed')
      )

      const result = await scheduler.triggerNow()

      expect(result.success).toBe(false)
      expect(result.recommendedCount).toBe(0)
      expect(result.message).toBe('Generation failed')
    })

    it('应该在没有新推荐时返回成功但数量为0', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [],
        stats: {
          totalArticles: 10,
          processedArticles: 5,
          recommendedCount: 0,
          processingTimeMs: 100
        }
      })

      const result = await scheduler.triggerNow()

      expect(result.success).toBe(false) // 没有生成推荐视为失败
      expect(result.recommendedCount).toBe(0)
    })
  })

  describe('handleAlarm()', () => {
    it('应该在学习阶段跳过生成', async () => {
      vi.mocked(getPageCount).mockResolvedValue(50)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)

      await scheduler.handleAlarm()

      expect(recommendationService.generateRecommendations).not.toHaveBeenCalled()
    })

    it('应该在学习完成后调用生成服务并重新安排', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(5)  // 应该是 5 分钟
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: 0
        }
      })

      await scheduler.start()  // 先启动
      vi.clearAllMocks()  // 清除启动时的调用
      
      await scheduler.handleAlarm()

      // 1. 应该调用生成服务
      expect(recommendationService.generateRecommendations).toHaveBeenCalledTimes(1)
      
      // 2. 应该重新安排（清除旧的 + 创建新的）
      expect(chrome.alarms.clear).toHaveBeenCalledWith('generate-recommendation')
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 5 }
      )
    })
    
    it('应该在待推荐数量变化后调整间隔', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      
      // 第一次：20 条待推荐 → 1 分钟
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(20)
      await scheduler.start()
      
      // 第二次：处理后只剩 2 条 → 10 分钟
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(2)
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: 0
        }
      })
      
      vi.clearAllMocks()
      await scheduler.handleAlarm()
      
      // 应该从 1 分钟调整到 10 分钟
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 10 }
      )
    })

    it('应该捕获并记录错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(getPageCount).mockRejectedValue(new Error('Database error'))

      await scheduler.handleAlarm()

      // 不应该抛出错误
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('getStatus()', () => {
    it('应该返回正确的状态', async () => {
      const status = scheduler.getStatus()

      expect(status).toEqual({
        isRunning: false,
        config: {
          minIntervalMinutes: 1,
          maxIntervalMinutes: 20,
          recommendationsPerRun: 1,
          batchSize: 10,
          source: 'subscribed'
        },
        alarmName: 'generate-recommendation'
      })
    })

    it('应该在启动后更新状态', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)
      
      await scheduler.start()

      const status = scheduler.getStatus()

      expect(status.isRunning).toBe(true)
    })
  })
  
  describe('动态间隔计算', () => {
    it('应该为 >=20 条待推荐返回最小间隔（1分钟）', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(25)
      
      await scheduler.start()
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 1 }
      )
    })
    
    it('应该为 10-19 条待推荐返回 3 分钟', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(15)
      
      await scheduler.start()
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 3 }
      )
    })
    
    it('应该为 5-9 条待推荐返回 5 分钟', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(7)
      
      await scheduler.start()
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 5 }
      )
    })
    
    it('应该为 1-4 条待推荐返回 10 分钟', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(2)
      
      await scheduler.start()
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 10 }
      )
    })
    
    it('应该为 0 条待推荐返回最大间隔（20分钟）', async () => {
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(0)
      
      await scheduler.start()
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 20 }
      )
    })
  })
  
  describe('Phase 7: 并发控制', () => {
    it('应该在任务执行时拒绝 triggerNow()', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      
      // 模拟一个慢速的生成过程
      let resolveGeneration: () => void
      const generationPromise = new Promise<any>(resolve => {
        resolveGeneration = () => resolve({
          recommendations: [],
          stats: {
            totalArticles: 0,
            processedArticles: 0,
            recommendedCount: 0,
            processingTimeMs: 0
          }
        })
      })
      
      vi.mocked(recommendationService.generateRecommendations)
        .mockReturnValue(generationPromise)
      
      // 第一次调用：开始执行
      const firstCall = scheduler.triggerNow()
      
      // 第二次调用：应该被拒绝
      const secondCall = await scheduler.triggerNow()
      
      expect(secondCall.success).toBe(false)
      expect(secondCall.message).toContain('正在执行中')
      
      // 完成第一次调用
      resolveGeneration!()
      await firstCall
      
      // 现在应该可以再次调用了
      const thirdCall = await scheduler.triggerNow()
      expect(thirdCall.success).toBe(false)  // 没有推荐，但不是因为并发
      expect(thirdCall.message).not.toContain('正在执行中')
    })
    
    it('应该在任务执行时跳过 handleAlarm()', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)
      
      // 模拟一个慢速的生成过程
      let resolveGeneration: () => void
      const generationPromise = new Promise<any>(resolve => {
        resolveGeneration = () => resolve({
          recommendations: [],
          stats: {
            totalArticles: 0,
            processedArticles: 0,
            recommendedCount: 0,
            processingTimeMs: 0
          }
        })
      })
      
      vi.mocked(recommendationService.generateRecommendations)
        .mockReturnValue(generationPromise)
      
      await scheduler.start()
      
      // 第一次 handleAlarm：开始执行
      const firstAlarm = scheduler.handleAlarm()
      
      // 等待一下确保任务开始
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // 第二次 handleAlarm：应该跳过
      await scheduler.handleAlarm()
      
      // 应该只调用一次生成服务
      expect(recommendationService.generateRecommendations).toHaveBeenCalledTimes(1)
      
      // 完成第一次调用
      resolveGeneration!()
      await firstAlarm
    })
    
    it('应该在错误后正确重置执行标志', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(recommendationService.generateRecommendations)
        .mockRejectedValue(new Error('Generation failed'))
      
      // 第一次调用：失败
      const firstCall = await scheduler.triggerNow()
      expect(firstCall.success).toBe(false)
      expect(firstCall.message).toBe('Generation failed')
      
      // 第二次调用：应该可以执行（标志已重置）
      const secondCall = await scheduler.triggerNow()
      expect(secondCall.success).toBe(false)
      expect(secondCall.message).toBe('Generation failed')  // 同样的错误，但能执行
      
      // 验证调用了两次
      expect(recommendationService.generateRecommendations).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('Phase 7: 自适应间隔调整', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    
    it('应该在连续跳过 3 次后自动增加间隔', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(15)  // 应该是 3 分钟基础间隔
      
      // 模拟一个很慢的任务（永不完成）
      vi.mocked(recommendationService.generateRecommendations)
        .mockReturnValue(new Promise(() => {}) as any)
      
      await scheduler.start()
      vi.clearAllMocks()  // 清除 start() 的调用记录
      
      // 第一次：开始执行慢任务（异步，不等待）
      const firstAlarm = scheduler.handleAlarm()
      await new Promise(resolve => setTimeout(resolve, 10))  // 等待任务开始
      
      // 第二次：跳过（consecutiveSkips = 1）
      await scheduler.handleAlarm()
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(0)  // 还没触发调整
      
      // 第三次：跳过（consecutiveSkips = 2）
      await scheduler.handleAlarm()
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(0)
      
      // 第四次：跳过（consecutiveSkips = 3），触发间隔调整
      await scheduler.handleAlarm()
      
      // 验证间隔被调整（3 分钟 → 6 分钟）
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(1)  // adjustIntervalOnOverload()
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'generate-recommendation',
        { periodInMinutes: 6 }  // 翻倍
      )
    })
    
    it('应该在任务成功执行后重置跳过计数', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)
      
      await scheduler.start()
      vi.clearAllMocks()
      
      // 先模拟一个慢任务导致跳过
      vi.mocked(recommendationService.generateRecommendations)
        .mockReturnValue(new Promise(() => {}) as any)
      
      // 第一次：开始慢任务
      scheduler.handleAlarm()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // 第二次：跳过（consecutiveSkips = 1）
      await scheduler.handleAlarm()
      
      // 第三次：跳过（consecutiveSkips = 2）
      await scheduler.handleAlarm()
      
      // 现在模拟任务快速完成
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: 0
        }
      })
      
      vi.clearAllMocks()
      
      // 第四次：成功执行，应该重置 consecutiveSkips
      await scheduler.handleAlarm()
      
      // 验证成功执行（调用了 reschedule）
      expect(chrome.alarms.clear).toHaveBeenCalled()
      expect(chrome.alarms.create).toHaveBeenCalled()
      
      // 再次模拟慢任务
      vi.mocked(recommendationService.generateRecommendations)
        .mockReturnValue(new Promise(() => {}) as any)
      
      vi.clearAllMocks()
      
      // 重新开始慢任务
      scheduler.handleAlarm()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // 需要再跳过 3 次才会触发调整（因为之前已重置）
      await scheduler.handleAlarm()  // consecutiveSkips = 1
      await scheduler.handleAlarm()  // consecutiveSkips = 2
      await scheduler.handleAlarm()  // consecutiveSkips = 3, 触发调整
      
      // 验证再次触发了间隔调整
      expect(chrome.alarms.clear).toHaveBeenCalled()
      expect(chrome.alarms.create).toHaveBeenCalled()
    })
    
    it('应该逐步恢复间隔到正常值', async () => {
      vi.mocked(getPageCount).mockResolvedValue(LEARNING_COMPLETE_PAGES)
      vi.mocked(getUnrecommendedArticleCount).mockResolvedValue(10)  // 基础间隔 3 分钟
      
      // 直接测试 adjustedInterval 的恢复逻辑
      // 通过反射访问私有属性来设置初始状态
      await scheduler.start()
      
      // 模拟快速任务
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValue({
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: 0
        }
      })
      
      // 手动设置 adjustedInterval（模拟之前已经调整过）
      // @ts-ignore - 访问私有属性用于测试
      scheduler['adjustedInterval'] = 6
      
      vi.clearAllMocks()
      
      // 执行任务，应该触发 reschedule() 并减少间隔
      await scheduler.handleAlarm()
      
      // 验证间隔被更新
      expect(chrome.alarms.clear).toHaveBeenCalled()
      expect(chrome.alarms.create).toHaveBeenCalled()
      
      const newInterval = vi.mocked(chrome.alarms.create).mock.calls[0][1].periodInMinutes
      
      // 验证间隔减少了（6 * 0.8 = 4.8 → 5，但不低于基础间隔 3）
      expect(newInterval).toBeLessThan(6)
      expect(newInterval).toBeGreaterThanOrEqual(3)
    })
  })
})
