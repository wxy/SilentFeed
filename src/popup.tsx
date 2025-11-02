import { useState } from "react"

import "./style.css"

/**
 * 根据页面数确定成长阶段
 */
export const getGrowthStage = (pageCount: number) => {
  if (pageCount < 250) return { icon: "🌱", name: "探索者" }
  if (pageCount < 600) return { icon: "🌿", name: "学习者" }
  if (pageCount < 1000) return { icon: "🌳", name: "成长者" }
  return { icon: "🌲", name: "大师" }
}

/**
 * Feed AI Muter - Popup 主界面
 * 显示初始化进度和欢迎信息
 */
function IndexPopup() {
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
        <h1 className="text-xl font-semibold">Feed AI Muter</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          RSS 静音器
        </p>
      </div>

      {/* 主体内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* 成长阶段图标 - 放大显示 */}
        <div className="text-8xl mb-6 animate-pulse">{stage.icon}</div>

        {/* 欢迎信息 */}
        <h2 className="text-lg font-medium text-center mb-2">
          欢迎使用智能 RSS 阅读器
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          正在学习你的兴趣...
        </p>

        {/* 进度条 */}
        <div className="w-full mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {stage.name}阶段
            </span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {pageCount}/{totalPages} 页
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
            <span>开始浏览，我会自动学习你的兴趣</span>
          </p>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="px-6 pb-6">
        <button
          onClick={openSettings}
          className="w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
        >
          设置
        </button>
      </div>
    </div>
  )
}

export default IndexPopup
