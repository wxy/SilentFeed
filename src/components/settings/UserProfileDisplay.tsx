/**
 * 用户画像展示组件
 *
 * 在设置页面展示用户兴趣画像分析结果：
 * - Top 3 主题分布
 * - 关键词云 (Top 10)
 * - 常访问域名统计
 * - 画像更新时间
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getUserProfile } from "@/storage/db"
import { TOPIC_NAMES, TOPIC_ICONS, Topic } from "@/core/profile/topics"
import { profileManager } from "@/core/profile/ProfileManager"
import type { UserProfile } from "@/core/profile/types"

export function UserProfileDisplay() {
  const { _ } = useI18n()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await getUserProfile()
        setProfile(data)
      } catch (error) {
        console.error("[UserProfileDisplay] 加载用户画像失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleRebuildProfile = async () => {
    if (isRebuilding) return

    setIsRebuilding(true)
    try {
      const newProfile = await profileManager.rebuildProfile()
      setProfile(newProfile)
      
      // 简单的成功提示
      alert("用户画像重建成功！")
    } catch (error) {
      console.error("[UserProfileDisplay] 重建用户画像失败:", error)
      alert("重建失败，请稍后重试")
    } finally {
      setIsRebuilding(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>{_("options.collectionStats.userProfile")}</span>
        </h2>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (!profile || profile.totalPages === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>{_("options.collectionStats.userProfile")}</span>
        </h2>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 border-2 border-dashed border-gray-300 dark:border-gray-600">
          <div className="text-center">
            <span className="text-4xl mb-2 block">🔍</span>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              还没有足够的浏览数据来构建用户画像
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              继续浏览感兴趣的内容，系统将自动分析您的兴趣偏好
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
              💡 不需要等到1000页，有几条有效记录就可以生成画像
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 获取 Top 3 主题
  const topTopics = Object.entries(profile.topics)
    .filter(([topic, score]) => topic !== Topic.OTHER && score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([topic, score]) => ({
      topic: topic as Topic,
      score: score * 100, // 转换为百分比
      name: TOPIC_NAMES[topic as Topic],
      icon: TOPIC_ICONS[topic as Topic],
    }))

  // 获取 Top 10 关键词
  const topKeywords = profile.keywords.slice(0, 10)

  // 获取 Top 5 域名
  const topDomains = profile.domains.slice(0, 5)

  const formatLastUpdated = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const hours = Math.floor(diff / (1000 * 60 * 60))
    
    if (hours < 1) return "刚刚更新"
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    return `${days} 天前`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>👤</span>
          <span>{_("options.collectionStats.userProfile")}</span>
        </h2>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {formatLastUpdated(profile.lastUpdated)}
        </div>
      </div>

      <div className="space-y-6">
        {/* 基本统计 */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">
              画像更新时间
            </div>
            <div className="text-lg font-bold text-orange-900 dark:text-orange-100">
              {new Date(profile.lastUpdated).toLocaleString('zh-CN')}
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              基于 {profile.totalPages} 页面分析
            </div>
          </div>
        </div>

        {/* Top 3 主题分布 */}
        <div>
          <h3 className="text-md font-medium mb-3 flex items-center gap-2">
            <span>🎯</span>
            <span>兴趣主题 Top 3</span>
          </h3>
          {topTopics.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无主题分类数据
            </div>
          ) : (
            <div className="space-y-3">
              {topTopics.map((item, index) => (
                <div key={item.topic}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.icon}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        #{index + 1} {item.name}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {item.score.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        index === 0 
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                          : index === 1
                          ? 'bg-gradient-to-r from-green-500 to-blue-500' 
                          : 'bg-gradient-to-r from-orange-500 to-red-500'
                      }`}
                      style={{ width: `${Math.max(item.score, 5)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 关键词 */}
        <div>
          <h3 className="text-md font-medium mb-3 flex items-center gap-2">
            <span>🔤</span>
            <span>热门关键词 Top 10</span>
          </h3>
          {topKeywords.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无关键词数据
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topKeywords.map((keyword, index) => (
                <span
                  key={`${keyword.word}-${index}`}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    index < 3
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : index < 6
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                  }`}
                >
                  {keyword.word}
                  <span className="ml-1 text-xs opacity-70">
                    {keyword.weight.toFixed(2)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 画像管理操作 */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-md font-medium mb-3 flex items-center gap-2">
            <span>⚙️</span>
            <span>画像管理</span>
          </h3>
          <div className="flex gap-3">
            <button
              onClick={handleRebuildProfile}
              disabled={isRebuilding}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isRebuilding
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
              }`}
            >
              {isRebuilding ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                  重建中...
                </span>
              ) : (
                <>🔄 重建画像</>
              )}
            </button>
            <button
              disabled={!profile}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
            >
              🗑️ 清除画像 (即将支持)
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            💡 重建画像会重新分析所有浏览记录，更新您的兴趣偏好
          </p>
        </div>
      </div>
    </div>
  )
}