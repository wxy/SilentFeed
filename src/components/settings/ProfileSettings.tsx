/**
 * 用户画像展示组件 - 对话式界面 v2
 * 
 * 设计理念：
 * - AI 以对话气泡形式展示画像理解
 * - 用户可以重建画像，历史记录保留在对话历史中（刷新后清空）
 * - 使用扩展图标作为用户头像
 * - 显示生成时间
 */

import { useState, useEffect, useRef } from "react"
import { useI18n } from "@/i18n/helpers"
import { getUserProfile } from "@/storage/db"
import { profileManager } from "@/core/profile/ProfileManager"
import { getAIConfig, getProviderDisplayName, type AIProviderType, getEngineAssignment, DEFAULT_TIMEOUTS } from "@/storage/ai-config"
import { resolveProvider } from "@/utils/ai-provider-resolver"
import type { UserProfile } from "@/types/profile"
import { logger } from "@/utils/logger"
import { formatMonthDay, formatDateTime } from "@/utils/date-formatter"
import { db } from "@/storage/db"

const profileViewLogger = logger.withTag("ProfileView")

/** 对话消息类型 */
interface ChatMessage {
  id: string
  type: 'ai' | 'user'
  content: UserProfile | 'rebuilding'
  timestamp: number
}

/** 画像更新进度类型 */
interface UpdateProgress {
  browseProgress: { current: number; threshold: number; percentage: number }
  readProgress: { current: number; threshold: number; percentage: number }
  dismissProgress: { current: number; threshold: number; percentage: number }
  hasNewData: boolean
}

/** 进度条项组件 */
/** 进度条项组件 - 美化版 */
function ProgressItem({ 
  icon, 
  label, 
  current, 
  threshold, 
  percentage, 
  colorClass 
}: { 
  icon: string
  label: string
  current: number
  threshold: number
  percentage: number
  colorClass: string
}) {
  return (
    <div className="flex items-center gap-3 group">
      <div className="flex items-center gap-2 w-20 flex-shrink-0">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {label}
        </span>
      </div>
      <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full ${colorClass} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="w-14 text-right flex-shrink-0">
        <span className={`text-xs font-semibold ${percentage >= 100 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {current}/{threshold}
        </span>
      </div>
    </div>
  )
}

/** 渲染画像更新进度气泡 */
function UpdateProgressBubble({ 
  updateProgress, 
  _ 
}: { 
  updateProgress: UpdateProgress
  _: (key: string) => string
}) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="flex-shrink-0">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-2xl shadow-lg">
          📊
        </div>
      </div>
      <div className="flex-1 max-w-3xl">
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800/60 dark:to-slate-800/60 rounded-2xl rounded-tl-sm p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span>📈</span>
            {_("options.userProfile.updateProgress.title")}
          </p>
          
          <div className="space-y-3">
            <ProgressItem
              icon="🌐"
              label={_("options.userProfile.updateProgress.browse")}
              current={updateProgress.browseProgress.current}
              threshold={updateProgress.browseProgress.threshold}
              percentage={updateProgress.browseProgress.percentage}
              colorClass="bg-gradient-to-r from-blue-400 to-blue-600"
            />
            <ProgressItem
              icon="📖"
              label={_("options.userProfile.updateProgress.read")}
              current={updateProgress.readProgress.current}
              threshold={updateProgress.readProgress.threshold}
              percentage={updateProgress.readProgress.percentage}
              colorClass="bg-gradient-to-r from-green-400 to-emerald-500"
            />
            <ProgressItem
              icon="🚫"
              label={_("options.userProfile.updateProgress.dismiss")}
              current={updateProgress.dismissProgress.current}
              threshold={updateProgress.dismissProgress.threshold}
              percentage={updateProgress.dismissProgress.percentage}
              colorClass="bg-gradient-to-r from-orange-400 to-amber-500"
            />
          </div>
          
          {/* 进度提示 */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            💡 {_("options.userProfile.updateProgress.hint")}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ProfileSettings() {
  const { _ } = useI18n()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState(0) // Phase 11: 进度条状态（0-100）
  const [rebuildStartTime, setRebuildStartTime] = useState(0) // 重建开始时间
  const [rebuildTimeoutMs, setRebuildTimeoutMs] = useState(60000) // 进度条超时时间（毫秒）
  const [useReasoning, setUseReasoning] = useState(false) // 是否使用推理模式
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiProvider, setAiProvider] = useState("")
  const [totalPages, setTotalPages] = useState(0)
  const [lastRebuildTime, setLastRebuildTime] = useState(0) // Phase 11: 上次重建时间（防抖）
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null) // 画像更新进度
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  const scrollToBottom = () => {
    // 检查方法是否存在（测试环境可能不支持）
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 加载初始画像
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [data, aiConfig] = await Promise.all([
          getUserProfile(),
          getAIConfig()
        ])
        
        // Phase 9.1: 获取实际的浏览历史数量，而不是从画像中获取
        // 因为学习阶段（<100页）画像可能还未创建
        let actualTotalPages = data?.totalPages || 0
        
        // 如果画像不存在或 totalPages 为 0，从数据库直接查询
        if (actualTotalPages === 0) {
          actualTotalPages = await db.confirmedVisits.count()
        }
        
        profileViewLogger.info("用户画像数据:", {
          hasAiSummary: !!data?.aiSummary,
          aiSummaryProvider: data?.aiSummary?.metadata?.provider,
          totalPages: data?.totalPages,
          actualTotalPages
        })
        
        const hasAIProvider = Object.values(aiConfig.providers).some(
          p => p && p.apiKey && p.model
        )
        setAiConfigured(hasAIProvider)
        // Phase 13: 使用 lowFrequencyTasks 替代 profileGeneration（画像生成属于低频任务）
        // Derive active provider from engineAssignment (priority: lowFrequencyTasks > articleAnalysis > pageAnalysis)
        // 使用 resolveProvider 处理抽象 provider
        const lowFreqConfig = aiConfig.engineAssignment?.lowFrequencyTasks || aiConfig.engineAssignment?.profileGeneration
        const lowFreqProvider = resolveProvider(lowFreqConfig?.provider, aiConfig)
        const articleProvider = resolveProvider(aiConfig.engineAssignment?.articleAnalysis?.provider, aiConfig)
        const pageProvider = resolveProvider(aiConfig.engineAssignment?.pageAnalysis?.provider, aiConfig)
        
        const activeProvider = lowFreqProvider !== 'ollama'
          ? lowFreqProvider
          : articleProvider !== 'ollama'
          ? articleProvider
          : pageProvider !== 'ollama'
          ? pageProvider
          : (Object.keys(aiConfig.providers)[0] as AIProviderType | undefined) || null
        setAiProvider(getProviderDisplayName(activeProvider))
        setTotalPages(actualTotalPages)
        
        // 读取推理模式配置
        const lowFreqEngine = lowFreqConfig
        if (lowFreqEngine?.provider === 'ollama') {
          // 本地 AI：检查模型名称
          const modelName = aiConfig.local?.model || ''
          const isReasoningModel = ['r1', 'reasoning', 'think', 'cot'].some(
            keyword => modelName.toLowerCase().includes(keyword)
          )
          setUseReasoning(isReasoningModel)
        } else {
          // 远程 AI：检查 useReasoning 配置
          setUseReasoning(lowFreqEngine?.useReasoning || false)
        }
        
        // 如果有画像，添加为初始消息
        if (data && data.totalPages > 0) {
          setMessages([{
            id: `init-${Date.now()}`,
            type: 'ai',
            content: data,
            timestamp: data.aiSummary?.metadata?.timestamp || data.lastUpdated
          }])
        }
        
        // 加载画像更新进度（从 Background 获取，因为计数器在 Background 实例中）
        try {
          const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE_UPDATE_PROGRESS' })
          if (response?.success && response.data) {
            setUpdateProgress(response.data)
          }
        } catch (progressError) {
          profileViewLogger.warn("加载画像更新进度失败:", progressError)
        }
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
    
    // Phase 11: 防抖机制 - 10 分钟内禁止重复点击（防止自动调度和手动触发冲突）
    const now = Date.now()
    const DEBOUNCE_TIME = 600000 // 10 分钟
    if (lastRebuildTime && now - lastRebuildTime < DEBOUNCE_TIME) {
      const remainingSeconds = Math.ceil((DEBOUNCE_TIME - (now - lastRebuildTime)) / 1000)
      alert(_('options.userProfile.alerts.rebuildCooldown', { seconds: remainingSeconds }))
      return
    }
    
    setLastRebuildTime(now)

    // 1. 添加用户消息："重建画像"
    const timestamp = Date.now()
    const userMessage: ChatMessage = {
      id: `user-${timestamp}`,
      type: 'user',
      content: 'rebuilding',
      timestamp
    }
    
    // 2. 添加 AI "生成中"消息（临时，不包含 aiSummary）
    const generatingId = `ai-generating-${timestamp}`
    const generatingMessage: ChatMessage = {
      id: generatingId,
      type: 'ai',
      content: {} as UserProfile, // 空画像，触发"生成中"显示
      timestamp
    }
    
    setMessages(prev => [...prev, userMessage, generatingMessage])

    setIsRebuilding(true)
    setRebuildStartTime(Date.now()) // 记录开始时间
    
    // Phase 11.1: 动态计算进度条超时时间
    // 根据当前使用的 AI 服务和模型类型确定超时
    let timeoutMs = 60000 // 默认 60s（远程 AI 标准模式）
    
    try {
      const assignment = await getEngineAssignment()
      // Phase 13: 使用 lowFrequencyTasks（画像生成属于低频任务）
      const lowFreqEngine = assignment.lowFrequencyTasks || assignment.profileGeneration
      const config = await getAIConfig()
      
      if (lowFreqEngine?.provider === 'ollama') {
        // 本地 AI：检查是否是推理模型
        const modelName = config.local?.model || ''
        
        // 推理模型检测逻辑（与 OllamaProvider 一致）
        const isReasoningModel = ['r1', 'reasoning', 'think', 'cot'].some(
          keyword => modelName.toLowerCase().includes(keyword)
        )
        
        // 使用用户配置的超时或默认值
        timeoutMs = isReasoningModel 
          ? (config.local?.reasoningTimeoutMs || DEFAULT_TIMEOUTS.local.reasoning)
          : (config.local?.timeoutMs || DEFAULT_TIMEOUTS.local.standard)
      } else {
        // 远程 AI（DeepSeek/OpenAI）
        const useReasoning = lowFreqEngine?.useReasoning || false
        
        // 解析实际的 provider（处理 "remote" 抽象类型）
        const actualProvider = resolveProvider(lowFreqEngine?.provider, config)
        const providerConfig = config.providers?.[actualProvider]
        
        profileViewLogger.info("远程 AI 配置检查:", {
          abstractProvider: lowFreqEngine?.provider,
          actualProvider,
          useReasoning,
          userConfiguredReasoningTimeout: providerConfig?.reasoningTimeoutMs,
          userConfiguredStandardTimeout: providerConfig?.timeoutMs,
          defaultReasoningTimeout: DEFAULT_TIMEOUTS.remote.reasoning,
          defaultStandardTimeout: DEFAULT_TIMEOUTS.remote.standard
        })
        
        if (useReasoning) {
          // 推理模式：优先使用用户配置的推理超时
          timeoutMs = providerConfig?.reasoningTimeoutMs || DEFAULT_TIMEOUTS.remote.reasoning
          profileViewLogger.info("推理模式超时:", {
            finalTimeout: timeoutMs,
            source: providerConfig?.reasoningTimeoutMs ? '用户配置' : '默认值'
          })
        } else {
          // 标准模式：优先使用用户配置的标准超时
          timeoutMs = providerConfig?.timeoutMs || DEFAULT_TIMEOUTS.remote.standard
          profileViewLogger.info("标准模式超时:", {
            finalTimeout: timeoutMs,
            source: providerConfig?.timeoutMs ? '用户配置' : '默认值'
          })
        }
      }
      
      // 进度条显示单次请求的预期时间，不考虑重试
      // 如果发生重试，进度条会回退（这是正常行为）
    } catch (error) {
      profileViewLogger.warn("获取 AI 配置失败，使用默认超时", error)
      timeoutMs = 60000 // 默认 60s
    }
    
    profileViewLogger.info("进度条超时设置:", { timeoutMs, timeoutSeconds: timeoutMs / 1000 })
    
    // 保存到状态，供进度条使用
    setRebuildTimeoutMs(timeoutMs)
    
    // Phase 11: 启动进度条（动态超时）
    const progressInterval = setInterval(() => {
      setRebuildProgress(prev => {
        // 使用保存的 rebuildTimeoutMs 状态计算增量
        // 注意：这里我们需要从外部访问 rebuildTimeoutMs，不能在 setState 回调中使用
        // 因为 timeoutMs 已经保存到状态，直接使用即可
        const increment = 100 / (timeoutMs / 100)
        const newProgress = Math.min(prev + increment, 99) // 最多到 99%
        return newProgress
      })
    }, 100)
    
    // 监听重试：如果进度条接近100%但请求还在进行，说明发生了重试，重置进度条
    let lastCheckTime = Date.now()
    const retryCheckInterval = setInterval(() => {
      const elapsed = Date.now() - lastCheckTime
      // 使用当前保存的超时值
      if (elapsed > timeoutMs * 0.9) {
        setRebuildProgress(currentProgress => {
          if (currentProgress > 90) {
            profileViewLogger.warn("检测到可能的重试，重置进度条")
            setRebuildStartTime(Date.now()) // 重新计时
            lastCheckTime = Date.now()
            return 30 // 重置到 30%，表示正在重试
          }
          return currentProgress
        })
      }
    }, 1000)

    try {
      const newProfile = await profileManager.rebuildProfile()
      if (!newProfile) {
        throw new Error('EMPTY_PROFILE')
      }
      
      // 成功：进度条直接到 100%
      setRebuildProgress(100)
      
      // 检查是否使用了推理模式（根据实际返回的模型判断）
      const actuallyUsedReasoning = newProfile.aiSummary?.metadata?.model === 'deepseek-reasoner'
      if (actuallyUsedReasoning !== useReasoning) {
        profileViewLogger.info("更新推理模式状态", { from: useReasoning, to: actuallyUsedReasoning })
        setUseReasoning(actuallyUsedReasoning)
      }
      
      // 3. 移除"生成中"消息，添加新画像消息
      setMessages(prev => {
        // 移除"生成中"消息
        const filtered = prev.filter(m => m.id !== generatingId)
        // 添加新画像
        return [...filtered, {
          id: `ai-${Date.now()}`,
          type: 'ai',
          content: newProfile,
          timestamp: newProfile.aiSummary?.metadata?.timestamp || newProfile.lastUpdated
        }]
      })
      
    } catch (error) {
      profileViewLogger.error("重建用户画像失败:", error)
      
      // 失败：移除"生成中"消息
      setMessages(prev => prev.filter(m => m.id !== generatingId))
      
      // 检查是否是任务锁错误
      if ((error as Error).message === 'PROFILE_REBUILDING') {
        alert(_("options.userProfile.alerts.rebuildInProgress"))
      } else {
        alert(_("options.userProfile.alerts.rebuildFailed"))
      }
      
      // Phase 11: 重置防抖时间，允许立即重试
      setLastRebuildTime(0)
      
      // 失败：重置进度条
      setRebuildProgress(0)
    } finally {
      // 清理定时器
      clearInterval(progressInterval)
      clearInterval(retryCheckInterval)
      setIsRebuilding(false)
      
      // 延迟 1s 后重置进度条和开始时间（让用户看到 100%）
      setTimeout(() => {
        setRebuildProgress(0)
        setRebuildStartTime(0)
      }, 1000)
    }
  }

  // 高亮关键字的辅助函数
  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords || keywords.length === 0) return text
    
    // 过滤掉太短的关键词（避免误匹配单个字母）
    const validKeywords = keywords.filter(k => k.length >= 2)
    if (validKeywords.length === 0) return text
    
    // 使用单词边界匹配，避免误匹配部分字符串（如 Grid 中的 id）
    // 对于中文关键词，使用精确匹配；对于英文关键词，使用单词边界
    const pattern = validKeywords.map(k => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 检测是否包含中文字符
      const hasChinese = /[\u4e00-\u9fa5]/.test(k)
      if (hasChinese) {
        // 中文关键词：精确匹配整个词，不允许部分匹配
        return escaped
      } else {
        // 英文关键词：使用单词边界，避免匹配 Grid 中的 id
        return `\\b${escaped}\\b`
      }
    }).join('|')
    
    const regex = new RegExp(`(${pattern})`, 'gi')
    
    const parts = text.split(regex)
    return (
      <>
        {parts.map((part, index) => {
          const isKeyword = validKeywords.some(k => 
            k.toLowerCase() === part.toLowerCase()
          )
          return isKeyword ? (
            <span 
              key={index}
              className="text-blue-600 dark:text-blue-400 font-semibold"
            >
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          )
        })}
      </>
    )
  }

  // 渲染 AI 消息气泡（三个独立气泡）
  const renderAIMessage = (profile: UserProfile, timestamp: number) => {
    const aiSummary = profile.aiSummary
    const providerName = aiSummary?.metadata?.provider === 'deepseek'
      ? 'DeepSeek'
      : aiSummary?.metadata?.provider === 'openai'
        ? 'OpenAI'
        : aiSummary?.metadata?.provider === 'anthropic'
          ? 'Anthropic'
          : 'AI'
    
    // 计算开始浏览时间（假设平均每天浏览10页）
    const estimatedDays = Math.max(1, Math.floor(profile.totalPages / 10))
    const startDate = new Date(timestamp - estimatedDays * 24 * 60 * 60 * 1000)
    
    if (!aiSummary) {
      // AI 画像生成中 - 单个气泡 + 进度条
      // 推理模式使用紫色，非推理模式使用蓝色
      const avatarBgClass = useReasoning 
        ? 'bg-gradient-to-br from-purple-400 to-violet-400'
        : 'bg-gradient-to-br from-blue-400 to-indigo-400'
      
      return (
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0">
            <div className={`w-12 h-12 ${avatarBgClass} rounded-full flex items-center justify-center text-2xl shadow-md`}>
              🤫
            </div>
          </div>
          <div className="flex-1 max-w-3xl">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                {_("options.userProfile.chat.generating")}
              </p>
              
              {/* Phase 11: 进度条 */}
              {rebuildProgress > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${rebuildProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>{Math.floor(rebuildProgress)}%</span>
                      {rebuildStartTime > 0 && (
                        <span className="text-gray-400 dark:text-gray-500">
                          {Math.floor((Date.now() - rebuildStartTime) / 1000)}s
                        </span>
                      )}
                    </div>
                    <span>{rebuildProgress >= 99 ? '即将完成...' : '分析中...'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    // 提取关键字用于高亮（从 interests 中提取）
    const interestKeywords = aiSummary.interests
      .split(/[、，,。]/g)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 10)
    
    // 推理模式使用紫色渐变，非推理模式使用蓝色渐变
    const isReasoningMode = aiSummary.metadata.model === 'deepseek-reasoner'
    const avatarBgClass = isReasoningMode
      ? 'bg-gradient-to-br from-purple-500 to-violet-500'
      : 'bg-gradient-to-br from-blue-500 to-indigo-500'
    
    return (
      <div className="space-y-3 mb-6">
        {/* 气泡 1: 兴趣介绍 */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className={`w-12 h-12 ${avatarBgClass} rounded-full flex items-center justify-center text-2xl shadow-md`}>
              🤫
            </div>
          </div>
          <div className="flex-1 max-w-3xl">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                {highlightKeywords(
                  _("options.userProfile.chat.intro", {
                    providerName,
                    startDate: formatMonthDay(startDate),
                    totalPages: profile.totalPages,
                    interests: aiSummary.interests
                  }),
                  interestKeywords
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 气泡 2: 内容偏好 */}
        {aiSummary.preferences && aiSummary.preferences.length > 0 && (
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12"></div>
            <div className="flex-1 max-w-3xl">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                  {highlightKeywords(
                    _("options.userProfile.chat.preferences", {
                      preferences: aiSummary.preferences.join('、')
                    }),
                    aiSummary.preferences
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 气泡 3: 回避话题 */}
        {aiSummary.avoidTopics && aiSummary.avoidTopics.length > 0 && (
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12"></div>
            <div className="flex-1 max-w-3xl">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                  {highlightKeywords(
                    _("options.userProfile.chat.avoidTopics", {
                      topics: aiSummary.avoidTopics.join('、')
                    }),
                    aiSummary.avoidTopics
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 时间戳（只在最后一个气泡下方显示） */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12"></div>
          <div className="text-xs text-gray-400 dark:text-gray-500 ml-2">
            {formatDateTime(timestamp, {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      </div>
    )
  }

  // 渲染用户消息气泡
  const renderUserMessage = () => {
    return (
      <div className="flex items-start gap-4 mb-6 justify-end">
        {/* 用户消息气泡 */}
        <div className="max-w-3xl">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl rounded-tr-sm p-4 border border-green-100 dark:border-green-800 shadow-sm">
            <p className="text-gray-800 dark:text-gray-200">
              {_("options.userProfile.chat.userRebuildLabel")}
            </p>
          </div>
        </div>
        
        {/* 用户头像（扩展图标） */}
        <div className="flex-shrink-0">
          <img 
            src={chrome.runtime.getURL('assets/icons/128/base-static.png')}
            alt="User"
            className="w-12 h-12 rounded-full shadow-md"
          />
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 对话历史区域 */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg min-h-[400px] max-h-[600px] overflow-y-auto">
        {messages.length === 0 ? (
          // 空状态 - 显示学习进度 + 更新进度
          <div className="space-y-6">
            {/* 学习进度（浏览历史数量）*/}
            <div className="flex flex-col items-center justify-center text-center py-8">
              <span className="text-6xl mb-4">🌱</span>
              {/* Phase 9.1: 总是显示进度，即使是 0 页 */}
              <p className="text-gray-600 dark:text-gray-300 text-base font-medium mb-2">
                {totalPages > 0 
                  ? _("options.profile.learning")
                  : _("options.userProfile.noData.message")
                }
              </p>
              <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((totalPages / 100) * 100, 100)}%` }}
                />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {_("options.profile.progress", { current: totalPages, total: 100 })}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                {_("options.userProfile.noData.hint")}
              </p>
            </div>
            
            {/* 画像更新进度 - AI 配置后显示 */}
            {updateProgress && aiConfigured && (
              <UpdateProgressBubble updateProgress={updateProgress} _={_} />
            )}
          </div>
        ) : (
          // 对话消息列表
          <div>
            {messages.map((message) => (
              <div key={message.id}>
                {message.type === 'ai' && message.content !== 'rebuilding' && 
                  renderAIMessage(message.content as UserProfile, message.timestamp)
                }
                {message.type === 'user' && renderUserMessage()}
              </div>
            ))}
            
            {/* 画像更新进度 - AI 配置后显示 */}
            {updateProgress && aiConfigured && (
              <UpdateProgressBubble updateProgress={updateProgress} _={_} />
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 操作区域 */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          💡 {aiConfigured 
            ? _("options.userProfile.chat.tipConfigured") 
            : _("options.userProfile.chat.tipNotConfigured")
          }
        </div>
        
        <button
          onClick={handleRebuildProfile}
          disabled={isRebuilding || !aiConfigured}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            isRebuilding
              ? 'bg-gray-400 text-white cursor-wait'
              : !aiConfigured
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
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
