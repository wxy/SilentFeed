/**
 * 漏斗数据块进度条组件
 * 
 * 将 7 个数据项可视化为一排小方块
 * 每个方块代表一个文章条目，用不同颜色表示不同状态
 * 
 * 数据项：待分析、已过时、初筛淘汰、未达标、候选池、推荐池、已退出
 */

import React, { useState, useRef } from 'react'
import { useI18n } from '@/i18n/helpers'
import type { FeedFunnelStats } from '@/storage/db'

interface FunnelBlockBarProps {
  stats: FeedFunnelStats
  label: string
  icon: string
}

/**
 * 定义数据项及其颜色、排序
 */
const BLOCK_CATEGORIES = [
  {
    key: 'raw' as const,
    labelKey: 'options.rssManager.status.raw',
    color: 'bg-gray-400 dark:bg-gray-600',
    hoverColor: 'hover:bg-gray-500 dark:hover:bg-gray-700',
    tooltipBg: 'bg-gray-700 dark:bg-gray-600'
  },
  {
    key: 'stale' as const,
    labelKey: 'options.rssManager.status.stale',
    color: 'bg-amber-600 dark:bg-amber-700',
    hoverColor: 'hover:bg-amber-700 dark:hover:bg-amber-600',
    tooltipBg: 'bg-amber-900 dark:bg-amber-800'
  },
  {
    key: 'prescreenedOut' as const,
    labelKey: 'options.rssManager.status.prescreenedOut',
    color: 'bg-red-500 dark:bg-red-700',
    hoverColor: 'hover:bg-red-600 dark:hover:bg-red-600',
    tooltipBg: 'bg-red-900 dark:bg-red-800'
  },
  {
    key: 'analyzedNotQualified' as const,
    labelKey: 'options.rssManager.status.analyzedNotQualified',
    color: 'bg-orange-500 dark:bg-orange-700',
    hoverColor: 'hover:bg-orange-600 dark:hover:bg-orange-600',
    tooltipBg: 'bg-orange-900 dark:bg-orange-800'
  },
  {
    key: 'currentCandidate' as const,
    labelKey: 'options.rssManager.status.currentCandidate',
    color: 'bg-yellow-400 dark:bg-yellow-600',
    hoverColor: 'hover:bg-yellow-500 dark:hover:bg-yellow-500',
    tooltipBg: 'bg-yellow-700 dark:bg-yellow-800'
  },
  {
    key: 'currentRecommended' as const,
    labelKey: 'options.rssManager.status.currentRecommended',
    color: 'bg-green-500 dark:bg-green-700',
    hoverColor: 'hover:bg-green-600 dark:hover:bg-green-600',
    tooltipBg: 'bg-green-900 dark:bg-green-800'
  },
  {
    key: 'exited' as const,
    labelKey: 'options.rssManager.status.exited',
    color: 'bg-slate-500 dark:bg-slate-600',
    hoverColor: 'hover:bg-slate-600 dark:hover:bg-slate-700',
    tooltipBg: 'bg-slate-700 dark:bg-slate-600'
  }
]

export function FunnelBlockBar({ stats, label, icon }: FunnelBlockBarProps) {
  const { _ } = useI18n()
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 计算总文章数
  const totalArticles = stats.rssArticles

  // 生成块数据
  const blockData = BLOCK_CATEGORIES.map((cat) => ({
    ...cat,
    count: stats[cat.key] as number,
    name: _(cat.labelKey) || cat.key
  }))

  // 计算合适的块尺寸
  // 如果文章数很少（<20），每个文章 1 块；否则按比例显示
  const blockUnitsPerArticle = totalArticles < 20 ? 1 : Math.max(1, Math.floor(totalArticles / 50))

  // 处理鼠标进入块组
  const handleBlockEnter = (categoryKey: string) => {
    setHoveredCategory(categoryKey)
  }

  const handleBlockLeave = () => {
    setHoveredCategory(null)
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 relative">
      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-medium w-8 flex-shrink-0">
        {icon} {label}:
      </span>

      {/* 块容器 */}
      <div className="flex items-center gap-0.5 flex-wrap flex-1 relative">
        {blockData.map((cat) => {
          const { count, name, color, hoverColor, tooltipBg } = cat
          const isHovered = hoveredCategory === cat.key
          
          // 计算应该显示多少个块（每个块代表 blockUnitsPerArticle 篇文章，向上取整）
          const blockCount = count > 0 ? Math.ceil(count / blockUnitsPerArticle) : 0

          return (
            <div
              key={cat.key}
              className="flex gap-0.5 relative group"
              onMouseEnter={() => handleBlockEnter(cat.key)}
              onMouseLeave={handleBlockLeave}
            >
              {/* 显示块 */}
              {Array.from({ length: blockCount }).map((_, idx) => (
                <div
                  key={`${cat.key}-${idx}`}
                  ref={(el) => {
                    blockRefs.current[cat.key] = el
                  }}
                  className={`w-2 h-2 rounded-sm transition-all ${color} ${hoverColor} ${
                    isHovered ? 'ring-1 ring-white dark:ring-gray-300 shadow-md' : ''
                  }`}
                  title={`${name}: ${count}`}
                />
              ))}

              {/* Tooltip - 仅在 hover 该类别时显示 */}
              {isHovered && (
                <div
                  className={`absolute z-50 px-2.5 py-1.5 rounded text-[10px] text-white whitespace-nowrap pointer-events-none shadow-lg ${tooltipBg}`}
                  style={{
                    bottom: '100%',
                    left: blockCount * 6 / 2,
                    transform: 'translateX(-50%)',
                    marginBottom: '8px'
                  }}
                >
                  <div className="font-semibold">{name}</div>
                  <div className="text-gray-100 dark:text-gray-200 mt-0.5">
                    {count} / {totalArticles}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 右侧总数显示 */}
      <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 flex-shrink-0">
        ({totalArticles})
      </span>
    </div>
  )
}
