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
    : "w-80 flex flex-col p-4 bg-white dark:bg-gray-900"

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
        
        {/* 头部 - 精简设计，只显示应用名 */}
        <div className={isSketchyStyle ? "px-6 pt-4 pb-3" : "p-4"}>
          <h1 className={isSketchyStyle ? "sketchy-title text-xl text-center" : "text-xl font-bold text-center"}>{_("app.name")}</h1>
          {isSketchyStyle && <div className="sketchy-divider mt-2"></div>}
        </div>

        {/* 主体内容 - 两阶段切换 */}
        {isColdStart ? (
          <ColdStartView pageCount={pageCount || 0} totalPages={COLD_START_THRESHOLD} uiStyle={uiStyle} />
        ) : (
          <RecommendationView />
        )}

        {/* 底部按钮 - 仅在冷启动阶段显示（推荐阶段顶部已有设置按钮） */}
        {isColdStart && (
          <div className={isSketchyStyle ? "px-6 pb-4" : "mt-4"}>
            <button
              onClick={openSettings}
              className={isSketchyStyle ? "sketchy-button w-full" : "w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"}
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
