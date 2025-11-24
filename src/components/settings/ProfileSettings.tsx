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
import { InterestSnapshotManager } from "@/core/profile/InterestSnapshotManager"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import type { UserProfile } from "@/types/profile"
import { logger } from "@/utils/logger"

const profileViewLogger = logger.withTag("ProfileView")

/**
 * 获取主题名称的国际化文本
 */
function getTopicName(topic: Topic | string, _: (key: string) => string): string {
  const topicMap: Record<string, string> = {
    'technology': _("common.topics.technology"),
    'science': _("common.topics.science"),
    'business': _("common.topics.business"),
    'design': _("common.topics.design"),
    'arts': _("common.topics.arts"),
    'health': _("common.topics.health"),
    'sports': _("common.topics.sports"),
    'entertainment': _("common.topics.entertainment"),
    'news': _("common.topics.news"),
    'education': _("common.topics.education"),
    'other': _("common.topics.other")
  }
  return topicMap[topic.toLowerCase()] || topic
}

/**
 * 获取主题性格描述的国际化文本
 */
function getTopicPersonality(topic: Topic | string, _: (key: string) => string): string {
  const personalityMap: Record<string, string> = {
    'technology': _("common.topicPersonalities.technology"),
    'science': _("common.topicPersonalities.science"),
    'business': _("common.topicPersonalities.business"),
    'design': _("common.topicPersonalities.design"),
    'arts': _("common.topicPersonalities.arts"),
    'health': _("common.topicPersonalities.health"),
    'sports': _("common.topicPersonalities.sports"),
    'entertainment': _("common.topicPersonalities.entertainment"),
    'news': _("common.topicPersonalities.news"),
    'education': _("common.topicPersonalities.education"),
    'other': _("common.topicPersonalities.other")
  }
  return personalityMap[topic.toLowerCase()] || topic
}

export function ProfileSettings() {
  const { _ } = useI18n()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [evolutionHistory, setEvolutionHistory] = useState<any>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiProvider, setAiProvider] = useState("")

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [data, history, aiConfig] = await Promise.all([
          getUserProfile(),
          InterestSnapshotManager.getEvolutionHistory(10),
          getAIConfig()
        ])
        
        // 调试日志：检查 AI 画像数据
        profileViewLogger.info("用户画像数据:", {
          hasAiSummary: !!data?.aiSummary,
          aiSummaryProvider: data?.aiSummary?.metadata?.provider,
          totalPages: data?.totalPages,
          behaviorsReads: data?.behaviors?.reads?.length || 0,
          behaviorsDismisses: data?.behaviors?.dismisses?.length || 0
        })
        
        setProfile(data)
        setEvolutionHistory(history)
        setAiConfigured(aiConfig.enabled && aiConfig.provider !== null)
        setAiProvider(getProviderDisplayName(aiConfig.provider))
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
      
      // 重新加载数据（包括历史）
      const history = await InterestSnapshotManager.getEvolutionHistory(10)
      setProfile(newProfile)
      setEvolutionHistory(history)
      
      // 简单的成功提示
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
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
            {_("options.userProfile.noData.tip")}
          </p>
        </div>
      </div>
    )
  }

  // 获取 Top 3 主题
  const topTopics = Object.entries(profile.topics)
    .filter(([topic, score]) => topic !== Topic.OTHER && score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([topic, score], index) => {
      const scorePercentage = score * 100
      
      // 计算是否为主导兴趣（使用相同的策略）
      let isPrimary = false
      let primaryLevel: 'absolute' | 'relative' | 'leading' | null = null
      
      if (index === 0) { // 只有第一名可能是主导兴趣
        const secondScore = Object.entries(profile.topics)
          .filter(([t, s]) => t !== Topic.OTHER && t !== topic && s > 0)
          .sort(([, a], [, b]) => b - a)[0]?.[1] || 0
        
        const validScores = Object.entries(profile.topics)
          .filter(([t, s]) => t !== Topic.OTHER && s > 0)
          .map(([, s]) => s)
        const avgScore = validScores.reduce((sum, s) => sum + s, 0) / validScores.length
        
        // 应用相同的主导兴趣策略
        if (score > 1/3) {
          isPrimary = true
          primaryLevel = 'absolute'
        } else if (score > 0.2 && score / secondScore >= 1.5) {
          isPrimary = true
          primaryLevel = 'relative'
        } else if (score > 0.25 && score / avgScore >= 2.0) {
          isPrimary = true
          primaryLevel = 'leading'
        }
      }

      return {
        topic: topic as Topic,
        score: scorePercentage,
        name: getTopicName(topic as Topic, _),
        animal: TOPIC_ANIMALS[topic as Topic],
        personality: getTopicPersonality(topic as Topic, _),
        isPrimary,
        primaryLevel
      }
    })

  // 检查是否有首选兴趣（用于特殊展示）
  const primaryTopic = topTopics.find(item => item.isPrimary)

  // 获取 Top 10 关键词
  const topKeywords = profile.keywords.slice(0, 10)

  // 获取 Top 5 域名
  const topDomains = profile.domains.slice(0, 5)

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
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">
              {_("options.userProfile.updateTime.label")}
            </div>
            <div className="text-lg font-bold text-orange-900 dark:text-orange-100">
              {new Date(profile.lastUpdated).toLocaleString('zh-CN')}
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              {_("options.userProfile.updateTime.basedOn", { count: profile.totalPages })}
            </div>
          </div>

          {/* AI 分析质量指标 (Phase 4.1) */}
          <div className={`rounded-lg p-4 border ${
            aiConfigured
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
              : "bg-gray-50 dark:bg-gray-700/20 border-gray-200 dark:border-gray-600"
          }`}>
            <div className={`text-sm mb-1 ${
              aiConfigured
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400"
            }`}>
              {_("options.userProfile.analysisQuality.label")}
            </div>
            <div className={`text-lg font-bold ${
              aiConfigured
                ? "text-blue-900 dark:text-blue-100"
                : "text-gray-900 dark:text-gray-100"
            }`}>
              {aiConfigured ? _("options.userProfile.analysisQuality.aiAnalysis", { provider: aiProvider }) : _("options.userProfile.analysisQuality.keywordAnalysis")}
            </div>
            <div className={`text-xs mt-1 ${
              aiConfigured
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400"
            }`}>
              {aiConfigured 
                ? _("options.userProfile.analysisQuality.aiHint")
                : _("options.userProfile.analysisQuality.keywordHint")}
            </div>
          </div>
        </div>

        {/* AI 语义画像 - AI 的独特价值展示 */}
        {profile.aiSummary && (
          <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-orange-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-700 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  AI 语义画像
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-full font-medium shadow-sm">
                  {profile.aiSummary.metadata.provider === 'deepseek' ? 'DeepSeek' : 
                   profile.aiSummary.metadata.provider === 'openai' ? 'OpenAI' : 
                   'AI'}
                </span>
                <span className="text-xs text-purple-600 dark:text-purple-400">
                  {new Date(profile.aiSummary.metadata.timestamp).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>

            {/* 兴趣理解 - AI 的核心价值 */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                  💭 AI 对您的理解
                </span>
                <span className="text-xs text-purple-500 dark:text-purple-400">
                  (超越关键词，深度语义分析)
                </span>
              </div>
              <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 border border-purple-100 dark:border-purple-800">
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic">
                  "{profile.aiSummary.interests}"
                </p>
              </div>
            </div>

            {/* 内容偏好 - 可操作的洞察 */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-pink-700 dark:text-pink-300">
                  ⭐ 您偏好的内容类型
                </span>
                <span className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded">
                  {profile.aiSummary.preferences.length} 项
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.aiSummary.preferences.map((pref, i) => (
                  <span 
                    key={i}
                    className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-800/40 dark:to-pink-800/40 text-purple-700 dark:text-purple-200 px-3 py-1.5 rounded-lg text-sm font-medium border border-purple-200 dark:border-purple-700 hover:shadow-md transition-shadow"
                  >
                    <span>✓</span>
                    <span>{pref}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* 避免主题 - 负向信号 */}
            {profile.aiSummary.avoidTopics.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                    🚫 不感兴趣的主题
                  </span>
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">
                    {profile.aiSummary.avoidTopics.length} 项
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.aiSummary.avoidTopics.map((topic, i) => (
                    <span 
                      key={i}
                      className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg text-sm border border-red-200 dark:border-red-800"
                    >
                      <span>×</span>
                      <span>{topic}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 数据来源和成本 */}
            <div className="pt-4 border-t border-purple-200 dark:border-purple-700">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4 text-purple-600 dark:text-purple-400">
                  <span>
                    📊 基于 {profile.aiSummary.metadata.basedOn.reads} 次阅读
                  </span>
                  {profile.aiSummary.metadata.basedOn.dismisses > 0 && (
                    <span>
                      🚫 {profile.aiSummary.metadata.basedOn.dismisses} 次拒绝
                    </span>
                  )}
                  {profile.aiSummary.metadata.basedOn.browses > 0 && (
                    <span>
                      🌐 {profile.aiSummary.metadata.basedOn.browses} 页浏览
                    </span>
                  )}
                </div>
                {profile.aiSummary.metadata.cost && (
                  <span className="text-purple-500 dark:text-purple-400">
                    💰 成本 ¥{profile.aiSummary.metadata.cost.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI 画像未生成提示 */}
        {!profile.aiSummary && aiConfigured && profile.totalPages > 0 && (
          <div className="bg-gradient-to-r from-yellow-50/80 to-amber-50/80 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⏳</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                  AI 语义画像正在积累数据
                </h3>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                  系统会在满足以下任一条件后自动生成 AI 画像：
                </p>
                <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>浏览 ≥20 个页面（当前: {profile.totalPages} 页）</li>
                  <li>阅读 ≥5 篇推荐（当前: {profile.behaviors?.totalReads || 0} 篇）</li>
                  <li>拒绝 ≥5 篇推荐（当前: {profile.behaviors?.totalDismisses || 0} 篇）</li>
                </ul>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  💡 提示：每个页面需要停留 30 秒以上才会被记录
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI 配置提示 */}
        {!aiConfigured && (
          <div className="bg-gradient-to-r from-indigo-50/80 to-cyan-50/80 dark:from-indigo-900/20 dark:to-cyan-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🚀</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                  {_("options.userProfile.aiPrompt.title")}
                </h3>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2">
                  {_("options.userProfile.aiPrompt.description")}
                </p>
                <ul className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1 mb-3">
                  <li>{_("options.userProfile.aiPrompt.benefit1")}</li>
                  <li>{_("options.userProfile.aiPrompt.benefit2")}</li>
                  <li>{_("options.userProfile.aiPrompt.benefit3")}</li>
                </ul>
                <a
                  href="/options.html?tab=ai"
                  className="inline-flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                  <span>{_("options.userProfile.aiPrompt.configureButton")}</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Top 3 主题分布 */}
        <div>
          <h3 className="text-md font-medium mb-4 flex items-center gap-2">
            <span>🎯</span>
            <span>{_("options.userProfile.interests.title")}</span>
            {primaryTopic && (
              <span className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded-full animate-pulse">
                {primaryTopic.primaryLevel === 'absolute' && _("options.userProfile.interests.primaryAbsolute", { topic: primaryTopic.name })}
                {primaryTopic.primaryLevel === 'relative' && _("options.userProfile.interests.primaryRelative", { topic: primaryTopic.name })} 
                {primaryTopic.primaryLevel === 'leading' && _("options.userProfile.interests.primaryLeading", { topic: primaryTopic.name })}
              </span>
            )}
          </h3>
          {topTopics.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.userProfile.interests.noData")}
            </div>
          ) : (
            <div className="space-y-4">
              {topTopics.map((item, index) => (
                <div 
                  key={item.topic} 
                  className={`rounded-xl p-4 border transition-all duration-500 ${
                    item.isPrimary 
                      ? 'bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 dark:from-purple-900/30 dark:via-pink-900/30 dark:to-purple-900/30 border-2 border-purple-300 dark:border-purple-600 shadow-lg ring-2 ring-purple-200 dark:ring-purple-800' 
                      : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* 动物头像 */}
                    <div className="flex-shrink-0">
                      <div className={`rounded-full flex items-center justify-center ${
                        item.isPrimary 
                          ? 'w-20 h-20 text-3xl bg-gradient-to-br from-purple-200 via-pink-200 to-purple-200 shadow-xl animate-bounce'
                          : index === 0 
                          ? 'w-16 h-16 text-2xl bg-gradient-to-br from-blue-100 to-purple-100'
                          : index === 1
                          ? 'w-16 h-16 text-2xl bg-gradient-to-br from-green-100 to-emerald-100' 
                          : 'w-16 h-16 text-2xl bg-gradient-to-br from-orange-100 to-amber-100'
                      }`}>
                        {item.animal}
                      </div>
                    </div>
                    
                    {/* 主题信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className={`font-semibold flex items-center gap-2 ${
                          item.isPrimary 
                            ? 'text-purple-900 dark:text-purple-100 text-lg' 
                            : 'text-gray-800 dark:text-gray-200'
                        }`}>
                          #{index + 1} {item.name}
                          <span className={`text-sm font-medium ${
                            item.isPrimary 
                              ? 'text-purple-700 dark:text-purple-300 font-bold' 
                              : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {item.score.toFixed(1)}%
                          </span>
                          {item.isPrimary && (
                            <span className="text-xs bg-gradient-to-r from-yellow-400 to-orange-400 text-yellow-900 px-2 py-1 rounded-full font-bold">
                              {item.primaryLevel === 'absolute' && _("options.userProfile.interests.levelAbsolute")}
                              {item.primaryLevel === 'relative' && _("options.userProfile.interests.levelRelative")}
                              {item.primaryLevel === 'leading' && _("options.userProfile.interests.levelLeading")}
                            </span>
                          )}
                        </h4>
                      </div>
                      
                      {/* 性格描述 */}
                      <p className={`text-sm mb-3 ${
                        item.isPrimary 
                          ? 'text-purple-700 dark:text-purple-300 font-medium' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {item.personality}
                      </p>
                      
                      {/* 进度条 */}
                      <div className={`w-full rounded-full h-2 ${
                        item.isPrimary 
                          ? 'bg-purple-200 dark:bg-purple-700' 
                          : 'bg-gray-200 dark:bg-gray-600'
                      }`}>
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            item.isPrimary 
                              ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600'
                              : index === 0 
                              ? 'bg-gradient-to-r from-blue-400 to-purple-500'
                              : index === 1
                              ? 'bg-gradient-to-r from-green-400 to-emerald-500' 
                              : 'bg-gradient-to-r from-orange-400 to-amber-500'
                          }`}
                          style={{ width: `${Math.max(item.score, 5)}%` }}
                        />
                      </div>
                      
                      {/* 主导兴趣提示 */}
                      {item.isPrimary && (
                        <div className="mt-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                          {item.primaryLevel === 'absolute' && _("options.userProfile.interests.levelAbsoluteHint")}
                          {item.primaryLevel === 'relative' && _("options.userProfile.interests.levelRelativeHint")}
                          {item.primaryLevel === 'leading' && _("options.userProfile.interests.levelLeadingHint")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


{/* 兴趣演化历程部分 - 完整替换从 line 390 到 line 560 */}
        {/* 兴趣演化历程 */}
        <div>
          <h3 className="text-md font-medium mb-4 flex items-center gap-2">
            <span>📈</span>
            <span>{_("options.userProfile.evolution.title")}</span>
            {evolutionHistory && evolutionHistory.totalSnapshots > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-2 py-1 rounded-full">
                {_("options.userProfile.evolution.totalSnapshots", { count: evolutionHistory.totalSnapshots })}
              </span>
            )}
          </h3>
          
          {/* 水平卡片布局展示最近5个快照 */}
          {evolutionHistory && evolutionHistory.snapshots && evolutionHistory.snapshots.length > 0 ? (
            <div className="bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
              {/* 整体容器，分为头像区域和文字区域 */}
              <div className="space-y-4">
                {/* 头像区域 - 固定高度，垂直居中 */}
                <div className="relative h-24 flex items-center justify-between">
                  {/* 贯穿的时间箭头 - 在最底层，垂直居中，延伸到两端 */}
                  {evolutionHistory.snapshots.length > 1 && (
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex items-center z-0">
                      <div className="w-full h-0.5 bg-gradient-to-r from-blue-400 via-blue-300 to-blue-400 dark:from-blue-500 dark:via-blue-400 dark:to-blue-500 relative">
                        {/* 右侧箭头 */}
                        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[10px] border-l-blue-400 dark:border-l-blue-500 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent"></div>
                      </div>
                    </div>
                  )}
                  
                  {/* 头像容器 - 水平均匀分布 */}
                  {evolutionHistory.snapshots.slice(0, 5).reverse().map((snapshot: any, index: number) => {
                    const totalCount = Math.min(evolutionHistory.snapshots.length, 5)
                    const isLatest = index === totalCount - 1
                    const topicEmoji = TOPIC_ANIMALS[snapshot.topic as Topic] || '🔖'
                    
                    const getLevelEmoji = (level: string) => {
                      switch (level) {
                        case 'absolute': return '🔥'
                        case 'relative': return '⭐'
                        case 'leading': return '💫'
                        default: return ''
                      }
                    }
                    
                    const getSizeStyle = (level: string) => {
                      switch (level) {
                        case 'absolute':
                          return {
                            containerSize: 'w-20 h-20',
                            emojiSize: 'text-3xl',
                            shadowSize: 'shadow-lg'
                          }
                        case 'relative':
                          return {
                            containerSize: 'w-16 h-16',
                            emojiSize: 'text-2xl',
                            shadowSize: 'shadow-md'
                          }
                        case 'leading':
                          return {
                            containerSize: 'w-14 h-14',
                            emojiSize: 'text-xl',
                            shadowSize: 'shadow'
                          }
                        default:
                          return {
                            containerSize: 'w-12 h-12',
                            emojiSize: 'text-lg',
                            shadowSize: 'shadow-sm'
                          }
                      }
                    }

                    const style = getSizeStyle(snapshot.level)
                    const levelEmoji = getLevelEmoji(snapshot.level)

                    return (
                      <div 
                        key={snapshot.id} 
                        className="flex-1 flex justify-center items-center relative z-10 group"
                      >
                        {/* 头像圆圈 - 添加 relative 以便徽章相对于它定位 */}
                        <div 
                          className={`${style.containerSize} rounded-full flex items-center justify-center ${style.shadowSize} transition-all duration-300 hover:scale-110 cursor-pointer relative ${
                            isLatest 
                              ? 'bg-gradient-to-br from-purple-200 via-pink-200 to-purple-200'
                              : snapshot.isTopicChange
                                ? 'bg-gradient-to-br from-blue-100 to-purple-100'
                                : snapshot.isLevelChange
                                  ? 'bg-gradient-to-br from-green-100 to-emerald-100'
                                  : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600'
                          }`}
                        >
                          <span className={style.emojiSize}>{topicEmoji}</span>
                          
                          {/* 重建标记 - 相对于头像圆圈定位 */}
                          {snapshot.trigger === 'rebuild' && (
                            <div className="absolute -top-1 -right-1 text-xl bg-white dark:bg-gray-800 rounded-full p-1 shadow-lg ring-2 ring-purple-400 z-20">
                              🔄
                            </div>
                          )}
                          {/* 变化标记 - 相对于头像圆圈定位 */}
                          {snapshot.trigger !== 'rebuild' && snapshot.isTopicChange && (
                            <div className="absolute -top-1 -right-1 text-base">
                              🔄
                            </div>
                          )}
                          {snapshot.trigger !== 'rebuild' && snapshot.isLevelChange && !snapshot.isTopicChange && (
                            <div className="absolute -top-1 -right-1 text-base">
                              📊
                            </div>
                          )}
                        </div>
                        
                        {/* Hover 提示框 - 显示在头像下方 */}
                        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <div className="bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900 text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-2xl ring-1 ring-black/10">
                            <div className="font-semibold mb-1">
                              {getTopicName(snapshot.topic, _)}
                              {snapshot.trigger === 'rebuild' && (
                                <span className="ml-1 text-purple-300 dark:text-purple-600">{_("options.userProfile.evolution.rebuildLabel")}</span>
                              )}
                            </div>
                            <div>{_("options.userProfile.evolution.scoreLabel", { score: Math.round(snapshot.score * 100) })}</div>
                            <div>{_("options.userProfile.evolution.pagesLabel", { pages: snapshot.basedOnPages })}</div>
                            <div className="text-gray-300 dark:text-gray-600 mt-1">
                              {snapshot.trigger === 'rebuild' 
                                ? _("options.userProfile.evolution.rebuildTrigger")
                                : snapshot.changeDetails || _("options.userProfile.evolution.stable")}
                            </div>
                            {/* 向上的小三角 */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                              <div className="border-4 border-transparent border-b-gray-700 dark:border-b-gray-300"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* 文字标签区域 - 独立于头像区域，水平对齐 */}
                <div className="flex items-start justify-between">
                  {evolutionHistory.snapshots.slice(0, 5).reverse().map((snapshot: any, index: number) => {
                    const isLatest = index === Math.min(evolutionHistory.snapshots.length, 5) - 1
                    
                    const getLevelEmoji = (level: string) => {
                      switch (level) {
                        case 'absolute': return '🔥'
                        case 'relative': return '⭐'
                        case 'leading': return '💫'
                        default: return ''
                      }
                    }
                    
                    const levelEmoji = getLevelEmoji(snapshot.level)

                    return (
                      <div key={`label-${snapshot.id}`} className="flex-1 text-center text-sm">
                        {/* 第一行：主导程度emoji + 兴趣名称(页数) */}
                        <div className={`font-semibold ${
                          isLatest 
                            ? 'text-purple-900 dark:text-purple-100' 
                            : 'text-gray-800 dark:text-gray-200'
                        }`}>
                          {levelEmoji} {getTopicName(snapshot.topic, _)} ({snapshot.basedOnPages})
                        </div>
                        
                        {/* 第二行：时间 */}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(snapshot.timestamp).toLocaleString(document.documentElement.lang || 'zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 底部提示 */}
              {evolutionHistory.totalSnapshots > 5 && (
                <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                  {_("options.userProfile.evolution.moreRecords", { count: evolutionHistory.totalSnapshots - 5 })}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-500 dark:text-gray-400">
                {_("options.userProfile.evolution.legend")}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.userProfile.evolution.noData")}
              <div className="text-xs mt-2 text-gray-400 dark:text-gray-500">
                {_("options.userProfile.evolution.noDataHint")}
              </div>
            </div>
          )}
        </div>

        {/* Top 关键词 */}
        <div>
          <h3 className="text-md font-medium mb-4 flex items-center gap-2">
            <span>🔤</span>
            <span>{_("options.userProfile.keywords.title")}</span>
          </h3>
          {topKeywords.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.userProfile.keywords.noData")}
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
                      title={_("options.userProfile.keywords.weightLabel", { weight: keyword.weight.toFixed(3) })}
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
                {_("options.userProfile.keywords.hint")}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }