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

import { getAIConfig } from "@/storage/ai-config"
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
      // 获取 AI 配置
      const aiConfig = await getAIConfig()
      
      // 如果 AI 未启用或没有配置 API Key，使用本地检测
      const hasApiKey = aiConfig.apiKeys?.openai || aiConfig.apiKeys?.deepseek
      if (!aiConfig.enabled || !hasApiKey) {
        translationLogger.warn('AI 未配置，无法翻译')
        const detectedLang = this.detectLanguage(text)
        return {
          sourceLanguage: detectedLang,
          targetLanguage,
          translatedText: text // 返回原文
        }
      }
      
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

      // 调用 AI API（优先使用 DeepSeek，因为翻译成本较低）
      const provider = aiConfig.provider || 'deepseek'
      const apiKey = provider === 'deepseek' 
        ? aiConfig.apiKeys.deepseek 
        : aiConfig.apiKeys.openai
      
      if (!apiKey) {
        translationLogger.warn(`${provider} API Key 未配置`)
        const detectedLang = this.detectLanguage(text)
        return {
          sourceLanguage: detectedLang,
          targetLanguage,
          translatedText: text
        }
      }
      
      const endpoint = provider === 'deepseek' 
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions'
      
      const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3 // 较低的温度以保证翻译稳定性
        })
      })

      if (!response.ok) {
        throw new Error(`AI API 请求失败: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices[0]?.message?.content || ''

      // 解析返回内容
      const sourceLangMatch = content.match(/源语言:\s*([a-zA-Z-]+)/)
      const translationMatch = content.match(/译文:\s*(.+)/)

      const sourceLanguage = sourceLangMatch?.[1] || this.detectLanguage(text)
      const translatedText = translationMatch?.[1]?.trim() || text

      return {
        sourceLanguage,
        targetLanguage,
        translatedText
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
