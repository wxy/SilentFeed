/**
 * 推荐阶段组件
 * Phase 7: 空间优化布局
 * - 头部工具栏移至popup（设置、RSS源、全部不想读）
 * - 推荐列表：智能显示摘要，优化空间利用
 * - 用户行为跟踪：点击、不想读、全部不想读
 */

import { useEffect, useState } from "react"
import { useI18n } from "@/i18n/helpers"
import { useRecommendationStore } from "@/stores/recommendationStore"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { getRecommendationConfig } from "@/storage/recommendation-config"
import {
  trackRecommendationClick,
  trackDismiss,
  trackDismissAll
} from "@/core/recommender/adaptive-count"
import { sanitizeHtml } from "@/utils/html"
import { getFaviconUrl, handleFaviconError } from "@/utils/favicon"
import { formatRecommendationReason } from "@/utils/formatReason"
import type { Recommendation } from "@/types/database"
import { logger } from "@/utils/logger"
import { getDisplayText, formatLanguageLabel, translateOnDemand } from "@/core/translator/recommendation-translator"
import { getUIConfig } from "@/storage/ui-config"
import { getOnboardingState } from "@/storage/onboarding-state"

const recViewLogger = logger.withTag("RecommendationView")

/**
 * 生成谷歌翻译页面URL
 * @param url 原始页面URL
 * @param targetLanguage 目标语言代码（如 'zh-CN', 'en'）
 * @returns 谷歌翻译后的页面URL
 */
function getGoogleTranslateUrl(url: string, targetLanguage: string): string {
  // 谷歌翻译URL格式: https://translate.google.com/translate?sl=auto&tl=zh-CN&u=encodeURIComponent(url)
  // 添加 &hl=目标语言 来设置界面语言（但不会自动折叠工具栏）
  const encodedUrl = encodeURIComponent(url)
  return `https://translate.google.com/translate?sl=auto&tl=${targetLanguage}&u=${encodedUrl}`
}

/**
 * 生成语言标签显示文本和样式
 * @param sourceLanguage 源语言
 * @param targetLanguage 目标语言（如果需要翻译）
 * @param isTranslated 是否已翻译
 * @param t i18n 翻译函数
 */
function getLanguageLabel(
  sourceLanguage: string,
  targetLanguage: string | undefined,
  isTranslated: boolean,
  t: (key: string, options?: any) => string
): {
  text: string
  tooltip: string
  needsTranslation: boolean
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
  
  // 如果已经是目标语言，只显示语言标签
  if (!targetLanguage || sourceLanguage === targetLanguage) {
    return {
      text: sourceLang,
      tooltip: sourceLang,
      needsTranslation: false,
      className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
    }
  }
  
  const targetLang = getLanguageName(targetLanguage)
  
  // 需要翻译：显示 英文→简体中文
  return {
    text: `${sourceLang}→${targetLang}`,
    tooltip: t('popup.clickToTranslate', { language: targetLang }),
    needsTranslation: true,
    className: isTranslated 
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40 cursor-pointer'
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

export function RecommendationView() {
  const { _, t } = useI18n()
  const {
    recommendations,
    isLoading,
    error,
    loadRecommendations,
    markAsRead,
    dismissAll,
    dismissSelected
  } = useRecommendationStore()
  
  const [maxRecommendations, setMaxRecommendations] = useState(5)
  const [hasRSSFeeds, setHasRSSFeeds] = useState(false)
  const [isReady, setIsReady] = useState(false)
  
  // 加载推荐配置
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getRecommendationConfig()
      setMaxRecommendations(config.maxRecommendations)
    }
    loadConfig()
  }, [])

  // 检查 onboarding 状态
  useEffect(() => {
    const checkOnboardingState = async () => {
      const status = await getOnboardingState()
      setIsReady(status.state === 'ready')
    }
    checkOnboardingState()
  }, [])

  // 检查是否有RSS源
  useEffect(() => {
    const checkRSSFeeds = async () => {
      try {
        const feedManager = new FeedManager()
        // 检查所有已订阅的源（subscribed状态）
        const subscribedFeeds = await feedManager.getFeeds('subscribed')
        const candidateFeeds = await feedManager.getFeeds('candidate')
        setHasRSSFeeds(subscribedFeeds.length > 0 || candidateFeeds.length > 0)
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
      
      // ⚠️ 关键修复：先标记为已读，再打开链接
      // 因为 chrome.tabs.create() 会关闭弹窗，导致后续异步操作被中断
      recViewLogger.debug(`开始标记为已读: ${rec.id}`)
      await markAsRead(rec.id)
      recViewLogger.info(`✅ 标记已读完成: ${rec.id}`)
      
      // 最后打开链接（这会关闭弹窗）
      await chrome.tabs.create({ url: rec.url })
      
    } catch (error) {
      recViewLogger.error('❌ 处理点击失败:', error)
      
      // 恢复视觉状态（如果操作失败）
      const element = event.currentTarget as HTMLElement
      element.style.opacity = '1'
      element.style.pointerEvents = 'auto'
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

  // 只显示前N条推荐（根据配置）
  const displayedRecommendations = recommendations.slice(0, maxRecommendations)

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
        onDismissAll: handleDismissAll,
        onOpenRSSManagement: openRSSManagement
      }
    }
  }, [hasRSSFeeds])

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
    
    // ready 状态且有 RSS 源：显示"全部读完"的鼓励消息
    if (isReady && hasRSSFeeds) {
      // 从预设消息中随机选择一条
      const messages = t("popup.allCaughtUp.messages", { returnObjects: true }) as string[]
      const randomMessage = messages[Math.floor(Math.random() * messages.length)]
      
      return (
        <div className="flex flex-col">
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center px-6">
              <div className="text-4xl mb-4">✨</div>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-2">
                {randomMessage}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {_("popup.allCaughtUp.subtitle")}
              </p>
            </div>
          </div>
        </div>
      )
    }
    
    // 其他情况：通用空状态（学习阶段等）
    return (
      <div className="flex flex-col">
        {/* 空状态 */}
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-center px-6">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {_("popup.noRecommendations")}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {_("popup.checkBackLater")}
            </p>
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
}

function RecommendationItem({ recommendation, isTopItem, showExcerpt, onClick, onDismiss }: RecommendationItemProps) {
  const { _, t, i18n } = useI18n()
  const { markAsRead } = useRecommendationStore()
  const [showOriginal, setShowOriginal] = useState(false)
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false)
  const [currentRecommendation, setCurrentRecommendation] = useState(recommendation)
  const [isTranslating, setIsTranslating] = useState(false)
  
  // 加载自动翻译配置
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getUIConfig()
      setAutoTranslateEnabled(config.autoTranslate)
    }
    loadConfig()
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
  
  // 第一条显示详细信息（标题3行 + 摘要4行）
  if (isTopItem) {
    return (
      <div
        data-recommendation-id={currentRecommendation.id}
        className="px-4 py-3 border-b-2 border-blue-200 dark:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-blue-50/30 dark:bg-blue-900/10 flex flex-col gap-2"
      >
        {/* 标题行 - 3行，带 favicon */}
        <div 
          onClick={(e) => onClick(e)}
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
            onClick={(e) => onClick(e)}
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
            {/* 推荐理由主题（仅图标+tooltip） */}
            {currentRecommendation.reason && (
              <span className="text-blue-600 dark:text-blue-400 flex-shrink-0 cursor-help" title={formatRecommendationReason(currentRecommendation.reason, t)}>
                💡
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
            
            {/* 语言标签 - 显示源语言或翻译标识，点击打开翻译页面 */}
            {(() => {
              const langLabel = getLanguageLabel(
                displayText.sourceLanguage,
                displayText.targetLanguage,
                displayText.hasTranslation && !displayText.isShowingOriginal,
                _  // 传入 i18n 翻译函数
              )
              
              if (!langLabel.needsTranslation) {
                // 本地语言，只显示标签
                return (
                  <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${langLabel.className}`} title={langLabel.tooltip}>
                    {langLabel.text}
                  </span>
                )
              }
              
              // 需要翻译，点击打开谷歌翻译
              return (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      const translateUrl = getGoogleTranslateUrl(currentRecommendation.url, i18n.language)
                      
                      // ⚠️ 关键：先标记为已读，再打开链接
                      // 因为 chrome.tabs.create() 会关闭弹窗，导致后续操作被中断
                      recViewLogger.debug(`点击语言标签，标记为已读: ${currentRecommendation.id}`)
                      await markAsRead(currentRecommendation.id)
                      recViewLogger.info(`✅ 标记已读完成，打开翻译: ${currentRecommendation.id}`)
                      
                      // 最后打开翻译链接（这会关闭弹窗）
                      await chrome.tabs.create({ url: translateUrl })
                    } catch (error) {
                      recViewLogger.error('❌ 打开翻译失败:', error)
                    }
                  }}
                  className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium transition-all ${langLabel.className}`}
                  title={langLabel.tooltip}
                >
                  {langLabel.text}
                </button>
              )
            })()}
          </div>
          
          <button
            onClick={onDismiss}
            className="text-base hover:scale-110 transition-transform flex-shrink-0"
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
        onClick={(e) => onClick(e)}
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
      
      {/* 摘要 - 智能显示，2行，点击后删除 */}
      {showExcerpt && displayText.summary && (
        <div 
          onClick={(e) => {
            onClick(e)  // 打开链接
            onDismiss(e)  // 删除推荐
          }}
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
          {/* 推荐理由主题（仅图标+tooltip） */}
          {currentRecommendation.reason && (
            <span className="text-blue-600 dark:text-blue-400 flex-shrink-0 cursor-help" title={formatRecommendationReason(currentRecommendation.reason, t)}>
              💡
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
          
          {/* 语言标签 - 显示源语言或翻译标识，点击打开翻译页面 */}
          {(() => {
            const langLabel = getLanguageLabel(
              displayText.sourceLanguage,
              displayText.targetLanguage,
              displayText.hasTranslation && !displayText.isShowingOriginal,
              _  // 传入 i18n 翻译函数
            )
            
            if (!langLabel.needsTranslation) {
              // 本地语言，只显示标签
              return (
                <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${langLabel.className}`} title={langLabel.tooltip}>
                  {langLabel.text}
                </span>
              )
            }
            
            // 需要翻译，点击打开谷歌翻译
            return (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const translateUrl = getGoogleTranslateUrl(currentRecommendation.url, i18n.language)
                    
                    // ⚠️ 关键：先标记为已读，再打开链接
                    // 因为 chrome.tabs.create() 会关闭弹窗，导致后续操作被中断
                    recViewLogger.debug(`点击语言标签，标记为已读: ${currentRecommendation.id}`)
                    await markAsRead(currentRecommendation.id)
                    recViewLogger.info(`✅ 标记已读完成，打开翻译: ${currentRecommendation.id}`)
                    
                    // 最后打开翻译链接（这会关闭弹窗）
                    await chrome.tabs.create({ url: translateUrl })
                  } catch (error) {
                    recViewLogger.error('❌ 打开翻译失败:', error)
                  }
                }}
                className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium transition-all ${langLabel.className}`}
                title={langLabel.tooltip}
              >
                {langLabel.text}
              </button>
            )
          })()}
        </div>
        
        <button
          onClick={onDismiss}
          className="text-base hover:scale-110 transition-transform flex-shrink-0"
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
