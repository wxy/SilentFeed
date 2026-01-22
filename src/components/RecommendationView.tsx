/**
 * 推荐阶段组件
 * Phase 7: 空间优化布局
 * - 头部工具栏移至popup（设置、RSS源、全部不想读）
 * - 推荐列表：智能显示摘要，优化空间利用
 * - 用户行为跟踪：点击、不想读、全部不想读
 * - 学习阶段和空窗期显示 Tips
 */

import { useEffect, useState, useMemo } from "react"
import { useI18n } from "@/i18n/helpers"
import { useRecommendationStore } from "@/stores/recommendationStore"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { getRecommendationConfig } from "@/storage/recommendation-config"
import {
  trackRecommendationClick,
  trackDismiss,
  trackDismissAll
} from "@/core/recommender/adaptive-count"
import { ReadingListManager } from "@/core/reading-list/reading-list-manager"
import { isReadingListAvailable } from "@/utils/browser-compat"
import { sanitizeHtml } from "@/utils/html"
import { getFaviconUrl, handleFaviconError } from "@/utils/favicon"
import { formatRecommendationReason } from "@/utils/formatReason"
import type { Recommendation } from "@/types/database"
import { logger } from "@/utils/logger"
import { getDisplayText, formatLanguageLabel, translateOnDemand } from "@/core/translator/recommendation-translator"
import { getUIConfig, watchAutoTranslate } from "@/storage/ui-config"
import { OnboardingStateService } from "@/core/onboarding/OnboardingStateService"

const recViewLogger = logger.withTag("RecommendationView")

/** Tip 数据结构 */
interface Tip {
  emoji: string
  text: string
}

/**
 * 获取随机 Tip（学习阶段优先工作原理类，推荐阶段优先理念和技巧类）
 */
function getRandomTip(tips: Record<string, Tip[]>, isLearningStage: boolean): Tip {
  // 学习阶段优先展示工作原理类
  const learningPriority = ['howItWorks', 'privacy', 'philosophy', 'features']
  // 推荐阶段优先展示理念和技巧类
  const readyPriority = ['philosophy', 'usage', 'features', 'privacy']
  
  const priority = isLearningStage ? learningPriority : readyPriority
  
  // 收集所有可用的 tips
  const allTips: Tip[] = []
  for (const category of priority) {
    if (tips[category]) {
      allTips.push(...tips[category])
    }
  }
  
  // 随机选择一条
  return allTips[Math.floor(Math.random() * allTips.length)]
}

/**
 * 生成 translate.goog 格式的翻译 URL
 * @param url 原始页面URL
 * @param targetLanguage 目标语言代码（如 'zh-CN', 'en'）
 * @returns translate.goog 格式的翻译 URL
 */
function getGoogleTranslateUrl(url: string, targetLanguage: string): string {
  try {
    const urlObj = new URL(url)
    
    // 将域名中的点替换为短横线
    // 例如：example.com → example-com
    const translatedHost = urlObj.hostname.replace(/\./g, '-')
    
    // 构造新 URL
    const translatedUrl = new URL(`https://${translatedHost}.translate.goog${urlObj.pathname}${urlObj.search}`)
    
    // 添加翻译参数
    const targetLang = targetLanguage.split('-')[0] // 'zh-CN' → 'zh'
    translatedUrl.searchParams.set('_x_tr_sl', 'auto')      // 源语言：自动检测
    translatedUrl.searchParams.set('_x_tr_tl', targetLang)  // 目标语言
    translatedUrl.searchParams.set('_x_tr_hl', targetLang)  // 界面语言
    
    // 保留原始 hash
    if (urlObj.hash) {
      translatedUrl.hash = urlObj.hash
    }
    
    return translatedUrl.toString()
  } catch (error) {
    // 如果 URL 解析失败，降级使用传统格式
    const encodedUrl = encodeURIComponent(url)
    return `https://translate.google.com/translate?sl=auto&tl=${targetLanguage}&u=${encodedUrl}`
  }
}

/**
 * 生成语言标签显示文本和样式
 * 新逻辑（Phase 9）：
 * - 符合界面语言：不显示标签
 * - 不符合界面语言 + 自动翻译开启：显示「原文：语言」按钮，点击访问原文
 * - 不符合界面语言 + 自动翻译关闭：显示「翻译」按钮，点击访问翻译
 * @param sourceLanguage 源语言
 * @param targetLanguage 目标语言（如果需要翻译）
 * @param autoTranslateEnabled 是否开启自动翻译
 * @param t i18n 翻译函数
 */
function getLanguageLabel(
  sourceLanguage: string,
  targetLanguage: string | undefined,
  autoTranslateEnabled: boolean,
  t: (key: string, options?: any) => string
): {
  text: string
  tooltip: string
  showLabel: boolean      // 是否显示标签
  actionType: 'original' | 'translate' | 'none'  // 点击行为
  className: string
} {
  // 使用 i18n 获取语言名称
  const getLanguageName = (lang: string): string => {
    const langKey = `languages.${lang.toLowerCase().replace('-', '_')}`
    const translated = t(langKey)
    // 如果没有翻译，使用简写
    if (translated === langKey) {
      return formatLanguageLabel(lang)
    }
    return translated
  }
  
  const sourceLang = getLanguageName(sourceLanguage)
  
  // 符合界面语言：不显示标签
  if (!targetLanguage || sourceLanguage.toLowerCase().startsWith(targetLanguage.toLowerCase().split('-')[0]) || 
      targetLanguage.toLowerCase().startsWith(sourceLanguage.toLowerCase().split('-')[0])) {
    return {
      text: '',
      tooltip: '',
      showLabel: false,
      actionType: 'none',
      className: ''
    }
  }
  
  // 不符合界面语言
  if (autoTranslateEnabled) {
    // 自动翻译开启：默认打开翻译，显示「原文：语言」按钮
    return {
      text: t('popup.viewOriginal', { language: sourceLang }),
      tooltip: t('popup.clickToViewOriginal'),
      showLabel: true,
      actionType: 'original',
      className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
    }
  } else {
    // 自动翻译关闭：默认打开原文，显示「翻译」按钮
    const targetLang = getLanguageName(targetLanguage)
    return {
      text: t('popup.translate'),
      tooltip: t('popup.clickToTranslate', { language: targetLang }),
      showLabel: true,
      actionType: 'translate',
      className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40 cursor-pointer'
    }
  }
}

// 导出工具栏相关接口给popup使用
export interface RecommendationViewToolbar {
  hasRSSFeeds: boolean
  onDismissAll: () => Promise<void>
  onOpenRSSManagement: () => void
}

/**
 * 获取推荐引擎标志（基于结构化数据或字符串）
 */
function getEngineLabel(recommendation: Recommendation, t: (key: string) => string): { emoji: string; text: string } {
  const reason = recommendation.reason
  
  // 如果是结构化数据
  if (typeof reason === 'object' && reason !== null) {
    const { provider, isReasoning } = reason
    if (provider === 'deepseek' && isReasoning) {
      return { emoji: "🤖", text: t("popup.engine.reasoningAI") }
    } else if (provider === 'keyword') {
      return { emoji: "🧮", text: t("popup.engine.algorithm") }
    } else {
      return { emoji: "🤖", text: t("popup.engine.ai") }
    }
  }
  
  // 兼容旧版本字符串数据
  const reasonStr = typeof reason === 'string' ? reason : ""
  if (reasonStr.includes("推理AI")) {
    return { emoji: "🤖", text: t("popup.engine.reasoningAI") }
  } else if (reasonStr.includes("AI")) {
    return { emoji: "🤖", text: t("popup.engine.ai") }
  } else if (reasonStr.includes("算法")) {
    return { emoji: "🧮", text: t("popup.engine.algorithm") }
  } else {
    return { emoji: "🧮", text: t("popup.engine.algorithm") }
  }
}

/**
 * 获取推荐理由图标
 * - 冷启动推荐（基于订阅偏好）：🌱 新芽
 * - 常规推荐（基于用户画像）：💡 灵感
 */
function getReasonIcon(recommendation: Recommendation): string {
  const reason = recommendation.reason
  
  // 如果是结构化数据
  if (typeof reason === 'object' && reason !== null) {
    if (reason.type === 'cold-start') {
      return '🌱'  // 新芽：代表基于订阅偏好的冷启动推荐
    }
  }
  
  return '💡'  // 灵感：代表基于用户画像的常规推荐
}

export function RecommendationView() {
  const { _, t, i18n } = useI18n()
  const {
    recommendations,
    isLoading,
    error,
    loadRecommendations,
    markAsRead,
    dismissAll,
    dismissSelected,
    removeFromList
  } = useRecommendationStore()
  
  const [maxRecommendations, setMaxRecommendations] = useState(5)
  const [hasRSSFeeds, setHasRSSFeeds] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [currentPageCount, setCurrentPageCount] = useState(0)
  const [dynamicThreshold, setDynamicThreshold] = useState(100)
  const [readingListAvailable, setReadingListAvailable] = useState(false)
  
  // 检查阅读列表功能可用性
  useEffect(() => {
    setReadingListAvailable(isReadingListAvailable())
  }, [])
  
  // 加载推荐配置
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getRecommendationConfig()
      setMaxRecommendations(config.maxRecommendations)
    }
    loadConfig()
  }, [])

  // 检查 onboarding 状态和页面计数（使用 OnboardingStateService 获取动态阈值）
  useEffect(() => {
    const checkOnboardingState = async () => {
      const stateInfo = await OnboardingStateService.getState()
      setIsReady(stateInfo.isLearningComplete)
      setCurrentPageCount(stateInfo.pageCount)
      setDynamicThreshold(stateInfo.threshold)
    }
    checkOnboardingState()
  }, [])

  // 获取随机 Tip（使用 useMemo 避免每次渲染都随机）
  const randomTip = useMemo(() => {
    const tips = t("popup.tips", { returnObjects: true }) as Record<string, Tip[]>
    if (!tips || typeof tips !== 'object') return null
    return getRandomTip(tips, !isReady)
  }, [t, isReady])

  // 检查 RSS 源状态
  const [hasCandidateFeeds, setHasCandidateFeeds] = useState(false)
  
  useEffect(() => {
    const checkRSSFeeds = async () => {
      try {
        const feedManager = new FeedManager()
        // 检查所有已订阅的源（subscribed状态）
        const subscribedFeeds = await feedManager.getFeeds('subscribed')
        // 检查待确认的源（candidate状态）- 新发现的订阅源
        const candidateFeeds = await feedManager.getFeeds('candidate')
        setHasRSSFeeds(subscribedFeeds.length > 0 || candidateFeeds.length > 0)
        setHasCandidateFeeds(candidateFeeds.length > 0)
      } catch (error) {
        recViewLogger.error('检查RSS源失败:', error)
      }
    }
    checkRSSFeeds()
  }, [])

  // 组件挂载时加载推荐
  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const handleItemClick = async (rec: Recommendation, event: React.MouseEvent) => {
    try {
      recViewLogger.debug(`点击推荐条目: ${rec.id} - ${rec.title}`)
      
      // 立即添加视觉反馈：降低透明度，表示正在处理
      const element = event.currentTarget as HTMLElement
      element.style.opacity = '0.6'
      element.style.pointerEvents = 'none'
      
      // Phase 6: 跟踪推荐点击
      await trackRecommendationClick()
      
      // 从推荐列表移除（不标记为不想读，等待阅读验证）
      await removeFromList([rec.id])
      recViewLogger.info(`✅ 已从推荐列表移除，等待阅读验证: ${rec.id}`)
      
      // ⚠️ 重要：先通过 Background 创建 Tab 并保存追踪信息
      // 原因：弹窗在创建新标签页后会立即关闭，后续代码可能无法执行
      // 解决方案：使用 fire-and-forget 模式发送消息，不等待响应
      // 因为 await sendMessage 会等待响应，但弹窗可能在响应前就关闭了
      chrome.runtime.sendMessage({
        type: 'OPEN_RECOMMENDATION',
        payload: {
          url: rec.url,
          sourceUrl: rec.sourceUrl, // 传递源URL以便查找翻译设置
          recommendationId: rec.id,
          title: rec.title,
          action: 'clicked'
        }
      }).then(response => {
        // 这个回调可能不会执行（弹窗已关闭）
        if (response?.success) {
          recViewLogger.info(`✅ Background 响应成功（Tab ID: ${response.tabId}）`)
        }
      }).catch(err => {
        // 忽略错误（弹窗关闭导致的错误是正常的）
        recViewLogger.debug('sendMessage 错误（可能是弹窗关闭）:', err)
      })
      
      // 不等待响应，弹窗会在消息发送后关闭
      
    } catch (error) {
      recViewLogger.error('❌ 处理点击失败:', error)
      
      // 恢复视觉状态（如果操作失败）
      if (event.currentTarget) {
        const element = event.currentTarget as HTMLElement
        element.style.opacity = '1'
        element.style.pointerEvents = 'auto'
      }
    }
  }

  const handleDismiss = async (recId: string, event: React.MouseEvent) => {
    event.stopPropagation() // 阻止点击事件冒泡
    
    try {
      recViewLogger.debug(`点击不想读: ${recId}`)
      
      // 立即添加视觉反馈：降低透明度，表示正在处理
      const element = (event.target as HTMLElement).closest('article') as HTMLElement
      if (element) {
        element.style.opacity = '0.6'
        element.style.pointerEvents = 'none'
      }
      
      // Phase 6: 跟踪单个不想读
      await trackDismiss()
      
      // 调用store的dismissSelected方法
      // Store会自动：
      // 1. 标记为不想读
      // 2. 重新加载推荐列表（移除已拒绝的，添加新的）
      // 3. React会自动重新渲染，条目会立即从列表消失并被新推荐替换
      recViewLogger.debug(`开始标记为不想读: ${recId}`)
      await dismissSelected([recId])
      recViewLogger.info(`✅ 标记不想读完成，列表已自动更新: ${recId}`)
      
    } catch (error) {
      recViewLogger.error('❌ 标记不想读失败:', error)
    }
  }

  const handleSaveToReadingList = async (rec: Recommendation, event: React.MouseEvent) => {
    event.stopPropagation() // 阻止点击事件冒泡
    
    try {
      recViewLogger.debug(`保存到稍后读: ${rec.id} - ${rec.title}`)
      
      // 立即添加视觉反馈
      const element = (event.target as HTMLElement).closest('[data-recommendation-id]') as HTMLElement
      if (element) {
        element.style.opacity = '0.6'
        element.style.pointerEvents = 'none'
      }
      
      // 获取自动翻译配置和界面语言
      const uiConfig = await getUIConfig()
      const currentLanguage = i18n.language
      
      // 保存到 Chrome 阅读列表（使用不同前缀 📌 区分用户手动保存的"稍后读"）
      // 这样在模式切换时不会被转移
      const manualSavePrefix = '📌 '
      await ReadingListManager.saveRecommendation(rec, uiConfig.autoTranslate, currentLanguage, manualSavePrefix)
      recViewLogger.info(`✅ 已保存到稍后读: ${rec.id}`)
      
      // 从推荐列表移除（但不标记为不想读）
      await removeFromList([rec.id])
      recViewLogger.info(`✅ 已从推荐列表移除: ${rec.id}`)
      
    } catch (error) {
      recViewLogger.error('❌ 保存到稍后读失败:', error)
      
      // 恢复视觉状态
      const element = (event.target as HTMLElement).closest('[data-recommendation-id]') as HTMLElement
      if (element) {
        element.style.opacity = '1'
        element.style.pointerEvents = 'auto'
      }
    }
  }

  const handleDismissAll = async () => {
    if (recommendations.length === 0) return
    
    const confirmed = confirm(
      _("popup.confirmDismissAll", { count: Math.min(recommendations.length, maxRecommendations) })
    )
    
    if (confirmed) {
      // Phase 6: 跟踪全部不想读（强信号）
      await trackDismissAll()
      
      await dismissAll()
    }
  }

  const openSettings = () => {
    chrome.runtime.openOptionsPage()
  }

  const openRSSManagement = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('options.html#feeds')
    })
  }

  // 🔧 Phase 22: 弹窗只显示前3条推荐
  // 推荐池中的文章数量可能更多，但弹窗UI空间有限，只显示前3条
  // 当用户处理某条后，后续推荐会自动补充到前3条位置
  const displayedRecommendations = recommendations.slice(0, 3)

  /**
   * 智能决定哪些条目显示摘要
   * 策略：
   * - 第一条始终显示摘要
   * - 其他条目：如果总高度允许，从第二条开始显示1-2行摘要
   * - 如果空间不够，从最后一条开始隐藏摘要
   * 
   * 高度估算：
   * - 第一条(有摘要): ~160px
   * - 其他条(无摘要): ~75px
   * - 其他条(有摘要): ~105px (增加~30px)
   * - 最大高度: 600px
   */
  const shouldShowExcerpt = (index: number): boolean => {
    if (index === 0) return true // 第一条总是显示
    
    const itemCount = displayedRecommendations.length
    if (itemCount <= 3) return true // 3条以内全部显示摘要
    if (itemCount === 4) return index <= 2 // 4条时前3条显示
    if (itemCount === 5) return index <= 1 // 5条时前2条显示
    
    return false
  }

  // 导出工具栏状态给popup使用 (通过window全局对象)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__recommendationViewToolbar = {
        hasRSSFeeds,
        hasCandidateFeeds,  // 新发现的订阅源
        hasRecommendations: displayedRecommendations.length > 0,  // 是否有推荐内容
        onDismissAll: handleDismissAll,
        onOpenRSSManagement: openRSSManagement
      }
    }
  }, [hasRSSFeeds, hasCandidateFeeds, displayedRecommendations.length])

  if (isLoading && recommendations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("popup.loading")}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            {error}
          </p>
          <button
            onClick={loadRecommendations}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {_("popup.retry")}
          </button>
        </div>
      </div>
    )
  }

  if (displayedRecommendations.length === 0) {
    // ready 状态且无 RSS 源：提示用户添加
    if (isReady && !hasRSSFeeds) {
      return (
        <div className="flex flex-col">
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center px-6">
              <div className="text-4xl mb-4">📰</div>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-2">
                {_("popup.noRSSFeeds.title")}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                {_("popup.noRSSFeeds.description")}
              </p>
              <button
                onClick={openRSSManagement}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                {_("popup.noRSSFeeds.action")}
              </button>
            </div>
          </div>
        </div>
      )
    }
    
    // ready 状态且有 RSS 源：显示"全部读完"的鼓励消息 + Tip
    if (isReady && hasRSSFeeds) {
      // 从预设消息中随机选择一条
      const messages = t("popup.allCaughtUp.messages", { returnObjects: true }) as string[]
      const randomMessage = messages[Math.floor(Math.random() * messages.length)]
      
      return (
        <div className="flex flex-col">
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center px-6">
              <div className="text-4xl mb-3">✨</div>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-1">
                {randomMessage}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                {_("popup.allCaughtUp.subtitle")}
              </p>
              
              {/* Tip 卡片 */}
              {randomTip && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="mr-1.5">{randomTip.emoji}</span>
                    {randomTip.text}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    
    // 其他情况：学习阶段，显示进度 + 说明 + Tip
    const totalPages = dynamicThreshold
    const progress = Math.min(currentPageCount, totalPages)
    
    return (
      <div className="flex flex-col">
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-center px-6">
            <div className="text-4xl mb-3">🌱</div>
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-1">
              {_("popup.learningStage.title")}
            </p>
            
            {/* 进度显示 */}
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">
              {_("popup.learningStage.progress", { current: progress, total: totalPages })}
            </p>
            
            {/* 进度条 */}
            <div className="w-32 mx-auto h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all"
                style={{ width: `${(progress / totalPages) * 100}%` }}
              ></div>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
              {_("popup.learningStage.subtitle")}
            </p>
            
            {/* Tip 卡片 */}
            {randomTip && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="mr-1.5">{randomTip.emoji}</span>
                  {randomTip.text}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* 推荐列表 - 无滚动条，动态高度 */}
      <div className="flex flex-col">
        {displayedRecommendations.map((rec, index) => (
          <RecommendationItem
            key={rec.id}
            recommendation={rec}
            isTopItem={index === 0} // 第一条显示摘要
            showExcerpt={shouldShowExcerpt(index)} // 智能决定是否显示摘要
            onClick={(e) => handleItemClick(rec, e)}
            onDismiss={(e) => handleDismiss(rec.id, e)}
            onSaveToReadingList={readingListAvailable ? (e) => handleSaveToReadingList(rec, e) : undefined}
            onRemoveFromList={() => removeFromList([rec.id])}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 推荐条目组件
 * Phase 7 优化：空间优化布局
 * - 第一条（评分最高）显示摘要（标题3行 + 摘要4行）
 * - 其他条目：智能显示摘要（标题2行 + 摘要2行）
 * - 显示文章长度、阅读时长、推荐理由
 */
interface RecommendationItemProps {
  recommendation: Recommendation
  isTopItem: boolean  // 是否为第一条（评分最高）
  showExcerpt: boolean // 是否显示摘要
  onClick: (event: React.MouseEvent) => void
  onDismiss: (event: React.MouseEvent) => void
  onSaveToReadingList?: (event: React.MouseEvent) => void // 保存到稍后读
  onRemoveFromList?: () => Promise<void> // 从列表移除（不标记为不想读）
}

function RecommendationItem({ recommendation, isTopItem, showExcerpt, onClick, onDismiss, onSaveToReadingList, onRemoveFromList }: RecommendationItemProps) {
  const { _, t, i18n } = useI18n()
  const { markAsRead } = useRecommendationStore()
  const [showOriginal, setShowOriginal] = useState(false)
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false)
  const [feedTranslateEnabled, setFeedTranslateEnabled] = useState(true) // 订阅源的翻译设置（默认启用）
  const [currentRecommendation, setCurrentRecommendation] = useState(recommendation)
  const [isTranslating, setIsTranslating] = useState(false)
  
  // 加载订阅源的翻译设置
  useEffect(() => {
    const loadFeedSettings = async () => {
      if (recommendation.sourceUrl) {
        try {
          const feedManager = new FeedManager()
          const feed = await feedManager.getFeedByUrl(recommendation.sourceUrl)
          if (feed) {
            // useGoogleTranslate 默认为 true，只有明确设置为 false 时才禁用
            setFeedTranslateEnabled(feed.useGoogleTranslate !== false)
          }
        } catch (err) {
          recViewLogger.warn('获取订阅源翻译设置失败，使用默认值:', err)
        }
      }
    }
    loadFeedSettings()
  }, [recommendation.sourceUrl])
  
  // 加载自动翻译配置，并监听变化
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getUIConfig()
      setAutoTranslateEnabled(config.autoTranslate)
    }
    loadConfig()
    
    // 监听自动翻译配置变化
    const unwatch = watchAutoTranslate((enabled) => {
      recViewLogger.debug(`自动翻译配置已变化: ${enabled}`)
      setAutoTranslateEnabled(enabled)
    })
    
    return () => unwatch()
  }, [])
  
  // 当推荐或配置变化时，检查是否需要即时翻译
  useEffect(() => {
    const checkAndTranslate = async () => {
      const displayText = getDisplayText(currentRecommendation, showOriginal, autoTranslateEnabled)
      
      // 如果需要即时翻译且未在翻译中
      if (displayText.needsTranslation && !isTranslating) {
        setIsTranslating(true)
        
        try {
          const translated = await translateOnDemand(currentRecommendation)
          setCurrentRecommendation(translated)
        } catch (error) {
          recViewLogger.error('即时翻译失败:', error)
        } finally {
          setIsTranslating(false)
        }
      }
    }
    
    checkAndTranslate()
  }, [currentRecommendation, showOriginal, autoTranslateEnabled, isTranslating])
  
  // 获取显示文本（自动选择原文或译文）
  const displayText = getDisplayText(currentRecommendation, showOriginal, autoTranslateEnabled)
  
  // 判断是否需要翻译（源语言与目标语言不同）
  const needsTranslation = displayText.targetLanguage && 
    !displayText.sourceLanguage.toLowerCase().startsWith(displayText.targetLanguage.toLowerCase().split('-')[0]) &&
    !displayText.targetLanguage.toLowerCase().startsWith(displayText.sourceLanguage.toLowerCase().split('-')[0])
  
  // 计算默认打开的 URL
  // 逻辑：全局自动翻译开启 + 订阅源翻译开启 + 需要翻译 → 默认打开翻译版；否则打开原文
  const getDefaultUrl = (): string => {
    // 始终以原始链接为基础，避免因推荐中残留翻译链接而误判
    const originalUrl = ReadingListManager.normalizeUrlForTracking(currentRecommendation.url)
    if (autoTranslateEnabled && feedTranslateEnabled && needsTranslation) {
      return getGoogleTranslateUrl(originalUrl, i18n.language)
    }
    return originalUrl
  }
  
  // 处理默认点击（标题/摘要）
  const handleDefaultClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const url = getDefaultUrl()
    const isTranslated = autoTranslateEnabled && needsTranslation
    
    recViewLogger.debug(`点击条目（默认）: ${currentRecommendation.id}, 翻译版: ${isTranslated}`)
    
    // 从推荐列表移除
    if (onRemoveFromList) {
      await onRemoveFromList()
    }
    
    // 发送消息打开页面
    chrome.runtime.sendMessage({
      type: 'OPEN_RECOMMENDATION',
      payload: {
        url,
        recommendationId: currentRecommendation.id,
        title: currentRecommendation.title,
        action: isTranslated ? 'translated' : 'clicked'
      }
    }).catch(() => {
      // 忽略错误（弹窗关闭导致的错误是正常的）
    })
  }
  
  // 处理「原文/翻译」按钮点击（与默认相反的行为）
  const handleAlternateClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // 统一从原始链接出发
    const originalUrl = ReadingListManager.normalizeUrlForTracking(currentRecommendation.url)
    // 如果自动翻译开启，按钮是「查看原文」，所以打开原文
    // 如果自动翻译关闭，按钮是「翻译」，但当订阅源禁用翻译时也应打开原文
    const url = autoTranslateEnabled
      ? originalUrl
      : (feedTranslateEnabled ? getGoogleTranslateUrl(originalUrl, i18n.language) : originalUrl)
    const isTranslated = !autoTranslateEnabled && feedTranslateEnabled
    
    recViewLogger.debug(`点击条目（备选）: ${currentRecommendation.id}, 翻译版: ${isTranslated}`)
    
    // 从推荐列表移除
    if (onRemoveFromList) {
      await onRemoveFromList()
    }
    
    // 发送消息打开页面
    chrome.runtime.sendMessage({
      type: 'OPEN_RECOMMENDATION',
      payload: {
        url,
        recommendationId: currentRecommendation.id,
        title: currentRecommendation.title,
        action: isTranslated ? 'translated' : 'clicked'
      }
    }).catch(() => {
      // 忽略错误（弹窗关闭导致的错误是正常的）
    })
  }
  
  // 获取语言标签配置
  const langLabel = getLanguageLabel(
    displayText.sourceLanguage,
    displayText.targetLanguage,
    autoTranslateEnabled,
    _
  )
  
  // 第一条显示详细信息（标题3行 + 摘要4行）
  if (isTopItem) {
    return (
      <div
        data-recommendation-id={currentRecommendation.id}
        className="px-4 py-3 border-b-2 border-blue-200 dark:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-blue-50/30 dark:bg-blue-900/10 flex flex-col gap-2"
      >
        {/* 标题行 - 3行，带 favicon */}
        <div 
          onClick={handleDefaultClick}
          className="cursor-pointer"
        >
          <h3 className="text-sm font-medium line-clamp-3 leading-snug flex items-start gap-1.5">
            <img 
              src={getFaviconUrl(currentRecommendation.sourceUrl || currentRecommendation.url)} 
              alt="" 
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              onError={handleFaviconError}
            />
            <span className="flex-1" title={currentRecommendation.url}>
              {sanitizeHtml(displayText.title)}
            </span>
          </h3>
        </div>
        
        {/* 摘要 - 4行 */}
        {displayText.summary && (
          <div 
            onClick={handleDefaultClick}
            className="cursor-pointer"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 leading-relaxed">
              {sanitizeHtml(displayText.summary)}
            </p>
          </div>
        )}
        
        {/* 底部信息栏 - 紧凑布局 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 推荐理由主题（仅图标+tooltip）- 冷启动🌱 vs 常规💡 */}
            {currentRecommendation.reason && (
              <span className="text-blue-600 dark:text-blue-400 flex-shrink-0 cursor-help" title={formatRecommendationReason(currentRecommendation.reason, t)}>
                {getReasonIcon(currentRecommendation)}
              </span>
            )}
            
            {currentRecommendation.wordCount && (
              <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                {formatWordCount(currentRecommendation.wordCount)}字
              </span>
            )}
            
            {currentRecommendation.readingTime && (
              <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                {currentRecommendation.readingTime}分钟
              </span>
            )}
            
            {/* 推荐分数 - 可视化横线 */}
            {currentRecommendation.score && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                    style={{ width: `${Math.round(currentRecommendation.score * 100)}%` }}
                  ></div>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400">
                  {Math.round(currentRecommendation.score * 100)}%
                </span>
              </div>
            )}
            
            {/* 语言标签 - 新逻辑：符合界面语言时不显示；不符合时显示「原文」或「翻译」按钮 */}
            {langLabel.showLabel && (
              <button
                onClick={handleAlternateClick}
                className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium transition-all ${langLabel.className}`}
                title={langLabel.tooltip}
              >
                {langLabel.text}
              </button>
            )}
          </div>
          
          {/* 稍后读按钮 */}
          {onSaveToReadingList && (
            <button
              onClick={onSaveToReadingList}
              className="text-base hover:scale-110 transition-transform flex-shrink-0 ml-3"
              title={_("popup.saveToReadingList")}
            >
              🔖
            </button>
          )}
          
          <button
            onClick={onDismiss}
            className="text-base hover:scale-110 transition-transform flex-shrink-0 ml-2"
            title={_("popup.notInterested")}
          >
            👎
          </button>
        </div>
      </div>
    )
  }
  
  // 其他条目保持紧凑 - 标题2行
  return (
    <div
      data-recommendation-id={currentRecommendation.id}
      className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex flex-col gap-1.5"
    >
      {/* 标题行 - 2行，带 favicon */}
      <div 
        onClick={handleDefaultClick}
        className="cursor-pointer"
      >
        <h3 className="text-sm font-medium line-clamp-2 leading-snug flex items-start gap-1.5">
          <img 
            src={getFaviconUrl(currentRecommendation.sourceUrl || currentRecommendation.url)} 
            alt="" 
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            onError={handleFaviconError}
          />
          <span className="flex-1" title={currentRecommendation.url}>
            {sanitizeHtml(displayText.title)}
          </span>
        </h3>
      </div>
      
      {/* 摘要 - 智能显示，2行，点击后移除（等待阅读验证） */}
      {showExcerpt && displayText.summary && (
        <div 
          onClick={handleDefaultClick}
          className="cursor-pointer"
        >
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {sanitizeHtml(displayText.summary)}
          </p>
        </div>
      )}
      
      {/* 底部信息栏 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 推荐理由主题（仅图标+tooltip）- 冷启动🌱 vs 常规💡 */}
          {currentRecommendation.reason && (
            <span className="text-blue-600 dark:text-blue-400 flex-shrink-0 cursor-help" title={formatRecommendationReason(currentRecommendation.reason, t)}>
              {getReasonIcon(currentRecommendation)}
            </span>
          )}
          
          {currentRecommendation.wordCount && (
            <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
              {formatWordCount(currentRecommendation.wordCount)}字
            </span>
          )}
          
          {currentRecommendation.readingTime && (
            <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
              {currentRecommendation.readingTime}分钟
            </span>
          )}
          
          {/* 推荐分数 - 可视化横线 */}
          {currentRecommendation.score && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                  style={{ width: `${Math.round(currentRecommendation.score * 100)}%` }}
                ></div>
              </div>
              <span className="text-xs text-green-600 dark:text-green-400">
                {Math.round(currentRecommendation.score * 100)}%
              </span>
            </div>
          )}
          
          {/* 语言标签 - 新逻辑：符合界面语言时不显示；不符合时显示「原文」或「翻译」按钮 */}
          {langLabel.showLabel && (
            <button
              onClick={handleAlternateClick}
              className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium transition-all ${langLabel.className}`}
              title={langLabel.tooltip}
            >
              {langLabel.text}
            </button>
          )}
        </div>
        
        {/* 稍后读按钮 */}
        {onSaveToReadingList && (
          <button
            onClick={onSaveToReadingList}
            className="text-base hover:scale-110 transition-transform flex-shrink-0 ml-3"
            title={_("popup.saveToReadingList")}
          >
            🔖
          </button>
        )}
        
        <button
          onClick={onDismiss}
          className="text-base hover:scale-110 transition-transform flex-shrink-0 ml-2"
          title={_("popup.notInterested")}
        >
          👎
        </button>
      </div>
    </div>
  )
}

/**
 * 格式化字数显示
 */
function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k字`
  }
  return `${count}字`
}
