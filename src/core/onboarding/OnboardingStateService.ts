/**
 * OnboardingStateService - 全局阶段状态管理服务
 * 
 * 职责：
 * 1. 统一计算当前阶段状态（setup/learning/ready）
 * 2. 统一计算动态阈值和进度
 * 3. 提供状态变化的监听和通知机制
 * 4. 供 Popup、IconManager、Scheduler 等组件使用
 * 
 * 状态定义：
 * - setup: 未配置 AI，需要引导
 * - learning: 已配置，正在收集用户画像（页面数 < 动态阈值）
 * - ready: 学习完成，可以推荐（页面数 >= 动态阈值）
 * 
 * 动态阈值计算：
 * - 基础值：100 页
 * - 每个 OPML 导入源：-8 页
 * - 每个手动添加源：-5 页
 * - 最小值：10 页
 */

import { logger } from '@/utils/logger'
import { getOnboardingState, setOnboardingState, type OnboardingStatus, type OnboardingState } from '@/storage/onboarding-state'
import { getPageCount } from '@/storage/db'
import { FeedManager } from '@/core/rss/managers/FeedManager'
import { getDynamicThreshold } from '@/core/recommender/cold-start/threshold-calculator'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import { isAIConfigured } from '@/storage/ai-config'

const stateLogger = logger.withTag('OnboardingStateService')

/**
 * 完整的阶段状态信息
 */
export interface OnboardingStateInfo {
  /** 当前阶段 */
  state: OnboardingState
  
  /** 当前学习页数 */
  pageCount: number
  
  /** 动态阈值（需要达到的页数） */
  threshold: number
  
  /** 订阅源数量 */
  subscribedFeedCount: number
  
  /** 学习进度百分比 (0-100) */
  progressPercent: number
  
  /** 是否已完成学习（可以推荐） */
  isLearningComplete: boolean
  
  /** 是否已配置 AI 服务商（远程 API Key） */
  isAIConfigured: boolean
}

/**
 * 状态变化监听器
 */
type StateChangeListener = (newState: OnboardingStateInfo, oldState: OnboardingStateInfo | null) => void

/**
 * 全局阶段状态服务
 */
class OnboardingStateServiceImpl {
  private listeners: Set<StateChangeListener> = new Set()
  private cachedState: OnboardingStateInfo | null = null
  private isInitialized = false
  
  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    stateLogger.info('初始化 OnboardingStateService...')
    
    // 首次加载状态
    await this.refreshState()
    
    this.isInitialized = true
    stateLogger.info('✅ OnboardingStateService 初始化完成')
  }
  
  /**
   * 获取当前完整状态信息
   * 如果缓存可用则返回缓存，否则重新计算
   */
  async getState(): Promise<OnboardingStateInfo> {
    if (this.cachedState) {
      return this.cachedState
    }
    
    return this.refreshState()
  }
  
  /**
   * 强制刷新状态（从数据库重新计算）
   * 当页面数变化、订阅源变化时调用
   */
  async refreshState(): Promise<OnboardingStateInfo> {
    const oldState = this.cachedState
    
    try {
      // 1. 获取基础 onboarding 状态
      const status = await getOnboardingState()
      
      // 2. 检查 AI 配置状态
      const aiConfigured = await isAIConfigured()
      
      // 3. 如果是 setup 状态，返回初始值
      if (status.state === 'setup') {
        const newState: OnboardingStateInfo = {
          state: 'setup',
          pageCount: 0,
          threshold: LEARNING_COMPLETE_PAGES,
          subscribedFeedCount: 0,
          progressPercent: 0,
          isLearningComplete: false,
          isAIConfigured: aiConfigured
        }
        this.cachedState = newState
        this.notifyListeners(newState, oldState)
        return newState
      }
      
      // 3. 获取页面数
      const pageCount = await getPageCount()
      
      // 4. 获取订阅源，计算动态阈值
      const feedManager = new FeedManager()
      const subscribedFeeds = await feedManager.getFeeds('subscribed')
      const threshold = getDynamicThreshold(subscribedFeeds)
      
      // 5. 计算进度
      const progressPercent = Math.min((pageCount / threshold) * 100, 100)
      const isLearningComplete = pageCount >= threshold
      
      // 6. 自动状态转换：如果学习完成但状态仍是 learning，升级到 ready
      let finalState = status.state
      if (status.state === 'learning' && isLearningComplete) {
        stateLogger.info(`🎉 学习完成！页面数 ${pageCount} >= 阈值 ${threshold}，自动进入 ready 状态`)
        await setOnboardingState({ ...status, state: 'ready' })
        finalState = 'ready'
      }
      
      const newState: OnboardingStateInfo = {
        state: finalState,
        pageCount,
        threshold,
        subscribedFeedCount: subscribedFeeds.length,
        progressPercent,
        isLearningComplete,
        isAIConfigured: aiConfigured
      }
      
      this.cachedState = newState
      this.notifyListeners(newState, oldState)
      
      // 日志：显示动态阈值和基础阈值，便于理解
      const baseThreshold = LEARNING_COMPLETE_PAGES
      if (threshold !== baseThreshold) {
        stateLogger.debug(`状态刷新: ${finalState}, 进度: ${pageCount}/${threshold} (基础${baseThreshold}, ${progressPercent.toFixed(1)}%)`)
      } else {
        stateLogger.debug(`状态刷新: ${finalState}, 进度: ${pageCount}/${threshold} (${progressPercent.toFixed(1)}%)`)
      }
      
      return newState
    } catch (error) {
      stateLogger.error('刷新状态失败:', error)
      
      // 返回安全的默认状态
      const fallbackState: OnboardingStateInfo = {
        state: 'setup',
        pageCount: 0,
        threshold: LEARNING_COMPLETE_PAGES,
        subscribedFeedCount: 0,
        progressPercent: 0,
        isLearningComplete: false,
        isAIConfigured: false
      }
      
      return fallbackState
    }
  }
  
  /**
   * 手动设置状态（用于引导流程）
   */
  async setState(state: OnboardingState): Promise<void> {
    const currentStatus = await getOnboardingState()
    await setOnboardingState({ ...currentStatus, state })
    
    // 刷新缓存并通知
    await this.refreshState()
    
    stateLogger.info(`手动设置状态为: ${state}`)
  }
  
  /**
   * 增加页面计数后刷新状态
   * 这个方法用于页面访问记录后更新状态
   */
  async onPageVisited(): Promise<OnboardingStateInfo> {
    // 清除缓存，强制重新计算
    this.cachedState = null
    return this.refreshState()
  }
  
  /**
   * 订阅源变化后刷新状态
   * 当用户添加/删除/导入订阅源时调用
   */
  async onFeedsChanged(): Promise<OnboardingStateInfo> {
    // 清除缓存，强制重新计算
    this.cachedState = null
    return this.refreshState()
  }
  
  /**
   * 添加状态变化监听器
   */
  addListener(listener: StateChangeListener): () => void {
    this.listeners.add(listener)
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener)
    }
  }
  
  /**
   * 移除状态变化监听器
   */
  removeListener(listener: StateChangeListener): void {
    this.listeners.delete(listener)
  }
  
  /**
   * 通知所有监听器
   */
  private notifyListeners(newState: OnboardingStateInfo, oldState: OnboardingStateInfo | null): void {
    // 检查状态是否真正变化
    if (oldState && oldState.state === newState.state && oldState.pageCount === newState.pageCount) {
      return
    }
    
    for (const listener of this.listeners) {
      try {
        listener(newState, oldState)
      } catch (error) {
        stateLogger.error('状态变化监听器执行失败:', error)
      }
    }
  }
  
  /**
   * 获取缓存的状态（同步方法，可能为 null）
   */
  getCachedState(): OnboardingStateInfo | null {
    return this.cachedState
  }
  
  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedState = null
  }
}

// 导出单例
export const OnboardingStateService = new OnboardingStateServiceImpl()

// 导出类型
export type { OnboardingState, OnboardingStatus }
