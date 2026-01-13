/**
 * 漏斗数据块进度条组件
 * 
 * 将 7 个数据项可视化为一排小方块
 * 每个方块代表一个文章条目，用不同颜色表示不同状态
 * 展示在源的数据，Hover 时显示源内/池内对比数据
 * 
 * 数据项：待分析、已过时、初筛淘汰、未达标、候选池、推荐池、已退出
 */

import React, { useState } from 'react'
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
    // 待分析 - 浅白色（未处理）
    color: 'bg-gray-200 dark:bg-gray-700',
    hoverColor: 'hover:bg-gray-300 dark:hover:bg-gray-600'
  },
  {
    key: 'stale' as const,
    labelKey: 'options.rssManager.status.stale',
    // 已过时 - 灰色（淘汰类）
    color: 'bg-gray-400 dark:bg-gray-500',
    hoverColor: 'hover:bg-gray-500 dark:hover:bg-gray-400'
  },
  {
    key: 'prescreenedOut' as const,
    labelKey: 'options.rssManager.status.prescreenedOut',
    // 初筛淘汰 - 深灰（淘汰类）
    color: 'bg-gray-500 dark:bg-gray-600',
    hoverColor: 'hover:bg-gray-600 dark:hover:bg-gray-500'
  },
  {
    key: 'analyzedNotQualified' as const,
    labelKey: 'options.rssManager.status.analyzedNotQualified',
    // 未达标 - 中灰（淘汰类）
    color: 'bg-gray-500 dark:bg-gray-600',
    hoverColor: 'hover:bg-gray-600 dark:hover:bg-gray-500'
  },
  {
    key: 'currentCandidate' as const,
    labelKey: 'options.rssManager.status.currentCandidate',
    // 候选池 - 浅绿（候选类）
    color: 'bg-green-400 dark:bg-green-500',
    hoverColor: 'hover:bg-green-500 dark:hover:bg-green-400'
  },
  {
    key: 'currentRecommended' as const,
    labelKey: 'options.rssManager.status.currentRecommended',
    // 推荐池 - 深绿（推荐类）
    color: 'bg-green-600 dark:bg-green-700',
    hoverColor: 'hover:bg-green-700 dark:hover:bg-green-600'
  },
  {
    key: 'exited' as const,
    labelKey: 'options.rssManager.status.exited',
    // 已退出 - 蓝色（已处理）
    color: 'bg-blue-600 dark:bg-blue-700',
    hoverColor: 'hover:bg-blue-700 dark:hover:bg-blue-600'
  }
]

export function FunnelBlockBar({ inFeedStats, poolStats }: FunnelBlockBarProps) {
  const { _ } = useI18n()
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  // 生成块数据
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

  // 过滤出在源中有数据的分类
  const inFeedCategories = blockData.filter(cat => cat.inFeedCount > 0)
  
  // 过滤出在池中有数据的分类
  const poolCategories = blockData.filter(cat => cat.poolCount > 0)
  
  // 计算在源文章总数
  const totalInFeed = inFeedCategories.reduce((sum, cat) => sum + cat.inFeedCount, 0)

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 relative">
      {/* 左侧：在源数据方块进度条 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* 显示总数 */}
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
            {totalInFeed}
          </span>
          {/* 方块进度条 */}
          <div className="flex items-center gap-px flex-wrap flex-1">
            {inFeedCategories.map((cat) => {
              const isHovered = hoveredCategory === cat.key
            
            return (
              <div
                key={cat.key}
                className="flex gap-px relative"
                onMouseEnter={() => setHoveredCategory(cat.key)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                {/* 每个方块代表一篇文章 */}
                {Array.from({ length: cat.inFeedCount }).map((_, idx) => (
                  <div
                    key={`${cat.key}-${idx}`}
                    className={`w-2 h-2 rounded transition-all shadow-sm ${cat.color} ${cat.hoverColor} ${
                      isHovered ? 'ring-1 ring-white dark:ring-gray-300 shadow-md scale-110' : ''
                    }`}
                  />
                ))}

                {/* Tooltip */}
                {isHovered && (
                  <div
                    className="absolute z-50 px-2.5 py-1.5 rounded text-[9px] text-white whitespace-nowrap pointer-events-none shadow-lg bg-gray-800 dark:bg-gray-900"
                    style={{
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%) translateY(-4px)',
                      marginBottom: '4px'
                    }}
                  >
                    <div className="font-semibold">{cat.name}</div>
                    <div className="text-gray-200 dark:text-gray-300">
                      源: {cat.inFeedCount}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* 右侧：文章池统计（方块 + 数字） */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {poolCategories.map((cat) => {
          const isHovered = hoveredCategory === cat.key
          
          return (
            <div
              key={cat.key}
              className="flex items-center gap-1 relative"
              onMouseEnter={() => setHoveredCategory(cat.key)}
              onMouseLeave={() => setHoveredCategory(null)}
            >
              {/* 彩色方块 */}
              <div
                className={`w-2.5 h-2.5 rounded-sm transition-all shadow-sm ${cat.color} ${cat.hoverColor} ${
                  isHovered ? 'ring-1 ring-white dark:ring-gray-300 shadow-md scale-110' : ''
                }`}
              />
              
              {/* 数字 */}
              <span className={`text-[10px] font-mono transition-colors ${
                isHovered ? 'text-gray-700 dark:text-gray-200 font-semibold' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {cat.poolCount}
              </span>

              {/* Tooltip */}
              {isHovered && (
                <div
                  className="absolute z-50 px-2.5 py-1.5 rounded text-[9px] text-white whitespace-nowrap pointer-events-none shadow-lg bg-gray-800 dark:bg-gray-900"
                  style={{
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%) translateY(-4px)',
                    marginBottom: '4px'
                  }}
                >
                  <div className="font-semibold">{cat.name}</div>
                  <div className="text-gray-200 dark:text-gray-300">
                    池: {cat.poolCount}
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
