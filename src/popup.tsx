import { useState, useEffect } from "react"

import "@/i18n" // 初始化 i18n
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import { getPageCount } from "@/storage/db"
import { getUIStyle, watchUIStyle, type UIStyle } from "@/storage/ui-config"
import { useTheme } from "@/hooks/useTheme"
import { ColdStartView } from "@/components/ColdStartView"
import { RecommendationView } from "@/components/RecommendationView"
import { trackPopupOpen } from "@/core/recommender/adaptive-count"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import "@/styles/global.css"
import "@/styles/sketchy.css" // 手绘风格样式

/**
 * Silent Feed - Popup 主界面
 * Phase 2.7: 两阶段 UI（冷启动 + 推荐）
 * Phase 6: 添加弹窗打开跟踪，动态高度适应
 */
function IndexPopup() {
  const { _ } = useI18n()
  useTheme() // 应用主题到 DOM
  
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [uiStyle, setUiStyle] = useState<UIStyle>("sketchy")
  const [toolbarState, setToolbarState] = useState<{
    hasRSSFeeds: boolean
    onDismissAll?: () => Promise<void>
    onOpenRSSManagement?: () => void
  }>({ hasRSSFeeds: false })

  const COLD_START_THRESHOLD = LEARNING_COMPLETE_PAGES

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

  useEffect(() => {
    // 加载 UI 风格
    const loadUIStyle = async () => {
      const style = await getUIStyle()
      setUiStyle(style)
    }
    loadUIStyle()

    // 监听 UI 风格变化
    const unwatch = watchUIStyle((newStyle) => {
      setUiStyle(newStyle)
    })

    return () => unwatch()
  }, [])

  useEffect(() => {
    // 加载页面计数
    const loadPageCount = async () => {
      try {
        const count = await getPageCount()
        setPageCount(count)
      } catch (error) {
        // 首次加载时数据库可能未初始化，使用 0 作为默认值
        setPageCount(0)
      } finally {
        setIsLoading(false)
      }
    }

    loadPageCount()
  }, [])

  const openSettings = () => {
    chrome.runtime.openOptionsPage()
  }

  // 根据风格决定是否应用手绘样式
  const isSketchyStyle = uiStyle === "sketchy"
  const currentLang = i18n.language // 获取当前语言
  // 弹窗高度根据内容动态计算，无固定高度，无滚动条
  const containerClass = isSketchyStyle 
    ? "sketchy-container sketchy-paper-texture w-80 flex flex-col"
    : "w-80 flex flex-col bg-gradient-to-br from-slate-50/95 to-indigo-50/80 dark:from-gray-900 dark:to-indigo-950/30"

  // 加载中状态
  if (isLoading) {
    return (
      <div className={containerClass} lang={currentLang}>
        {isSketchyStyle && (
          <svg className="sketchy-svg-filters" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* 手绘笔触滤镜 - 中等强度,仅用于边框 */}
              <filter id="sketchy-stroke" x="-30%" y="-30%" width="160%" height="160%">
                {/* 添加噪点模拟笔触不均 */}
                <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                {/* 轻微膨胀和腐蚀模拟断续 */}
                <feMorphology operator="dilate" radius="0.2" in="displaced" result="thickened" />
                <feMorphology operator="erode" radius="0.15" in="thickened" result="thinned" />
                {/* 轻微模糊模拟手绘边缘 */}
                <feGaussianBlur stdDeviation="0.25" in="thinned" result="blurred" />
                <feComponentTransfer in="blurred">
                  <feFuncA type="linear" slope="1.15" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>
        )}
        <div className={`${isSketchyStyle ? 'sketchy-emoji' : ''} text-4xl animate-pulse flex items-center justify-center flex-1`}>⏳</div>
      </div>
    )
  }

  const isColdStart = pageCount !== null && pageCount < COLD_START_THRESHOLD

  return (
    <ErrorBoundary>
      <div className={containerClass} lang={currentLang}>
        {/* SVG 滤镜定义 - 手绘笔触效果 */}
        {isSketchyStyle && (
          <svg className="sketchy-svg-filters" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* 手绘笔触滤镜 - 中等强度,仅用于边框 */}
              <filter id="sketchy-stroke" x="-30%" y="-30%" width="160%" height="160%">
                {/* 添加噪点模拟笔触不均 */}
                <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                {/* 轻微膨胀和腐蚀模拟断续 */}
                <feMorphology operator="dilate" radius="0.2" in="displaced" result="thickened" />
                <feMorphology operator="erode" radius="0.15" in="thickened" result="thinned" />
                {/* 轻微模糊模拟手绘边缘 */}
                <feGaussianBlur stdDeviation="0.25" in="thinned" result="blurred" />
                <feComponentTransfer in="blurred">
                  <feFuncA type="linear" slope="1.15" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>
        )}
        
        {/* 头部 - 极简设计：应用名 + 右上角工具图标 */}
        <div className={isSketchyStyle 
          ? "px-4 pt-2 pb-2 flex items-center justify-between bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b-2 border-blue-200 dark:border-blue-700" 
          : "px-4 pt-3 pb-3 flex items-center justify-between bg-gradient-to-r from-indigo-500 to-cyan-500 dark:from-indigo-600 dark:to-cyan-600 border-b border-indigo-600/20 dark:border-cyan-500/20 shadow-sm"
        }>
          <h1 className={isSketchyStyle ? "sketchy-title text-sm font-medium" : "text-base font-bold text-white drop-shadow-sm"}>{_("app.name")}</h1>
          
          {/* 右上角工具图标 - 仅在推荐阶段显示完整工具栏 */}
          <div className="flex items-center gap-1.5">
            {/* 设置按钮始终显示 */}
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className={isSketchyStyle 
                ? "p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded transition-colors"
                : "p-1.5 hover:bg-white/20 rounded transition-colors"
              }
              title={_("popup.settings")}
            >
              <span className={isSketchyStyle ? "text-sm" : "text-sm text-white drop-shadow"}>⚙️</span>
            </button>
            
            {/* 推荐阶段显示额外按钮 */}
            {!isColdStart && (
              <>
                {/* RSS源按钮 - 仅在有发现的源时显示 */}
                {toolbarState.hasRSSFeeds && (
                  <button
                    onClick={toolbarState.onOpenRSSManagement}
                    className={isSketchyStyle 
                      ? "p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded transition-colors"
                      : "p-1.5 hover:bg-white/20 rounded transition-colors"
                    }
                    title={_("popup.rssFeeds")}
                  >
                    <span className={isSketchyStyle ? "text-sm" : "text-sm text-white drop-shadow"}>📡</span>
                  </button>
                )}
                
                {/* 全部不想读按钮 */}
                <button
                  onClick={toolbarState.onDismissAll}
                  className={isSketchyStyle 
                    ? "p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded transition-colors"
                    : "p-1.5 hover:bg-white/20 rounded transition-colors"
                  }
                  title={_("popup.dismissAll")}
                >
                  <span className={isSketchyStyle ? "text-sm" : "text-sm text-white drop-shadow"}>👎</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 主体内容 - 两阶段切换 */}
        {isColdStart ? (
          <ColdStartView pageCount={pageCount || 0} totalPages={COLD_START_THRESHOLD} uiStyle={uiStyle} />
        ) : (
          <RecommendationView />
        )}

        {/* 底部按钮 - 仅在冷启动阶段显示（推荐阶段顶部已有设置按钮） */}
        {isColdStart && (
          <div className={isSketchyStyle ? "px-6 pb-4" : "mt-4 flex justify-center"}>
            <button
              onClick={openSettings}
              className={isSketchyStyle ? "sketchy-button w-full" : "px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"}
            >
              ⚙️ {_("popup.settings")}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

export default IndexPopup
