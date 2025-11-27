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
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import type { UserProfile } from "@/types/profile"
import { logger } from "@/utils/logger"

const profileViewLogger = logger.withTag("ProfileView")

/** 对话消息类型 */
interface ChatMessage {
  id: string
  type: 'ai' | 'user'
  content: UserProfile | 'rebuilding'
  timestamp: number
}

export function ProfileSettings() {
  const { _ } = useI18n()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiProvider, setAiProvider] = useState("")
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
        
        profileViewLogger.info("用户画像数据:", {
          hasAiSummary: !!data?.aiSummary,
          aiSummaryProvider: data?.aiSummary?.metadata?.provider,
          totalPages: data?.totalPages
        })
        
        setAiConfigured(aiConfig.enabled && aiConfig.provider !== null)
        setAiProvider(getProviderDisplayName(aiConfig.provider || null))
        
        // 如果有画像，添加为初始消息
        if (data && data.totalPages > 0) {
          setMessages([{
            id: `init-${Date.now()}`,
            type: 'ai',
            content: data,
            timestamp: data.aiSummary?.metadata?.timestamp || data.lastUpdated
          }])
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

    // 1. 添加用户消息："重建画像"
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: 'rebuilding',
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMessage])

    setIsRebuilding(true)
    try {
      const newProfile = await profileManager.rebuildProfile()
      
      // 2. 添加 AI 回复消息：新画像
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: newProfile,
        timestamp: newProfile.aiSummary?.metadata?.timestamp || newProfile.lastUpdated
      }
      setMessages(prev => [...prev, aiMessage])
      
    } catch (error) {
      profileViewLogger.error("重建用户画像失败:", error)
      alert(_("options.userProfile.alerts.rebuildFailed"))
    } finally {
      setIsRebuilding(false)
    }
  }

  // 渲染 AI 消息气泡
  const renderAIMessage = (profile: UserProfile, timestamp: number) => {
    const aiSummary = profile.aiSummary
    
    return (
      <div className="flex items-start gap-4 mb-6">
        {/* AI 头像 */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-2xl shadow-md">
            🤖
          </div>
        </div>
        
        {/* AI 消息气泡 */}
        <div className="flex-1 max-w-3xl">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl rounded-tl-sm p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
            {aiSummary ? (
              // 有 AI 画像
              <div className="text-gray-800 dark:text-gray-200 leading-relaxed space-y-3">
                <p>
                  我是 <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {aiSummary.metadata.provider === 'deepseek' ? 'DeepSeek' : 
                     aiSummary.metadata.provider === 'openai' ? 'OpenAI' : 
                     aiSummary.metadata.provider === 'anthropic' ? 'Anthropic' : 'AI'}
                  </span>，
                  通过分析你的 <span className="font-medium text-orange-600 dark:text-orange-400">{profile.totalPages} 次</span>浏览，
                  我发现你{aiSummary.interests}
                </p>
                
                {aiSummary.preferences && aiSummary.preferences.length > 0 && (
                  <p>
                    根据这些理解，我会为你推荐 <span className="font-medium text-green-600 dark:text-green-400">
                      {aiSummary.preferences.join('、')}
                    </span> 等方面的内容。
                  </p>
                )}
                
                {aiSummary.avoidTopics && aiSummary.avoidTopics.length > 0 && (
                  <p>
                    同时，我也注意到你不感兴趣的内容，会避免推荐 <span className="font-medium text-red-600 dark:text-red-400">
                      {aiSummary.avoidTopics.join('、')}
                    </span> 等话题。
                  </p>
                )}
              </div>
            ) : (
              // AI 画像生成中
              <p className="text-gray-600 dark:text-gray-400">
                AI 画像生成中，请稍候...
              </p>
            )}
          </div>
          
          {/* 时间戳 */}
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-2">
            {new Date(timestamp).toLocaleString('zh-CN', {
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
              🔄 重建画像
            </p>
          </div>
        </div>
        
        {/* 用户头像（扩展图标） */}
        <div className="flex-shrink-0">
          <img 
            src={chrome.runtime.getURL('assets/icons/128/icon-128.png')}
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
          // 空状态
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <span className="text-6xl mb-4">🔍</span>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {_("options.userProfile.noData.message")}
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              {_("options.userProfile.noData.hint")}
            </p>
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 操作区域 */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          💡 {aiConfigured 
            ? '点击"重建画像"按钮，AI会重新分析你的浏览习惯' 
            : '请先在"AI引擎"标签页配置AI服务'
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
