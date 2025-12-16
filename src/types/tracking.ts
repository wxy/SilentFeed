/**
 * 推荐追踪类型定义
 * 
 * 统一弹窗和阅读列表的追踪机制
 * 
 * 工作流程：
 * 1. 弹窗点击 / 保存到阅读列表 → 设置追踪信息
 * 2. 内容脚本检测到30秒阅读 → 发送 SAVE_PAGE_VISIT
 * 3. 后台检查追踪信息 → 识别来源 → 标记已读 → 删除追踪信息
 * 
 * 注意：追踪信息在第一次验证后即删除，避免重复追踪
 */

/**
 * 推荐追踪信息
 * 
 * 存储在 chrome.storage.session 中，用于追踪推荐文章的打开来源
 * Key格式: `recommendation_tracking_${url}`
 */
export interface RecommendationTracking {
  /** 推荐ID */
  recommendationId: string
  
  /** 文章标题 */
  title: string
  
  /** 来源：弹窗或阅读列表 */
  source: 'popup' | 'readingList'
  
  /** 
   * 访问方式
   * - clicked: 点击原文链接
   * - translated: 点击翻译链接  
   * - opened: 从阅读列表打开（无法直接监听，保存时预设）
   */
  action: 
    | 'clicked'           // 点击原文链接
    | 'translated'        // 点击翻译链接
    | 'opened'            // 从阅读列表打开
                          // 注：Chrome无onEntryOpened事件，
                          // 保存到阅读列表时预设此标记
  
  /** 时间戳 */
  timestamp: number
}

/**
 * 获取追踪key
 */
export function getTrackingKey(url: string): string {
  return `recommendation_tracking_${url}`
}

/**
 * 保存追踪信息
 */
export async function saveTracking(
  url: string,
  tracking: RecommendationTracking
): Promise<void> {
  const key = getTrackingKey(url)
  await chrome.storage.session.set({ [key]: tracking })
}

/**
 * 获取追踪信息
 */
export async function getTracking(url: string): Promise<RecommendationTracking | null> {
  const key = getTrackingKey(url)
  const data = await chrome.storage.session.get(key)
  return data[key] || null
}

/**
 * 删除追踪信息
 */
export async function removeTracking(url: string): Promise<void> {
  const key = getTrackingKey(url)
  await chrome.storage.session.remove(key)
}
