/**
 * 推荐理由格式化工具
 * 
 * 将结构化推荐理由数据转换为本地化文本
 */

import type { RecommendationReason, ReasonData } from '@/types/recommendation-reason'
import type { TFunction } from 'i18next'

/**
 * 格式化推荐理由
 * 
 * @param reason 推荐理由（字符串或结构化数据）
 * @param t 翻译函数
 * @returns 本地化的推荐理由文本
 */
export function formatRecommendationReason(
  reason: RecommendationReason | undefined,
  t: TFunction
): string {
  try {
    // 如果没有理由或是空字符串，返回默认文本
    if (!reason || (typeof reason === 'string' && reason.trim() === '')) {
      return t('recommendation.reason.unknown')
    }

    // 如果是字符串（旧版本数据），直接返回
    if (typeof reason === 'string') {
      return reason
    }

    // 处理结构化数据
    return formatStructuredReason(reason, t)
  } catch (error) {
    console.error('[formatRecommendationReason] 格式化失败:', error, reason)
    return t('recommendation.reason.unknown')
  }
}

/**
 * 格式化结构化推荐理由
 */
function formatStructuredReason(data: ReasonData, t: TFunction): string {
  const { type, provider, isReasoning, score, topics, interests } = data

  // 1. 生成基础理由部分
  let baseReason = ''
  
  switch (type) {
    case 'topic-match':
      if (topics && topics.length > 0) {
        baseReason = t('recommendation.reason.topicMatch', { 
          topics: topics.join(t('recommendation.reason.topicSeparator')) 
        })
      } else {
        baseReason = t('recommendation.reason.highQuality')
      }
      break
    
    case 'interest-match':
      if (interests && interests.length > 0) {
        baseReason = t('recommendation.reason.interestMatch', { 
          interests: interests.join(t('recommendation.reason.topicSeparator')) 
        })
      } else {
        baseReason = t('recommendation.reason.highQuality')
      }
      break
    
    case 'high-quality':
      baseReason = t('recommendation.reason.highQuality')
      break
    
    case 'browsing-history':
      baseReason = t('recommendation.reason.browsingHistory')
      break
    
    case 'trending':
      baseReason = t('recommendation.reason.trending')
      break
    
    case 'cold-start':
      // 冷启动推荐：使用 params 中的 mainReason 或默认文本
      if (data.params?.mainReason) {
        baseReason = data.params.mainReason
      } else {
        baseReason = t('recommendation.reason.coldStart')
      }
      break
    
    default:
      baseReason = t('recommendation.reason.highQuality')
  }

  // 2. 生成来源标签
  let sourceLabel = ''
  
  if (provider === 'keyword') {
    sourceLabel = t('recommendation.source.algorithm')
  } else if (provider === 'deepseek') {
    sourceLabel = isReasoning 
      ? t('recommendation.source.reasoningAI')
      : t('recommendation.source.smartAI')
  } else if (provider === 'openai') {
    sourceLabel = t('recommendation.source.ai')
  } else if (provider === 'anthropic') {
    sourceLabel = t('recommendation.source.ai')
  } else if (provider === 'chrome-ai') {
    sourceLabel = t('recommendation.source.chromeAI')
  } else {
    sourceLabel = t('recommendation.source.ai')
  }

  // 3. 计算匹配度百分比
  const matchPercent = Math.round(score * 100)

  // 4. 组合完整理由
  return t('recommendation.reason.template', {
    baseReason,
    sourceLabel,
    matchPercent
  })
}

/**
 * 获取推荐理由的纯文本（去除 HTML）
 * 
 * @param reason 推荐理由
 * @param t 翻译函数
 * @returns 纯文本推荐理由
 */
export function getReasonPlainText(
  reason: RecommendationReason | undefined,
  t: TFunction
): string {
  const formatted = formatRecommendationReason(reason, t)
  // 移除 HTML 标签
  return formatted.replace(/<[^>]*>/g, '')
}
