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
      {/* 成长阶段图标 - 手绘风格放大显示 */}
      <div className="sketchy-emoji text-8xl mb-6">{stage.icon}</div>

      {/* 欢迎信息 - 手绘风格 */}
      <h2 className="sketchy-title text-xl text-center mb-3">
        {_("popup.welcome")}
      </h2>
      <p className="sketchy-text text-sm text-center mb-6 max-w-xs">
        {_("popup.learning")}
      </p>

      {/* 进度条 - 手绘风格 */}
      <div className="w-full mb-4">
        <div className="flex justify-between items-center mb-3">
          <span className="sketchy-badge">
            {_(`popup.stage.${stage.name}`)}
          </span>
          <span className="sketchy-text text-sm font-medium">
            {_("popup.progress", { current: pageCount, total: totalPages })}
          </span>
        </div>
        <div className="sketchy-progress">
          <div
            className="sketchy-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 提示信息 - 手绘风格 */}
      <div className="sketchy-card mt-6 w-full">
        <p className="sketchy-text text-sm text-center flex items-center justify-center gap-2">
          <span className="sketchy-emoji">📖</span>
          <span>{_("popup.hint")}</span>
        </p>
      </div>
    </div>
  )
}
