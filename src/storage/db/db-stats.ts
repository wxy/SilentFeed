/**
 * 数据库统计查询模块
 * 
 * 提供各类统计数据查询功能：
 * - 推荐统计
 * - 存储统计
 * - 分析统计
 * - AI 分析统计
 * - RSS 文章统计
 * - 推荐漏斗统计
 */

import type { RecommendationStats, StorageStats } from "@/types/database"
import { db } from './index'
import { statsCache } from '@/utils/cache'
import { logger } from '@/utils/logger'

const dbLogger = logger.withTag('DB')
const statsLogger = logger.withTag('AnalysisStats')

/**
 * Phase 2.7: 获取推荐统计信息
 * 
 * Phase 7: 支持选择统计范围
 * 
 * @param days - 统计最近 N 天的数据（默认 7 天）
 * @param onlyActive - 是否只统计活跃推荐（默认 false）
 * @returns 推荐统计数据
 */
export async function getRecommendationStats(
  days: number = 7, 
  onlyActive: boolean = false
): Promise<RecommendationStats> {
  return statsCache.get(
    `rec-stats-${days}d-${onlyActive ? 'active' : 'all'}`,
    async () => {
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
      
      // 查询最近 N 天的推荐记录
      let recentRecommendations = await db.recommendations
        .where('recommendedAt')
        .above(cutoffTime)
        .toArray()
      
      // Phase 7: 如果只统计活跃推荐，过滤掉非活跃状态
      if (onlyActive) {
        recentRecommendations = recentRecommendations.filter(r => 
          !r.status || r.status === 'active'
        )
      }
      
      const total = recentRecommendations.length
      const read = recentRecommendations.filter(r => r.isRead).length
      const dismissed = recentRecommendations.filter(r => 
        r.feedback === 'dismissed' || r.status === 'dismissed'
      ).length
      
      // 计算有效性
      const effective = recentRecommendations.filter(
        r => r.effectiveness === 'effective'
      ).length
      const neutral = recentRecommendations.filter(
        r => r.effectiveness === 'neutral'
      ).length
      const ineffective = recentRecommendations.filter(
        r => r.effectiveness === 'ineffective'
      ).length
      
      // 计算平均阅读时长
      const readItems = recentRecommendations.filter(r => r.isRead && r.readDuration)
      const avgReadDuration = readItems.length > 0
        ? readItems.reduce((sum, r) => sum + (r.readDuration || 0), 0) / readItems.length
        : 0
      
      // 统计来源
      const sourceMap = new Map<string, { count: number; read: number }>()
      recentRecommendations.forEach(r => {
        const stats = sourceMap.get(r.source) || { count: 0, read: 0 }
        stats.count++
        if (r.isRead) stats.read++
        sourceMap.set(r.source, stats)
      })
      
      const topSources = Array.from(sourceMap.entries())
        .map(([source, stats]) => ({
          source,
          count: stats.count,
          readRate: stats.count > 0 ? (stats.read / stats.count) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      
      return {
        totalCount: total,
        readCount: read,
        unreadCount: total - read,
        readLaterCount: recentRecommendations.filter(r => r.feedback === 'later').length,
        dismissedCount: dismissed,
        avgReadDuration,
        topSources
      }
    },
    300  // 5 分钟缓存
  )
}

/**
 * 获取存储统计数据
 * Phase 2.7: 设置页面展示
 */
export async function getStorageStats(): Promise<StorageStats> {
  const pendingCount = await db.pendingVisits.count()
  const confirmedCount = await db.confirmedVisits.count()
  const recommendationCount = await db.recommendations.count()
  
  // 计算总页面数（= confirmed visits）
  const pageCount = confirmedCount
  
  // 估算存储大小（每条记录约 5KB）
  const avgRecordSizeKB = 5
  const totalRecords = pendingCount + confirmedCount + recommendationCount
  const totalSizeMB = (totalRecords * avgRecordSizeKB) / 1024
  
  // 计算最早采集时间和平均每日页面数
  let firstCollectionTime: number | undefined = undefined
  let avgDailyPages: number = 0
  
  if (confirmedCount > 0) {
    const visits = await db.confirmedVisits.orderBy('visitTime').toArray()
    if (visits.length > 0) {
      firstCollectionTime = visits[0].visitTime
      
      // 计算采集天数和平均每日页面数
      const now = Date.now()
      const daysSinceStart = Math.max(1, Math.ceil((now - firstCollectionTime) / (24 * 60 * 60 * 1000)))
      avgDailyPages = visits.length / daysSinceStart
    }
  }

  return {
    pageCount,
    pendingCount,
    confirmedCount,
    recommendationCount,
    totalSizeMB: totalRecords > 0 ? Math.max(0.01, Math.round(totalSizeMB * 100) / 100) : 0,
    firstCollectionTime,
    avgDailyPages
  }
}

/**
 * 获取文本分析统计
 */
export async function getAnalysisStats(): Promise<{
  analyzedPages: number
  totalKeywords: number
  avgKeywordsPerPage: number
  languageDistribution: Array<{ language: string; count: number }>
  topKeywords: Array<{ word: string; frequency: number }>
}> {
  const confirmedVisits = await db.confirmedVisits.toArray()
  
  // 添加调试信息
  statsLogger.debug('数据库调试信息:', {
    总访问记录: confirmedVisits.length,
    有analysis字段: confirmedVisits.filter(v => v.analysis).length,
    有keywords字段: confirmedVisits.filter(v => v.analysis?.keywords).length,
    keywords非空: confirmedVisits.filter(v => v.analysis?.keywords && v.analysis.keywords.length > 0).length
  })
  
  // 详细检查每个记录
  confirmedVisits.forEach((visit, index) => {
    if (index < 5) { // 只显示前5个记录的详情
      statsLogger.debug(`记录 ${index + 1}:`, {
        url: visit.url?.substring(0, 50) + '...',
        hasAnalysis: !!visit.analysis,
        keywords: visit.analysis?.keywords?.length || 0,
        language: visit.analysis?.language || 'undefined'
      })
    }
  })
  
  // 使用统一的过滤条件（与 DataMigrator 一致）
  const analyzedVisits = confirmedVisits.filter(visit => {
    if (!visit.analysis) return false
    if (!visit.analysis.keywords) return false
    if (!Array.isArray(visit.analysis.keywords)) return false
    if (visit.analysis.keywords.length === 0) return false
    if (!visit.analysis.language) return false
    return true
  })

  statsLogger.debug('过滤后有效记录:', analyzedVisits.length)

  // 计算关键词统计
  const keywordFrequency = new Map<string, number>()
  let totalKeywords = 0

  analyzedVisits.forEach(visit => {
    if (visit.analysis?.keywords) {
      totalKeywords += visit.analysis.keywords.length
      visit.analysis.keywords.forEach(keyword => {
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1)
      })
    }
  })

  // Top 10 关键词
  const topKeywords = Array.from(keywordFrequency.entries())
    .map(([word, frequency]) => ({ word, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)

  // 语言分布统计（保留原始语言代码，由 UI 层处理国际化）
  const languageCount = new Map<string, number>()
  analyzedVisits.forEach(visit => {
    if (visit.analysis?.language) {
      // 直接使用语言代码，不做转换
      const lang = visit.analysis.language
      languageCount.set(lang, (languageCount.get(lang) || 0) + 1)
    }
  })

  const languageDistribution = Array.from(languageCount.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)

  return {
    analyzedPages: analyzedVisits.length,
    totalKeywords,
    avgKeywordsPerPage: analyzedVisits.length > 0 ? totalKeywords / analyzedVisits.length : 0,
    languageDistribution,
    topKeywords,
  }
}

/**
 * 获取 AI 分析质量统计 (Phase 4 - Sprint 5.2)
 * 
 * 统计 AI 分析 vs 关键词分析的占比、成本等
 */
export async function getAIAnalysisStats(): Promise<{
  totalPages: number
  aiAnalyzedPages: number
  keywordAnalyzedPages: number
  aiPercentage: number
  providerDistribution: Array<{ provider: string; count: number; percentage: number }>
  providerCostDistribution: Array<{ provider: string; costUSD: number; costCNY: number; tokens: number }>
  totalCostUSD: number
  totalCostCNY: number
  totalTokens: number
  avgCostPerPage: number
  primaryCurrency: 'USD' | 'CNY' | null
}> {
  const confirmedVisits = await db.confirmedVisits.toArray()
  
  // 过滤有效记录（有分析数据）
  const analyzedVisits = confirmedVisits.filter(visit => {
    if (!visit.analysis) return false
    if (!visit.analysis.keywords || visit.analysis.keywords.length === 0) return false
    return true
  })

  // 统计 AI 分析的页面（只统计远程 AI）
  const remoteAIProviders = ['openai', 'anthropic', 'deepseek']
  const aiPages = analyzedVisits.filter(visit => {
    if (!visit.analysis.aiAnalysis) return false
    return remoteAIProviders.includes(visit.analysis.aiAnalysis.provider)
  })
  const keywordPages = analyzedVisits.filter(visit => !visit.analysis.aiAnalysis)

  // 提供商分布统计（只包含远程 AI）
  const providerCount = new Map<string, number>()
  aiPages.forEach(visit => {
    const provider = visit.analysis.aiAnalysis!.provider
    providerCount.set(provider, (providerCount.get(provider) || 0) + 1)
  })

  const providerDistribution = Array.from(providerCount.entries())
    .map(([provider, count]) => ({
      provider: provider === 'deepseek' ? 'DeepSeek' :
                provider === 'openai' ? 'OpenAI' :
                provider === 'anthropic' ? 'Anthropic' :
                provider === 'keyword' ? '关键词' :
                provider,
      count,
      percentage: (count / Math.max(aiPages.length, 1)) * 100
    }))
    .sort((a, b) => b.count - a.count)

  // 成本统计（分货币）
  let totalCostUSD = 0
  let totalCostCNY = 0
  let totalTokens = 0
  let currencyCount = { USD: 0, CNY: 0 }
  
  // 定义每个提供商的标准货币
  const providerStandardCurrency: Record<string, 'USD' | 'CNY'> = {
    'openai': 'USD',
    'anthropic': 'USD',
    'deepseek': 'CNY'
  }
  
  // 按提供商统计成本
  const providerCostMap = new Map<string, { costUSD: number; costCNY: number; tokens: number }>()
  
  aiPages.forEach(visit => {
    const aiAnalysis = visit.analysis.aiAnalysis
    const provider = aiAnalysis!.provider
    const standardCurrency = providerStandardCurrency[provider] || 'USD'
    
    // 初始化提供商统计
    if (!providerCostMap.has(provider)) {
      providerCostMap.set(provider, { costUSD: 0, costCNY: 0, tokens: 0 })
    }
    const providerStats = providerCostMap.get(provider)!
    
    if (aiAnalysis?.cost) {
      const currency = aiAnalysis.currency || 'USD' // 默认美元
      
      // 只统计该提供商的标准货币
      if (currency === standardCurrency) {
        if (currency === 'CNY') {
          totalCostCNY += aiAnalysis.cost
          providerStats.costCNY += aiAnalysis.cost
          currencyCount.CNY++
        } else {
          totalCostUSD += aiAnalysis.cost
          providerStats.costUSD += aiAnalysis.cost
          currencyCount.USD++
        }
      }
    }
    if (aiAnalysis?.tokensUsed) {
      const tokens = aiAnalysis.tokensUsed.total
      totalTokens += tokens
      providerStats.tokens += tokens
    }
  })

  // 转换为数组格式（只包含远程 AI 提供商）
  const providerCostDistribution = Array.from(providerCostMap.entries())
    .filter(([provider]) => remoteAIProviders.includes(provider))
    .map(([provider, stats]) => ({
      provider: provider === 'deepseek' ? 'DeepSeek' :
                provider === 'openai' ? 'OpenAI' :
                provider === 'anthropic' ? 'Anthropic' :
                provider,
      costUSD: stats.costUSD,
      costCNY: stats.costCNY,
      tokens: stats.tokens
    }))
    .sort((a, b) => {
      // 按总成本排序（USD + CNY 换算）
      const totalA = a.costUSD + a.costCNY / 7 // 简单换算，1 USD ≈ 7 CNY
      const totalB = b.costUSD + b.costCNY / 7
      return totalB - totalA
    })

  // 确定主要货币（用于显示平均成本）
  const primaryCurrency = currencyCount.CNY > currencyCount.USD ? 'CNY' : 
                         currencyCount.USD > 0 ? 'USD' : null
  const primaryCost = primaryCurrency === 'CNY' ? totalCostCNY : totalCostUSD

  return {
    totalPages: analyzedVisits.length,
    aiAnalyzedPages: aiPages.length,
    keywordAnalyzedPages: keywordPages.length,
    aiPercentage: analyzedVisits.length > 0 ? (aiPages.length / analyzedVisits.length) * 100 : 0,
    providerDistribution,
    providerCostDistribution,
    totalCostUSD,
    totalCostCNY,
    totalTokens,
    avgCostPerPage: aiPages.length > 0 ? primaryCost / aiPages.length : 0,
    primaryCurrency
  }
}

/**
 * 获取 RSS 文章总数
 * Phase 10.2: 系统数据展示优化
 * 
 * @returns RSS 文章总数（从所有已发现的 Feed 的 latestArticles 聚合）
 */
export async function getRSSArticleCount(): Promise<number> {
  try {
    const allFeeds = await db.discoveredFeeds.toArray()
    
    let totalArticles = 0
    for (const feed of allFeeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        totalArticles += feed.latestArticles.length
      }
    }
    
    return totalArticles
  } catch (error) {
    dbLogger.error('获取 RSS 文章总数失败:', error)
    return 0
  }
}

/**
 * 推荐筛选漏斗统计
 * Phase 10.3: 重构漏斗数据结构
 * 
 * 漏斗层级：
 * - rssArticles: RSS 累计读取的文章总数（去重）
 * - inPool: 累计放入推荐池的文章数
 * - notified: 累计进入弹窗的文章数
 * - read: 累计阅读数
 * 
 * 侧边数据：
 * - learningPages: 学习页面总数
 * - dismissed: 不想读总数
 */
export async function getRecommendationFunnel(): Promise<{
  rssArticles: number
  inPool: number
  notified: number
  read: number
  learningPages: number
  dismissed: number
}> {
  try {
    // 统计 RSS 文章总数（去重）
    const allFeeds = await db.discoveredFeeds.toArray()
    const articleUrls = new Set<string>()
    for (const feed of allFeeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        feed.latestArticles.forEach(article => {
          if (article.link) articleUrls.add(article.link)
        })
      }
    }
    const rssArticlesCount = articleUrls.size
    
    // 推荐统计
    const allRecommendations = await db.recommendations.toArray()
    const inPoolCount = allRecommendations.length
    
    // 统计弹窗通知数（所有 active 状态的推荐在创建时都会被通知）
    const notifiedCount = allRecommendations.filter(r => r.status === 'active').length
    
    // 统计已读数（使用 isRead 字段）
    const readCount = allRecommendations.filter(r => r.isRead === true).length
    
    // 统计不想读（status 为 dismissed）
    const dismissedCount = allRecommendations.filter(r => r.status === 'dismissed').length
    
    // 统计学习页面数
    const learningPagesCount = await db.confirmedVisits.count()
    
    return {
      rssArticles: rssArticlesCount,
      inPool: inPoolCount,
      notified: notifiedCount,
      read: readCount,
      learningPages: learningPagesCount,
      dismissed: dismissedCount
    }
  } catch (error) {
    dbLogger.error('获取推荐漏斗统计失败:', error)
    return {
      rssArticles: 0,
      inPool: 0,
      notified: 0,
      read: 0,
      learningPages: 0,
      dismissed: 0
    }
  }
}
