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
import { getUnreadRecommendations } from './db-recommendations'

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
      
      // 查询最近 N 天的推荐记录（使用 feedArticles，poolStatus='popup' 表示曾在弹窗中）
      let recentRecommendations = await db.feedArticles
        .filter(a => {
          const wasRecommended = a.poolStatus === 'recommended' || a.poolStatus === 'exited'
          const inTimeRange = (a.popupAddedAt || 0) > cutoffTime
          return wasRecommended && inTimeRange
        })
        .toArray()
      
      // Phase 7: 如果只统计活跃推荐，只看当前在弹窗中的
      if (onlyActive) {
        recentRecommendations = recentRecommendations.filter(a => 
          a.poolStatus === 'recommended'
        )
      }
      
      const total = recentRecommendations.length
      const read = recentRecommendations.filter(a => a.isRead).length
      const dismissed = recentRecommendations.filter(a => 
        a.feedback === 'dismissed'
      ).length
      
      // 计算有效性
      const effective = recentRecommendations.filter(
        a => a.effectiveness === 'effective'
      ).length
      const neutral = recentRecommendations.filter(
        a => a.effectiveness === 'neutral'
      ).length
      const ineffective = recentRecommendations.filter(
        a => a.effectiveness === 'ineffective'
      ).length
      
      // 计算平均阅读时长
      const readItems = recentRecommendations.filter(a => a.isRead && a.readDuration)
      const avgReadDuration = readItems.length > 0
        ? readItems.reduce((sum, a) => sum + (a.readDuration || 0), 0) / readItems.length
        : 0
      
      // 统计来源（使用 feedId 作为来源标识）
      const sourceMap = new Map<string, { count: number; read: number }>()
      recentRecommendations.forEach(a => {
        const source = a.feedId || 'unknown'
        const stats = sourceMap.get(source) || { count: 0, read: 0 }
        stats.count++
        if (a.isRead) stats.read++
        sourceMap.set(source, stats)
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
        readLaterCount: recentRecommendations.filter(a => a.feedback === 'later').length,
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
  // 统计曾在弹窗中的推荐数量（poolStatus='popup' 或已退出但来源是弹窗）
  const recommendationCount = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended' || (a.poolStatus === 'exited' && a.popupAddedAt))
    .count()
  
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
 * Phase 13+: 基于多池架构重新设计
 * Phase 14: 混合数据源 + 动态指标分离
 * Phase 14.1: 修正数据恒等式
 * Phase 14.2: 支持筛选当前 XML 中的文章
 * 
 * 数据恒等式（必须成立）：
 * - rssArticles = raw + prescreenedOut + analyzed
 * - analyzed = analyzedNotQualified + candidateEver（曾进入候选池的）
 * - candidateEver = currentCandidate + currentRecommended + exitedFromPool
 * 
 * 漏斗层级（累计统计，递减）：
 * - rssArticles: RSS 累计抓取的文章总数
 * - analyzed: 已深度分析的文章数（= 总数 - raw - prescreenedOut）
 * - candidate: 曾进入候选池的文章数（有 candidatePoolAddedAt 时间戳）
 * - recommended: 曾进入推荐池的文章数（有 recommendedPoolAddedAt 时间戳）
 * - read: 用户已阅读数（poolExitReason = 'read'）
 * 
 * @param currentFeedOnly - 是否只统计当前还在 RSS XML 中的文章（默认 true）
 */
export async function getRecommendationFunnel(currentFeedOnly: boolean = true): Promise<{
  // 漏斗层（累计统计）
  rssArticles: number
  analyzed: number
  candidate: number
  recommended: number
  // 右侧卡片（状态/动态指标）
  prescreenedOut: number
  raw: number
  analyzedNotQualified: number
  currentRecommendedPool: number
  recommendedPoolCapacity: number
  currentPopupCount: number
  popupCapacity: number
  exitStats: {
    total: number
    // 用户主动操作
    read: number
    saved: number
    disliked: number
    // 被动离开（互斥，合计=未读）
    unread: number  // 未读总数 = replaced + expired + stale + other
    replaced: number
    expired: number
    stale: number   // 出源
    other: number   // 其他（无明确原因）
  }
  learningPages: number
  // 筛选信息
  currentFeedOnly: boolean
  currentFeedArticleCount: number
  totalArticleCount: number
  // 兼容旧字段（将被弃用）
  prescreened: number
  dismissed: number
}> {
  try {
    // ===== 获取已订阅源信息 =====
    const allFeeds = await db.discoveredFeeds.toArray()
    const subscribedFeeds = allFeeds.filter(f => f.status === 'subscribed')
    const subscribedFeedIds = new Set(subscribedFeeds.map(f => f.id))
    
    // ===== 数据源 1: feedArticles（文章池状态）=====
    // 只统计来自已订阅源的文章，与订阅列表统计保持一致
    const allArticlesRaw = await db.feedArticles
      .filter(article => subscribedFeedIds.has(article.feedId))
      .toArray()
    
    // 当前在源中的文章（用于统计和日志）
    const inFeedArticles = allArticlesRaw.filter(a => a.inFeed !== false)
    
    // 根据参数决定统计范围
    // currentFeedOnly=true → 只统计当前在源中的文章（inFeed=true）
    // currentFeedOnly=false → 统计文章池全部文章（包括已出源的历史记录）
    // 
    // 注意：这里的"在源中"指的是"当前在RSS源中"，而不是"来自已订阅的feed"
    // 因为：
    // 1. 待分析(raw)的文章必然在源中(inFeed=true)
    // 2. 已过时(stale)的文章必然已出源(inFeed=false)
    // 3. 所以"在源中"模式下不应该有已过时文章
    const allArticles = currentFeedOnly 
      ? inFeedArticles  // 只看当前在源中的
      : allArticlesRaw  // 全部文章池（包括历史）
    
    const rssArticlesCount = allArticles.length
    
    // ===== 基础状态统计（互斥，总和 = rssArticles）=====
    
    // 初筛淘汰（累计）
    const prescreenedOutCount = allArticles.filter(a => 
      a.poolStatus === 'prescreened-out'
    ).length
    
    // 待分析（当前 raw 状态，仍在源中）
    // 在"订阅源"模式下，allArticles 已经是 inFeed=true 的，所以 rawCount 会正确统计
    // 在"文章池"模式下，需要排除 inFeed=false 的（这些是 stale）
    const rawCount = allArticles.filter(a => 
      (a.poolStatus === 'raw' || !a.poolStatus) && a.inFeed !== false
    ).length
    
    // 已过时（已出源，未分析，跳过）
    // 在"订阅源"模式下，allArticles 不包含 inFeed=false 的，所以 staleCount=0
    // 在"文章池"模式下，统计所有 stale 状态 + 未迁移的 (raw && inFeed=false)
    const staleCount = allArticles.filter(a =>
      a.poolStatus === 'stale' || 
      ((a.poolStatus === 'raw' || !a.poolStatus) && a.inFeed === false)
    ).length
    
    // 分析未达标（累计）- 分析后分数不够，未进入候选池
    const analyzedNotQualifiedCount = allArticles.filter(a =>
      a.poolStatus === 'analyzed-not-qualified'
    ).length
    
    // 当前在候选池
    const currentCandidateCount = allArticles.filter(a =>
      a.poolStatus === 'candidate'
    ).length
    
    // 当前在推荐池（动态）
    const currentRecommendedPoolCount = allArticles.filter(a =>
      a.poolStatus === 'recommended'
    ).length
    
    // ===== 基于时间戳的历史统计（更可靠）=====
    
    // 曾进入候选池的文章（有 candidatePoolAddedAt 时间戳）
    const everInCandidatePool = allArticles.filter(a => a.candidatePoolAddedAt)
    
    // 曾进入推荐池的文章（有 recommendedPoolAddedAt 时间戳）
    const everInRecommendedPool = allArticles.filter(a => a.recommendedPoolAddedAt)
    
    // ===== 退出文章分类 =====
    const exitedArticles = allArticles.filter(a => a.poolStatus === 'exited')
    
    // feedArticles 退出统计（按 poolExitReason）
    const feedExitStats = {
      total: exitedArticles.length,
      byReason: {
        read: exitedArticles.filter(a => a.poolExitReason === 'read').length,
        saved: exitedArticles.filter(a => a.poolExitReason === 'saved').length,
        disliked: exitedArticles.filter(a => a.poolExitReason === 'disliked').length,
        replaced: exitedArticles.filter(a => a.poolExitReason === 'replaced').length,
        expired: exitedArticles.filter(a => a.poolExitReason === 'expired').length,
        other: exitedArticles.filter(a => 
          !a.poolExitReason || 
          !['read', 'saved', 'disliked', 'replaced', 'expired'].includes(a.poolExitReason)
        ).length
      }
    }
    
    // ===== 数据源 2: 弹窗推荐统计（统一数据源：以弹窗实际显示为准）=====
    // 统一使用 getUnreadRecommendations() 查询，与弹窗显示保持完全一致
    const unreadRecs = await getUnreadRecommendations(100)
    const currentPopupCount = unreadRecs.length
    
    // 从 feedArticles 中获取所有推荐池或曾在弹窗中的文章（用于其他统计）
    const popupArticles = await db.feedArticles
      .filter(a => a.poolStatus === 'recommended' || (a.poolStatus === 'exited' && a.popupAddedAt))
      .toArray()
    
    // 弹窗推荐统计（用于对比）
    const recsTableStats = {
      total: popupArticles.length,
      uniqueUrls: new Set(popupArticles.map(a => a.link)).size,
      read: popupArticles.filter(a => a.isRead === true).length,
      dismissed: popupArticles.filter(a => a.feedback === 'dismissed').length,
      later: popupArticles.filter(a => a.feedback === 'later').length,
      currentPopup: currentPopupCount
    }
    
    // ===== 漏斗层计算（全部基于 feedArticles 表）=====
    
    // analyzed = 总数 - raw - prescreenedOut - stale
    const analyzedCount = rssArticlesCount - rawCount - prescreenedOutCount - staleCount
    
    // candidate = 当前在候选池的文章数（与订阅源统计保持一致）
    const candidateCount = currentCandidateCount
    
    // recommended = 当前在推荐池的文章数（与订阅源统计保持一致）
    const recommendedCount = currentRecommendedPoolCount
    
    // 历史累计统计（保留用于其他用途）
    const everCandidateCount = everInCandidatePool.length
    const everRecommendedCount = everInRecommendedPool.length
    
    // 退出统计（基于 feedArticles 表）
    // 所有"已离开推荐池"的文章 = 曾推荐 - 当前在推荐池
    // 包括：正式退出(exited) + 出源(stale) + 状态异常(其他)
    const leftRecommendedPool = everInRecommendedPool.filter(a => a.poolStatus !== 'recommended')
    
    // 正式退出的文章（poolStatus = 'exited'）
    const exitedFromRecommendedPool = leftRecommendedPool.filter(a => a.poolStatus === 'exited')
    
    // 曾推荐但已出源的文章
    const staleFromRecommendedPool = leftRecommendedPool.filter(a => 
      a.poolStatus === 'stale' || 
      (a.poolStatus === 'raw' && a.inFeed === false) ||
      !a.poolStatus  // undefined
    )
    
    // 退出分类（互斥）：
    // 1. 已读 - 用户点击阅读
    // 2. 稍后 - 用户点击稍后
    // 3. 不想读 - 用户点击不感兴趣
    // 4. 未读 - 被动离开，细分为：被替换、过期、出源、其他
    
    // 用户主动操作（基于正式退出的文章）
    const exitReadCount = exitedFromRecommendedPool.filter(a => a.poolExitReason === 'read').length
    const exitSavedCount = exitedFromRecommendedPool.filter(a => a.poolExitReason === 'saved').length
    const exitDislikedCount = exitedFromRecommendedPool.filter(a => a.poolExitReason === 'disliked').length
    
    // 未读细分（被动离开的原因）
    const exitReplacedCount = exitedFromRecommendedPool.filter(a => a.poolExitReason === 'replaced').length
    const exitExpiredCount = exitedFromRecommendedPool.filter(a => a.poolExitReason === 'expired').length
    const exitStaleCount = staleFromRecommendedPool.length  // 出源
    
    // 其他未读（exitedFromRecommendedPool 中没有明确原因的，可能是旧数据）
    const exitOtherCount = exitedFromRecommendedPool.length - exitReadCount - exitSavedCount - exitDislikedCount - exitReplacedCount - exitExpiredCount
    
    // 未读总数 = 被替换 + 过期 + 出源 + 其他（这些都是用户没机会读到的）
    const exitUnreadCount = exitReplacedCount + exitExpiredCount + exitStaleCount + exitOtherCount
    
    // 总退出数 = 已读 + 稍后 + 不想读 + 未读（互斥）
    const exitTotalCount = exitReadCount + exitSavedCount + exitDislikedCount + exitUnreadCount
    
    const exitStats = {
      total: exitTotalCount,
      // 用户主动操作
      read: exitReadCount,
      saved: exitSavedCount,
      disliked: exitDislikedCount,
      // 被动离开（未读细分）
      unread: exitUnreadCount,
      replaced: exitReplacedCount,
      expired: exitExpiredCount,
      stale: exitStaleCount,  // 出源
      other: exitOtherCount   // 其他（无明确原因的旧数据）
    }
    
    // ===== 调试日志：输出完整漏斗数据 =====
    dbLogger.info('📊 漏斗数据统计:', {
      // 筛选条件
      '筛选': {
        currentFeedOnly,
        subscribedFeeds: subscribedFeeds.length,
        inFeedArticles: inFeedArticles.length,
        totalArticles: allArticlesRaw.length,
        filteredArticles: allArticles.length
      },
      // 漏斗层（递减，全部基于 feedArticles）
      '漏斗层': {
        rssArticles: rssArticlesCount,
        analyzed: analyzedCount,
        candidate: candidateCount,
        recommended: recommendedCount
      },
      // feedArticles 状态分布
      'feedArticles状态': {
        raw: rawCount,
        stale: staleCount,
        prescreenedOut: prescreenedOutCount,
        analyzedNotQualified: analyzedNotQualifiedCount,
        currentCandidate: currentCandidateCount,
        currentRecommended: currentRecommendedPoolCount,
        exited: feedExitStats.total
      },
      // 基于时间戳的历史统计
      '历史统计(时间戳)': {
        everInCandidatePool: everCandidateCount,
        everInRecommendedPool: everRecommendedCount,
        exitedFromRecommendedPool: exitedFromRecommendedPool.length,
        // 诊断：曾进入推荐池但状态异常的文章
        recommendedButNotInPoolOrExited: (() => {
          const notInPoolOrExited = everInRecommendedPool.filter(a => 
            a.poolStatus !== 'recommended' && a.poolStatus !== 'exited'
          )
          // 按状态分组统计
          const byStatus: Record<string, number> = {}
          notInPoolOrExited.forEach(a => {
            const status = a.poolStatus || 'undefined'
            byStatus[status] = (byStatus[status] || 0) + 1
          })
          return { count: notInPoolOrExited.length, byStatus }
        })()
      },
      // 退出统计详情
      '退出统计': exitStats,
      // recommendations 表统计（当前数据，用于对比）
      'recommendations表(当前)': recsTableStats,
      // 恒等式验证
      '恒等式检查': {
        'rss = raw + stale + prescreenedOut + analyzed': `${rssArticlesCount} = ${rawCount} + ${staleCount} + ${prescreenedOutCount} + ${analyzedCount} (${rssArticlesCount === rawCount + staleCount + prescreenedOutCount + analyzedCount ? '✓' : '✗'})`,
        'candidate(时间戳) vs analyzed-notQualified': `${candidateCount} vs ${analyzedCount - analyzedNotQualifiedCount}`,
        'recommended <= candidate': `${recommendedCount} <= ${candidateCount} (${recommendedCount <= candidateCount ? '✓' : '✗'})`,
        'recommended = currentInPool + exitTotal': `${recommendedCount} = ${currentRecommendedPoolCount} + ${exitStats.total} (${recommendedCount === currentRecommendedPoolCount + exitStats.total ? '✓' : '✗'})`,
        'exitTotal = read+saved+disliked+unread': `${exitStats.total} = ${exitStats.read}+${exitStats.saved}+${exitStats.disliked}+${exitStats.unread} (${exitStats.total === exitStats.read + exitStats.saved + exitStats.disliked + exitStats.unread ? '✓' : '✗'})`
      }
    })
    
    // 验证漏斗递减: recommended <= candidate
    if (recommendedCount > candidateCount) {
      dbLogger.warn('漏斗递减约束不成立: recommended > candidate', {
        candidate: candidateCount,
        recommended: recommendedCount
      })
    }
    
    // 统计学习页面数
    const learningPagesCount = await db.confirmedVisits.count()
    
    // 获取配置（推荐池容量和弹窗容量）
    let recommendedPoolCapacity = 6  // 默认值
    let popupCapacity = 3            // 默认值
    try {
      const { getRecommendationConfig } = await import('@/storage/recommendation-config')
      const config = await getRecommendationConfig()
      popupCapacity = config.maxRecommendations || 3
      recommendedPoolCapacity = popupCapacity * 2
    } catch {
      // 使用默认值
    }
    
    return {
      // 漏斗层（累计统计，全部基于 feedArticles，到 recommended 为止）
      rssArticles: rssArticlesCount,
      analyzed: analyzedCount,
      candidate: candidateCount,
      recommended: recommendedCount,
      // 右侧卡片（状态/动态指标）
      prescreenedOut: prescreenedOutCount,
      raw: rawCount,
      stale: staleCount,
      analyzedNotQualified: analyzedNotQualifiedCount,
      currentRecommendedPool: currentRecommendedPoolCount,
      recommendedPoolCapacity,
      currentPopupCount,
      popupCapacity,
      exitStats,
      learningPages: learningPagesCount,
      // 筛选信息
      currentFeedOnly,
      currentFeedArticleCount: inFeedArticles.length,
      totalArticleCount: allArticlesRaw.length,
      // 兼容旧字段
      prescreened: analyzedCount, // 旧字段映射到 analyzed
      dismissed: recsTableStats.dismissed // 当前不想读数（从 recommendations 表）
    }
  } catch (error) {
    dbLogger.error('获取推荐漏斗统计失败:', error)
    return {
      rssArticles: 0,
      analyzed: 0,
      candidate: 0,
      recommended: 0,
      prescreenedOut: 0,
      raw: 0,
      stale: 0,
      analyzedNotQualified: 0,
      currentRecommendedPool: 0,
      recommendedPoolCapacity: 6,
      currentPopupCount: 0,
      popupCapacity: 3,
      exitStats: { total: 0, read: 0, saved: 0, disliked: 0, unread: 0, replaced: 0, expired: 0, stale: 0, other: 0 },
      learningPages: 0,
      currentFeedOnly: false,
      currentFeedArticleCount: 0,
      totalArticleCount: 0,
      prescreened: 0,
      dismissed: 0
    }
  }
}