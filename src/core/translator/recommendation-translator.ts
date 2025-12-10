/**
 * 推荐条目翻译辅助函数
 * 
 * 在推荐生成后、展示前翻译标题和摘要
 */

import type { Recommendation } from "@/types/database"
import type { SupportedLanguage } from "./TranslationService"
import { TranslationService } from "./TranslationService"
import { getUIConfig } from "@/storage/ui-config"
import { logger, isNetworkError } from "@/utils/logger"
import i18n from "@/i18n"
import { db } from '@/storage/db'

const translationLogger = logger.withTag('RecommendationTranslator')

/**
 * 获取当前界面语言（从用户设置，而非浏览器语言）
 * @returns 界面语言代码
 */
function getCurrentLanguage(): SupportedLanguage {
  // ⚠️ 关键：从 i18n 获取用户选择的界面语言，而不是 navigator.language
  // 因为用户可能在设置中切换了语言，应该以用户设置为准
  const lang = i18n.language?.toLowerCase() || 'en'
  
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('es')) return 'es'
  return 'en'
}

/**
 * 格式化语言代码为显示标签
 * @param langCode 语言代码（如 zh-CN, en, ja）
 * @returns 显示标签（如 ZH, EN, JA）
 */
export function formatLanguageLabel(langCode: string): string {
  const code = langCode.toUpperCase()
  // 简化中文代码
  if (code.startsWith('ZH')) return 'ZH'
  // 其他语言取前两位
  return code.substring(0, 2)
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
 * 即时翻译推荐（兜底策略）
 * 用于在显示时发现推荐没有翻译时即时翻译
 * 
 * @param recommendation 推荐条目
 * @returns 翻译后的推荐条目
 */
export async function translateOnDemand(
  recommendation: Recommendation
): Promise<Recommendation> {
  try {
    const translated = await translateRecommendation(recommendation)
    
    // 如果翻译成功，更新数据库
    if (translated.translation) {
      await db.recommendations.update(recommendation.id, {
        translation: translated.translation
      })
    }
    
    return translated
  } catch (error) {
    // 网络错误是临时性的，使用 warn 级别
    if (isNetworkError(error)) {
      translationLogger.warn('⚠️ 即时翻译服务暂时不可用（网络问题），显示原文', error)
    } else {
      translationLogger.error('❌ 即时翻译失败', error)
    }
    return recommendation
  }
}

/**
 * 显示文本结果
 */
export interface DisplayTextResult {
  title: string
  summary: string
  /** 当前显示的语言代码 */
  currentLanguage: string
  /** 原文语言代码 */
  sourceLanguage: string
  /** 目标语言代码（翻译语言） */
  targetLanguage?: string
  /** 是否有翻译 */
  hasTranslation: boolean
  /** 是否正在显示原文 */
  isShowingOriginal: boolean
  /** 是否需要即时翻译（兜底策略） */
  needsTranslation: boolean
}

/**
 * 获取推荐的显示文本（自动选择原文或译文）
 * 
 * 兜底策略：
 * 1. 如果启用了自动翻译但推荐没有翻译 → needsTranslation = true（由组件处理即时翻译）
 * 2. 如果禁用了自动翻译 → 始终显示原文，即使有翻译
 * 
 * @param recommendation 推荐条目
 * @param showOriginal 是否强制显示原文（默认 false）
 * @param autoTranslateEnabled 是否启用自动翻译（从 UI 配置获取）
 * @returns 显示文本对象
 */
export function getDisplayText(
  recommendation: Recommendation,
  showOriginal = false,
  autoTranslateEnabled = false
): DisplayTextResult {
  const hasTranslation = !!recommendation.translation
  
  // 检测源语言（如果没有翻译信息）
  const detectSourceLanguage = (): string => {
    if (recommendation.translation?.sourceLanguage) {
      return recommendation.translation.sourceLanguage
    }
    
    // 简单的语言检测
    const text = recommendation.title
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
    if (/[\uac00-\ud7af]/.test(text)) return 'ko'
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh-CN'
    return 'en'
  }
  
  const sourceLanguage = detectSourceLanguage()
  const targetLanguage = getCurrentLanguage()
  
  // 【优先判断】如果源语言等于目标语言，直接显示原文（无需翻译）
  if (sourceLanguage === targetLanguage) {
    return {
      title: recommendation.title,
      summary: recommendation.summary || recommendation.excerpt || '',
      currentLanguage: sourceLanguage,
      sourceLanguage,
      targetLanguage: undefined, // 不需要目标语言
      hasTranslation,
      isShowingOriginal: true,
      needsTranslation: false
    }
  }
  
  // 如果禁用了自动翻译，始终显示原文
  if (!autoTranslateEnabled) {
    return {
      title: recommendation.title,
      summary: recommendation.summary || recommendation.excerpt || '',
      currentLanguage: sourceLanguage,
      sourceLanguage,
      targetLanguage: undefined,
      hasTranslation,
      isShowingOriginal: true,
      needsTranslation: false
    }
  }
  
  // 检查翻译是否匹配当前目标语言
  const hasMatchingTranslation = hasTranslation && 
    recommendation.translation!.targetLanguage === targetLanguage
  
  // 如果启用了自动翻译但没有匹配的翻译 → 需要即时翻译
  if (autoTranslateEnabled && !hasMatchingTranslation && sourceLanguage !== targetLanguage) {
    return {
      title: recommendation.title,
      summary: recommendation.summary || recommendation.excerpt || '',
      currentLanguage: sourceLanguage,
      sourceLanguage,
      targetLanguage,
      hasTranslation: false,
      isShowingOriginal: true,
      needsTranslation: true // 触发即时翻译（包括覆盖旧翻译）
    }
  }
  
  // 如果用户主动选择显示原文
  if (showOriginal) {
    return {
      title: recommendation.title,
      summary: recommendation.summary || recommendation.excerpt || '',
      currentLanguage: sourceLanguage,
      sourceLanguage,
      targetLanguage: recommendation.translation?.targetLanguage,
      hasTranslation,
      isShowingOriginal: true,
      needsTranslation: false
    }
  }
  
  // 显示翻译文本（仅当翻译匹配当前目标语言时）
  if (hasMatchingTranslation) {
    return {
      title: recommendation.translation!.translatedTitle,
      summary: recommendation.translation!.translatedSummary,
      currentLanguage: recommendation.translation!.targetLanguage,
      sourceLanguage,
      targetLanguage: recommendation.translation!.targetLanguage,
      hasTranslation: true,
      isShowingOriginal: false,
      needsTranslation: false
    }
  }
  
  // 默认显示原文
  return {
    title: recommendation.title,
    summary: recommendation.summary || recommendation.excerpt || '',
    currentLanguage: sourceLanguage,
    sourceLanguage,
    targetLanguage: undefined,
    hasTranslation: false,
    isShowingOriginal: true,
    needsTranslation: false
  }
}
