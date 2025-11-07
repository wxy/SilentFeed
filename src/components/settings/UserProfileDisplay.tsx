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
import { TOPIC_NAMES, TOPIC_ANIMALS, TOPIC_PERSONALITIES, Topic } from "@/core/profile/topics"
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
      animal: TOPIC_ANIMALS[topic as Topic],
      personality: TOPIC_PERSONALITIES[topic as Topic],
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
          <h3 className="text-md font-medium mb-4 flex items-center gap-2">
            <span>�</span>
            <span>你的兴趣画像</span>
          </h3>
          {topTopics.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无主题分类数据
            </div>
          ) : (
            <div className="space-y-4">
              {topTopics.map((item, index) => (
                <div key={item.topic} className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-4">
                    {/* 动物头像 */}
                    <div className="flex-shrink-0">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${
                        index === 0 
                          ? 'bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-blue-200'
                          : index === 1
                          ? 'bg-gradient-to-br from-green-100 to-emerald-100 border-2 border-green-200' 
                          : 'bg-gradient-to-br from-orange-100 to-amber-100 border-2 border-orange-200'
                      }`}>
                        {item.animal}
                      </div>
                    </div>
                    
                    {/* 主题信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                          #{index + 1} {item.name}
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {item.score.toFixed(1)}%
                          </span>
                        </h4>
                      </div>
                      
                      {/* 性格描述 */}
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {item.personality}
                      </p>
                      
                      {/* 进度条 */}
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            index === 0 
                              ? 'bg-gradient-to-r from-blue-400 to-purple-500'
                              : index === 1
                              ? 'bg-gradient-to-r from-green-400 to-emerald-500' 
                              : 'bg-gradient-to-r from-orange-400 to-amber-500'
                          }`}
                          style={{ width: `${Math.max(item.score, 5)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 关键词 */}
        <div>
          <h3 className="text-md font-medium mb-4 flex items-center gap-2">
            <span>�</span>
            <span>兴趣关键词云</span>
          </h3>
          {topKeywords.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无关键词数据
            </div>
          ) : (
            <div className="bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
              <div className="flex flex-wrap gap-3 justify-center">
                {topKeywords.map((keyword, index) => {
                  // 根据权重计算字体大小和样式
                  const getFontSize = () => {
                    if (index < 2) return 'text-2xl'
                    if (index < 5) return 'text-lg'
                    if (index < 8) return 'text-base'
                    return 'text-sm'
                  }
                  
                  const getColors = () => {
                    const colorSets = [
                      'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                      'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
                      'bg-gradient-to-r from-green-500 to-emerald-500 text-white',
                      'bg-gradient-to-r from-orange-500 to-amber-500 text-white',
                      'bg-gradient-to-r from-red-500 to-rose-500 text-white',
                      'bg-gradient-to-r from-indigo-500 to-purple-500 text-white',
                      'bg-gradient-to-r from-cyan-500 to-teal-500 text-white',
                      'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
                      'bg-gradient-to-r from-pink-500 to-red-500 text-white',
                      'bg-gradient-to-r from-teal-500 to-green-500 text-white'
                    ]
                    return colorSets[index % colorSets.length]
                  }

                  return (
                    <span
                      key={`${keyword.word}-${index}`}
                      className={`
                        inline-flex items-center px-4 py-2 rounded-full font-semibold transition-all duration-300 
                        hover:scale-105 hover:shadow-lg cursor-default
                        ${getFontSize()} ${getColors()}
                      `}
                      title={`权重: ${keyword.weight.toFixed(3)}`}
                    >
                      {keyword.word}
                      <span className="ml-2 text-xs opacity-80">
                        {keyword.weight.toFixed(2)}
                      </span>
                    </span>
                  )
                })}
              </div>
              
              <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                💡 关键词大小代表权重，hover查看详细权重值
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}