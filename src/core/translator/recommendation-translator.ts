/**
 * 推荐条目翻译辅助函数
 * 
 * 在推荐生成后、展示前翻译标题和摘要
 */

import type { Recommendation } from "@/types/database"
import type { SupportedLanguage } from "./TranslationService"
import { TranslationService } from "./TranslationService"
import { getUIConfig } from "@/storage/ui-config"
import { logger } from "@/utils/logger"

const translationLogger = logger.withTag('RecommendationTranslator')

/**
 * 获取当前界面语言
 * @returns 界面语言代码
 */
function getCurrentLanguage(): SupportedLanguage {
  // 从 i18n 或浏览器语言获取
  const lang = typeof navigator !== 'undefined' 
    ? navigator.language.toLowerCase() 
    : 'zh-cn'
  
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('es')) return 'es'
  return 'en'
}

/**
 * 翻译单个推荐条目
 * @param recommendation 推荐条目
 * @returns 翻译后的推荐条目（如果启用翻译且需要翻译）
 */
export async function translateRecommendation(
  recommendation: Recommendation
): Promise<Recommendation> {
  try {
    // 1. 检查是否启用自动翻译
    const config = await getUIConfig()
    if (!config.autoTranslate) {
      return recommendation
    }

    // 2. 获取目标语言（界面语言）
    const targetLanguage = getCurrentLanguage()

    // 3. 翻译标题和摘要
    const translator = new TranslationService()
    
    const [titleResult, summaryResult] = await Promise.all([
      translator.translateText(recommendation.title, targetLanguage),
      translator.translateText(recommendation.summary || recommendation.excerpt || '', targetLanguage)
    ])

    // 4. 如果源语言与目标语言相同，无需存储翻译
    if (titleResult.sourceLanguage === targetLanguage) {
      translationLogger.debug(`推荐 ${recommendation.id} 无需翻译（已是目标语言）`)
      return recommendation
    }

    // 5. 存储翻译结果
    const translatedRecommendation: Recommendation = {
      ...recommendation,
      translation: {
        sourceLanguage: titleResult.sourceLanguage,
        targetLanguage,
        translatedTitle: titleResult.translatedText,
        translatedSummary: summaryResult.translatedText,
        translatedAt: Date.now()
      }
    }

    translationLogger.info(`推荐 ${recommendation.id} 已翻译: ${titleResult.sourceLanguage} → ${targetLanguage}`)
    return translatedRecommendation
  } catch (error) {
    translationLogger.error('翻译推荐失败:', error)
    return recommendation // 失败时返回原推荐
  }
}

/**
 * 批量翻译推荐条目
 * @param recommendations 推荐条目数组
 * @returns 翻译后的推荐条目数组
 */
export async function translateRecommendations(
  recommendations: Recommendation[]
): Promise<Recommendation[]> {
  try {
    // 1. 检查是否启用自动翻译
    const config = await getUIConfig()
    if (!config.autoTranslate) {
      return recommendations
    }

    // 2. 批量翻译
    const translated = await Promise.all(
      recommendations.map(rec => translateRecommendation(rec))
    )

    return translated
  } catch (error) {
    translationLogger.error('批量翻译推荐失败:', error)
    return recommendations // 失败时返回原推荐
  }
}

/**
 * 获取推荐的显示文本（自动选择原文或译文）
 * @param recommendation 推荐条目
 * @param showOriginal 是否强制显示原文（默认 false）
 * @returns 显示文本对象
 */
export function getDisplayText(
  recommendation: Recommendation,
  showOriginal = false
): {
  title: string
  summary: string
  language: string
  hasTranslation: boolean
} {
  const hasTranslation = !!recommendation.translation

  if (!hasTranslation || showOriginal) {
    return {
      title: recommendation.title,
      summary: recommendation.summary || recommendation.excerpt || '',
      language: recommendation.translation?.sourceLanguage || 'unknown',
      hasTranslation
    }
  }

  return {
    title: recommendation.translation!.translatedTitle,
    summary: recommendation.translation!.translatedSummary,
    language: recommendation.translation!.targetLanguage,
    hasTranslation
  }
}
