/**
 * 提示词管理器
 * 
 * 负责加载和管理多语言提示词模板
 * 
 * @module core/ai/prompts
 */

import type { PromptTemplates, PromptTemplate, PromptVariables } from './types'
import zhCNTemplates from './templates/zh-CN.json'
import enTemplates from './templates/en.json'

/**
 * 支持的语言列表
 */
export type SupportedLanguage = 'zh-CN' | 'en'

/**
 * 提示词管理器
 */
export class PromptManager {
  private templates: Map<SupportedLanguage, PromptTemplates>
  
  constructor() {
    this.templates = new Map()
    // 预加载所有语言的模板
    this.templates.set('zh-CN', zhCNTemplates as PromptTemplates)
    this.templates.set('en', enTemplates as PromptTemplates)
  }
  
  /**
   * 获取指定语言的提示词模板
   * 
   * @param language - 语言代码
   * @returns 提示词模板集合
   */
  getTemplates(language: SupportedLanguage): PromptTemplates {
    const templates = this.templates.get(language)
    if (!templates) {
      // 如果找不到指定语言，回退到中文
      console.warn(`提示词模板不存在: ${language}，使用中文模板`)
      return this.templates.get('zh-CN')!
    }
    return templates
  }
  
  /**
   * 渲染提示词模板（变量替换）
   * 
   * @param template - 提示词模板
   * @param variables - 变量值
   * @returns 渲染后的提示词
   */
  render(template: PromptTemplate, variables: PromptVariables): string {
    let prompt = template.user
    
    // 替换简单变量
    if (variables.content) {
      prompt = prompt.replace(/\{\{content\}\}/g, variables.content)
    }
    
    if (variables.behaviorSummary) {
      prompt = prompt.replace(/\{\{behaviorSummary\}\}/g, variables.behaviorSummary)
    }
    
    // 替换用户画像变量
    const profile = variables.userProfile || variables.currentProfile
    if (profile) {
      prompt = prompt.replace(/\{\{interests\}\}/g, profile.interests)
      prompt = prompt.replace(/\{\{preferences\}\}/g, profile.preferences.join('、'))
      prompt = prompt.replace(/\{\{avoidTopics\}\}/g, profile.avoidTopics.join('、'))
    }
    
    // 处理条件渲染：{{#originalTitle}}...{{/originalTitle}}
    if (variables.originalTitle) {
      // 有原标题：显示条件块内容，并替换 {{originalTitle}} 变量
      prompt = prompt.replace(/\{\{#originalTitle\}\}([\s\S]*?)\{\{\/originalTitle\}\}/g, '$1')
      prompt = prompt.replace(/\{\{originalTitle\}\}/g, variables.originalTitle)
    } else {
      // 无原标题：移除条件块
      prompt = prompt.replace(/\{\{#originalTitle\}\}[\s\S]*?\{\{\/originalTitle\}\}/g, '')
    }
    
    return prompt
  }
  
  /**
   * 获取内容分析提示词
   * 
   * @param language - 语言
   * @param content - 文章内容
   * @param userProfile - 用户画像（可选）
   * @param useReasoning - 是否使用推理模式
   * @param originalTitle - 原文标题（可选，用于翻译）
   * @returns 渲染后的提示词
   */
  getAnalyzeContentPrompt(
    language: SupportedLanguage,
    content: string,
    userProfile?: PromptVariables['userProfile'],
    useReasoning = false,
    originalTitle?: string
  ): string {
    const templates = this.getTemplates(language)
    const analyzeTemplates = useReasoning 
      ? templates.analyzeContentReasoning 
      : templates.analyzeContent
    
    const template = userProfile 
      ? analyzeTemplates.withProfile 
      : analyzeTemplates.withoutProfile
    
    return this.render(template, { content, userProfile, originalTitle })
  }
  
  /**
   * 获取用户画像生成提示词（全量）
   * 
   * @param language - 语言
   * @param behaviorSummary - 行为摘要
   * @returns 渲染后的提示词
   */
  getGenerateProfileFullPrompt(
    language: SupportedLanguage,
    behaviorSummary: string
  ): string {
    const templates = this.getTemplates(language)
    return this.render(templates.generateProfileFull, { behaviorSummary })
  }
  
  /**
   * 获取用户画像生成提示词（增量）
   * 
   * @param language - 语言
   * @param behaviorSummary - 行为摘要
   * @param currentProfile - 当前画像
   * @returns 渲染后的提示词
   */
  getGenerateProfileIncrementalPrompt(
    language: SupportedLanguage,
    behaviorSummary: string,
    currentProfile: PromptVariables['currentProfile']
  ): string {
    const templates = this.getTemplates(language)
    return this.render(templates.generateProfileIncremental, { 
      behaviorSummary, 
      currentProfile 
    })
  }
  
  /**
   * 获取订阅源质量分析提示词（添加订阅源时使用）
   * 
   * @param language - 语言
   * @param feedTitle - 订阅源名称
   * @param feedDescription - 订阅源描述
   * @param feedLink - 订阅源链接
   * @param sampleArticles - 样本文章列表（JSON格式字符串）
   * @returns 渲染后的提示词
   */
  getSourceAnalysisPrompt(
    language: SupportedLanguage,
    feedTitle: string,
    feedDescription: string,
    feedLink: string,
    sampleArticles: string
  ): string {
    const templates = this.getTemplates(language)
    
    // 如果模板不存在，返回默认提示词
    if (!templates.sourceAnalysis) {
      return this.getDefaultSourceAnalysisPrompt(feedTitle, feedDescription, feedLink, sampleArticles)
    }
    
    return this.renderSourceAnalysisTemplate(templates.sourceAnalysis, {
      feedTitle,
      feedDescription,
      feedLink,
      sampleArticles
    })
  }
  
  /**
   * 渲染订阅源分析模板
   */
  private renderSourceAnalysisTemplate(
    template: PromptTemplate,
    variables: {
      feedTitle: string
      feedDescription: string
      feedLink: string
      sampleArticles: string
    }
  ): string {
    let prompt = template.user
    prompt = prompt.replace(/\{\{feedTitle\}\}/g, variables.feedTitle)
    prompt = prompt.replace(/\{\{feedDescription\}\}/g, variables.feedDescription || '无描述')
    prompt = prompt.replace(/\{\{feedLink\}\}/g, variables.feedLink)
    prompt = prompt.replace(/\{\{sampleArticles\}\}/g, variables.sampleArticles)
    return prompt
  }
  
  /**
   * 默认订阅源分析提示词（降级用）
   */
  private getDefaultSourceAnalysisPrompt(
    feedTitle: string,
    feedDescription: string,
    feedLink: string,
    sampleArticles: string
  ): string {
    return `Analyze the quality of this RSS feed for subscription:
Name: ${feedTitle}
Description: ${feedDescription || 'No description'}
Link: ${feedLink}

Sample Articles:
${sampleArticles}

Return JSON with this exact format (summary must be a JSON string):
{
  "topics": {
    "main category": 1.0
  },
  "summary": "{\\"category\\":\\"tech\\",\\"language\\":\\"en\\",\\"originality\\":70,\\"informationDensity\\":70,\\"clickbaitScore\\":30,\\"spamScore\\":20,\\"reasoning\\":\\"Brief analysis\\"}"
}

Categories: tech, news, finance, lifestyle, entertainment, education, science, sports, gaming, design, business, health, travel, food, photography, music, art, politics, culture, other
Languages: zh-CN, zh-TW, en, ja, ko, fr, de, es, ru, pt, it, ar, unknown

Output JSON only.`
  }
}

/**
 * 全局提示词管理器实例
 */
export const promptManager = new PromptManager()
