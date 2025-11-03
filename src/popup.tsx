import { useState, useEffect } from "react"

import "@/i18n" // 初始化 i18n
import { useI18n } from "@/i18n/helpers"
import { getPageCount } from "@/storage/db"
import { ColdStartView } from "@/components/ColdStartView"
import { RecommendationView } from "@/components/RecommendationView"
import "./style.css"

/**
 * Feed AI Muter - Popup 主界面
 * Phase 2.7: 两阶段 UI（冷启动 + 推荐）
 */
function IndexPopup() {
  const { _ } = useI18n()
  
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const COLD_START_THRESHOLD = 1000

  useEffect(() => {
    // 加载页面计数
    const loadPageCount = async () => {
      try {
        console.log("[Popup] 开始加载页面计数...")
        const count = await getPageCount()
        console.log("[Popup] 页面计数:", count)
        setPageCount(count)
      } catch (error) {
        console.warn("[Popup] 加载页面计数失败，使用默认值 0:", error)
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

  // 加载中状态
  if (isLoading) {
    return (
      <div className="w-80 min-h-96 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
        <div className="text-4xl animate-pulse">⏳</div>
      </div>
    )
  }

  const isColdStart = pageCount !== null && pageCount < COLD_START_THRESHOLD

  return (
    <div className="w-80 min-h-96 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      {/* 头部 */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold">{_("app.name")}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {_("app.shortName")}
        </p>
      </div>

      {/* 主体内容 - 两阶段切换 */}
      {isColdStart ? (
        <ColdStartView pageCount={pageCount || 0} totalPages={COLD_START_THRESHOLD} />
      ) : (
        <RecommendationView />
      )}

      {/* 底部按钮 */}
      <div className="px-6 pb-6">
        <button
          onClick={openSettings}
          className="w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
        >
          {_("popup.settings")}
        </button>
      </div>
    </div>
  )
}

export default IndexPopup
