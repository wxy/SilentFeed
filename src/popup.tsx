import { useState, useEffect } from "react"

import "@/i18n" // 初始化 i18n
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import { useTheme } from "@/hooks/useTheme"
import { ColdStartView } from "@/components/ColdStartView"
import { RecommendationView } from "@/components/RecommendationView"
import { ReadingListSummaryView } from "@/components/ReadingListSummaryView"
import { OnboardingView } from "@/components/OnboardingView"
import { type OnboardingState } from "@/storage/onboarding-state"
import { trackPopupOpen } from "@/core/recommender/adaptive-count"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { getRecommendationConfig } from "@/storage/recommendation-config"
import { isReadingListAvailable } from "@/utils/browser-compat"
import "@/styles/global.css"

/**
 * 阶段状态信息（从 Background 获取）
 */
interface OnboardingStateInfo {
  state: OnboardingState
  pageCount: number
  threshold: number
  subscribedFeedCount: number
  progressPercent: number
  isLearningComplete: boolean
  isAIConfigured: boolean
}

/**
 * Silent Feed - Popup 主界面
 * Phase 2.7: 两阶段 UI（冷启动 + 推荐）
 * Phase 6: 添加弹窗打开跟踪，动态高度适应
 * Phase 15: 根据投递方式显示不同视图（弹窗推荐 vs 阅读清单汇总）
 */
function IndexPopup() {
  const { _ } = useI18n()
  useTheme() // 应用主题到 DOM
  
  const [stateInfo, setStateInfo] = useState<OnboardingStateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deliveryMode, setDeliveryMode] = useState<'popup' | 'readingList' | 'both'>('popup')
  const [toolbarState, setToolbarState] = useState<{
    hasRSSFeeds: boolean
    hasCandidateFeeds: boolean  // 新发现的订阅源
    hasRecommendations: boolean  // 是否有推荐内容
    onDismissAll?: () => Promise<void>
    onOpenRSSManagement?: () => void
  }>({ hasRSSFeeds: false, hasCandidateFeeds: false, hasRecommendations: false })

  // Phase 6: 跟踪弹窗打开
  useEffect(() => {
    trackPopupOpen()
    
    // 确保 body 和 html 没有固定高度
    document.body.style.minHeight = 'auto'
    document.body.style.height = 'auto'
    document.documentElement.style.minHeight = 'auto'
    document.documentElement.style.height = 'auto'
  }, [])

  // 监听 RecommendationView 的工具栏状态
  useEffect(() => {
    const checkToolbar = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).__recommendationViewToolbar) {
        setToolbarState((window as any).__recommendationViewToolbar)
      }
    }, 100)
    
    return () => clearInterval(checkToolbar)
  }, [])

  // Phase 15: 加载投递方式配置
  useEffect(() => {
    const loadDeliveryMode = async () => {
      try {
        const config = await getRecommendationConfig()
        const readingListAvailable = isReadingListAvailable()
        
        // 根据配置和浏览器能力决定实际投递方式
        if (config.deliveryMode === 'both' && readingListAvailable) {
          setDeliveryMode('both')
        } else if (config.deliveryMode === 'readingList' && readingListAvailable) {
          setDeliveryMode('readingList')
        } else {
          setDeliveryMode('popup')
        }
      } catch (error) {
        console.error('加载投递方式失败:', error)
        setDeliveryMode('popup')
      }
    }
    loadDeliveryMode()
  }, [])

  useEffect(() => {
    // 从 Background 获取完整的阶段状态信息
    const loadData = async () => {
      try {
        // 使用消息从 Background 获取统一的状态信息
        const response = await chrome.runtime.sendMessage({ type: 'GET_ONBOARDING_STATE_INFO' })
        
        if (response?.success && response.data) {
          setStateInfo(response.data)
        } else {
          // 回退到默认状态
          console.error('Failed to get state info:', response?.error)
          setStateInfo({
            state: 'setup',
            pageCount: 0,
            threshold: LEARNING_COMPLETE_PAGES,
            subscribedFeedCount: 0,
            progressPercent: 0,
            isLearningComplete: false,
            isAIConfigured: false
          })
        }
      } catch (error) {
        console.error('Failed to load data:', error)
        // 首次加载时可能 background 还未就绪，使用默认值
        setStateInfo({
          state: 'setup',
          pageCount: 0,
          threshold: LEARNING_COMPLETE_PAGES,
          subscribedFeedCount: 0,
          progressPercent: 0,
          isLearningComplete: false,
          isAIConfigured: false
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const currentLang = i18n.language // 获取当前语言
  // 弹窗高度根据内容动态计算，无固定高度，无滚动条
  const containerClass = "w-[400px] flex flex-col bg-gradient-to-br from-slate-50/95 to-indigo-50/80 dark:from-gray-900 dark:to-indigo-950/30"

  // 加载中状态
  if (isLoading) {
    return (
      <div className={containerClass} lang={currentLang}>
        <div className="text-4xl animate-pulse flex items-center justify-center flex-1">⏳</div>
      </div>
    )
  }

  // 从 stateInfo 提取状态
  const { state: onboardingState, pageCount, threshold, isLearningComplete } = stateInfo
  const isColdStart = !isLearningComplete

  // Onboarding 完成回调
  const handleOnboardingComplete = () => {
    // 更新本地状态
    setStateInfo(prev => prev ? {
      ...prev,
      state: 'learning',
      pageCount: 0,
      progressPercent: 0,
      isLearningComplete: false
    } : null)
    
    // 通知 background 重新配置调度器
    chrome.runtime.sendMessage({ type: 'ONBOARDING_STATE_CHANGED', state: 'learning' })
  }

  // Phase 9.1: 如果处于 setup 状态，显示引导界面
  if (onboardingState === 'setup') {
    return (
      <ErrorBoundary>
        <OnboardingView onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className={containerClass} lang={currentLang}>
        
        {/* 头部 - 极简设计：应用名 + 右上角工具图标 */}
        <div className="px-4 pt-3 pb-3 flex items-center justify-between bg-gradient-to-r from-indigo-500 to-cyan-500 dark:from-indigo-600 dark:to-cyan-600 border-b border-indigo-600/20 dark:border-cyan-500/20 shadow-sm">
          <h1 className="text-base font-bold text-white drop-shadow-sm">{_("app.name")}</h1>
          
          {/* 右上角工具图标 - 设置图标固定在最右端 */}
          <div className="flex items-center gap-1.5">
            {/* 推荐阶段显示额外按钮 */}
            {!isColdStart && (
              <>
                {/* RSS源按钮 - 仅在有新发现的订阅源时显示 */}
                {toolbarState.hasCandidateFeeds && (
                  <button
                    onClick={toolbarState.onOpenRSSManagement}
                    className="p-1.5 hover:bg-white/20 rounded transition-colors"
                    title={_("popup.rssFeeds")}
                  >
                    <span className="text-sm text-white drop-shadow">📡</span>
                  </button>
                )}
                
                {/* 全部不想读按钮 - 仅在有推荐内容时显示 */}
                {toolbarState.hasRecommendations && (
                  <button
                    onClick={toolbarState.onDismissAll}
                    className="p-1.5 hover:bg-white/20 rounded transition-colors"
                    title={_("popup.dismissAll")}
                  >
                    <span className="text-sm text-white drop-shadow">👎</span>
                  </button>
                )}
              </>
            )}
            
            {/* 设置按钮始终显示，固定在最右端 */}
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="p-1.5 hover:bg-white/20 rounded transition-colors"
              title={_("popup.settings")}
            >
              <span className="text-sm text-white drop-shadow">⚙️</span>
            </button>
          </div>
        </div>

        {/* 主体内容 - 三种模式：冷启动 / 推荐弹窗 / 阅读清单汇总 */}
        {isColdStart ? (
          <ColdStartView 
            pageCount={pageCount} 
            totalPages={threshold} 
            subscribedFeedCount={stateInfo.subscribedFeedCount}
            isAIConfigured={stateInfo.isAIConfigured}
          />
        ) : deliveryMode === 'readingList' ? (
          <ReadingListSummaryView />
        ) : (
          // popup 模式或 both 模式都显示推荐列表
          // both 模式下额外在阅读清单中同步显示，但弹窗只显示 RecommendationView
          <RecommendationView />
        )}
      </div>
    </ErrorBoundary>
  )
}

export default IndexPopup
