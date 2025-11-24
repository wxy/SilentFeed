/**
 * 翻译服务
 * 提供基于 AI 的内容翻译功能
 * 
 * 设计思路：
 * - 翻译结果直接存储在推荐条目中，无需独立缓存
 * - 目标语言自动使用界面语言
 * - 源语言由 AI 自动识别
 * - 翻译在推荐生成后、展示前进行
 */

import { aiManager } from "../ai/AICapabilityManager"
import { logger } from "@/utils/logger"

const translationLogger = logger.withTag('Translation')

/**
 * 支持的语言
 */
export type SupportedLanguage = 'zh-CN' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es'

/**
 * 翻译结果
 */
export interface TranslationResult {
  /** 原文语言（由 AI 识别） */
  sourceLanguage: string
  /** 译文语言 */
  targetLanguage: string
  /** 翻译后的文本 */
  translatedText: string
}

/**
 * 翻译服务类
 */
export class TranslationService {
  /**
   * 翻译文本（由 AI 识别源语言并翻译）
   * @param text 原文
   * @param targetLanguage 目标语言
   * @returns 翻译结果（包含识别的源语言和翻译后的文本）
   */
  async translateText(
    text: string,
    targetLanguage: SupportedLanguage
  ): Promise<TranslationResult> {
    try {
      // 初始化 AI Manager
      await aiManager.initialize()
      
      const languageNames: Record<SupportedLanguage, string> = {
        'zh-CN': '简体中文',
        'en': 'English',
        'ja': '日本語',
        'ko': '한국어',
        'fr': 'Français',
        'de': 'Deutsch',
        'es': 'Español'
      }

      const targetLangName = languageNames[targetLanguage] || targetLanguage

      // 构建翻译 prompt，要求 AI 识别源语言并翻译
      const prompt = `请分析以下文本并翻译为${targetLangName}。

要求：
1. 首先识别文本的源语言，用语言代码表示（如 zh-CN, en, ja, ko 等）
2. 如果源语言与目标语言相同，则无需翻译，直接返回原文
3. 翻译时保持原文的语气和风格
4. 如果是标题，翻译后也应该是标题形式

请按以下格式返回结果（严格遵守格式，不要添加其他内容）：
源语言: [语言代码]
译文: [翻译结果]

原文：
${text}`

      // TODO: 当前 analyzeContent 返回主题概率，不适合翻译
      // 需要等待 AICapabilityManager 添加 generateText 方法
      // 临时方案：使用本地语言检测
      const detectedLang = this.detectLanguage(text)
      
      if (detectedLang === targetLanguage) {
        // 源语言与目标语言相同，无需翻译
        return {
          sourceLanguage: detectedLang,
          targetLanguage,
          translatedText: text
        }
      }

      // TODO: 调用 AI 翻译
      translationLogger.warn('AI 翻译功能尚未实现，返回原文')
      
      return {
        sourceLanguage: detectedLang,
        targetLanguage,
        translatedText: text // 临时返回原文
      }
    } catch (error) {
      translationLogger.error('翻译失败:', error)
      
      // 失败时返回原文
      return {
        sourceLanguage: 'unknown',
        targetLanguage,
        translatedText: text
      }
    }
  }

  /**
   * 批量翻译文本
   * @param texts 原文数组
   * @param targetLanguage 目标语言
   * @returns 翻译结果数组
   */
  async translateBatch(
    texts: string[],
    targetLanguage: SupportedLanguage
  ): Promise<TranslationResult[]> {
    const results = await Promise.all(
      texts.map(text => this.translateText(text, targetLanguage))
    )
    return results
  }

  /**
   * 检测文本语言（本地实现，作为 AI 识别的备用方案）
   * @param text 文本
   * @returns 检测到的语言代码
   */
  detectLanguage(text: string): SupportedLanguage {
    // 日文字符（优先检测，因为日文可能包含汉字）
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja'
    }
    
    // 韩文字符
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko'
    }
    
    // 中文字符
    if (/[\u4e00-\u9fa5]/.test(text)) {
      return 'zh-CN'
    }
    
    // 默认为英文
    return 'en'
  }
}
