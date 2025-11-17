import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { RSSValidator } from "@/core/rss/RSSValidator"
import { RSSFetcher, type FeedItem } from "@/core/rss/RSSFetcher"
import { OPMLImporter } from "@/core/rss/OPMLImporter"
import type { DiscoveredFeed } from "@/core/rss/types"
import { logger } from "@/utils/logger"

const rssManagerLogger = logger.withTag("RSSManager")

/**
 * 解码 HTML 实体（如 &#xxxx;）
 */
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

/**
 * RSS 源管理组件
 * 
 * Phase 5.1.5: 优化版
 * - 精简显示：标题（链接）、来源、时间、格式徽章
 * - 右侧操作：收录、忽略
 */
export function RSSManager() {
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
      setCandidateFeeds(candidates)
      setSubscribedFeeds(subscribed)
      setIgnoredFeeds(ignored)
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
      
      rssManagerLogger.info('已切换源状态:', feedId, newState)
    } catch (error) {
      rssManagerLogger.error('切换源状态失败:', error)
    }
  }

  // 获取格式徽章文本
  const getFormatBadge = (url: string) => {
    if (url.includes('atom')) return 'ATOM'
    return 'RSS'
  }

  // 格式化时间（日期 + 时间）
  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
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
  const calculateNextFetchTime = (feed: DiscoveredFeed): number | null => {
    if (!feed.quality || !feed.lastFetchedAt || !feed.isActive) {
      return null
    }

    const frequency = feed.quality.updateFrequency // 篇/周
    let intervalMs = 0

    if (frequency >= 7) {
      intervalMs = 6 * 60 * 60 * 1000  // 6 小时
    } else if (frequency >= 3) {
      intervalMs = 12 * 60 * 60 * 1000 // 12 小时
    } else if (frequency >= 1) {
      intervalMs = 24 * 60 * 60 * 1000 // 24 小时
    } else {
      return null // 低频源不自动抓取
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
        title: `${metadata.title} - ${domain}`,
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
      rssManagerLogger.info('解析 OPML 成功:', opmlFeeds.length, '个源')
      
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
          rssManagerLogger.error('导入源失败:', opmlFeed.xmlUrl, error)
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
  
  // 格式化语言显示
  const formatLanguage = (lang?: string) => {
    if (!lang) return _('options.rssManager.languages.unknown')
    const langMap: Record<string, string> = {
      'zh-CN': _('options.rssManager.languages.zh'),
      'zh': _('options.rssManager.languages.zh'),
      'en': _('options.rssManager.languages.en'),
      'en-US': _('options.rssManager.languages.en'),
      'ja': _('options.rssManager.languages.ja'),
      'ko': _('options.rssManager.languages.ko'),
      'fr': _('options.rssManager.languages.fr'),
      'de': _('options.rssManager.languages.de'),
      'es': _('options.rssManager.languages.es'),
      'ru': _('options.rssManager.languages.ru'),
    }
    return langMap[lang] || lang
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

  // 渲染源列表项（三行紧凑布局）
  const renderFeedItem = (
    feed: DiscoveredFeed,
    actions: { label: string; onClick: () => void; className: string; row?: 2 | 3; disabled?: boolean }[]
  ) => {
    const nextFetchTime = feed.status === 'subscribed' ? calculateNextFetchTime(feed) : null
    
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
        className="flex flex-col gap-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
      >
        {/* 第一行：RSS 本身属性 */}
        <div className="flex items-center gap-2 text-sm">
          {/* XML/RSS 图标 */}
          <a 
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-1.5 py-0.5 text-white text-xs font-mono font-bold rounded flex-shrink-0 hover:opacity-80 transition-opacity"
            style={{ backgroundColor: '#FF6600' }}
            title={_('options.rssManager.openXML')}
          >
            {getFormatBadge(feed.url)}
          </a>
          
          {/* 语言文本图标 */}
          {feed.language && (
            <span 
              className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-mono font-bold uppercase"
              title={formatLanguage(feed.language)}
            >
              {feed.language}
            </span>
          )}
          
          {/* 标题 */}
          <button
            onClick={() => loadPreviewArticles(feed.id, feed.url)}
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex-1 truncate text-left"
          >
            {feed.title}
          </button>
          
          {/* 质量文本图标 */}
          {feed.quality && (
            <span 
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                feed.quality.score >= 70 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                  : feed.quality.score >= 50 
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
              title={`${_('options.rssManager.quality.score')}: ${feed.quality.score}/100`}
            >
              {getQualityText(feed.quality.score)}
            </span>
          )}
          
          {/* 类别文本图标 */}
          {feed.category && (
            <span 
              className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-medium"
              title={_('options.rssManager.category')}
            >
              {feed.category}
            </span>
          )}
        </div>
        
        {/* 第二行：订阅/发现信息 + 操作按钮 */}
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
                    <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-medium">
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
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-[10px] font-medium">
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
        
        {/* 第三行：统计信息 + 操作按钮 */}
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 已订阅源：抓取统计 */}
            {feed.status === 'subscribed' && (
              <>
                {/* 文章统计：总数/推荐数/阅读数 */}
                {feed.articleCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span>📰</span>
                    <span>
                      {feed.articleCount} {_('options.rssManager.fetch.articles')}
                      {/* 显示推荐数和推荐已读数 */}
                      <span className="ml-1 text-gray-600 dark:text-gray-300">
                        / {getRecommendedCountForFeed(feed)} {_('options.rssManager.fetch.recommended')}
                        / {feed.recommendedReadCount || 0} {_('options.rssManager.fetch.read')}
                      </span>
                    </span>
                  </span>
                )}
                
                {/* 上次抓取时间/下次抓取时间 */}
                {feed.lastFetchedAt && (
                  <>
                    {feed.articleCount > 0 && <span>•</span>}
                    <span className="flex items-center gap-1">
                      <span>⏱️</span>
                      <span>
                        {_('options.rssManager.fetch.last')}: {formatRelativeTime(feed.lastFetchedAt)}
                        {nextFetchTime && feed.isActive && (
                          <span className="ml-1 text-blue-600 dark:text-blue-400">
                            → {formatTimeUntil(nextFetchTime)}
                          </span>
                        )}
                      </span>
                    </span>
                  </>
                )}
                
                {/* 平均每周文章数 */}
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
            )}
            
            {/* 候选源和忽略源：发现时的统计 */}
            {(feed.status === 'candidate' || feed.status === 'ignored') && (
              <>
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
              </>
            )}
            
            {/* 格式警告（所有源） */}
            {feed.quality && !feed.quality.formatValid && (
              <>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400">
                  ⚠️ {_('options.rssManager.quality.formatInvalid')}
                </span>
              </>
            )}
          </div>
          
          {/* 第三行操作按钮 */}
          {row3Actions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {row3Actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={`${action.className} text-white text-xs px-2 py-1 rounded hover:opacity-90 transition-opacity whitespace-nowrap`}
                >
                  {action.label}
                </button>
              ))}
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
                        {item.pubDate.toLocaleString('zh-CN')}
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
  
  if (totalFeeds === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-6xl mb-4">📡</div>
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          {_('options.rssManager.noFeeds')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {_('options.rssManager.noFeedsHint')}
        </p>
      </div>
    )
  }

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
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
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
        
        {/* OPML 导入 */}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
            {_('options.rssManager.importOPML')}
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {_('options.rssManager.selectOPML')}
                </>
              )}
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
            {candidateFeeds.map((feed) => renderFeedItem(feed, [
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
            ]))}
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
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors"
            >
              {isFetchingAll ? '📡 读取中...' : fetchCompleted.all ? '✅ 读取完成' : '📡 全部读取'}
            </button>
          </div>

          <div className="space-y-2">
            {subscribedFeeds.map((feed) => renderFeedItem(feed, [
              // 第二行：读取 + 暂停/恢复 + 取消订阅
              {
                label: isFetchingSingle === feed.id 
                  ? '📡 读取中...' 
                  : fetchCompleted.single === feed.id 
                  ? '✅ 读取完成'
                  : '📡 读取',
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
                  : 'bg-blue-500 hover:bg-blue-600',
                row: 2
              },
              {
                label: _('options.rssManager.actions.unsubscribe'),
                onClick: () => handleUnsubscribe(feed.id),
                className: 'bg-orange-500 hover:bg-orange-600',
                row: 2
              }
              // 订阅列表不显示删除按钮，只能取消订阅（移到忽略列表）
            ]))}
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
              {ignoredFeeds.map((feed) => renderFeedItem(feed, [
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
              ]))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
