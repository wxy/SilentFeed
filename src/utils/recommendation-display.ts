/**
 * 推荐显示工具函数
 * Phase 15: 简化阅读清单模式
 * 
 * 提供统一的 URL 决策逻辑，供弹窗和阅读清单模式使用
 * 避免重复实现 URL 决策逻辑
 */

import type { Recommendation } from '@/types/database'
import { ReadingListManager } from '@/core/reading-list/reading-list-manager'
import { logger } from './logger'

const displayLogger = logger.withTag('RecommendationDisplay')

/**
 * URL 显示决策
 * 
 * 根据推荐数据和配置决定应该使用原文链接还是翻译链接
 * 
 * 决策逻辑：
 * 1. 订阅源禁用翻译 → 原文链接
 * 2. 全局翻译启用 + 推荐已翻译 → 翻译链接
 * 3. 其他情况 → 原文链接
 */
export function decideUrlForDisplay(
  recommendation: Recommendation,
  config: {
    autoTranslate: boolean
    interfaceLanguage: string
    feedUseGoogleTranslate: boolean
  }
): {
  url: string
  title: string
  isTranslated: boolean
} {
  // 基础 URL（规范化后的原始 URL）
  const baseUrl = ReadingListManager.normalizeUrlForTracking(recommendation.url)

  // 情况1：订阅源禁用翻译
  if (!config.feedUseGoogleTranslate) {
    displayLogger.debug('订阅源禁用翻译，使用原文链接', {
      recommendationId: recommendation.id,
      title: recommendation.title
    })
    return {
      url: baseUrl,
      title: recommendation.title,
      isTranslated: false
    }
  }

  // 情况2：启用自动翻译 + 推荐已翻译
  if (config.autoTranslate && recommendation.translation) {
    const encodedUrl = encodeURIComponent(baseUrl)
    const translatedUrl = `https://translate.google.com/translate?sl=auto&tl=${config.interfaceLanguage}&u=${encodedUrl}`

    displayLogger.debug('使用翻译链接', {
      recommendationId: recommendation.id,
      sourceLanguage: recommendation.translation.sourceLanguage,
      targetLanguage: config.interfaceLanguage
    })

    return {
      url: translatedUrl,
      title: recommendation.translation.translatedTitle,
      isTranslated: true
    }
  }

  // 情况3：其他情况使用原文
  displayLogger.debug('使用原文链接', {
    recommendationId: recommendation.id,
    reason: `autoTranslate=${config.autoTranslate}, hasTranslation=${!!recommendation.translation}`
  })

  return {
    url: baseUrl,
    title: recommendation.title,
    isTranslated: false
  }
}

/**
 * 为清单条目决策 URL 和标题
 * 
 * 包含错误处理和兜底逻辑
 */
export async function decideUrlForReadingListEntry(
  recommendation: Recommendation,
  config: {
    autoTranslate: boolean
    interfaceLanguage: string
  }
): Promise<{
  url: string
  title: string
}> {
  try {
    // 获取订阅源翻译设置
    let feedUseGoogleTranslate = true

    if (recommendation.sourceUrl) {
      try {
        const { FeedManager } = await import('@/core/rss/managers/FeedManager')
        const feedManager = new FeedManager()
        const feed = await feedManager.getFeedByUrl(recommendation.sourceUrl)

        if (feed) {
          feedUseGoogleTranslate = feed.useGoogleTranslate !== false
        }
      } catch (error) {
        displayLogger.warn('查询订阅源翻译设置失败，使用默认值', {
          sourceUrl: recommendation.sourceUrl,
          error
        })
      }
    }

    const { url, title } = decideUrlForDisplay(recommendation, {
      autoTranslate: config.autoTranslate,
      interfaceLanguage: config.interfaceLanguage,
      feedUseGoogleTranslate
    })

    return { url, title }
  } catch (error) {
    displayLogger.error('决策 URL 失败，使用兜底方案', { error })

    // 兜底：返回原文链接
    return {
      url: ReadingListManager.normalizeUrlForTracking(recommendation.url),
      title: recommendation.title
    }
  }
}
