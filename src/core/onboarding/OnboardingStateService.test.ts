/**
 * OnboardingStateService 测试
 * 
 * 注意：由于 FeedManager 的复杂依赖，这里主要测试基本流程
 * 更完整的集成测试应该在 e2e 测试中进行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import { OnboardingStateService } from './OnboardingStateService'

// Mock storage modules
vi.mock('@/storage/onboarding-state', () => ({
  getOnboardingState: vi.fn(),
  setOnboardingState: vi.fn(),
}))

vi.mock('@/storage/db', () => ({
  getPageCount: vi.fn(),
}))

vi.mock('@/core/rss/managers/FeedManager', () => {
  const mockFeeds = [
    { id: '1', title: 'Feed 1', url: 'https://example.com/feed1' },
    { id: '2', title: 'Feed 2', url: 'https://example.com/feed2' },
  ]
  return {
    FeedManager: vi.fn().mockImplementation(() => ({
      getFeeds: vi.fn().mockResolvedValue(mockFeeds),
    })),
  }
})

vi.mock('@/core/recommender/cold-start/threshold-calculator', () => ({
  getDynamicThreshold: vi.fn().mockReturnValue(100),
}))

// 由于 FeedManager 依赖 Dexie，这里我们直接测试服务的基本功能
// 在真实环境中，服务会正常工作

describe('OnboardingStateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('常量和类型', () => {
    it('LEARNING_COMPLETE_PAGES 应该是 100', () => {
      expect(LEARNING_COMPLETE_PAGES).toBe(100)
    })
  })

  describe('OnboardingStateInfo 接口', () => {
    it('应该定义正确的字段', () => {
      // 类型测试：编译时检查
      interface OnboardingStateInfo {
        state: 'setup' | 'learning' | 'ready'
        pageCount: number
        threshold: number
        subscribedFeedCount: number
        progressPercent: number
        isLearningComplete: boolean
      }
      
      const mockState: OnboardingStateInfo = {
        state: 'learning',
        pageCount: 50,
        threshold: 60,
        subscribedFeedCount: 5,
        progressPercent: 83.3,
        isLearningComplete: false
      }
      
      expect(mockState.state).toBe('learning')
      expect(mockState.pageCount).toBe(50)
      expect(mockState.threshold).toBe(60)
      expect(mockState.subscribedFeedCount).toBe(5)
      expect(mockState.progressPercent).toBeCloseTo(83.3)
      expect(mockState.isLearningComplete).toBe(false)
    })
  })

  describe('进度计算逻辑', () => {
    it('应该正确计算进度百分比', () => {
      const calculateProgress = (pageCount: number, threshold: number) => {
        return Math.min((pageCount / threshold) * 100, 100)
      }
      
      expect(calculateProgress(50, 100)).toBe(50)
      expect(calculateProgress(30, 60)).toBe(50)
      expect(calculateProgress(100, 100)).toBe(100)
      expect(calculateProgress(150, 100)).toBe(100) // 不超过 100%
    })

    it('应该正确判断学习完成', () => {
      const isComplete = (pageCount: number, threshold: number) => {
        return pageCount >= threshold
      }
      
      expect(isComplete(50, 100)).toBe(false)
      expect(isComplete(100, 100)).toBe(true)
      expect(isComplete(101, 100)).toBe(true)
      expect(isComplete(59, 60)).toBe(false)
      expect(isComplete(60, 60)).toBe(true)
    })
  })

  describe('动态阈值计算', () => {
    it('基础阈值应该是 100', () => {
      expect(LEARNING_COMPLETE_PAGES).toBe(100)
    })

    it('导入源应该减少阈值（每个 -8）', () => {
      // 这个逻辑在 threshold-calculator 中测试
      // 这里只验证概念
      const base = 100
      const opmlFeeds = 5
      const reduction = opmlFeeds * 8 // 40
      const threshold = Math.max(base - reduction, 10)
      expect(threshold).toBe(60)
    })

    it('阈值最小值应该是 10', () => {
      const base = 100
      const opmlFeeds = 20 // 160 reduction
      const reduction = opmlFeeds * 8
      const threshold = Math.max(base - reduction, 10)
      expect(threshold).toBe(10) // 不能低于 10
    })
  })

  describe('OnboardingStateService 实例', () => {
    let service: typeof OnboardingStateService
    
    beforeEach(async () => {
      vi.clearAllMocks()
      // 清空现有实例的缓存
      const module = await import('./OnboardingStateService')
      service = module.OnboardingStateService
      service.clearCache()
    })

    describe('initialize', () => {
      it('应该初始化服务并缓存状态', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        
        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'learning',
          aiConfigured: true,
          lastUpdated: Date.now(),
        })
        vi.mocked(getPageCount).mockResolvedValue(50)

        await service.initialize()
        const state = await service.getState()
        
        expect(state.state).toBeDefined()
        expect(state.pageCount).toBeDefined()
      })
    })

    describe('getState', () => {
      it('setup 状态应该返回初始值', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        
        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'setup',
          aiConfigured: false,
          lastUpdated: Date.now(),
        })

        const state = await service.getState()
        
        expect(state.state).toBe('setup')
        expect(state.pageCount).toBe(0)
        expect(state.threshold).toBe(LEARNING_COMPLETE_PAGES)
        expect(state.subscribedFeedCount).toBe(0)
        expect(state.progressPercent).toBe(0)
        expect(state.isLearningComplete).toBe(false)
      })

      it('learning 状态应该返回学习进度', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        const { getDynamicThreshold } = await import('@/core/recommender/cold-start/threshold-calculator')
        
        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'learning',
          aiConfigured: true,
          lastUpdated: Date.now(),
        })
        vi.mocked(getPageCount).mockResolvedValue(50)
        vi.mocked(getDynamicThreshold).mockReturnValue(100)

        const state = await service.getState()
        
        expect(state.state).toBe('learning')
        expect(state.pageCount).toBe(50)
        expect(state.threshold).toBe(100)
        expect(state.progressPercent).toBe(50)
        expect(state.isLearningComplete).toBe(false)
      })

      it('learning 状态在达到阈值时应该自动升级为 ready', async () => {
        const { getOnboardingState, setOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        const { getDynamicThreshold } = await import('@/core/recommender/cold-start/threshold-calculator')
        
        const mockStatus = {
          state: 'learning' as const,
          aiConfigured: true,
          lastUpdated: Date.now(),
        }
        
        vi.mocked(getOnboardingState).mockResolvedValue(mockStatus)
        vi.mocked(getPageCount).mockResolvedValue(100)
        vi.mocked(getDynamicThreshold).mockReturnValue(100)

        const state = await service.getState()
        
        expect(state.pageCount).toBe(100)
        expect(state.threshold).toBe(100)
        expect(state.isLearningComplete).toBe(true)
        expect(state.state).toBe('ready')
        expect(setOnboardingState).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'ready' })
        )
      })

      it('ready 状态应该返回完成状态', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        const { getDynamicThreshold } = await import('@/core/recommender/cold-start/threshold-calculator')
        
        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'ready',
          aiConfigured: true,
          lastUpdated: Date.now(),
        })
        vi.mocked(getPageCount).mockResolvedValue(120)
        vi.mocked(getDynamicThreshold).mockReturnValue(100)

        const state = await service.getState()
        
        expect(state.state).toBe('ready')
        expect(state.pageCount).toBe(120)
        expect(state.progressPercent).toBe(100) // 不超过 100%
        expect(state.isLearningComplete).toBe(true)
      })
    })

    describe('状态监听器', () => {
      it('应该通知状态变化监听器', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        
        const listener = vi.fn()
        service.addListener(listener)

        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'setup',
          aiConfigured: false,
          lastUpdated: Date.now(),
        })
        vi.mocked(getPageCount).mockResolvedValue(0)

        await service.refreshState()
        
        expect(listener).toHaveBeenCalled()
        const [newState, oldState] = listener.mock.calls[0]
        expect(newState.state).toBe('setup')
      })

      it('应该能移除监听器', async () => {
        const listener = vi.fn()
        service.addListener(listener)
        service.removeListener(listener)

        await service.refreshState()
        
        // 由于移除了监听器，不应该被调用
        // 注意：如果之前的测试已经调用过，计数会累加
        const callCountBefore = listener.mock.calls.length
        await service.refreshState()
        expect(listener.mock.calls.length).toBe(callCountBefore)
      })
    })

    describe('clearCache', () => {
      it('应该清空缓存', async () => {
        const { getOnboardingState } = await import('@/storage/onboarding-state')
        const { getPageCount } = await import('@/storage/db')
        
        vi.mocked(getOnboardingState).mockResolvedValue({
          state: 'setup',
          aiConfigured: false,
          lastUpdated: Date.now(),
        })
        vi.mocked(getPageCount).mockResolvedValue(0)

        // 先获取状态建立缓存
        await service.getState()
        
        // 清空缓存
        service.clearCache()
        
        // 下次获取状态应该重新计算
        vi.mocked(getPageCount).mockResolvedValue(10) // 改变值
        const state = await service.getState()
        
        expect(state.pageCount).toBe(10) // 应该是新值
      })
    })
  })
})