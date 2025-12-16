/**
 * 推荐追踪类型定义
 * 
 * 统一弹窗和阅读列表的追踪机制
 * 
 * 工作流程：
 * 1. 弹窗点击 / 保存到阅读列表 → 创建新 Tab → 记录 {tabId: tracking}
 * 2. 内容脚本检测到30秒阅读 → 发送 SAVE_PAGE_VISIT（包含 tabId）
 * 3. 后台通过 tabId 查找追踪信息 → 识别来源 → 标记已读 → 删除追踪信息
 * 
 * 注意：使用 Tab ID 而非 URL，因为 URL 可能因跳转、翻译、短链接等变化
 */

/** Tab ID 追踪 key 前缀 */
const TAB_TRACKING_PREFIX = 'recommendation_tab_'

/**
 * 推荐追踪信息
 * 
 * 存储在 chrome.storage.session 中，用于追踪推荐文章的打开来源
 * Key格式: `recommendation_tab_${tabId}`（主要）
 *          `recommendation_tracking_${url}`（备用，兼容旧逻辑）
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
 * 获取 URL 追踪 key（备用，兼容旧逻辑）
 */
export function getTrackingKey(url: string): string {
  return `recommendation_tracking_${url}`
}

/**
 * 获取 Tab ID 追踪 key（主要方式）
 */
export function getTabTrackingKey(tabId: number): string {
  return `${TAB_TRACKING_PREFIX}${tabId}`
}

/**
 * 通过 Tab ID 保存追踪信息（推荐方式）
 */
export async function saveTrackingByTabId(
  tabId: number,
  tracking: RecommendationTracking
): Promise<void> {
  const key = getTabTrackingKey(tabId)
  await chrome.storage.session.set({ [key]: tracking })
}

/**
 * 通过 Tab ID 获取追踪信息（推荐方式）
 */
export async function getTrackingByTabId(tabId: number): Promise<RecommendationTracking | null> {
  const key = getTabTrackingKey(tabId)
  const data = await chrome.storage.session.get(key)
  return data[key] || null
}

/**
 * 通过 Tab ID 删除追踪信息
 */
export async function removeTrackingByTabId(tabId: number): Promise<void> {
  const key = getTabTrackingKey(tabId)
  await chrome.storage.session.remove(key)
}

/**
 * 保存追踪信息（URL 方式，备用）
 */
export async function saveTracking(
  url: string,
  tracking: RecommendationTracking
): Promise<void> {
  const key = getTrackingKey(url)
  await chrome.storage.session.set({ [key]: tracking })
}

/**
 * 获取追踪信息（URL 方式，备用）
 */
export async function getTracking(url: string): Promise<RecommendationTracking | null> {
  const key = getTrackingKey(url)
  const data = await chrome.storage.session.get(key)
  return data[key] || null
}

/**
 * 删除追踪信息（URL 方式）
 */
export async function removeTracking(url: string): Promise<void> {
  const key = getTrackingKey(url)
  await chrome.storage.session.remove(key)
}
