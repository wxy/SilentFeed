/**
 * RSS 订阅源蛛网图组件
 * 
 * 以订阅源为轴的雷达图，展示所有订阅源的文章数量分布：
 * - 每个订阅源对应一条轴（从中心向外辐射）
 * - 每条轴上展示 4 个数据点：文章总数、推荐总数、阅读总数、不想读总数
 * - 4 个半透明多边形叠加显示
 * - 采用对称排列算法优化视觉效果
 * 
 * Phase 11: 订阅源质量蛛网图
 */

import React, { useMemo } from 'react'
import type { FeedStats } from '@/storage/db/db-feeds-stats'
import { arrangeSymmetrically, normalizeLogarithmic } from '@/storage/db/db-feeds-stats'
import { useI18n } from '@/i18n/helpers'

/**
 * 蛛网图组件属性
 */
interface FeedSpiderChartProps {
  /** 订阅源统计数据 */
  stats: FeedStats[]
  /** SVG 画布大小 */
  size?: number
  /** 是否显示源标签 */
  showLabels?: boolean
}

/**
 * 数据层定义（从底层到顶层的顺序）
 * 底层（先绘制）→ 顶层（后绘制）
 * 注意：label 字段在组件内动态生成（使用 i18n）
 */
const DATA_LAYERS = [
  { 
    key: 'totalArticles' as const, 
    labelKey: 'options.collectionStats.feedSpiderTotalArticles',
    color: '#fbbf24', // 黄色
    opacity: 0.2,
    strokeWidth: 0.5
  },
  { 
    key: 'recommendedCount' as const, 
    labelKey: 'options.collectionStats.feedSpiderRecommended',
    color: '#10b981', // 绿色
    opacity: 0.3,
    strokeWidth: 0.5
  },
  { 
    key: 'dislikedCount' as const, 
    labelKey: 'options.collectionStats.feedSpiderDisliked',
    color: '#ef4444', // 红色
    opacity: 0.4,
    strokeWidth: 0.5
  },
  { 
    key: 'readCount' as const, 
    labelKey: 'options.collectionStats.feedSpiderRead',
    color: '#3b82f6', // 蓝色
    opacity: 0.5,
    strokeWidth: 0.5
  }
]

/**
 * 计算极坐标点的笛卡尔坐标
 * 
 * @param axisIndex 轴索引（0-based）
 * @param normalizedValue 归一化值（0-1）
 * @param totalAxes 总轴数
 * @param centerX 中心点 X
 * @param centerY 中心点 Y
 * @param maxRadius 最大半径
 * @returns [x, y] 坐标
 */
function polarToCartesian(
  axisIndex: number,
  normalizedValue: number,
  totalAxes: number,
  centerX: number,
  centerY: number,
  maxRadius: number
): [number, number] {
  // 从顶部（-90度）开始，顺时针旋转
  const angle = (Math.PI * 2 * axisIndex) / totalAxes - Math.PI / 2
  const distance = maxRadius * normalizedValue
  
  return [
    centerX + distance * Math.cos(angle),
    centerY + distance * Math.sin(angle)
  ]
}

/**
 * 生成多边形路径（使用二阶贝塞尔曲线平滑连接）
 * 
 * @param points 点坐标数组
 * @returns SVG path 字符串
 */
function generatePolygonPath(points: [number, number][]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  
  // 使用二阶贝塞尔曲线平滑连接
  let pathData = `M ${points[0][0]} ${points[0][1]}`
  
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    
    // 计算控制点（当前点和下一点的中点）
    const controlX = (current[0] + next[0]) / 2
    const controlY = (current[1] + next[1]) / 2
    
    // Q: 二阶贝塞尔曲线命令
    // 控制点为中点，终点为下一个点
    pathData += ` Q ${current[0]} ${current[1]}, ${controlX} ${controlY}`
  }
  
  // 从最后一个中点回到起点
  const last = points[points.length - 1]
  const first = points[0]
  pathData += ` Q ${last[0]} ${last[1]}, ${first[0]} ${first[1]}`
  
  return pathData + ' Z' // 闭合路径
}

/**
 * RSS 订阅源蛛网图组件
 */
export function FeedSpiderChart({
  stats,
  size = 600,
  showLabels = true
}: FeedSpiderChartProps) {
  const { _ } = useI18n() // 使用 i18n
  
  // 对称排列订阅源
  const arrangedStats = useMemo(() => arrangeSymmetrically(stats), [stats])
  
  // 计算全局最大值（所有层使用统一最大值，避免数据层相对关系错位）
  const globalMaxValue = useMemo(() => {
    const allValues = arrangedStats.flatMap(s => [
      s.totalArticles,
      s.recommendedCount,
      s.readCount,
      s.dislikedCount
    ])
    return Math.max(...allValues, 1)
  }, [arrangedStats])
  
  // SVG 参数 - 宽屏比例
  const svgWidth = 800
  const svgHeight = 500
  const centerX = svgWidth / 2
  const centerY = svgHeight / 2
  const maxRadius = Math.min(svgWidth, svgHeight) * 0.35 // 缩小主体避免标签溢出
  
  // 自动隐藏标签（超过 30 个源）
  const autoShowLabels = showLabels && arrangedStats.length <= 30
  
  // 网格层级（5 层同心圆）
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]
  
  if (arrangedStats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        {_('options.collectionStats.feedSpiderNoData')}
      </div>
    )
  }
  
  return (
    <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-6 md:p-8">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="mx-auto max-w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 背景网格 */}
        <g className="spider-grid">
          {/* 同心圆 */}
          {gridLevels.map((level, i) => (
            <circle
              key={`grid-circle-${i}`}
              cx={centerX}
              cy={centerY}
              r={maxRadius * level}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.1"
              className="text-gray-400 dark:text-gray-600"
            />
          ))}
          
          {/* 径向轴线 */}
          {arrangedStats.map((_, index) => {
            const [x, y] = polarToCartesian(index, 1, arrangedStats.length, centerX, centerY, maxRadius)
            return (
              <line
                key={`grid-line-${index}`}
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.1"
                className="text-gray-400 dark:text-gray-600"
              />
            )
          })}
        </g>
        
        {/* 数据多边形（从外到内绘制，避免遮挡） */}
        {DATA_LAYERS.map((layer, layerIndex) => {
          // 计算每个订阅源在当前层的数据点
          const points = arrangedStats.map((stat, index) => {
            const value = stat[layer.key]
            // 使用全局最大值归一化，保持各层数据的相对关系
            const normalized = normalizeLogarithmic(value, globalMaxValue)
            
            return polarToCartesian(
              index,
              normalized,
              arrangedStats.length,
              centerX,
              centerY,
              maxRadius
            )
          })
          
          const path = generatePolygonPath(points)
          
          return (
            <g key={`layer-${layerIndex}`}>
              {/* 填充区域 */}
              <path
                d={path}
                fill={layer.color}
                fillOpacity={layer.opacity}
                stroke={layer.color}
                strokeWidth={layer.strokeWidth}
                strokeOpacity={layer.opacity + 0.2}
                className="transition-opacity hover:fill-opacity-60"
              >
                <title>{_(layer.labelKey)}</title>
              </path>
            </g>
          )
        })}
        
        {/* 订阅源标签（带 tooltip） */}
        {autoShowLabels && (
          <g className="spider-labels">
            {arrangedStats.map((stat, index) => {
              const [x, y] = polarToCartesian(index, 1.12, arrangedStats.length, centerX, centerY, maxRadius)
              
              // 根据位置调整文本对齐
              let textAnchor: 'start' | 'middle' | 'end' = 'middle'
              if (x < centerX - 10) textAnchor = 'end'
              else if (x > centerX + 10) textAnchor = 'start'
              
              // 构建 tooltip 内容
              const tooltipLines = [
                _('options.collectionStats.feedSpiderTooltipTitle', { feedTitle: stat.feedTitle }),
                _('options.collectionStats.feedSpiderTooltipTotal', { count: stat.totalArticles }),
                _('options.collectionStats.feedSpiderTooltipRecommended', { count: stat.recommendedCount }),
                _('options.collectionStats.feedSpiderTooltipRead', { count: stat.readCount }),
                _('options.collectionStats.feedSpiderTooltipDisliked', { count: stat.dislikedCount })
              ]
              
              if (stat.isWorstPerformer) {
                tooltipLines.push('', _('options.collectionStats.feedSpiderWorstWarning'))
              }
              
              const tooltipText = tooltipLines.join('\n')
              
              return (
                <g key={`label-${index}`}>
                  {/* 最差订阅源的警告标记 */}
                  {stat.isWorstPerformer && (
                    <circle
                      cx={x}
                      cy={y}
                      r="12"
                      fill="#ef4444"
                      opacity="0.2"
                      className="animate-pulse"
                    />
                  )}
                  <text
                    x={x}
                    y={y}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className={`text-xs font-medium cursor-pointer hover:fill-blue-600 dark:hover:fill-blue-400 ${
                      stat.isWorstPerformer 
                        ? 'fill-red-600 dark:fill-red-400 font-bold' 
                        : 'fill-gray-700 dark:fill-gray-300'
                    }`}
                  >
                    {stat.isWorstPerformer ? '⚠️ ' : ''}{stat.feedTitle}
                    <title>{tooltipText}</title>
                  </text>
                </g>
              )
            })}
          </g>
        )}
      </svg>
      
      {/* 图例 */}
      <div className="mt-6 flex flex-wrap justify-center gap-4">
        {DATA_LAYERS.map((layer) => (
          <div key={layer.key} className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-sm" 
              style={{ 
                backgroundColor: layer.color,
                opacity: layer.opacity + 0.3
              }}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {_(layer.labelKey)}
            </span>
          </div>
        ))}
      </div>
      
      {/* 提示信息 */}
      {!autoShowLabels && (
        <div className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          {_('options.collectionStats.feedSpiderTooManyFeeds')}
        </div>
      )}
      
      <div className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
        {_('options.collectionStats.feedSpiderFooter', { count: arrangedStats.length })}
      </div>
    </div>
  )
}
