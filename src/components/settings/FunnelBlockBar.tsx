/**
 * 漏斗数据块进度条组件
 * 
 * 将 7 个数据项可视化为一排小方块
 * 每个方块代表一个文章条目，用不同颜色表示不同状态
 * 展示在源的数据，Hover 时显示源内/池内对比数据
 * 
 * 数据项：待分析、已过时、初筛淘汰、未达标、候选池、推荐池、已退出
 */

import React, { useState, useRef } from 'react'
import { useI18n } from '@/i18n/helpers'
import type { FeedFunnelStats } from '@/storage/db'

interface FunnelBlockBarProps {
  /** 在源中的统计数据（用于显示块进度条） */
  inFeedStats: FeedFunnelStats
  /** 文章池的统计数据（用于右侧汇总显示） */
  poolStats: FeedFunnelStats
}

/**
 * 定义数据项及其颜色、排序
 * 使用具有区分度的颜色方案
 */
const BLOCK_CATEGORIES = [
  {
    key: 'raw' as const,
    labelKey: 'options.rssManager.status.raw',
    // 待分析 - 灰色（未处理）
    color: 'bg-gray-500 dark:bg-gray-500',
    hoverColor: 'hover:bg-gray-600 dark:hover:bg-gray-400'
  },
  {
    key: 'stale' as const,
    labelKey: 'options.rssManager.status.stale',
    // 已过时 - 棕色/深黄（陈旧内容）
    color: 'bg-yellow-700 dark:bg-yellow-700',
    hoverColor: 'hover:bg-yellow-800 dark:hover:bg-yellow-600'
  },
  {
    key: 'prescreenedOut' as const,
    labelKey: 'options.rssManager.status.prescreenedOut',
    // 初筛淘汰 - 红色（被排除）
    color: 'bg-red-600 dark:bg-red-600',
    hoverColor: 'hover:bg-red-700 dark:hover:bg-red-500'
  },
  {
    key: 'analyzedNotQualified' as const,
    labelKey: 'options.rssManager.status.analyzedNotQualified',
    // 未达标 - 橙色（不符合标准）
    color: 'bg-orange-500 dark:bg-orange-600',
    hoverColor: 'hover:bg-orange-600 dark:hover:bg-orange-500'
  },
  {
    key: 'currentCandidate' as const,
    labelKey: 'options.rssManager.status.currentCandidate',
    // 候选池 - 琥珀色（待审核）
    color: 'bg-amber-500 dark:bg-amber-600',
    hoverColor: 'hover:bg-amber-600 dark:hover:bg-amber-500'
  },
  {
    key: 'currentRecommended' as const,
    labelKey: 'options.rssManager.status.currentRecommended',
    // 推荐池 - 绿色（推荐）
    color: 'bg-green-600 dark:bg-green-600',
    hoverColor: 'hover:bg-green-700 dark:hover:bg-green-500'
  },
  {
    key: 'exited' as const,
    labelKey: 'options.rssManager.status.exited',
    // 已退出 - 蓝色（已处理/完成）
    color: 'bg-blue-600 dark:bg-blue-600',
    hoverColor: 'hover:bg-blue-700 dark:hover:bg-blue-500'
  }
]

export function FunnelBlockBar({ inFeedStats, poolStats }: FunnelBlockBarProps) {
  const { _ } = useI18n()
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 生成块数据（基于在源中的统计）
  const blockData = BLOCK_CATEGORIES.map((cat) => {
    const inFeedCount = inFeedStats[cat.key] as number
    const poolCount = poolStats[cat.key] as number
    return {
      ...cat,
      inFeedCount,
      poolCount,
      name: _(cat.labelKey) || cat.key
    }
  })

  // 处理鼠标进入/离开块组
  const handleBlockEnter = (categoryKey: string) => {
    setHoveredCategory(categoryKey)
  }

  const handleBlockLeave = () => {
    setHoveredCategory(null)
  }

  return (
    <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 relative">
      {/* 块容器 */}
      <div className="flex items-center gap-2 flex-wrap flex-1 relative min-h-7">
        {blockData.map((cat) => {
          const { inFeedCount, poolCount, name, color, hoverColor } = cat
          const isHovered = hoveredCategory === cat.key
          
          // 每个块组包括一个分类的所有块（即使数量为 0 也显示占位符）
          return (
            <div
              key={cat.key}
              className="flex flex-col gap-0.5 items-start relative group"
              onMouseEnter={() => handleBlockEnter(cat.key)}
              onMouseLeave={handleBlockLeave}
            >
              {/* 块行 - 每个块代表一篇文章 */}
              <div className="flex gap-px flex-wrap max-w-[60px]">
                {inFeedCount > 0 ? (
                  Array.from({ length: inFeedCount }).map((_, idx) => (
                    <div
                      key={`${cat.key}-${idx}`}
                      ref={(el) => {
                        if (el) blockRefs.current[cat.key] = el
                      }}
                      className={`w-2 h-2 rounded-sm transition-all ${color} ${hoverColor} shadow-sm ${
                        isHovered ? 'ring-1 ring-white dark:ring-gray-300 shadow-md scale-110' : ''
                      }`}
                      title={`${name}`}
                    />
                  ))
                ) : (
                  // 空占位符，保持间隙
                  <div className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-700 opacity-40" />
                )}
              </div>

              {/* 分类标签和池数据 */}
              <div className="text-[8px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                <div className="font-semibold">{name}</div>
                <div className="text-[7px] text-gray-400 dark:text-gray-500">源:{inFeedCount} 池:{poolCount}</div>
              </div>

              {/* Tooltip - 仅在 hover 该类别时显示 */}
              {isHovered && (
                <div
                  className={`absolute z-50 px-2.5 py-1.5 rounded text-[9px] text-white whitespace-nowrap pointer-events-none shadow-lg bg-gray-800 dark:bg-gray-900 bottom-full left-0`}
                  style={{
                    transform: 'translateY(-4px)',
                    marginBottom: '4px'
                  }}
                >
                  <div className="font-semibold text-white">{name}</div>
                  <div className="text-gray-200 dark:text-gray-300 mt-0.5">
                    源: {inFeedCount} | 池: {poolCount}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
