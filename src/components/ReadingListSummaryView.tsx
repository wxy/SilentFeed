/**
 * 阅读清单汇总视图
 * Phase 15: 当投递方式为 readingList 时，弹窗显示阅读清单汇总而非推荐条目
 */

import { useState, useEffect } from 'react'
import { useI18n } from '@/i18n/helpers'
import { db } from '@/storage/db'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import { isReadingListAvailable } from '@/utils/browser-compat'

interface ReadingListEntry {
  id: string
  url: string
  title: string
  addedAt: number
  status: 'unread' | 'read'
}

interface ReadingListStats {
  total: number
  unread: number
  recentCount: number // 最近 24 小时添加
}

/**
 * 阅读清单汇总视图
 */
export function ReadingListSummaryView() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<ReadingListStats>({ total: 0, unread: 0, recentCount: 0 })
  const [recentEntries, setRecentEntries] = useState<ReadingListEntry[]>([])
  const [nextCleanupTime, setNextCleanupTime] = useState<number | null>(null)
  const [cleanupEnabled, setCleanupEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
    
    // 每 30 秒刷新一次数据
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      // 加载统计数据
      const total = await db.readingListEntries.count()
      const unread = await db.readingListEntries.where('status').equals('unread').count()
      const recentThreshold = Date.now() - 24 * 3600 * 1000
      const recentCount = await db.readingListEntries
        .where('addedAt')
        .above(recentThreshold)
        .count()
      
      setStats({ total, unread, recentCount })

      // 加载最近 5 条条目
      const recent = await db.readingListEntries
        .orderBy('addedAt')
        .reverse()
        .limit(5)
        .toArray()
      
      setRecentEntries(recent)

      // 加载清理配置
      const config = await getRecommendationConfig()
      setCleanupEnabled(config.readingList?.cleanup?.enabled ?? false)
      
      if (config.readingList?.cleanup?.enabled) {
        // 计算下次清理时间（简化版，实际应该从后台获取）
        const intervalMs = (config.readingList.cleanup.intervalHours || 24) * 3600 * 1000
        // 这里暂时假设下次清理时间，实际应该从 background 获取上次清理时间
        setNextCleanupTime(Date.now() + intervalMs)
      }
    } catch (error) {
      console.error('加载阅读清单数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenReadingList = async () => {
    try {
      // 打开 Chrome Reading List 页面
      if (isReadingListAvailable()) {
        await chrome.tabs.create({ url: 'chrome://read-later/' })
      }
    } catch (error) {
      console.error('打开阅读清单失败:', error)
    }
  }

  const handleOpenEntry = async (entry: ReadingListEntry) => {
    try {
      await chrome.tabs.create({ url: entry.url })
      // 标记为已读
      await db.readingListEntries.update(entry.id, { status: 'read' })
      loadData()
    } catch (error) {
      console.error('打开条目失败:', error)
    }
  }

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} 天前`
    if (hours > 0) return `${hours} 小时前`
    if (minutes > 0) return `${minutes} 分钟前`
    return '刚刚'
  }

  const formatNextCleanup = (timestamp: number): string => {
    const diff = timestamp - Date.now()
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} 天后`
    if (hours > 0) return `${hours} 小时后`
    return '即将清理'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 头部统计 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>📚</span>
            阅读清单
          </h2>
          <button
            onClick={handleOpenReadingList}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            打开完整列表
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">总条目</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.unread}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">未读</div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.recentCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">今日新增</div>
          </div>
        </div>

        {/* 清理状态 */}
        {cleanupEnabled && nextCleanupTime && (
          <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">🧹 自动清理已启用</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                下次清理: {formatNextCleanup(nextCleanupTime)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 最近条目列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {recentEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-4xl mb-2">📭</span>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              阅读清单为空
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
              系统将自动添加推荐内容到此处
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
              最近添加
            </div>
            {recentEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => handleOpenEntry(entry)}
                className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {entry.status === 'unread' && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                      )}
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {entry.title}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {entry.url}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {formatTimeAgo(entry.addedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作提示 */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="text-xs text-center text-gray-500 dark:text-gray-400">
          💡 推荐内容会自动添加到阅读清单，你可以稍后阅读
        </div>
      </div>
    </div>
  )
}
