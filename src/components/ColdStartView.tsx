/**
 * 冷启动阶段组件
 * 0-1000 页：显示学习进度和鼓励信息
 */

import { useI18n } from "@/i18n/helpers"

interface ColdStartViewProps {
  pageCount: number
  totalPages?: number
}

/**
 * 根据页面数确定成长阶段
 */
const getGrowthStage = (pageCount: number) => {
  if (pageCount < 250) return { icon: "🌱", name: "explorer" }
  if (pageCount < 600) return { icon: "🌿", name: "learner" }
  if (pageCount < 1000) return { icon: "🌳", name: "grower" }
  return { icon: "🌲", name: "master" }
}

export function ColdStartView({ pageCount, totalPages = 1000 }: ColdStartViewProps) {
  const { _ } = useI18n()
  
  const progress = Math.min((pageCount / totalPages) * 100, 100)
  const stage = getGrowthStage(pageCount)

  return (
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
  )
}
