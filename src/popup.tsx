import { useState } from "react"

import "@/i18n" // 初始化 i18n
import { useI18n } from "@/i18n/helpers"
import "./style.css"

/**
 * 根据页面数确定成长阶段
 */
export const getGrowthStage = (pageCount: number) => {
  if (pageCount < 250) return { icon: "🌱", name: "explorer" }
  if (pageCount < 600) return { icon: "🌿", name: "learner" }
  if (pageCount < 1000) return { icon: "🌳", name: "grower" }
  return { icon: "🌲", name: "master" }
}

/**
 * Feed AI Muter - Popup 主界面
 * 显示初始化进度和欢迎信息
 */
function IndexPopup() {
  const { _ } = useI18n()
  
  // 模拟状态：后续会从存储读取
  const [pageCount] = useState(0)
  const totalPages = 1000
  const progress = (pageCount / totalPages) * 100

  const stage = getGrowthStage(pageCount)

  const openSettings = () => {
    // 打开设置页面
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="w-80 min-h-96 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      {/* 头部 */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold">{_("app.name")}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {_("app.shortName")}
        </p>
      </div>

      {/* 主体内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* 成长阶段图标 - 放大显示 */}
        <div className="text-8xl mb-6 animate-pulse">{stage.icon}</div>

        {/* 欢迎信息 */}
        <h2 className="text-lg font-medium text-center mb-2">
          {_("popup.welcome")}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          {_("popup.learning")}
        </p>

        {/* 进度条 */}
        <div className="w-full mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {_(`popup.stage.${stage.name}`)}
            </span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {_("popup.progress", { current: pageCount, total: totalPages })}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-green-500 dark:bg-green-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 提示信息 */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-center gap-2">
            <span>📖</span>
            <span>{_("popup.hint")}</span>
          </p>
        </div>
      </div>

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
