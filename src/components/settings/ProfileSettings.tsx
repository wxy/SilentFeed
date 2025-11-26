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
    try {
      const newProfile = await profileManager.rebuildProfile()
      setProfile(newProfile)
      alert(_("options.userProfile.alerts.rebuildSuccess"))
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
      {/* 基本统计 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 数据采集统计 */}
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">
            📊 {_("options.userProfile.updateTime.label")}
          </div>
          <div className="text-lg font-bold text-orange-900 dark:text-orange-100">
            {formatLastUpdated(profile.lastUpdated)}
          </div>
          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
            {_("options.userProfile.updateTime.basedOn", { count: profile.totalPages })}
          </div>
        </div>

        {/* AI 分析状态 */}
        <div className={`rounded-lg p-4 border ${
          aiConfigured
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
        }`}>
          <div className={`text-sm mb-1 ${
            aiConfigured
              ? "text-blue-600 dark:text-blue-400"
              : "text-amber-600 dark:text-amber-400"
          }`}>
            🤖 {_("options.userProfile.analysisQuality.label")}
          </div>
          <div className={`text-lg font-bold ${
            aiConfigured
              ? "text-blue-900 dark:text-blue-100"
              : "text-amber-900 dark:text-amber-100"
          }`}>
            {aiConfigured 
              ? _("options.userProfile.analysisQuality.aiAnalysis", { provider: aiProvider })
              : _("options.userProfile.analysisQuality.notConfigured")
            }
          </div>
          <div className={`text-xs mt-1 ${
            aiConfigured
              ? "text-blue-600 dark:text-blue-400"
              : "text-amber-600 dark:text-amber-400"
          }`}>
            {aiConfigured 
              ? _("options.userProfile.analysisQuality.aiHint")
              : _("options.userProfile.analysisQuality.configureHint")
            }
          </div>
        </div>
      </div>

      {/* AI 画像区域 */}
      {aiConfigured && profile.aiSummary ? (
        // 有 AI 画像时显示
        <div className="bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-900/20 dark:to-slate-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-700 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span className="bg-gradient-to-r from-blue-600 to-slate-600 bg-clip-text text-transparent">
                {_("options.profile.aiProfile.title")}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium border border-primary/20">
                {profile.aiSummary.metadata.provider === 'deepseek' ? 'DeepSeek' : 
                 profile.aiSummary.metadata.provider === 'openai' ? 'OpenAI' : 
                 profile.aiSummary.metadata.provider === 'anthropic' ? 'Anthropic' :
                 'AI'}
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {new Date(profile.aiSummary.metadata.timestamp).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>

          {/* 兴趣理解 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                💭 {_("options.profile.aiProfile.understanding")}
              </span>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic">
                "{profile.aiSummary.interests}"
              </p>
            </div>
          </div>

          {/* 内容偏好 */}
          {profile.aiSummary.preferences && profile.aiSummary.preferences.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  📚 {_("options.profile.aiProfile.contentPreferences")}
                </span>
              </div>
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                <ul className="space-y-2">
                  {profile.aiSummary.preferences.map((pref, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                      <span className="text-blue-500 dark:text-blue-400">•</span>
                      <span>{pref}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 避免主题 */}
          {profile.aiSummary.avoidTopics && profile.aiSummary.avoidTopics.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  🚫 {_("options.profile.aiProfile.avoidTopics")}
                </span>
              </div>
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                <ul className="space-y-2">
                  {profile.aiSummary.avoidTopics.map((topic, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                      <span className="text-red-500 dark:text-red-400">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
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

      {/* 基础数据展示 */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          📊 {_("options.profile.basicStats.title")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
              {_("options.profile.basicStats.totalPages")}
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {profile.totalPages}
            </div>
          </div>
          {profile.domains && profile.domains.length > 0 && (
            <div>
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                {_("options.profile.basicStats.topDomain")}
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {profile.domains[0].domain}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 重建按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleRebuildProfile}
          disabled={isRebuilding}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {isRebuilding ? (
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
