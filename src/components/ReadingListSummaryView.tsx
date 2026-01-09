/**
 * 阅读清单汇总视图
 * Phase 15: 当投递方式为 readingList 时，弹窗显示阅读清单汇总而非推荐条目
 */

import { useState, useEffect } from 'react'
import { useI18n } from '@/i18n/helpers'
import { getRecommendationConfig } from '@/storage/recommendation-config'

interface ReadingListStats {
  total: number // Chrome Reading List 总条目数
  unread: number // Chrome Reading List 未读数
  extensionAdded: number // 本扩展添加的条目数（通过 title prefix 识别）
}

/**
 * 阅读清单汇总视图
 */
export function ReadingListSummaryView() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<ReadingListStats>({ total: 0, unread: 0, extensionAdded: 0 })
  const [titlePrefix, setTitlePrefix] = useState('📰 ')
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
      // 加载配置
      const config = await getRecommendationConfig()
      const prefix = config.readingList?.titlePrefix || '📰 '
      setTitlePrefix(prefix)
      setCleanupEnabled(config.readingList?.cleanup?.enabled ?? false)
      
      if (config.readingList?.cleanup?.enabled) {
        const intervalMs = (config.readingList.cleanup.intervalHours || 24) * 3600 * 1000
        setNextCleanupTime(Date.now() + intervalMs)
      }

      // 从 Chrome Reading List API 获取数据
      if (chrome.readingList) {
        const entries = await chrome.readingList.query({})
        
        const total = entries.length
        const unread = entries.filter(e => !e.hasBeenRead).length
        // 通过标题前缀识别本扩展添加的条目
        const extensionAdded = entries.filter(e => e.title.startsWith(prefix)).length
        
        setStats({ total, unread, extensionAdded })
      } else {
        console.warn('Chrome Reading List API 不可用')
        setStats({ total: 0, unread: 0, extensionAdded: 0 })
      }
    } catch (error) {
      console.error('加载阅读清单数据失败:', error)
      setStats({ total: 0, unread: 0, extensionAdded: 0 })
    } finally {
      setIsLoading(false)
    }
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
      {/* 模式提示 */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b border-emerald-200 dark:border-emerald-700 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-emerald-600 dark:text-emerald-400">📖</span>
          <span className="text-emerald-800 dark:text-emerald-300 font-medium">
            阅读清单模式
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 text-xs">
            推荐内容将自动添加到阅读清单
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="flex-1 p-4 space-y-4">
        {/* 主要统计 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4 flex items-center gap-2">
            <span>📊</span>
            阅读清单统计
          </h3>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">总条目</div>
            </div>
            <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.unread}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">未读</div>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.extensionAdded}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">扩展添加</div>
            </div>
          </div>
        </div>

        {/* 清理状态 */}
        {cleanupEnabled && nextCleanupTime && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧹</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">自动清理已启用</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">定期清理过期条目</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {formatNextCleanup(nextCleanupTime)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">下次清理</div>
              </div>
            </div>
          </div>
        )}

        {/* 提示信息 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p>• 推荐内容会自动添加到 Chrome 阅读清单</p>
              <p>• 可在设置中配置标题前缀和自动清理规则</p>
              <p>• 在 Chrome 侧边栏中查看完整阅读清单</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
