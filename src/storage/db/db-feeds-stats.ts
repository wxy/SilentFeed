/**
 * RSS 订阅源统计模块
 * 
 * 提供订阅源的文章数量统计，用于蛛网图可视化
 * 
 * Phase 11: 订阅源质量蛛网图
 * Phase 13+: 基于多池架构更新统计逻辑
 */

import { db } from './index'
import type { DiscoveredFeed } from '@/types/rss'

/**
 * 订阅源统计数据
 */
export interface FeedStats {
  /** 订阅源 ID */
  feedId: string
  /** 订阅源标题 */
  feedTitle: string
  /** 订阅源 URL */
  feedUrl: string
  
  /** 文章总数（包括历史文章） */
  totalArticles: number
  /** 推荐总数（进入过候选池或推荐池） */
  recommendedCount: number
  /** 阅读总数 */
  readCount: number
  /** 不想读总数 */
  dislikedCount: number
  
  /** 候选池数量（当前在候选池等待推荐） */
  candidateCount?: number
  /** 初筛淘汰数量 */
  prescreenedOutCount?: number
  /** 分析未达标数量 */
  analyzedNotQualifiedCount?: number
  
  /** 是否为表现最差的订阅源（推荐数最低的 3 个） */
  isWorstPerformer?: boolean
}

/**
 * 获取所有已订阅源的统计数据
 * 基于 Phase 13 多池架构的 poolStatus 字段进行统计
 * 
 * @returns 订阅源统计数组
 */
export async function getFeedStats(): Promise<FeedStats[]> {
  // 获取所有已订阅的源
  const feeds = await db.discoveredFeeds
    .where('status')
    .equals('subscribed')
    .toArray()
  
  const stats: FeedStats[] = []
  
  for (const feed of feeds) {
    // 获取该源的所有文章
    const articles = await db.feedArticles
      .where('feedId')
      .equals(feed.id)
      .toArray()
    
    if (articles.length === 0) {
      // 跳过无文章的源
      continue
    }
    
    // 基于 poolStatus 统计各类文章数量
    // recommended: 曾被推荐的文章（当前在推荐池、或曾在推荐池退出、或有 recommended 标记）
    const recommendedArticles = articles.filter(a => 
      a.poolStatus === 'recommended' ||
      (a.poolStatus === 'exited' && a.recommendedPoolAddedAt) ||
      a.recommended === true  // 向后兼容
    )
    // read: 已阅读的文章
    const readArticles = articles.filter(a => a.read === true)
    // disliked: 标记为不想读的文章
    const dislikedArticles = articles.filter(a => a.disliked === true)
    // candidate: 当前在候选池的文章
    const candidateArticles = articles.filter(a => a.poolStatus === 'candidate')
    // prescreened-out: 初筛淘汰的文章
    const prescreenedOutArticles = articles.filter(a => a.poolStatus === 'prescreened-out')
    // analyzed-not-qualified: 分析未达标的文章
    const analyzedNotQualifiedArticles = articles.filter(a => a.poolStatus === 'analyzed-not-qualified')
    
    stats.push({
      feedId: feed.id,
      feedTitle: feed.title,
      feedUrl: feed.url,
      totalArticles: articles.length,
      recommendedCount: recommendedArticles.length,
      readCount: readArticles.length,
      dislikedCount: dislikedArticles.length,
      candidateCount: candidateArticles.length,
      prescreenedOutCount: prescreenedOutArticles.length,
      analyzedNotQualifiedCount: analyzedNotQualifiedArticles.length
    })
  }
  
  // 标记推荐数最差的 3 个订阅源（建议取消订阅）
  if (stats.length > 3) {
    const sortedByRecommended = [...stats].sort((a, b) => a.recommendedCount - b.recommendedCount)
    const worstThree = sortedByRecommended.slice(0, 3)
    worstThree.forEach(worst => {
      const stat = stats.find(s => s.feedId === worst.feedId)
      if (stat) {
        stat.isWorstPerformer = true
      }
    })
  }
  
  return stats
}

/**
 * 对称排列算法
 * 
 * 将订阅源按文章总数排序后，采用对称分布：
 * - 最高的放在顶部（12点）
 * - 第二高的放在右侧（3点）
 * - 第三高的放在左侧（9点）
 * - 第四高的放在底部（6点）
 * - 以此类推，形成对称分布
 * 
 * 算法：从最高值开始，交替放置在顺时针和逆时针方向
 * 
 * @param stats 订阅源统计数组
 * @returns 对称排列后的数组
 */
export function arrangeSymmetrically(stats: FeedStats[]): FeedStats[] {
  if (stats.length === 0) return []
  if (stats.length === 1) return stats
  
  // 按文章总数降序排序
  const sorted = [...stats].sort((a, b) => b.totalArticles - a.totalArticles)
  
  const arranged: FeedStats[] = []
  const left: FeedStats[] = []
  const right: FeedStats[] = []
  
  // 第一个（最高）作为起点
  arranged.push(sorted[0])
  
  // 剩余的源交替放入右侧和左侧
  for (let i = 1; i < sorted.length; i++) {
    if (i % 2 === 1) {
      // 奇数位放右侧（顺时针）
      right.push(sorted[i])
    } else {
      // 偶数位放左侧（逆时针）
      left.unshift(sorted[i]) // 使用 unshift 保持逆序
    }
  }
  
  // 最终顺序：[最高] + 右侧（顺时针） + 左侧（逆时针）
  return [...arranged, ...right, ...left]
}

/**
 * 对数归一化
 * 
 * 将数值归一化到 0-1 范围，使用对数刻度避免大数值遮挡小数值
 * 
 * @param value 原始数值
 * @param maxValue 最大数值
 * @param minDisplayRatio 最小显示比例（默认 0.1，即至少显示 10%）
 * @returns 归一化后的值 (0-1)
 */
export function normalizeLogarithmic(
  value: number,
  maxValue: number,
  minDisplayRatio: number = 0.1
): number {
  if (maxValue === 0) return minDisplayRatio
  if (value === 0) return minDisplayRatio
  
  // 使用对数刻度: log(value + 1) / log(maxValue + 1)
  const normalized = Math.log(value + 1) / Math.log(maxValue + 1)
  
  // 确保至少显示 minDisplayRatio（避免完全不可见）
  return Math.max(minDisplayRatio, normalized)
}
