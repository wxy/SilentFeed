/**
 * 推荐通知模块
 * Phase 6: 推送新推荐通知
 * 
 * 设计理念：
 * - 克制的通知策略（避免打扰）
 * - 用户可配置通知频率
 * - 支持批量通知合并
 */

const NOTIFICATION_ID_PREFIX = "recommendation-"

/**
 * 获取通知图标 URL
 * 使用 manifest 中定义的 128x128 图标
 */
function getNotificationIconUrl(): string {
  const manifest = chrome.runtime.getManifest()
  const icons = manifest.icons
  
  if (icons && icons["128"]) {
    return chrome.runtime.getURL(icons["128"])
  }
  
  // 降级方案：使用其他尺寸的图标
  if (icons && icons["48"]) {
    return chrome.runtime.getURL(icons["48"])
  }
  
  // 最后的降级方案：返回空字符串（Chrome 会使用默认图标）
  console.warn("[Notification] 未找到合适的图标，将使用默认图标")
  return ""
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  /** 是否启用通知 */
  enabled: boolean
  
  /** 静默时段（小时，24小时制） */
  quietHours?: {
    start: number  // 例如: 22 (晚上10点)
    end: number    // 例如: 8 (早上8点)
  }
  
  /** 最小通知间隔（分钟） */
  minInterval?: number  // 默认: 60分钟
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  quietHours: {
    start: 22,
    end: 8
  },
  minInterval: 60
}

/**
 * 获取通知配置
 */
async function getNotificationConfig(): Promise<NotificationConfig> {
  try {
    const result = await chrome.storage.local.get("notification-config")
    return {
      ...DEFAULT_CONFIG,
      ...(result["notification-config"] || {})
    }
  } catch (error) {
    console.error("[Notification] 加载配置失败:", error)
    return DEFAULT_CONFIG
  }
}

/**
 * 检查是否在静默时段
 */
function isQuietHours(config: NotificationConfig): boolean {
  if (!config.quietHours) return false
  
  const now = new Date()
  const currentHour = now.getHours()
  const { start, end } = config.quietHours
  
  // 跨午夜的情况 (例如: 22:00 - 08:00)
  if (start > end) {
    return currentHour >= start || currentHour < end
  }
  
  // 正常时段
  return currentHour >= start && currentHour < end
}

/**
 * 检查是否满足最小通知间隔
 */
async function canSendNotification(config: NotificationConfig): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get("last-notification-time")
    const lastTime = result["last-notification-time"] as number | undefined
    
    if (!lastTime) return true
    
    const minInterval = (config.minInterval || 60) * 60 * 1000 // 转换为毫秒
    const timeSinceLastNotification = Date.now() - lastTime
    
    return timeSinceLastNotification >= minInterval
  } catch (error) {
    console.error("[Notification] 检查间隔失败:", error)
    return true
  }
}

/**
 * 记录通知发送时间
 */
async function recordNotificationTime(): Promise<void> {
  try {
    await chrome.storage.local.set({
      "last-notification-time": Date.now()
    })
  } catch (error) {
    console.error("[Notification] 记录时间失败:", error)
  }
}

/**
 * 发送新推荐通知
 * 
 * @param count - 推荐数量
 * @param topRecommendation - 第一条推荐（必需，用于按钮点击）
 */
export async function sendRecommendationNotification(
  count: number,
  topRecommendation: {
    title: string
    source: string
    url: string  // 添加 URL 用于"查看"按钮
  }
): Promise<void> {
  try {
    // 1. 检查配置
    const config = await getNotificationConfig()
    
    if (!config.enabled) {
      console.log("[Notification] 通知已禁用")
      return
    }
    
    // 2. 检查静默时段
    if (isQuietHours(config)) {
      console.log("[Notification] 当前在静默时段，跳过通知")
      return
    }
    
    // 3. 检查最小间隔
    const canSend = await canSendNotification(config)
    if (!canSend) {
      console.log("[Notification] 距离上次通知时间不足，跳过通知")
      return
    }
    
    // 4. 构建通知内容
    const notificationId = `${NOTIFICATION_ID_PREFIX}${Date.now()}`
    
    const message = count > 1 
      ? `${topRecommendation.title}\n\n还有 ${count - 1} 篇推荐`
      : topRecommendation.title
    
    // 5. 发送通知
    await chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: getNotificationIconUrl(),
      title: "Silent Feed - 新推荐",
      message: message,
      priority: 1,
      requireInteraction: false, // 不强制交互，自动消失
      silent: false,
      buttons: [
        { title: "查看" },
        { title: "不想看" }
      ]
    })
    
    // 6. 存储推荐 URL，用于按钮点击
    await chrome.storage.local.set({
      [`notification-url-${notificationId}`]: topRecommendation.url
    })
    
    console.log(`[Notification] 已发送通知: ${count}条推荐`)
    
    // 6. 记录发送时间
    await recordNotificationTime()
    
  } catch (error) {
    console.error("[Notification] 发送通知失败:", error)
  }
}

/**
 * 测试通知功能
 * 用于开发阶段验证通知是否正常工作
 */
export async function testNotification(): Promise<void> {
  console.log("[Notification] 测试通知...")
  
  const notificationId = "test-notification"
  const testUrl = "https://example.com"
  
  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: getNotificationIconUrl(),
    title: "Silent Feed - 测试通知",
    message: "这是一条测试推荐\n\n来自: 测试源",
    priority: 2,
    requireInteraction: true, // 测试通知需要用户关闭
    buttons: [
      { title: "查看" },
      { title: "不想看" }
    ]
  })
  
  // 存储测试 URL
  await chrome.storage.local.set({
    [`notification-url-${notificationId}`]: testUrl
  })
  
  console.log("[Notification] 测试通知已发送")
}

/**
 * 监听通知点击事件
 */
export function setupNotificationListeners(): void {
  // 点击通知（非按钮区域）- 打开 popup
  chrome.notifications.onClicked.addListener((notificationId) => {
    console.log("[Notification] 点击通知:", notificationId)
    
    // 打开popup
    chrome.action.openPopup().catch(() => {
      // 如果无法打开popup（某些Chrome版本限制），则打开选项页
      chrome.runtime.openOptionsPage()
    })
    
    // 清除通知
    chrome.notifications.clear(notificationId)
  })
  
  // 点击通知按钮
  chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    console.log("[Notification] 点击按钮:", notificationId, buttonIndex)
    
    if (buttonIndex === 0) {
      // "查看"按钮 - 打开推荐文章
      try {
        const result = await chrome.storage.local.get(`notification-url-${notificationId}`)
        const url = result[`notification-url-${notificationId}`]
        
        if (url) {
          await chrome.tabs.create({ url })
          
          // 清理存储
          await chrome.storage.local.remove(`notification-url-${notificationId}`)
        } else {
          console.warn("[Notification] 未找到推荐 URL")
        }
      } catch (error) {
        console.error("[Notification] 打开推荐失败:", error)
      }
    } else if (buttonIndex === 1) {
      // "不想看"按钮 - 仅关闭通知
      console.log("[Notification] 用户选择不想看")
      
      // 未来优化: 可以记录用户不感兴趣，优化推荐算法
      
      // 清理存储
      await chrome.storage.local.remove(`notification-url-${notificationId}`)
    }
    
    // 清除通知
    chrome.notifications.clear(notificationId)
  })
  
  // 通知关闭
  chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
    console.log("[Notification] 通知关闭:", notificationId, "用户主动:", byUser)
    
    // 清理存储
    await chrome.storage.local.remove(`notification-url-${notificationId}`)
  })
}
