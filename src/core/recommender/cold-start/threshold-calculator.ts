/**
 * 动态冷启动阈值计算器
 * 
 * 根据用户订阅源数量和导入方式动态调整冷启动阈值：
 * - 有 OPML 导入：订阅源本身已体现用户兴趣，可更早开始推荐
 * - 手动发现：需要更多页面浏览来学习用户画像
 * - 混合模式：根据比例调整
 */

import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import type { DiscoveredFeed } from '@/types/rss'

/**
 * 冷启动策略判断结果
 */
export interface ColdStartDecision {
  /** 是否应使用冷启动策略 */
  useColdStart: boolean
  /** 当前有效阈值 */
  effectiveThreshold: number
  /** 原始阈值（无订阅源调整） */
  baseThreshold: number
  /** 决策原因 */
  reason: string
  /** 置信度 (0-1) - 对推荐质量的信心 */
  confidence: number
}

/**
 * 阈值配置
 */
export interface ThresholdConfig {
  /** 基础阈值（无订阅时的默认值） */
  baseThreshold: number
  /** 最小阈值（最激进的推荐策略） */
  minThreshold: number
  /** 每个导入源减少的阈值 */
  importedFeedReduction: number
  /** 每个手动订阅减少的阈值 */
  manualFeedReduction: number
  /** 每个发现源减少的阈值（保守，因为可能是误订阅） */
  discoveredFeedReduction: number
  /** 最少需要的订阅源数量才启用冷启动 */
  minFeedsForColdStart: number
  /** 冷启动策略的最低文章数量要求 */
  minArticlesForColdStart: number
}

const DEFAULT_CONFIG: ThresholdConfig = {
  baseThreshold: LEARNING_COMPLETE_PAGES,  // 默认 100
  minThreshold: 10,                        // 最少浏览 10 页
  importedFeedReduction: 8,                // 每个导入源减少 8 页
  manualFeedReduction: 5,                  // 每个手动订阅减少 5 页
  discoveredFeedReduction: 2,              // 每个发现源减少 2 页
  minFeedsForColdStart: 3,                 // 至少 3 个订阅源
  minArticlesForColdStart: 10              // 至少 10 篇已分析文章
}

/**
 * 计算动态阈值
 * 
 * @param feeds 订阅源列表
 * @param config 配置（可选）
 * @returns 计算后的阈值
 */
export function getDynamicThreshold(
  feeds: DiscoveredFeed[],
  config: Partial<ThresholdConfig> = {}
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  // 只统计已订阅的活跃源
  const subscribedFeeds = feeds.filter(f => f.status === 'subscribed' && f.isActive)
  
  let reduction = 0

  for (const feed of subscribedFeeds) {
    switch (feed.subscriptionSource) {
      case 'imported':
        reduction += cfg.importedFeedReduction
        break
      case 'manual':
        reduction += cfg.manualFeedReduction
        break
      case 'discovered':
        reduction += cfg.discoveredFeedReduction
        break
      default:
        // 未知来源按发现处理
        reduction += cfg.discoveredFeedReduction
    }
  }

  const threshold = Math.max(
    cfg.baseThreshold - reduction,
    cfg.minThreshold
  )

  return threshold
}

/**
 * 判断是否应使用冷启动策略
 * 
 * @param currentPageCount 当前已浏览页面数
 * @param feeds 订阅源列表
 * @param analyzedArticleCount 已分析的文章数量
 * @param config 配置（可选）
 * @returns 冷启动决策
 */
export function shouldUseColdStartStrategy(
  currentPageCount: number,
  feeds: DiscoveredFeed[],
  analyzedArticleCount: number,
  config: Partial<ThresholdConfig> = {}
): ColdStartDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  const subscribedFeeds = feeds.filter(f => f.status === 'subscribed' && f.isActive)
  const baseThreshold = cfg.baseThreshold
  const effectiveThreshold = getDynamicThreshold(feeds, config)

  // 情况 1：已超过有效阈值，使用正常推荐
  if (currentPageCount >= effectiveThreshold) {
    return {
      useColdStart: false,
      effectiveThreshold,
      baseThreshold,
      reason: '用户画像已建立，使用正常推荐策略',
      confidence: 1.0
    }
  }

  // 情况 2：订阅源不足
  if (subscribedFeeds.length < cfg.minFeedsForColdStart) {
    return {
      useColdStart: false,
      effectiveThreshold,
      baseThreshold,
      reason: `订阅源数量不足（当前 ${subscribedFeeds.length}，需要 ${cfg.minFeedsForColdStart}）`,
      confidence: 0.3
    }
  }

  // 情况 3：已分析文章不足
  if (analyzedArticleCount < cfg.minArticlesForColdStart) {
    return {
      useColdStart: false,
      effectiveThreshold,
      baseThreshold,
      reason: `已分析文章不足（当前 ${analyzedArticleCount}，需要 ${cfg.minArticlesForColdStart}）`,
      confidence: 0.3
    }
  }

  // 情况 4：可以使用冷启动
  // 计算置信度：基于订阅源质量和数量
  const importedCount = subscribedFeeds.filter(f => f.subscriptionSource === 'imported').length
  const manualCount = subscribedFeeds.filter(f => f.subscriptionSource === 'manual').length
  
  // 导入源比例高 → 更有信心（用户主动选择的源更能反映兴趣）
  const importRatio = (importedCount + manualCount) / subscribedFeeds.length
  const confidence = Math.min(0.5 + importRatio * 0.4, 0.9)

  const reason = buildColdStartReason(subscribedFeeds, importedCount, manualCount, currentPageCount, effectiveThreshold)

  return {
    useColdStart: true,
    effectiveThreshold,
    baseThreshold,
    reason,
    confidence
  }
}

/**
 * 构建冷启动原因说明
 */
function buildColdStartReason(
  feeds: DiscoveredFeed[],
  importedCount: number,
  manualCount: number,
  pageCount: number,
  threshold: number
): string {
  const parts: string[] = []

  if (importedCount > 0) {
    parts.push(`${importedCount} 个导入源`)
  }
  if (manualCount > 0) {
    parts.push(`${manualCount} 个手动订阅`)
  }

  const progress = Math.round((pageCount / threshold) * 100)
  
  return `基于 ${parts.join('和')}启用冷启动推荐（画像进度 ${progress}%）`
}

/**
 * 获取推荐策略说明（用于 UI 展示）
 */
export function getStrategyDescription(decision: ColdStartDecision): {
  title: string
  description: string
  icon: 'learning' | 'cold-start' | 'normal'
} {
  if (!decision.useColdStart) {
    if (decision.confidence >= 0.8) {
      return {
        title: '个性化推荐',
        description: '基于您的浏览历史和兴趣画像推荐',
        icon: 'normal'
      }
    }
    return {
      title: '学习阶段',
      description: decision.reason,
      icon: 'learning'
    }
  }

  return {
    title: '智能冷启动',
    description: '基于您的订阅偏好发现感兴趣的内容',
    icon: 'cold-start'
  }
}
