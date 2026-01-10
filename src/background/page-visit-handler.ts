/**
 * 页面访问处理模块
 * Phase 12.8: 集中处理页面访问相关逻辑
 */

import { db } from '@/storage/db'
import type { ConfirmedVisit } from '@/types/database'
import { aiManager } from '@/core/ai/AICapabilityManager'
import { detectLanguage } from '@/core/ai/helpers'
import { logger } from '@/utils/logger'
import type { AIAnalysisResult } from '@/types/database'

const bgLogger = logger.withTag('PageVisitHandler')

/**
 * 页面访问数据（从 content script 接收）
 */
export interface PageVisitData {
  url: string
  title: string
  domain: string
  visitTime: number
  duration: number
  interactionCount: number
  source?: 'organic' | 'recommended' | 'search'
  recommendationId?: string
  /** 内容过短时允许跳过学习，但仍触发后续移除逻辑 */
  skipAnalysis?: boolean
  meta: {
    description?: string
    keywords?: string[]
    author?: string
    publishedTime?: string
    ogImage?: string
    canonical?: string
  } | null
  content: string // 去除 HTML 的纯文本
}

/**
 * 处理结果
 */
export interface PageVisitResult {
  success: boolean
  deduplicated: boolean
  error?: string
  analysis?: {
    keywords: string[]
    topics: string[]
    language: string
    provider?: string
    model?: string
    cost?: number
    tokensUsed?: {
      prompt: number
      completion: number
      total: number
    }
  }
}

/**
 * 检查重复访问（30分钟窗口）
 */
export async function checkDuplicate(
  url: string,
  visitTime: number
): Promise<ConfirmedVisit | null> {
  const DEDUP_WINDOW_MS = 30 * 60 * 1000 // 30 分钟
  const windowStart = visitTime - DEDUP_WINDOW_MS

  try {
    const recentVisit = await db.confirmedVisits
      .where('[url+visitTime]')
      .between([url, windowStart], [url, visitTime])
      .reverse()
      .first()

    return recentVisit || null
  } catch (error) {
    bgLogger.error('检查重复访问失败', error)
    return null
  }
}

/**
 * 更新已存在的访问记录
 */
async function updateExistingVisit(
  existingId: string,
  visitTime: number,
  duration: number,
  interactionCount: number
): Promise<void> {
  const existing = await db.confirmedVisits.get(existingId)
  if (!existing) {
    throw new Error(`记录不存在: ${existingId}`)
  }

  await db.confirmedVisits.update(existingId, {
    visitTime,
    duration: existing.duration + duration,
    interactionCount: existing.interactionCount + interactionCount
  })

  bgLogger.info('🔄 更新重复访问记录', {
    id: existingId,
    累计停留: `${existing.duration + duration}秒`
  })
}

/**
 * AI 内容分析
 */
async function performAIAnalysis(
  content: string,
  title: string
): Promise<AIAnalysisResult> {
  // 合并标题和内容，给标题更高权重
  const fullText = title + ' '.repeat(3) + content

  // 检测语言
  const detectedLang = detectLanguage(fullText)
  const language = detectedLang === 'zh' || detectedLang === 'en' ? detectedLang : 'other'

  // 初始化 AI 管理器
  await aiManager.initialize()

  // 使用 pageAnalysis 任务类型
  const aiResult = await aiManager.analyzeContent(fullText, {}, 'pageAnalysis')

  bgLogger.info('🤖 AI 分析完成', {
    provider: aiResult.metadata.provider,
    model: aiResult.metadata.model,
    主题数量: Object.keys(aiResult.topicProbabilities).length,
    cost: aiResult.metadata.cost
  })

  // 从 AI 主题概率提取关键词
  const keywords = Object.entries(aiResult.topicProbabilities)
    .filter(([_, prob]) => prob > 0.05)
    .map(([topic, _]) => topic)
    .slice(0, 20)

  // 提取主题列表
  const topics = Object.entries(aiResult.topicProbabilities)
    .filter(([_, prob]) => prob > 0.1)
    .map(([topic, _]) => topic)

  return {
    keywords: keywords.length > 0 ? keywords : ['other'],
    topics: topics.length > 0 ? topics : ['other'],
    language,
    aiAnalysis: {
      topics: aiResult.topicProbabilities,
      provider: aiResult.metadata.provider,
      model: aiResult.metadata.model,
      timestamp: aiResult.metadata.timestamp,
      cost: aiResult.metadata.cost,
      tokensUsed: aiResult.metadata.tokensUsed
    }
  }
}

/**
 * 处理页面访问
 * 
 * @param data 页面访问数据
 * @returns 处理结果
 */
export async function processPageVisit(
  data: PageVisitData
): Promise<PageVisitResult> {
  try {
    // 0. 若请求明确要求跳过分析，则不进行 AI 与入库，仅返回成功以触发后续流程
    if (data.skipAnalysis === true) {
      bgLogger.debug('⏭️ 跳过内容分析（内容过短或策略要求）', {
        url: data.url,
        title: data.title,
        duration: data.duration,
        interactionCount: data.interactionCount
      })
      return {
        success: true,
        deduplicated: false
      }
    }

    // 1. 检查重复
    const existingVisit = await checkDuplicate(data.url, data.visitTime)

    if (existingVisit) {
      // 重复访问：只更新时间
      await updateExistingVisit(
        existingVisit.id,
        data.visitTime,
        data.duration,
        data.interactionCount
      )

      return {
        success: true,
        deduplicated: true
      }
    }

    // 2. 新访问：进行 AI 分析
    const analysis = await performAIAnalysis(data.content, data.title)

    // 3. 构建完整记录
    const visitRecord: ConfirmedVisit = {
      id: crypto.randomUUID(),
      url: data.url,
      title: data.title,
      domain: data.domain,
      visitTime: data.visitTime,
      duration: data.duration,
      interactionCount: data.interactionCount,
      source: data.source || 'organic',
      recommendationId: data.recommendationId,
      meta: data.meta,
      contentSummary: data.content ? {
        firstParagraph: data.content.substring(0, 500),
        extractedText: data.content.substring(0, 2000),
        wordCount: data.content.split(/\s+/).length,
        language: analysis.language as 'zh' | 'en' | 'other'
      } : null,
      analysis: {
        keywords: analysis.keywords,
        topics: analysis.topics,
        language: analysis.language as 'zh' | 'en' | 'other'
      },
      status: 'qualified',
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
      analysisRetainUntil: -1
    }

    // 4. 保存到数据库
    await db.confirmedVisits.add(visitRecord)

    bgLogger.info('📝 新页面访问记录已保存', {
      url: data.url,
      title: data.title,
      主题: analysis.topics.join(', ')
    })

    // 5. 返回详细结果
    return {
      success: true,
      deduplicated: false,
      analysis: {
        keywords: analysis.keywords,
        topics: analysis.topics,
        language: analysis.language,
        provider: analysis.aiAnalysis?.provider,
        model: analysis.aiAnalysis?.model,
        cost: analysis.aiAnalysis?.cost,
        tokensUsed: analysis.aiAnalysis?.tokensUsed
      }
    }
  } catch (error) {
    bgLogger.error('❌ 处理页面访问失败', error)
    
    return {
      success: false,
      deduplicated: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
