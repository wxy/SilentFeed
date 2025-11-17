/**
 * 进度相关常量
 */

/** 完成学习阶段所需的页面数 */
export const LEARNING_COMPLETE_PAGES = 100

/**
 * 计算学习进度比例（0-1）
 */
export function getLearningProgressRatio(pages: number): number {
  if (!isFinite(pages)) {
    return 0
  }
  return Math.min(Math.max(pages / LEARNING_COMPLETE_PAGES, 0), 1)
}
