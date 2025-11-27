/**
 * 用户画像展示组件 - AI First 版本
 * Phase 10: 完全移除关键字画像，仅展示 AI 生成的语义画像
 *
 * 展示内容：
 * - AI 生成的兴趣理解（自然语言描述）
 * - AI 分析的阅读偏好
 * - AI 识别的主题演变
 * - 基础统计数据（页面数、最近更新）
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getUserProfile } from "@/storage/db"
import { profileManager } from "@/core/profile/ProfileManager"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import type { UserProfile } from "@/types/profile"
import { logger } from "@/utils/logger"

const profileViewLogger = logger.withTag("ProfileView")

export function ProfileSettings() {
  const { _ } = useI18n()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [rebuildSuccess, setRebuildSuccess] = useState(false)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiProvider, setAiProvider] = useState("")

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [data, aiConfig] = await Promise.all([
          getUserProfile(),
          getAIConfig()
        ])
        
        profileViewLogger.info("用户画像数据:", {
          hasAiSummary: !!data?.aiSummary,
          aiSummaryProvider: data?.aiSummary?.metadata?.provider,
          totalPages: data?.totalPages
        })
        
        setProfile(data)
        setAiConfigured(aiConfig.enabled && aiConfig.provider !== null)
        setAiProvider(getProviderDisplayName(aiConfig.provider || null))
      } catch (error) {
        profileViewLogger.error("加载用户画像失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleRebuildProfile = async () => {
    if (isRebuilding) return

    setIsRebuilding(true)
    setRebuildSuccess(false)
    try {
      const newProfile = await profileManager.rebuildProfile()
      setProfile(newProfile)
      setRebuildSuccess(true)
      // 3秒后隐藏成功提示
      setTimeout(() => setRebuildSuccess(false), 3000)
    } catch (error) {
      profileViewLogger.error("重建用户画像失败:", error)
      alert(_("options.userProfile.alerts.rebuildFailed"))
    } finally {
      setIsRebuilding(false)
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!profile || profile.totalPages === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 border-2 border-dashed border-gray-300 dark:border-gray-600">
        <div className="text-center">
          <span className="text-4xl mb-2 block">🔍</span>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {_("options.userProfile.noData.message")}
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            {_("options.userProfile.noData.hint")}
          </p>
        </div>
      </div>
    )
  }

  // 格式化时间
  const formatLastUpdated = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const hours = Math.floor(diff / (1000 * 60 * 60))
    
    if (hours < 1) return _("options.userProfile.lastUpdated.justNow")
    if (hours < 24) return _("options.userProfile.lastUpdated.hoursAgo", { hours })
    const days = Math.floor(hours / 24)
    return _("options.userProfile.lastUpdated.daysAgo", { days })
  }

  return (
    <div className="space-y-6">
      {/* AI 画像区域 */}
      {aiConfigured && profile.aiSummary ? (
        // 有 AI 画像时显示 - 连贯的自我介绍
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-700 shadow-lg">
          <div className="flex items-start gap-4">
            {/* AI 头像 */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                🤖
              </div>
            </div>
            
            {/* AI 的完整自我介绍 */}
            <div className="flex-1">
              <div className="bg-white/70 dark:bg-gray-800/70 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed space-y-2">
                  <span className="block">
                    我是 <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {profile.aiSummary.metadata.provider === 'deepseek' ? 'DeepSeek' : 
                       profile.aiSummary.metadata.provider === 'openai' ? 'OpenAI' : 
                       profile.aiSummary.metadata.provider === 'anthropic' ? 'Anthropic' : 'AI'}
                    </span>，
                    从 <span className="font-medium text-cyan-600 dark:text-cyan-400">{new Date(profile.lastUpdated - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')}</span> 开始，
                    截止到 <span className="font-medium text-cyan-600 dark:text-cyan-400">{new Date(profile.aiSummary.metadata.timestamp).toLocaleDateString('zh-CN')}</span>，
                    我从你对 <span className="font-medium text-orange-600 dark:text-orange-400">{profile.totalPages} 个页面</span>的浏览中发现，
                    你{profile.aiSummary.interests}
                  </span>
                  
                  {profile.aiSummary.preferences && profile.aiSummary.preferences.length > 0 && (
                    <span className="block mt-3">
                      根据这些理解，我将会为你推荐 <span className="font-medium text-green-600 dark:text-green-400">{profile.aiSummary.preferences.join('、')}</span>等方面的内容
                      {profile.aiSummary.avoidTopics && profile.aiSummary.avoidTopics.length > 0 ? '；' : '。'}
                    </span>
                  )}
                  
                  {profile.aiSummary.avoidTopics && profile.aiSummary.avoidTopics.length > 0 && (
                    <span className="block">
                      而根据你不想读的文章，我也会忽略 <span className="font-medium text-orange-600 dark:text-orange-400">{profile.aiSummary.avoidTopics.join('、')}</span>等方面的内容，不将这方面的内容推荐给你。
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // 无 AI 画像时的提示
        <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-200 dark:border-amber-700 rounded-xl p-8">
          <div className="text-center">
            <span className="text-5xl mb-4 block">🤖</span>
            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
              {aiConfigured 
                ? _("options.profile.aiProfile.generatingTitle")
                : _("options.profile.aiProfile.notConfiguredTitle")
              }
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              {aiConfigured 
                ? _("options.profile.aiProfile.generatingDescription")
                : _("options.profile.aiProfile.notConfiguredDescription")
              }
            </p>
            {!aiConfigured && (
              <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                <p>💡 {_("options.profile.aiProfile.configureStep1")}</p>
                <p>💡 {_("options.profile.aiProfile.configureStep2")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 重建按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleRebuildProfile}
          disabled={isRebuilding}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            rebuildSuccess 
              ? 'bg-green-500 text-white cursor-default'
              : isRebuilding
                ? 'bg-gray-400 text-white cursor-wait'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {rebuildSuccess ? (
            <>
              <span>✅</span>
              <span>{_("options.userProfile.actions.rebuildComplete") || "重建完成"}</span>
            </>
          ) : isRebuilding ? (
            <>
              <span className="animate-spin">⏳</span>
              <span>{_("options.userProfile.actions.rebuilding")}</span>
            </>
          ) : (
            <>
              <span>🔄</span>
              <span>{_("options.userProfile.actions.rebuild")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
