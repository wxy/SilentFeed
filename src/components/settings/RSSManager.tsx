import { useState, useEffect, useRef } from "react"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { RSSValidator } from "@/core/rss/RSSValidator"
import { OPMLImporter } from "@/core/rss/OPMLImporter"
import type { DiscoveredFeed } from "@/core/rss/types"

/**
 * RSS 源管理组件
 * 
 * Phase 5.1.5: 优化版
 * - 精简显示：标题（链接）、来源、时间、格式徽章
 * - 右侧操作：收录、忽略
 */
export function RSSManager() {
  const [candidateFeeds, setCandidateFeeds] = useState<DiscoveredFeed[]>([])
  const [subscribedFeeds, setSubscribedFeeds] = useState<DiscoveredFeed[]>([])
  const [ignoredFeeds, setIgnoredFeeds] = useState<DiscoveredFeed[]>([])
  const [loading, setLoading] = useState(true)
  const [showIgnored, setShowIgnored] = useState(false)
  
  // Phase 5.1.6: 手动订阅和 OPML 导入
  const [manualUrl, setManualUrl] = useState('')
  const [isManualAdding, setIsManualAdding] = useState(false)
  const [manualError, setManualError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      console.error('[RSSManager] 加载候选源失败:', error)
    } finally {
      setLoading(false)
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
      console.error('[RSSManager] 忽略源失败:', error)
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
      
      console.log('[RSSManager] 已订阅源:', feedId)
    } catch (error) {
      console.error('[RSSManager] 订阅源失败:', error)
    }
  }
  
  // 取消订阅
  const handleUnsubscribe = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.unsubscribe(feedId)
      
      // 从订阅列表移除，添加到候选列表
      const feed = subscribedFeeds.find(f => f.id === feedId)
      if (feed) {
        setSubscribedFeeds(prev => prev.filter(f => f.id !== feedId))
        setCandidateFeeds(prev => [...prev, { ...feed, status: 'candidate', subscribedAt: undefined }])
      }
      
      console.log('[RSSManager] 已取消订阅:', feedId)
    } catch (error) {
      console.error('[RSSManager] 取消订阅失败:', error)
    }
  }
  
  // 从忽略列表订阅
  const handleSubscribeIgnored = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.subscribe(feedId, 'discovered') // 保持原始来源
      
      // 从忽略列表移除，添加到订阅列表
      const feed = ignoredFeeds.find(f => f.id === feedId)
      if (feed) {
        setIgnoredFeeds(prev => prev.filter(f => f.id !== feedId))
        setSubscribedFeeds(prev => [...prev, { 
          ...feed, 
          status: 'subscribed', 
          subscribedAt: Date.now() 
        }])
      }
      
      console.log('[RSSManager] 已从忽略列表订阅:', feedId)
    } catch (error) {
      console.error('[RSSManager] 订阅失败:', error)
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
  
  // Phase 5.1.6: 手动订阅 RSS
  const handleManualAdd = async () => {
    if (!manualUrl.trim()) {
      setManualError('请输入 RSS URL')
      return
    }
    
    setIsManualAdding(true)
    setManualError('')
    
    try {
      // 1. 验证 URL
      const validationResult = await RSSValidator.validateURL(manualUrl.trim())
      if (!validationResult.valid) {
        setManualError(validationResult.error || 'RSS 验证失败')
        return
      }
      
      // 2. 检查是否已存在
      const feedManager = new FeedManager()
      const existing = await feedManager.getFeedByUrl(manualUrl.trim())
      if (existing) {
        setManualError('该源已存在')
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
        discoveredFrom: 'manual', // 标记为手动添加
        discoveredAt: Date.now(),
      })
      
      // 4. 直接订阅
      await feedManager.subscribe(id, 'manual')
      
      // 5. 刷新列表
      await loadFeeds()
      
      // 6. 清空输入
      setManualUrl('')
      console.log('[RSSManager] 手动订阅成功:', id)
    } catch (error) {
      setManualError(error instanceof Error ? error.message : '订阅失败')
      console.error('[RSSManager] 手动订阅失败:', error)
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
      console.log('[RSSManager] 解析 OPML 成功:', opmlFeeds.length, '个源')
      
      // 2. 批量验证并添加
      const feedManager = new FeedManager()
      let successCount = 0
      let skipCount = 0
      let failCount = 0
      
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
            discoveredFrom: 'imported', // 标记为 OPML 导入
            discoveredAt: Date.now(),
          })
          
          // 直接订阅
          await feedManager.subscribe(id, 'imported')
          successCount++
        } catch (error) {
          failCount++
          console.error('[RSSManager] 导入源失败:', opmlFeed.xmlUrl, error)
        }
      }
      
      // 3. 刷新列表
      await loadFeeds()
      
      // 4. 显示结果
      console.log(`[RSSManager] OPML 导入完成: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}`)
      if (failCount > 0) {
        setImportError(`导入完成: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}`)
      }
      
      // 5. 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'OPML 导入失败')
      console.error('[RSSManager] OPML 导入失败:', error)
    } finally {
      setIsImporting(false)
    }
  }
  
  // 格式化语言显示
  const formatLanguage = (lang?: string) => {
    if (!lang) return '未知'
    const langMap: Record<string, string> = {
      'zh-CN': '中文',
      'zh': '中文',
      'en': '英文',
      'en-US': '英文',
      'ja': '日文',
      'ko': '韩文',
    }
    return langMap[lang] || lang
  }
  
  // 渲染源列表项（三行布局）
  const renderFeedItem = (
    feed: DiscoveredFeed,
    actions: { label: string; onClick: () => void; className: string }[]
  ) => (
    <div 
      key={feed.id}
      className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
    >
      {/* 第一行：格式徽章 + 标题（可点击） */}
      <div className="flex items-center gap-2">
        <span 
          className="inline-block w-14 px-2 py-1 text-white text-xs font-mono font-bold rounded text-center flex-shrink-0"
          style={{ backgroundColor: '#FF6600' }}
        >
          {getFormatBadge(feed.url)}
        </span>
        <a
          href={feed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex-1 truncate"
        >
          {feed.title}
        </a>
      </div>
      
      {/* 第二行：元数据（发布日期、类别、语言、条目数） */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pl-16">
        {feed.lastBuildDate && (
          <span className="flex items-center gap-1">
            <span>📅</span>
            <span>{formatDateTime(feed.lastBuildDate)}</span>
          </span>
        )}
        {feed.category && (
          <span className="flex items-center gap-1">
            <span>🏷️</span>
            <span>{feed.category}</span>
          </span>
        )}
        {feed.language && (
          <span className="flex items-center gap-1">
            <span>🌐</span>
            <span>{formatLanguage(feed.language)}</span>
          </span>
        )}
        {feed.itemCount !== undefined && (
          <span className="flex items-center gap-1">
            <span>📄</span>
            <span>{feed.itemCount} 条</span>
          </span>
        )}
      </div>
      
      {/* 第三行：来源 + 订阅来源 + 操作按钮 */}
      <div className="flex items-center justify-between pl-16">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span className="truncate">
            来自: {new URL(feed.discoveredFrom).hostname}
          </span>
          {feed.subscriptionSource && (
            <>
              <span>•</span>
              <span className="text-green-600 dark:text-green-400">
                {feed.subscriptionSource === 'discovered' && '自动发现'}
                {feed.subscriptionSource === 'manual' && '手动订阅'}
                {feed.subscriptionSource === 'imported' && 'OPML导入'}
              </span>
            </>
          )}
          {feed.subscribedAt && (
            <>
              <span>•</span>
              <span className="text-green-600 dark:text-green-400">
                订阅于: {formatDateTime(feed.subscribedAt)}
              </span>
            </>
          )}
        </div>
        
        {/* 操作按钮 */}
        <div className="flex gap-2 flex-shrink-0">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={action.className}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="text-4xl animate-pulse">⏳</div>
        <p className="text-sm text-gray-500 mt-2">加载中...</p>
      </div>
    )
  }

  const totalFeeds = candidateFeeds.length + subscribedFeeds.length + ignoredFeeds.length
  
  if (totalFeeds === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-6xl mb-4">📡</div>
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          暂无发现的 RSS 源
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          浏览包含 RSS 订阅的网站时，我们会自动发现并在这里显示
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Phase 5.1.6: 手动订阅和 OPML 导入 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-3">
          ➕ 添加订阅源
        </h3>
        
        {/* 手动订阅 URL */}
        <div className="mb-4">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
            手动订阅 RSS URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isManualAdding}
            />
            <button
              onClick={handleManualAdd}
              disabled={isManualAdding || !manualUrl.trim()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {isManualAdding ? '验证中...' : '订阅'}
            </button>
          </div>
          {manualError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {manualError}
            </p>
          )}
        </div>
        
        {/* OPML 导入 */}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
            批量导入（OPML 文件）
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
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {isImporting ? '导入中...' : '📂 选择 OPML 文件'}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 self-center">
              支持从其他 RSS 阅读器导出的订阅列表
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
              📡 发现的 RSS 源 ({candidateFeeds.length})
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              这些 RSS 源是从你浏览的页面中自动发现的，点击标题查看源内容
            </p>
          </div>

          <div className="space-y-2">
            {candidateFeeds.map((feed) => renderFeedItem(feed, [
              {
                label: '✓ 订阅',
                onClick: () => handleSubscribe(feed.id),
                className: 'px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors'
              },
              {
                label: '✗ 忽略',
                onClick: () => handleIgnore(feed.id),
                className: 'px-3 py-1.5 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-xs font-medium rounded transition-colors'
              }
            ]))}
          </div>
        </div>
      )}
      
      {/* 2. 已订阅的源 */}
      {subscribedFeeds.length > 0 && (
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
              ✓ 已订阅 ({subscribedFeeds.length})
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              你已订阅的 RSS 源，可以随时取消订阅
            </p>
          </div>

          <div className="space-y-2">
            {subscribedFeeds.map((feed) => renderFeedItem(feed, [
              {
                label: '✗ 取消订阅',
                onClick: () => handleUnsubscribe(feed.id),
                className: 'px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors'
              }
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
                🚫 已忽略 ({ignoredFeeds.length})
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                点击{showIgnored ? '收起' : '展开'}
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
                  label: '✓ 订阅',
                  onClick: () => handleSubscribeIgnored(feed.id),
                  className: 'px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors'
                }
              ]))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
