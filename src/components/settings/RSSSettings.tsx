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
import { formatDateTime as formatDateTimeI18n } from "@/utils/date-formatter"
import { isValidCategoryKey, type FeedCategoryKey } from "@/types/feed-category"

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

  useEffect(() => {
    loadFeeds()
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
        await loadFeeds()
        
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
        
        await loadFeeds()
        
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
      await loadFeeds()
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
      
      // 6. 触发质量分析（异步，不阻塞 UI）
      feedManager.analyzeFeed(id, true).catch(error => {
        rssManagerLogger.error('手动订阅源质量分析失败:', error)
      })
      
      // 7. 轮询检查质量分析完成
      const checkQuality = async () => {
        for (let i = 0; i < 60; i++) {  // 最多等待 60 秒
          await new Promise(resolve => setTimeout(resolve, 1000))
          const updatedFeed = await feedManager.getFeed(id)
          if (updatedFeed?.quality) {
            setSubscribedFeeds(prev => prev.map(f => 
              f.id === id ? updatedFeed : f
            ))
            break
          }
        }
      }
      checkQuality()
      
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
      
      // 3. 批量触发质量分析（异步，不阻塞 UI）
      if (importedIds.length > 0) {
        rssManagerLogger.info(`开始分析 ${importedIds.length} 个导入的源...`)
        feedManager.analyzeCandidates(importedIds.length).catch(error => {
          rssManagerLogger.error('OPML 导入源质量分析失败:', error)
        })
      }
      
      // 4. 刷新列表
      await loadFeeds()
      
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
        await loadFeeds()
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
                  onClick={() => loadPreviewArticles(feed.id, feed.url)}
                  className="ml-1 px-1 py-0.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  title={expandedFeedId === feed.id ? _('options.rssManager.preview.collapse') : _('options.rssManager.preview.expand')}
                >
                  {expandedFeedId === feed.id ? '▼' : '▶'}
                </button>
              </>
            )}

            {/* 内联重命名按钮 */}
            <button
              onClick={() => {
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
          
          {/* 质量文本图标 - 可点击触发重新分析 */}
          {!isAnalyzing && feed.quality && (
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
          
          {/* 无质量数据时显示分析按钮 */}
          {!isAnalyzing && !feed.quality && onTriggerAnalysis && (
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
          
          {/* 类别文本图标 - 可点击触发重新分析 */}
          {!isAnalyzing && feed.category && (
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
              {feed.status === 'subscribed' && (
                <button
                  onClick={() => handleToggleGoogleTranslate(feed.id)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-r text-xs transition-colors ${
                    feed.useGoogleTranslate !== false
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title={feed.useGoogleTranslate !== false 
                    ? _('options.rssManager.googleTranslate.enabled')
                    : _('options.rssManager.googleTranslate.disabled')
                  }
                >
                  <span>{feed.useGoogleTranslate !== false ? '🌐' : '🚫'}</span>
                  <span>{_('options.rssManager.googleTranslate.label')}</span>
                </button>
              )}
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
              {row2Actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`${action.className} text-white text-xs px-2 py-1 rounded hover:opacity-90 transition-opacity whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* 第三行：文章统计数据条（完整宽度）*/}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {/* 已订阅源：文章统计可视化 */}
          {feed.status === 'subscribed' && feed.articleCount > 0 && (() => {
            // Phase 10: 基于新架构统计（只显示仍在源中的文章）
            const totalArticles = feed.articleCount || 0        // 所有文章（包括历史）
            const inFeedCount = feed.inFeedCount || 0           // 仍在RSS源中
            const inFeedAnalyzedCount = feed.inFeedAnalyzedCount || 0
            const inFeedRecommendedCount = feed.inFeedRecommendedCount || 0  // 已推荐但未操作
            const inFeedReadCount = feed.inFeedReadCount || 0
            const inFeedDislikedCount = feed.inFeedDislikedCount || 0
            
            // 推荐相关统计（历史总数，用于显示图标）
            const totalRecommended = feed.recommendedCount || 0
            const totalDisliked = feed.dislikedCount || 0
            
            // Phase 10: 进度条只显示"仍在源中"的文章（inFeed=true）
            const displayTotal = inFeedCount
            
            if (displayTotal === 0) {
              // 如果没有在源中的文章，显示简单统计
              return (
                <div className="flex items-center gap-2">
                  <span>📰</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{totalArticles}</span>
                  <span className="text-gray-400">({_('options.rssManager.stats.allHistorical')})</span>
                </div>
              )
            }
            
            // 计算各类型文章数（只统计 inFeed=true 的文章）
            // 5 种颜色分类：绿色（已推荐未操作）、蓝色（已阅读）、红色（不想读）、灰色（已分析未推荐）、白色（未分析）
            const recommendedBlocks = inFeedRecommendedCount  // 绿色
            const readBlocks = inFeedReadCount                // 蓝色
            const dislikedBlocks = inFeedDislikedCount        // 红色
            const analyzedNotRecommendedBlocks = Math.max(0, 
              inFeedAnalyzedCount - inFeedRecommendedCount - inFeedReadCount - inFeedDislikedCount
            )  // 灰色
            const unanalyzedBlocks = Math.max(0, displayTotal - inFeedAnalyzedCount)  // 白色
            
            // 构建方块数组
            const blocks: Array<{
              type: 'recommended' | 'read' | 'disliked' | 'analyzed' | 'unanalyzed'
              className: string
              tooltip: string
            }> = []
            
            // 已推荐（绿色）
            for (let i = 0; i < recommendedBlocks; i++) {
              blocks.push({
                type: 'recommended',
                className: 'bg-green-400 dark:bg-green-500 border border-green-500 dark:border-green-600',
                tooltip: `${_('options.rssManager.stats.recommended')}: ${inFeedRecommendedCount} ${_('options.rssManager.stats.articles')}`
              })
            }
            
            // 已阅读（蓝色）
            for (let i = 0; i < readBlocks; i++) {
              blocks.push({
                type: 'read',
                className: 'bg-blue-400 dark:bg-blue-500 border border-blue-500 dark:border-blue-600',
                tooltip: `${_('options.rssManager.stats.read')}: ${inFeedReadCount} ${_('options.rssManager.stats.articles')}`
              })
            }
            
            // 不想读（红色）
            for (let i = 0; i < dislikedBlocks; i++) {
              blocks.push({
                type: 'disliked',
                className: 'bg-red-400 dark:bg-red-500 border border-red-500 dark:border-red-600',
                tooltip: `${_('options.rssManager.stats.disliked')}: ${inFeedDislikedCount} ${_('options.rssManager.stats.articles')}`
              })
            }
            
            // 已分析但未推荐（灰色）
            for (let i = 0; i < analyzedNotRecommendedBlocks; i++) {
              blocks.push({
                type: 'analyzed',
                className: 'bg-gray-200 dark:bg-gray-500 border border-gray-300 dark:border-gray-600',
                tooltip: `${_('options.rssManager.stats.analyzed')}: ${inFeedAnalyzedCount} ${_('options.rssManager.stats.articles')}`
              })
            }
            
            // 未分析（白色边框）
            for (let i = 0; i < unanalyzedBlocks; i++) {
              blocks.push({
                type: 'unanalyzed',
                className: 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
                tooltip: `${_('options.rssManager.stats.unanalyzed')}: ${unanalyzedBlocks} ${_('options.rssManager.stats.articles')}`
              })
            }
            
            // 最多显示 50 个方块（每块=1篇）
            const maxVisible = 50
            const visibleBlocks = blocks.slice(0, maxVisible)
            const hiddenCount = blocks.length - visibleBlocks.length
            
            return (
              <div className="flex items-center gap-2 flex-1">
                {/* 总数标签（显示在源中的文章数）*/}
                <span 
                  className="flex items-center gap-1 flex-shrink-0 cursor-help"
                  title={totalArticles > displayTotal 
                    ? _('options.rssManager.stats.articleCountTooltip', { inFeed: displayTotal, total: totalArticles })
                    : _('options.rssManager.stats.articleCountSimpleTooltip', { count: displayTotal })
                  }
                >
                  <span>📰</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {displayTotal}
                  </span>
                  {totalArticles > displayTotal && (
                    <span className="text-gray-400 text-xs">
                      /{totalArticles}
                    </span>
                  )}
                </span>
                
                {/* 方块可视化 */}
                <div className="flex items-center gap-0.5 flex-wrap flex-1">
                  {visibleBlocks.map((block, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-sm cursor-help transition-transform hover:scale-150 ${block.className}`}
                      title={block.tooltip}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                      +{hiddenCount}
                    </span>
                  )}
                </div>
                
                {/* 简洁数字图例 */}
                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                  {inFeedRecommendedCount > 0 && (
                    <span className="flex items-center gap-1 cursor-help" title={_('options.rssManager.stats.recommendedTooltip')}>
                      <span className="w-2 h-2 bg-green-400 dark:bg-green-500 rounded-sm"></span>
                      <span>{inFeedRecommendedCount}</span>
                    </span>
                  )}
                  {inFeedReadCount > 0 && (
                    <span className="flex items-center gap-1 cursor-help" title={_('options.rssManager.stats.readTooltip')}>
                      <span className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-sm"></span>
                      <span>{inFeedReadCount}</span>
                    </span>
                  )}
                  {inFeedDislikedCount > 0 && (
                    <span className="flex items-center gap-1 cursor-help" title={_('options.rssManager.stats.dislikedTooltip')}>
                      <span className="w-2 h-2 bg-red-400 dark:bg-red-500 rounded-sm"></span>
                      <span>{inFeedDislikedCount}</span>
                    </span>
                  )}
                  {totalRecommended > 0 && (
                    <span className="flex items-center gap-1 text-gray-400 cursor-help" title={_('options.rssManager.stats.totalRecommendedTooltip')}>
                      <span>👍</span>
                      <span>{totalRecommended}</span>
                    </span>
                  )}
                  {totalDisliked > 0 && (
                    <span className="flex items-center gap-1 text-gray-400 cursor-help" title={_('options.rssManager.stats.totalDislikedTooltip')}>
                      <span>👎</span>
                      <span>{totalDisliked}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
          
          {/* 候选源和忽略源：发现时的统计（保持原样）*/}
          {(feed.status === 'candidate' || feed.status === 'ignored') && (
            <div className="flex items-center gap-2 flex-1">
            
              {/* 分析中状态 */}
              {!feed.quality ? (
                <div className="text-blue-600 dark:text-blue-400 animate-pulse">
                  🔍 {_('options.rssManager.quality.analyzing')}
                </div>
              ) : (
                <>
                  {/* 发现时的文章数 */}
                  {feed.itemCount && feed.itemCount > 0 && (
                    <span className="flex items-center gap-1">
                      <span>📰</span>
                      <span>{feed.itemCount} {_('options.rssManager.fetch.articles')}</span>
                    </span>
                  )}
                  
                  {/* 预估每周文章数 */}
                  {feed.quality.updateFrequency > 0 && (
                    <>
                      {feed.itemCount && feed.itemCount > 0 && <span>•</span>}
                      <span className="flex items-center gap-1">
                        <span>📊</span>
                        <span>{feed.quality.updateFrequency.toFixed(1)} {_('options.rssManager.fetch.perWeek')}</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          
          {/* 格式警告（所有源） */}
          {feed.quality && !feed.quality.formatValid && (
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400">
                ⚠️ {_('options.rssManager.quality.formatInvalid')}
              </span>
            </div>
          )}
        </div>
        
        {/* 文章预览区域 */}
        {expandedFeedId === feed.id && previewArticles[feed.id] && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              {_('options.rssManager.preview.latestArticles')}
            </div>
            {previewArticles[feed.id].length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {previewArticles[feed.id].map((item, idx) => (
                  <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
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


  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="text-4xl animate-pulse">⏳</div>
        <p className="text-sm text-gray-500 mt-2">{_('options.rssManager.loading')}</p>
      </div>
    )
  }

  const totalFeeds = candidateFeeds.length + subscribedFeeds.length + ignoredFeeds.length

  return (
    <div className="space-y-6">
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
