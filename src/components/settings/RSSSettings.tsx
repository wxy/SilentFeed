import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { RSSValidator } from "@/core/rss/RSSValidator"
import { RSSFetcher, type FeedItem } from "@/core/rss/RSSFetcher"
import { OPMLImporter } from "@/core/rss/OPMLImporter"
import { getSourceAnalysisService } from "@/core/rss/SourceAnalysisService"
import { getFaviconUrl, handleFaviconError } from "@/utils/favicon"
import { formatFeedTitle, decodeHtmlEntities } from "@/utils/html"
import type { DiscoveredFeed } from "@/types/rss"
import { logger } from "@/utils/logger"
import { getFeedFunnelStats, type FeedFunnelStats } from "@/storage/db"
import { formatDateTime as formatDateTimeI18n } from "@/utils/date-formatter"
import { isValidCategoryKey, type FeedCategoryKey } from "@/types/feed-category"
import { FunnelBlockBar } from "./FunnelBlockBar"

const rssManagerLogger = logger.withTag("RSSManager")

/**
 * 从 URL 提取主机名
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * RSS 源管理组件
 * 
 * Phase 5.1.5: 优化版
 * - 精简显示：标题（链接）、来源、时间、格式徽章
 * - 右侧操作：收录、忽略
 */
export function RSSSettings({ isSketchyStyle = false }: { isSketchyStyle?: boolean }) {
  const { t: _ } = useTranslation()
  const [candidateFeeds, setCandidateFeeds] = useState<DiscoveredFeed[]>([])
  const [subscribedFeeds, setSubscribedFeeds] = useState<DiscoveredFeed[]>([])
  const [ignoredFeeds, setIgnoredFeeds] = useState<DiscoveredFeed[]>([])
  const [loading, setLoading] = useState(true)
  const [showIgnored, setShowIgnored] = useState(false)
  // 漏斗统计（完全对齐推荐漏斗）- 文章池（包括历史）
  const [feedPoolStatsMap, setFeedPoolStatsMap] = useState<Record<string, FeedFunnelStats>>({})
  // 漏斗统计（完全对齐推荐漏斗）- 在源中（当前）
  const [feedInFeedStatsMap, setFeedInFeedStatsMap] = useState<Record<string, FeedFunnelStats>>({})
  
  // Phase 5.1.6: 手动订阅和 OPML 导入
  const [manualUrl, setManualUrl] = useState('')
  const [isManualAdding, setIsManualAdding] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualSuccess, setManualSuccess] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // RSS 条目预览
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null)
  const [previewArticles, setPreviewArticles] = useState<Record<string, FeedItem[]>>({})
  const [loadingPreview, setLoadingPreview] = useState<Record<string, boolean>>({})
  
  // RSS 手动读取
  const [isFetchingAll, setIsFetchingAll] = useState(false)
  const [isFetchingSingle, setIsFetchingSingle] = useState<string | null>(null)
  const [fetchCompleted, setFetchCompleted] = useState<{
    all: boolean
    single: string | null
  }>({ all: false, single: null })
  
  // 订阅源 AI 分析状态
  const [analyzingFeedIds, setAnalyzingFeedIds] = useState<Set<string>>(new Set())

  // 滚动位置保持辅助函数
  const withScrollPreservation = async (action: () => Promise<void>) => {
    const scrollY = window.scrollY
    await action()
    // 使用 requestAnimationFrame 确保在 DOM 更新后恢复滚动
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY)
    })
  }

  useEffect(() => {
    loadFeeds()
    
    // 监听源更新消息（如 AI 分析完成）
    const messageListener = (message: any) => {
      if (message.type === 'FEED_UPDATED' || message.type === 'FEED_FETCH_COMPLETE') {
        // 保持滚动位置
        const scrollY = window.scrollY
        loadFeeds().then(() => {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY)
          })
        })
      }
    }
    
    // 仅在扩展环境中添加监听器
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener)
      
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener)
      }
    }
  }, [])

  const loadFeeds = async () => {
    try {
      const feedManager = new FeedManager()
      const [candidates, subscribed, ignored] = await Promise.all([
        feedManager.getFeeds('candidate'),
        feedManager.getFeeds('subscribed'),
        feedManager.getFeeds('ignored')
      ])
      // 渲染层清理：移除历史上持久化到标题中的“ - 域名”后缀（不修改数据库）
      const stripDomainSuffix = (title: string, urlOrLink?: string) => {
        if (!title) return title
        let host = ''
        try {
          host = new URL(urlOrLink || '').hostname
        } catch {
          host = ''
        }
        if (!host) return title
        const patterns = [
          ` - ${host}`,
          ` — ${host}`,
          ` | ${host}`,
        ]
        for (const p of patterns) {
          if (title.endsWith(p)) {
            return title.slice(0, -p.length)
          }
        }
        return title
      }

      const sanitize = (feeds: DiscoveredFeed[]) => feeds.map(f => ({
        ...f,
        title: stripDomainSuffix(f.title, f.link || f.url)
      }))

      setCandidateFeeds(sanitize(candidates))
      setSubscribedFeeds(sanitize(subscribed))
      setIgnoredFeeds(sanitize(ignored))

      // 加载每源漏斗统计（完全对齐推荐漏斗维度）
      try {
        // 文章池统计（包括历史文章）
        const poolStats = await getFeedFunnelStats(false)
        const poolMap: Record<string, FeedFunnelStats> = {}
        for (const s of poolStats) {
          poolMap[s.feedId] = s
        }
        setFeedPoolStatsMap(poolMap)
        
        // 在源中统计（当前在RSS源中的文章）
        const inFeedStats = await getFeedFunnelStats(true)
        const inFeedMap: Record<string, FeedFunnelStats> = {}
        for (const s of inFeedStats) {
          inFeedMap[s.feedId] = s
        }
        setFeedInFeedStatsMap(inFeedMap)
      } catch (e) {
        rssManagerLogger.warn('加载每源文章池统计失败（将跳过文章池汇总的部分项）', e)
      }
    } catch (error) {
      rssManagerLogger.error('加载候选源失败:', error)
    } finally {
      setLoading(false)
    }
  }
  
  /**
   * 手动触发全部RSS读取
   */
  const handleFetchAllFeeds = async () => {
    setIsFetchingAll(true)
    setFetchCompleted(prev => ({ ...prev, all: false }))
    try {
      rssManagerLogger.info('手动触发全部RSS读取...')
      
      const response = await chrome.runtime.sendMessage({
        type: 'MANUAL_FETCH_FEEDS'
      })
      
      if (response.success) {
        rssManagerLogger.info('全部RSS读取完成:', response.data)
        
        // 显示完成反馈
        setFetchCompleted(prev => ({ ...prev, all: true }))
        
        // 重新加载源列表以刷新统计数据
        await withScrollPreservation(async () => {
          await loadFeeds()
        })
        
        // 2秒后隐藏完成反馈
        setTimeout(() => {
          setFetchCompleted(prev => ({ ...prev, all: false }))
        }, 2000)
      } else {
        throw new Error(response.error || '读取失败')
      }
    } catch (error) {
      rssManagerLogger.error('全部RSS读取失败:', error)
      alert('RSS读取失败: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsFetchingAll(false)
    }
  }

  /**
   * 手动触发单个RSS读取
   */
  const handleFetchSingleFeed = async (feedId: string) => {
    setIsFetchingSingle(feedId)
    setFetchCompleted(prev => ({ ...prev, single: null }))
    try {
      const feed = subscribedFeeds.find(f => f.id === feedId)
      const feedTitle = feed?.title || 'Unknown Feed'
      rssManagerLogger.info(`手动读取RSS: ${feedTitle}`)
      
      // 使用新的单个源读取API
      const response = await chrome.runtime.sendMessage({
        type: 'MANUAL_FETCH_SINGLE_FEED',
        payload: { feedId }
      })
      
      if (response.success) {
        rssManagerLogger.info(`${feedTitle} 读取完成:`, response.data)
        
        // 显示完成反馈
        setFetchCompleted(prev => ({ ...prev, single: feedId }))
        
        await withScrollPreservation(async () => {
          await loadFeeds()
        })
        
        // 2秒后隐藏完成反馈
        setTimeout(() => {
          setFetchCompleted(prev => ({ ...prev, single: null }))
        }, 2000)
      } else {
        throw new Error(response.error || '读取失败')
      }
    } catch (error) {
      rssManagerLogger.error(`读取失败:`, error)
      alert(`读取失败: ` + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsFetchingSingle(null)
    }
  }
  
  // 计算RSS源的推荐数量（暂时返回0，待优化）
  const getRecommendedCountForFeed = (feed: DiscoveredFeed): number => {
    // Phase 6: 返回 RSS 源的推荐数（从数据库字段读取）
    return feed.recommendedCount || 0
  }
  
  // 加载 RSS 预览文章
  const loadPreviewArticles = async (feedId: string, feedUrl: string) => {
    if (previewArticles[feedId]) {
      // 已加载过，直接展开/收起
      setExpandedFeedId(expandedFeedId === feedId ? null : feedId)
      return
    }
    
    // 开始加载
    setLoadingPreview(prev => ({ ...prev, [feedId]: true }))
    setExpandedFeedId(feedId)
    
    try {
      const fetcher = new RSSFetcher()
      const result = await fetcher.fetch(feedUrl)
      
      if (result.success && result.items) {
        // 只显示最新 5 篇
        setPreviewArticles(prev => ({
          ...prev,
          [feedId]: result.items.slice(0, 5)
        }))
      } else {
        rssManagerLogger.error('加载预览失败:', result.error)
        // 加载失败，仍然展开显示错误
        setPreviewArticles(prev => ({
          ...prev,
          [feedId]: []
        }))
      }
    } catch (error) {
      rssManagerLogger.error('加载预览失败:', error)
      setPreviewArticles(prev => ({
        ...prev,
        [feedId]: []
      }))
    } finally {
      setLoadingPreview(prev => ({ ...prev, [feedId]: false }))
    }
  }

  // 忽略源
  const handleIgnore = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.ignore(feedId)
      
      // 从候选列表移除，添加到忽略列表
      const feed = candidateFeeds.find(f => f.id === feedId)
      if (feed) {
        setCandidateFeeds(prev => prev.filter(f => f.id !== feedId))
        setIgnoredFeeds(prev => [...prev, { ...feed, status: 'ignored' }])
      }
      
      // 通知 background 更新徽章
      chrome.runtime.sendMessage({ type: 'RSS_IGNORED' })
    } catch (error) {
      rssManagerLogger.error('忽略源失败:', error)
    }
  }

  // 订阅源
  const handleSubscribe = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.subscribe(feedId, 'discovered') // 标记为自动发现订阅
      
      // 从候选列表移除，添加到订阅列表
      const feed = candidateFeeds.find(f => f.id === feedId)
      if (feed) {
        setCandidateFeeds(prev => prev.filter(f => f.id !== feedId))
        setSubscribedFeeds(prev => [...prev, { 
          ...feed, 
          status: 'subscribed', 
          subscribedAt: Date.now(),
          subscriptionSource: 'discovered'
        }])
      }
      
      rssManagerLogger.info('已订阅源:', feedId)
    } catch (error) {
      rssManagerLogger.error('订阅源失败:', error)
    }
  }
  
  // 取消订阅（移到忽略列表）
  const handleUnsubscribe = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.unsubscribe(feedId)
      
      // 从订阅列表移除，添加到忽略列表（而不是候选列表）
      const feed = subscribedFeeds.find(f => f.id === feedId)
      if (feed) {
        setSubscribedFeeds(prev => prev.filter(f => f.id !== feedId))
        setIgnoredFeeds(prev => [...prev, { 
          ...feed, 
          status: 'ignored', 
          subscribedAt: undefined,
          subscriptionSource: feed.subscriptionSource  // 保留订阅来源
        }])
      }
      
      rssManagerLogger.info('已取消订阅（移到忽略列表）:', feedId)
    } catch (error) {
      rssManagerLogger.error('取消订阅失败:', error)
    }
  }
  
  // 从忽略列表订阅
  const handleSubscribeIgnored = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.subscribe(feedId, 'discovered') // 保持原始来源
      
      // 从忽略列表移除，添加到订阅列表（先显示分析中状态）
      const feed = ignoredFeeds.find(f => f.id === feedId)
      if (feed) {
        setIgnoredFeeds(prev => prev.filter(f => f.id !== feedId))
        setSubscribedFeeds(prev => [...prev, { 
          ...feed, 
          status: 'subscribed', 
          subscribedAt: Date.now(),
          quality: undefined  // 清空旧的质量数据，触发"分析中"状态
        }])
        
        // 监听质量分析完成，更新 UI
        // 通过轮询检查质量数据更新（简单实现）
        const checkQuality = async () => {
          for (let i = 0; i < 60; i++) {  // 最多等待 60 秒
            await new Promise(resolve => setTimeout(resolve, 1000))
            const updatedFeed = await feedManager.getFeed(feedId)
            if (updatedFeed?.quality) {
              setSubscribedFeeds(prev => prev.map(f => 
                f.id === feedId ? updatedFeed : f
              ))
              break
            }
          }
        }
        checkQuality()
      }
      
      rssManagerLogger.info('已从忽略列表订阅:', feedId)
    } catch (error) {
      rssManagerLogger.error('从忽略列表订阅失败:', error)
      // 验证失败，源已被删除，刷新列表并提示用户
      await withScrollPreservation(async () => {
        await loadFeeds()
      })
      alert(_(error instanceof Error ? error.message : 'options.rssManager.errors.revalidationFailed'))
    }
  }
  
  // 删除源
  const handleDelete = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.delete(feedId)
      
      // 从相应列表移除
      setIgnoredFeeds(prev => prev.filter(f => f.id !== feedId))
      setCandidateFeeds(prev => prev.filter(f => f.id !== feedId))
      setSubscribedFeeds(prev => prev.filter(f => f.id !== feedId))
      
      rssManagerLogger.info('已删除源:', feedId)
    } catch (error) {
      rssManagerLogger.error('删除源失败:', error)
    }
  }

  // Phase 5 Sprint 3: 切换源的启用/暂停状态
  const handleToggleActive = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      const newState = await feedManager.toggleActive(feedId)
      
      // 更新订阅列表中的状态
      setSubscribedFeeds(prev => prev.map(feed => 
        feed.id === feedId ? { ...feed, isActive: newState } : feed
      ))
      
  rssManagerLogger.info('已切换源状态:', { feedId, newState })
    } catch (error) {
      rssManagerLogger.error('切换源状态失败:', error)
    }
  }

  // 切换是否使用谷歌翻译打开链接
  const handleToggleGoogleTranslate = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      const feed = subscribedFeeds.find(f => f.id === feedId)
      if (!feed) return
      
      // 当前值（默认为 true）
      const currentValue = feed.useGoogleTranslate !== false
      const newValue = !currentValue
      
      await feedManager.updateFeed(feedId, { useGoogleTranslate: newValue })
      
      // 更新本地状态
      setSubscribedFeeds(prev => prev.map(f => 
        f.id === feedId ? { ...f, useGoogleTranslate: newValue } : f
      ))
      
      rssManagerLogger.info('已切换谷歌翻译设置:', { feedId, useGoogleTranslate: newValue })
    } catch (error) {
      rssManagerLogger.error('切换谷歌翻译设置失败:', error)
    }
  }

  // 获取格式徽章文本
  const getFormatBadge = (url: string) => {
    if (url.includes('atom')) return 'ATOM'
    return 'RSS'
  }

  // 格式化时间（日期 + 时间）
  const formatDateTime = (timestamp: number) => {
    return formatDateTimeI18n(timestamp, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Phase 5 Sprint 3: 格式化相对时间（如 "2小时前"）
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days} ${_('options.rssManager.time.daysAgo')}`
    } else if (hours > 0) {
      return `${hours} ${_('options.rssManager.time.hoursAgo')}`
    } else if (minutes > 0) {
      return `${minutes} ${_('options.rssManager.time.minutesAgo')}`
    } else {
      return _('options.rssManager.time.justNow')
    }
  }

  // Phase 5 Sprint 3: 计算下次抓取时间
  // Phase 7.1: 修复 - 直接使用数据库中的 nextScheduledFetch 字段
  const calculateNextFetchTime = (feed: DiscoveredFeed): number | null => {
    // 优先使用数据库中已经计算好的 nextScheduledFetch
    if (feed.nextScheduledFetch) {
      return feed.nextScheduledFetch
    }
    
    // 降级方案：如果没有 nextScheduledFetch，尝试计算
    if (!feed.lastFetchedAt || !feed.isActive) {
      return null
    }

    // 使用 feed.updateFrequency（优先）或 feed.quality.updateFrequency（降级）
    const frequency = feed.updateFrequency || feed.quality?.updateFrequency || 0
    let intervalMs = 0

    if (frequency >= 7) {
      intervalMs = 6 * 60 * 60 * 1000  // 6 小时
    } else if (frequency >= 3) {
      intervalMs = 12 * 60 * 60 * 1000 // 12 小时
    } else if (frequency >= 1) {
      intervalMs = 24 * 60 * 60 * 1000 // 24 小时
    } else if (frequency >= 0.25) {
      intervalMs = 48 * 60 * 60 * 1000 // 48 小时（低频源）
    } else {
      intervalMs = 7 * 24 * 60 * 60 * 1000 // 7 天（超低频源）
    }

    return feed.lastFetchedAt + intervalMs
  }

  // 格式化时间间隔（如 "6小时后"）
  const formatTimeUntil = (timestamp: number) => {
    const now = Date.now()
    const diff = timestamp - now
    
    if (diff <= 0) {
      return _('options.rssManager.time.now')
    }

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days} ${_('options.rssManager.time.daysLater')}`
    } else if (hours > 0) {
      return `${hours} ${_('options.rssManager.time.hoursLater')}`
    } else if (minutes > 0) {
      return `${minutes} ${_('options.rssManager.time.minutesLater')}`
    } else {
      return _('options.rssManager.time.soon')
    }
  }
  
  // Phase 5.1.6: 手动订阅 RSS
  const handleManualAdd = async () => {
    if (!manualUrl.trim()) {
      setManualError(_('options.rssManager.errors.invalidUrl'))
      return
    }
    
    setIsManualAdding(true)
    setManualError('')
    setManualSuccess('')
    
    try {
      // 1. 验证 URL
      const validationResult = await RSSValidator.validateURL(manualUrl.trim())
      if (!validationResult.valid) {
        setManualError(validationResult.error || _('options.rssManager.errors.validationFailed'))
        return
      }
      
      // 2. 检查是否已存在
      const feedManager = new FeedManager()
      const existing = await feedManager.getFeedByUrl(manualUrl.trim())
      if (existing) {
        setManualError(_('options.rssManager.errors.alreadyExists'))
        return
      }
      
      // 3. 添加到订阅列表
      const metadata = validationResult.metadata!
      const domain = new URL(manualUrl.trim()).hostname
      
      const id = await feedManager.addCandidate({
        url: manualUrl.trim(),
        title: metadata.title,
        description: metadata.description,
        link: metadata.link,
        language: metadata.language,
        category: metadata.category,
        lastBuildDate: metadata.lastBuildDate,
        itemCount: metadata.itemCount,
        generator: metadata.generator,
        discoveredFrom: metadata.link || manualUrl.trim(), // 使用源网站链接或 RSS URL
        discoveredAt: Date.now(),
      })
      
      // 4. 直接订阅
      await feedManager.subscribe(id, 'manual')
      
      // 5. 刷新列表，先显示"分析中"状态
      await loadFeeds()
      
      // 6. 触发 AI 分析（异步，不阻塞 UI）
      // 注意：feedManager.analyzeFeed 内部会检查 AI 是否配置
      feedManager.analyzeFeed(id, true).catch(error => {
        rssManagerLogger.error('手动订阅源 AI 分析失败:', error)
      })
      
      // 7. 轮询检查分析完成（检查 category 或 quality）
      const checkAnalysis = async () => {
        for (let i = 0; i < 60; i++) {  // 最多等待 60 秒
          await new Promise(resolve => setTimeout(resolve, 1000))
          const updatedFeed = await feedManager.getFeed(id)
          // 检查是否有分类（AI 分析结果）或质量数据
          if (updatedFeed?.category || updatedFeed?.quality) {
            setSubscribedFeeds(prev => prev.map(f => 
              f.id === id ? updatedFeed : f
            ))
            break
          }
        }
      }
      checkAnalysis()
      
      // 8. 显示成功消息
      setManualSuccess(_('options.rssManager.success.subscribed'))
      
      // 9. 清空输入
      setManualUrl('')
      rssManagerLogger.info('手动订阅成功:', id)
    } catch (error) {
      setManualError(error instanceof Error ? error.message : _('options.rssManager.errors.subscribeFailed'))
      rssManagerLogger.error('手动订阅失败:', error)
    } finally {
      setIsManualAdding(false)
    }
  }
  
  // Phase 5.1.6: OPML 导入
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setIsImporting(true)
    setImportError('')
    
    try {
      // 1. 解析 OPML 文件
  const opmlFeeds = await OPMLImporter.fromFile(file)
  rssManagerLogger.info('解析 OPML 成功:', { count: opmlFeeds.length })
      
      // 2. 批量验证并添加
      const feedManager = new FeedManager()
      let successCount = 0
      let skipCount = 0
      let failCount = 0
      const importedIds: string[] = [] // 记录成功导入的 ID
      
      for (const opmlFeed of opmlFeeds) {
        try {
          // 检查是否已存在
          const existing = await feedManager.getFeedByUrl(opmlFeed.xmlUrl)
          if (existing) {
            skipCount++
            continue
          }
          
          // 验证 RSS（简化处理，不验证每个URL，因为OPML可能有大量源）
          const id = await feedManager.addCandidate({
            url: opmlFeed.xmlUrl,
            title: opmlFeed.title,
            description: opmlFeed.description,
            link: opmlFeed.htmlUrl,
            category: opmlFeed.category,
            discoveredFrom: opmlFeed.htmlUrl || opmlFeed.xmlUrl, // 使用网站链接或 RSS URL
            discoveredAt: Date.now(),
          })
          
          // 直接订阅
          await feedManager.subscribe(id, 'imported')
          importedIds.push(id)
          successCount++
        } catch (error) {
          failCount++
          rssManagerLogger.error('导入源失败:', { feedUrl: opmlFeed.xmlUrl, error })
        }
      }
      
      // 3. 批量触发 AI 分析（异步，不阻塞 UI）
      // 注意：feedManager.analyzeCandidates 内部会检查 AI 是否配置
      if (importedIds.length > 0) {
        rssManagerLogger.info(`开始 AI 分析 ${importedIds.length} 个导入的源...`)
        feedManager.analyzeCandidates(importedIds.length).catch(error => {
          rssManagerLogger.error('OPML 导入源 AI 分析失败:', error)
        })
      }
      
      // 4. 刷新列表
      await withScrollPreservation(async () => {
        await loadFeeds()
      })
      
      // 5. 显示结果
      rssManagerLogger.info(`OPML 导入完成: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}`)
      if (failCount > 0) {
        setImportError(_('options.rssManager.success.importedWithErrors', { successCount, skipCount, failCount }))
      }
      
      // 5. 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : _('options.rssManager.errors.importFailed'))
      rssManagerLogger.error('OPML 导入失败:', error)
    } finally {
      setIsImporting(false)
    }
  }
  
  // OPML 导出
  const handleExportOPML = async () => {
    try {
      rssManagerLogger.info('开始导出 OPML...')
      
      // 转换为 OPML 格式
      const opmlFeeds = subscribedFeeds.map(feed => ({
        title: feed.title,
        xmlUrl: feed.url,
        htmlUrl: feed.link,
        description: feed.description,
        category: feed.category,
      }))
      
      // 获取当前语言（从 i18n）
      const currentLang = i18n.language as 'zh-CN' | 'en'
      
      // 生成 OPML XML（使用当前界面语言）
      const opmlContent = OPMLImporter.generate(opmlFeeds, undefined, currentLang)
      
      // 创建下载
      const blob = new Blob([opmlContent], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `silentfeed-subscriptions-${new Date().toISOString().split('T')[0]}.opml`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      rssManagerLogger.info('OPML 导出成功:', { count: opmlFeeds.length })
    } catch (error) {
      rssManagerLogger.error('OPML 导出失败:', error)
      alert(_('options.rssManager.errors.exportFailed'))
    }
  }
  
  // 格式化语言显示（使用 i18n 翻译标准语言代码）
  const formatLanguage = (lang?: string): string => {
    if (!lang) return _('feedLanguage.unknown')
    // 尝试使用 feedLanguage 翻译
    const translationKey = `feedLanguage.${lang}`
    const translated = _(translationKey)
    // 如果翻译返回了 key 本身，说明没有这个翻译，直接显示原始值
    if (translated === translationKey) {
      return lang
    }
    return translated
  }
  
  // 获取质量评分颜色
  const getQualityColor = (score: number) => {
    if (score >= 70) return 'text-green-600 dark:text-green-400'
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }
  
  // 获取质量评分文本
  const getQualityText = (score: number) => {
    if (score >= 70) return _('options.rssManager.quality.high')
    if (score >= 50) return _('options.rssManager.quality.medium')
    return _('options.rssManager.quality.low')
  }
  
  // 获取分类显示文本（使用 i18n 翻译标准 key）
  const getCategoryText = (category: string | undefined): string => {
    if (!category) return ''
    // 如果是标准 key，使用翻译
    if (isValidCategoryKey(category)) {
      return _(`feedCategory.${category}`)
    }
    // 否则直接显示原始值（兼容旧数据）
    return category
  }

  // 手动触发订阅源 AI 分析
  const handleTriggerAnalysis = useCallback(async (feedId: string, feedTitle: string) => {
    // 如果已在分析中，跳过
    if (analyzingFeedIds.has(feedId)) return
    
    setAnalyzingFeedIds(prev => new Set(prev).add(feedId))
    rssManagerLogger.info(`手动触发订阅源分析: ${feedTitle} (${feedId})`)
    
    try {
      const service = getSourceAnalysisService()
      const result = await service.analyze(feedId, true) // force = true 强制重新分析
      
      if (result) {
        rssManagerLogger.info(`订阅源分析完成: ${feedTitle}`, result)
        // 重新加载数据以更新 UI
        await withScrollPreservation(async () => {
          await loadFeeds()
        })
      } else {
        rssManagerLogger.warn(`订阅源分析返回空结果: ${feedTitle}`)
      }
    } catch (error) {
      rssManagerLogger.error(`订阅源分析失败: ${feedTitle}`, error)
    } finally {
      setAnalyzingFeedIds(prev => {
        const next = new Set(prev)
        next.delete(feedId)
        return next
      })
    }
  }, [analyzingFeedIds])

  // 渲染源列表项（三行紧凑布局）
  // 子组件：订阅源行（允许使用 hooks）
  function FeedRow({ 
    feed, 
    actions,
    isAnalyzing,
    onTriggerAnalysis 
  }: { 
    feed: DiscoveredFeed
    actions: { label: string; onClick: () => void; className: string; row?: 2 | 3; disabled?: boolean }[]
    isAnalyzing?: boolean
    onTriggerAnalysis?: () => void
  }) {
    const nextFetchTime = feed.status === 'subscribed' ? calculateNextFetchTime(feed) : null
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editedTitle, setEditedTitle] = useState(feed.title)
    
    // 安全获取域名
    const getHostname = (url: string): string => {
      try {
        return new URL(url).hostname
      } catch {
        return url
      }
    }
    
    // 分组按钮：第二行和第三行
    const row2Actions = actions.filter(a => !a.row || a.row === 2)
    const row3Actions = actions.filter(a => a.row === 3)
    
    return (
      <div 
        key={feed.id}
        className="group flex flex-col gap-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
      >
        {/* 第一行：RSS 本身属性 */}
        <div className="flex items-center gap-2 text-sm">
          {/* 标题（带 favicon）- 放在最左边 */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <img 
              src={getFaviconUrl(feed.link || feed.url)} 
              alt="" 
              className="w-4 h-4 flex-shrink-0"
              onError={handleFaviconError}
            />
            {isEditingTitle ? (
              <input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={async () => {
                  try {
                    const fm = new FeedManager()
                    await fm.renameTitle(feed.id, editedTitle)
                    // 更新本地列表中的标题
                    setCandidateFeeds(prev => prev.map(f => f.id === feed.id ? { ...f, title: editedTitle } : f))
                    setSubscribedFeeds(prev => prev.map(f => f.id === feed.id ? { ...f, title: editedTitle } : f))
                    setIgnoredFeeds(prev => prev.map(f => f.id === feed.id ? { ...f, title: editedTitle } : f))
                  } catch (error) {
                    rssManagerLogger.error('重命名失败:', error)
                    alert(_('options.rssManager.errors.renameFailed'))
                  } finally {
                    setIsEditingTitle(false)
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    setEditedTitle(feed.title)
                    setIsEditingTitle(false)
                  }
                }}
                className="flex-1 px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                autoFocus
              />
            ) : (
              <>
                {/* 标题（可点击打开 XML） */}
                <a
                  href={feed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline truncate"
                  title={`${_('options.rssManager.openXML')}\n${feed.url}`}
                  onMouseEnter={(e) => {
                    // 显示完整 URL
                    e.currentTarget.title = feed.url
                  }}
                >
                  <span className="truncate">
                    {formatFeedTitle(feed.title, getHostname(feed.link || feed.url))}
                  </span>
                </a>
                
                {/* 展开/折叠图标 */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    loadPreviewArticles(feed.id, feed.url)
                  }}
                  className="ml-1 px-1 py-0.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  title={expandedFeedId === feed.id ? _('options.rssManager.preview.collapse') : _('options.rssManager.preview.expand')}
                >
                  {expandedFeedId === feed.id ? '▼' : '▶'}                
                </button>
              </>
            )}

            {/* 内联重命名按钮 */}
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setEditedTitle(feed.title)
                setIsEditingTitle(true)
              }}
              className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              title={_('options.rssManager.actions.rename')}
            >
              ✎
            </button>
          </div>
          
          {/* 分析中状态 */}
          {isAnalyzing && (
            <span 
              className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-medium flex-shrink-0 animate-pulse"
              title={_('options.rssManager.analysis.analyzing')}
            >
              ⟳ {_('options.rssManager.analysis.analyzing')}
            </span>
          )}
          
          {/* 质量文本图标 - 只显示已订阅源的分析结果 */}
          {feed.status === 'subscribed' && !isAnalyzing && feed.quality && (
            <button 
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onTriggerAnalysis?.()
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${
                feed.quality.score >= 70 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:ring-green-400' 
                  : feed.quality.score >= 50 
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:ring-yellow-400' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:ring-red-400'
              }`}
              title={`${_('options.rssManager.quality.score')}: ${feed.quality.score}/100\n${_('options.rssManager.analysis.clickToReanalyze')}`}
            >
              {getQualityText(feed.quality.score)}
            </button>
          )}
          
          {/* 无质量数据时显示分析按钮 - 只对已订阅源 */}
          {feed.status === 'subscribed' && !isAnalyzing && !feed.quality && onTriggerAnalysis && (
            <button 
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onTriggerAnalysis()
              }}
              className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[10px] font-medium flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={_('options.rssManager.analysis.clickToAnalyze')}
            >
              🔍 {_('options.rssManager.analysis.analyze')}
            </button>
          )}
          
          {/* 类别文本图标 - 只显示已订阅源的分析结果 */}
          {feed.status === 'subscribed' && !isAnalyzing && feed.category && (
            <button 
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onTriggerAnalysis?.()
              }}
              className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-medium flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-purple-400 transition-all"
              title={`${_('options.rssManager.category')}: ${getCategoryText(feed.category)}\n${_('options.rssManager.analysis.clickToReanalyze')}`}
            >
              {getCategoryText(feed.category)}
            </button>
          )}
          
          {/* 语言标签 + 翻译开关组合 */}
          {feed.language ? (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* 语言代码 */}
              <span 
                className={`px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-l text-xs uppercase ${
                  isSketchyStyle ? 'sketchy-text font-semibold' : 'font-mono font-bold'
                }`}
                title={formatLanguage(feed.language)}
              >
                {feed.language}
              </span>
              {/* 翻译开关（仅已订阅的源）*/}
              {feed.status === 'subscribed' && (() => {
                // 检查订阅源语言是否与界面语言相同
                const currentLang = i18n.language || 'zh-CN'
                const isSameLanguage = feed.language.toLowerCase().startsWith(currentLang.toLowerCase().split('-')[0]) ||
                  currentLang.toLowerCase().startsWith(feed.language.toLowerCase().split('-')[0])
                
                return (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!isSameLanguage) {
                        handleToggleGoogleTranslate(feed.id)
                      }
                    }}
                    disabled={isSameLanguage}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-r text-xs transition-colors ${
                      isSameLanguage
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60'
                        : feed.useGoogleTranslate !== false
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={
                      isSameLanguage
                        ? _('options.rssManager.googleTranslate.sameLanguage')
                        : feed.useGoogleTranslate !== false 
                          ? _('options.rssManager.googleTranslate.enabled')
                          : _('options.rssManager.googleTranslate.disabled')
                    }
                  >
                    <span>{isSameLanguage ? '=' : (feed.useGoogleTranslate !== false ? '🌐' : '🚫')}</span>
                    <span>{_('options.rssManager.googleTranslate.label')}</span>
                  </button>
                )
              })()}
            </div>
          ) : null}
          
          {/* RSS/ATOM 徽章 - 右侧对齐，固定宽度 */}
          <a 
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center w-12 px-1.5 py-0.5 text-white text-xs rounded flex-shrink-0 hover:opacity-80 transition-opacity ${
              isSketchyStyle ? 'sketchy-text font-semibold' : 'font-mono font-bold'
            }`}
            style={{ backgroundColor: '#FF6600' }}
            title={_('options.rssManager.openXML')}
          >
            {getFormatBadge(feed.url)}
          </a>
        </div>
        
        {/* 第二行：订阅/发现信息 + 文章统计 + 操作按钮 */}
        <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 已订阅源：订阅时间 */}
            {feed.status === 'subscribed' && feed.subscribedAt ? (
              <>
                <span className="flex items-center gap-1 truncate">
                  <span>📌</span>
                  <span className="truncate">{_('options.rssManager.subscribedAt')}: {formatDateTime(feed.subscribedAt)}</span>
                </span>
                
                {/* 订阅方式 */}
                {feed.subscriptionSource && (
                  <>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      feed.subscriptionSource === 'manual'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : feed.subscriptionSource === 'imported'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>
                      {feed.subscriptionSource === 'manual' 
                        ? _('options.rssManager.source.manual')
                        : feed.subscriptionSource === 'imported'
                        ? _('options.rssManager.source.imported')
                        : _('options.rssManager.source.discovered')}
                    </span>
                  </>
                )}
                
                {/* 暂停状态 */}
                {!feed.isActive && (
                  <>
                    <span>•</span>
                    <span className="text-gray-400 dark:text-gray-500">
                      ⏸ {_('options.rssManager.status.paused')}
                    </span>
                  </>
                )}
                
                {/* 更新进度条（已订阅且活跃的源）*/}
                {feed.isActive && feed.lastFetchedAt && (() => {
                  const nextFetchTime = calculateNextFetchTime(feed)
                  if (!nextFetchTime) return null
                  
                  const lastFetch = feed.lastFetchedAt
                  const nextFetch = nextFetchTime
                  const now = Date.now()
                  const totalDuration = nextFetch - lastFetch
                  const elapsed = now - lastFetch
                  const progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100))
                  const durationDays = totalDuration / (24 * 60 * 60 * 1000)
                  const barWidth = Math.min(180, Math.max(60, durationDays * 60))
                  
                  return (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-1.5">
                        <span>⏱️</span>
                        <div 
                          className="h-px bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-visible cursor-help"
                          style={{ width: `${barWidth}px` }}
                          title={`${_('options.rssManager.stats.progress')}: ${progress.toFixed(1)}%\n${_('options.rssManager.stats.cycle')}: ${durationDays.toFixed(1)} ${_('options.rssManager.stats.days')}\n${_('options.rssManager.stats.lastFetch')}: ${formatDateTime(lastFetch)}\n${_('options.rssManager.stats.currentTime')}: ${formatDateTime(now)}\n${_('options.rssManager.stats.nextFetch')}: ${formatDateTime(nextFetch)}`}
                        >
                          <div 
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-gray-400 to-green-500 dark:from-gray-500 dark:to-green-600 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full border-2 border-white dark:border-gray-800 shadow-sm transition-all duration-300"
                            style={{ left: `calc(${progress}% - 4px)` }}
                          />
                        </div>
                        <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {formatTimeUntil(nextFetch)}
                        </span>
                      </div>
                    </>
                  )
                })()}
                
                {/* 每周篇数（已订阅的源）*/}
                {((feed.updateFrequency && feed.updateFrequency > 0) || 
                  (feed.quality && feed.quality.updateFrequency > 0)) && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <span>📊</span>
                      <span>
                        {(feed.updateFrequency || feed.quality?.updateFrequency || 0).toFixed(1)}{' '}
                        {_('options.rssManager.fetch.perWeek')}
                      </span>
                    </span>
                  </>
                )}
              </>
            ) : (
              /* 候选源和忽略源：发现信息 */
              <>
                {feed.discoveredFrom && (
                  <span className="flex items-center gap-1 truncate">
                    <span>🔍</span>
                    <span className="truncate">{_('options.rssManager.discoveredAt')}: {formatDateTime(feed.discoveredAt)}</span>
                  </span>
                )}
                
                {/* 订阅来源（忽略列表可能有） */}
                {feed.subscriptionSource && (
                  <>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      feed.subscriptionSource === 'manual'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : feed.subscriptionSource === 'imported'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>
                      {feed.subscriptionSource === 'manual' 
                        ? _('options.rssManager.source.manual')
                        : feed.subscriptionSource === 'imported'
                        ? _('options.rssManager.source.imported')
                        : _('options.rssManager.source.discovered')}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          
          {/* 第二行操作按钮 */}
          {row2Actions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {row2Actions.map((action) => (
                <button
                  key={`${feed.id}-${action.label}`}
                  type="button"
                  onClick={(e) => {
                    console.log(`[RSSSettings] 按钮点击:`, {
                      feedId: feed.id,
                      feedTitle: feed.title,
                      subscriptionSource: feed.subscriptionSource,
                      actionLabel: action.label
                    })
                    e.preventDefault()
                    e.stopPropagation()
                    action.onClick()
                  }}
                  disabled={action.disabled}
                  className={`${action.className} text-white text-xs px-2 py-1 rounded hover:opacity-90 transition-opacity whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* 第三行和第四行：漏斗统计（分文章池和在源中两种情况）*/}
        {feed.status === 'subscribed' && feed.articleCount > 0 && (() => {
          // 获取文章池和在源中两种统计数据
          const poolStats = feedPoolStatsMap[feed.id]
          const inFeedStats = feedInFeedStatsMap[feed.id]
          
          if (!poolStats && !inFeedStats) {
            // 如果没有统计数据，显示简单计数
            return (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>📰</span>
                <span>{feed.articleCount} {_('options.rssManager.fetch.articles')}</span>
              </div>
            )
          }
          
          // 渲染单行统计的函数（使用块进度条可视化）
          const renderFunnelRow = (inFeedStats: FeedFunnelStats | undefined, poolStats: FeedFunnelStats | undefined) => {
            if (!inFeedStats || !poolStats) return null
            return <FunnelBlockBar inFeedStats={inFeedStats} poolStats={poolStats} />
          }
          
          return (
            <>
              {/* 漏斗统计：只显示在源中的数据，右侧显示文章池的汇总 */}
              {renderFunnelRow(inFeedStats, poolStats)}
            </>
          )
        })()}
        
        {/* 候选源和忽略源：显示发现时的统计或提示 */}
        {(feed.status === 'candidate' || feed.status === 'ignored') && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {/* 发现时的文章数 */}
            {feed.itemCount && feed.itemCount > 0 ? (
              <>
                <span className="flex items-center gap-1">
                  <span>📰</span>
                  <span>{feed.itemCount} {_('options.rssManager.fetch.articles')}</span>
                </span>
                
                {/* 预估每周文章数 */}
                {feed.quality && feed.quality.updateFrequency > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <span>📊</span>
                      <span>{feed.quality.updateFrequency.toFixed(1)} {_('options.rssManager.fetch.perWeek')}</span>
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-500 text-xs">
                💡 订阅后才会抓取文章
              </span>
            )}
          </div>
        )}
        
        {/* 文章预览区域 */}
        {expandedFeedId === feed.id && previewArticles[feed.id] && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              {_('options.rssManager.preview.latestArticles')}
            </div>
            {previewArticles[feed.id].length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {previewArticles[feed.id].map((item, idx) => (
                  <div key={item.link || `${feed.id}-article-${idx}`} className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline block"
                    >
                      {decodeHtmlEntities(item.title)}
                    </a>
                    {item.pubDate && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 block">
                        {formatDateTimeI18n(item.pubDate.getTime())}
                      </span>
                    )}
                    {item.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {decodeHtmlEntities(item.description.replace(/<[^>]*>/g, '').substring(0, 200))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                {_('options.rssManager.preview.noArticles')}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  const totalFeeds = candidateFeeds.length + subscribedFeeds.length + ignoredFeeds.length

  return (
    <div className="space-y-6">
      {/* 加载指示：保留但不阻塞输入区域 */}
      {loading && (
        <div className="py-4 text-center">
          <div className="text-2xl animate-pulse">⏳</div>
          <p className="text-xs text-gray-500 mt-1">{_('options.rssManager.loading')}</p>
        </div>
      )}
      {/* Phase 5.1.6: 手动订阅和 OPML 导入 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-3">
          ➕ {_('options.rssManager.addSource')}
        </h3>
        
        {/* 手动订阅 URL */}
        <div className="mb-4">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
            {_('options.rssManager.manualSubscribe')}
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder={_('options.rssManager.manualPlaceholder')}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isManualAdding}
            />
            <button
              onClick={handleManualAdd}
              disabled={isManualAdding || !manualUrl.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {isManualAdding ? _('options.rssManager.subscribing') : _('options.rssManager.subscribe')}
            </button>
          </div>
          {manualError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {manualError}
            </p>
          )}
          {manualSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              {manualSuccess}
            </p>
          )}
        </div>
        
        {/* OPML 导入/导出 */}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
            {_('options.rssManager.importExportOPML')}
          </label>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isImporting}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1"
            >
              {isImporting ? (
                _('options.rssManager.importing')
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {_('options.rssManager.importOPML')}
                </>
              )}
            </button>
            <button
              onClick={handleExportOPML}
              disabled={subscribedFeeds.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1"
              title={subscribedFeeds.length === 0 ? _('options.rssManager.noSubscribedFeeds') : ''}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {_('options.rssManager.exportOPML')}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 self-center">
              {_('options.rssManager.opmlHint')}
            </p>
          </div>
          {importError && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              {importError}
            </p>
          )}
        </div>
      </div>
      
      {/* 1. 待处理的候选源 */}
      {candidateFeeds.length > 0 && (
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              📡 {_('options.rssManager.discoveredFeeds', { count: candidateFeeds.length })}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {_('options.rssManager.discoveredFeedsHint')}
            </p>
          </div>

          <div className="space-y-2">
            {candidateFeeds.map((feed) => (
              <FeedRow 
                key={feed.id} 
                feed={feed} 
                isAnalyzing={analyzingFeedIds.has(feed.id)}
                onTriggerAnalysis={() => handleTriggerAnalysis(feed.id, feed.title)}
                actions={[
              {
                label: _('options.rssManager.actions.subscribe'),
                onClick: () => handleSubscribe(feed.id),
                className: 'bg-green-500 hover:bg-green-600',
                row: 2
              },
              {
                label: _('options.rssManager.actions.ignore'),
                onClick: () => handleIgnore(feed.id),
                className: 'bg-gray-400 hover:bg-gray-500 dark:bg-gray-600 dark:hover:bg-gray-500',
                row: 2
              }
            ]} />
            ))}
          </div>
        </div>
      )}
      
      {/* 2. 已订阅的源 */}
      {subscribedFeeds.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                ✓ {_('options.rssManager.subscribedFeeds', { count: subscribedFeeds.length })}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_('options.rssManager.subscribedFeedsHint')}
              </p>
            </div>
            <button
              onClick={handleFetchAllFeeds}
              disabled={isFetchingAll || fetchCompleted.all}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors"
            >
              {isFetchingAll 
                ? _('options.rssManager.actions.fetchingAll') 
                : fetchCompleted.all 
                ? _('options.rssManager.actions.fetchAllCompleted') 
                : _('options.rssManager.actions.fetchAll')}
            </button>
          </div>

          <div className="space-y-2">
            {subscribedFeeds.map((feed) => (
              <FeedRow 
                key={feed.id} 
                feed={feed} 
                isAnalyzing={analyzingFeedIds.has(feed.id)}
                onTriggerAnalysis={() => handleTriggerAnalysis(feed.id, feed.title)}
                actions={[
              // 第二行：读取 + 暂停/恢复 + 取消订阅
              {
                label: isFetchingSingle === feed.id 
                  ? _('options.rssManager.actions.fetching')
                  : fetchCompleted.single === feed.id 
                  ? _('options.rssManager.actions.fetchCompleted')
                  : _('options.rssManager.actions.fetch'),
                onClick: () => handleFetchSingleFeed(feed.id),
                className: 'bg-green-500 hover:bg-green-600 disabled:bg-gray-400',
                disabled: isFetchingSingle === feed.id || fetchCompleted.single === feed.id,
                row: 2
              },
              {
                label: feed.isActive ? _('options.rssManager.actions.pause') : _('options.rssManager.actions.resume'),
                onClick: () => handleToggleActive(feed.id),
                className: feed.isActive 
                  ? 'bg-gray-400 hover:bg-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-700',
                row: 2
              },
              {
                label: _('options.rssManager.actions.unsubscribe'),
                onClick: () => handleUnsubscribe(feed.id),
                className: 'bg-orange-500 hover:bg-orange-600',
                row: 2
              }
            ]} />
            ))}
            {/* 汇总：漏斗统计（分文章池和在源中）*/}
            {subscribedFeeds.length > 0 && (() => {
              // 聚合文章池统计
              const allPoolStats = subscribedFeeds.map(f => feedPoolStatsMap[f.id]).filter(Boolean)
              // 聚合在源中统计
              const allInFeedStats = subscribedFeeds.map(f => feedInFeedStatsMap[f.id]).filter(Boolean)
              
              if (allPoolStats.length === 0 && allInFeedStats.length === 0) {
                return null  // 如果没有统计数据，不显示汇总
              }
              
              // 计算汇总函数
              const calculateTotal = (stats: FeedFunnelStats[]) => {
                const total = {
                  rssArticles: stats.reduce((sum, s) => sum + s.rssArticles, 0),
                  analyzed: stats.reduce((sum, s) => sum + s.analyzed, 0),
                  candidate: stats.reduce((sum, s) => sum + s.candidate, 0),
                  recommended: stats.reduce((sum, s) => sum + s.recommended, 0),
                  raw: stats.reduce((sum, s) => sum + s.raw, 0),
                  stale: stats.reduce((sum, s) => sum + s.stale, 0),
                  prescreenedOut: stats.reduce((sum, s) => sum + s.prescreenedOut, 0),
                  analyzedNotQualified: stats.reduce((sum, s) => sum + s.analyzedNotQualified, 0),
                  currentCandidate: stats.reduce((sum, s) => sum + s.currentCandidate, 0),
                  currentRecommended: stats.reduce((sum, s) => sum + s.currentRecommended, 0),
                  exited: stats.reduce((sum, s) => sum + s.exited, 0),
                }
                return total
              }
              
              const totalPool = calculateTotal(allPoolStats)
              const totalInFeed = calculateTotal(allInFeedStats)
              
              // 彩色块的分类配置（与 FunnelBlockBar 保持一致）
              const BLOCK_CATEGORIES = [
                { key: 'raw', labelKey: 'options.rssManager.status.raw', color: 'bg-gray-500' },
                { key: 'stale', labelKey: 'options.rssManager.status.stale', color: 'bg-yellow-700' },
                { key: 'prescreenedOut', labelKey: 'options.rssManager.status.prescreenedOut', color: 'bg-red-600' },
                { key: 'analyzedNotQualified', labelKey: 'options.rssManager.status.analyzedNotQualified', color: 'bg-orange-500' },
                { key: 'currentCandidate', labelKey: 'options.rssManager.status.currentCandidate', color: 'bg-amber-500' },
                { key: 'currentRecommended', labelKey: 'options.rssManager.status.currentRecommended', color: 'bg-green-600' },
                { key: 'exited', labelKey: 'options.rssManager.status.exited', color: 'bg-blue-600' }
              ]
              
              // 渲染汇总行的函数（块+数字 + 连贯等式）
              const renderSummaryRow = (total: any, label: string, icon: string, bgColor: string, borderColor: string, textColor: string) => {
                // 验证等式：rssArticles - raw - stale - prescreenedOut = analyzed
                const analyzedCalc = total.rssArticles - total.raw - total.stale - total.prescreenedOut
                const isValid1 = analyzedCalc === total.analyzed
                
                // 验证等式：analyzed = analyzedNotQualified + currentCandidate + currentRecommended + exited
                const analyzedSum = total.analyzedNotQualified + total.currentCandidate + total.currentRecommended + total.exited
                const isValid2 = analyzedSum === total.analyzed
                
                // 获取分类颜色的辅助函数
                const getColorForKey = (key: string) => {
                  return BLOCK_CATEGORIES.find(cat => cat.key === key)?.color || 'bg-gray-400'
                }
                
                // 渲染标签样式的方块+数字组合（固定宽度保持一致）
                const renderTag = (color: string, value: number, title: string) => (
                  <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-help"
                       title={title}>
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${color}`} />
                    <span className="text-[11px] font-medium w-8 text-right">{value}</span>
                  </div>
                )
                
                return (
                  <div className={`p-3 ${bgColor} rounded-lg border ${borderColor}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${textColor} flex items-center gap-1.5`}>
                        <span>{icon}</span>
                        <span>{label}</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-gray-600 dark:text-gray-300">
                        {/* 左边：rssArticles - raw - stale - prescreenedOut */}
                        {renderTag('bg-slate-400', total.rssArticles, `${_('options.rssManager.funnel.rssArticles') || 'RSS总数'}: ${total.rssArticles}`)}
                        <span className="text-gray-400">-</span>
                        {renderTag(getColorForKey('raw'), total.raw, `${_('options.rssManager.status.raw') || '待分析'}: ${total.raw}`)}
                        <span className="text-gray-400">-</span>
                        {renderTag(getColorForKey('stale'), total.stale, `${_('options.rssManager.status.stale') || '已过时'}: ${total.stale}`)}
                        <span className="text-gray-400">-</span>
                        {renderTag(getColorForKey('prescreenedOut'), total.prescreenedOut, `${_('options.rssManager.status.prescreenedOut') || '初筛淘汰'}: ${total.prescreenedOut}`)}
                        
                        {/* 第一个等号 */}
                        <span className={`font-bold ${isValid1 ? 'text-green-500' : 'text-red-500'}`}>
                          {isValid1 ? '=' : '≠'}
                        </span>
                        
                        {/* 中间：analyzed */}
                        {renderTag('bg-indigo-500', total.analyzed, `${_('options.rssManager.funnel.analyzed') || '已分析'}: ${total.analyzed} (${isValid1 ? '计算正确' : `计算值: ${analyzedCalc}, 差值: ${total.analyzed - analyzedCalc}`})`)}
                        
                        {/* 第二个等号 */}
                        <span className={`font-bold ${isValid2 ? 'text-green-500' : 'text-red-500'}`}>
                          {isValid2 ? '=' : '≠'}
                        </span>
                        
                        {/* 右边：analyzedNotQualified + currentCandidate + currentRecommended + exited */}
                        {renderTag(getColorForKey('analyzedNotQualified'), total.analyzedNotQualified, `${_('options.rssManager.status.analyzedNotQualified') || '分析未达标'}: ${total.analyzedNotQualified}`)}
                        <span className="text-gray-400">+</span>
                        {renderTag(getColorForKey('currentCandidate'), total.currentCandidate, `${_('options.rssManager.status.currentCandidate') || '当前候选池'}: ${total.currentCandidate}`)}
                        <span className="text-gray-400">+</span>
                        {renderTag(getColorForKey('currentRecommended'), total.currentRecommended, `${_('options.rssManager.status.currentRecommended') || '当前推荐池'}: ${total.currentRecommended}`)}
                        <span className="text-gray-400">+</span>
                        {renderTag(getColorForKey('exited'), total.exited, `${_('options.rssManager.status.exited') || '已退出'}: ${total.exited}`)}
                      </div>
                    </div>
                  </div>
                )
              }
              
              return (
                <div className="mt-3 space-y-2">
                  {/* 文章池汇总 */}
                  {allPoolStats.length > 0 && renderSummaryRow(
                    totalPool,
                    _('options.rssManager.stats.poolSummary') || '文章池汇总',
                    '📦',
                    'bg-purple-50 dark:bg-purple-900/20',
                    'border-purple-200 dark:border-purple-700',
                    'text-purple-700 dark:text-purple-300'
                  )}
                  
                  {/* 在源中汇总 */}
                  {allInFeedStats.length > 0 && renderSummaryRow(
                    totalInFeed,
                    _('options.rssManager.stats.inFeedSummary') || '在源中汇总',
                    '📚',
                    'bg-blue-50 dark:bg-blue-900/20',
                    'border-blue-200 dark:border-blue-700',
                    'text-blue-700 dark:text-blue-300'
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
      
      {/* 3. 已忽略的源（折叠） */}
      {ignoredFeeds.length > 0 && (
        <div>
          <button
            onClick={() => setShowIgnored(!showIgnored)}
            className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                🚫 {_('options.rssManager.ignoredFeeds', { count: ignoredFeeds.length })}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {_('options.rssManager.clickToToggle', { action: showIgnored ? _('options.rssManager.collapse') : _('options.rssManager.expand') })}
              </span>
            </div>
            <span className="text-gray-500 dark:text-gray-400">
              {showIgnored ? '▼' : '▶'}
            </span>
          </button>

          {showIgnored && (
            <div className="mt-2 space-y-2">
              {ignoredFeeds.map((feed) => (
                <FeedRow 
                  key={feed.id} 
                  feed={feed} 
                  isAnalyzing={analyzingFeedIds.has(feed.id)}
                  onTriggerAnalysis={() => handleTriggerAnalysis(feed.id, feed.title)}
                  actions={[
                {
                  label: _('options.rssManager.actions.subscribe'),
                  onClick: () => handleSubscribeIgnored(feed.id),
                  className: 'bg-green-500 hover:bg-green-600',
                  row: 2
                },
                {
                  label: _('options.rssManager.actions.delete'),
                  onClick: () => handleDelete(feed.id),
                  className: 'bg-red-700 hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-900',
                  row: 2
                }
              ]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
