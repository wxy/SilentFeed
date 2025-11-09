/**
 * i18next 自定义 Backend
 * 
 * 将语言偏好存储到 chrome.storage.sync 而不是 localStorage
 * 实现跨设备同步和统一配置策略
 */

const STORAGE_KEY = "i18nextLng"

/**
 * Chrome Storage Backend for i18next
 */
class ChromeStorageBackend {
  type = "backend" as const
  
  /**
   * 初始化（i18next 要求的方法）
   */
  init(services: any, backendOptions: any, i18nextOptions: any) {
    // 无需初始化逻辑
  }
  
  /**
   * 读取翻译数据（必需方法）
   * 
   * 注意：我们不用这个方法加载翻译文件，
   * 翻译文件仍然通过静态导入加载。
   * 这个方法只是为了满足 i18next backend 接口要求。
   */
  read(language: string, namespace: string, callback: (err: Error | null, data: any) => void) {
    // 返回 null 表示使用默认的翻译资源
    callback(null, null)
  }
  
  /**
   * 保存语言偏好到 chrome.storage.sync
   */
  static async saveLanguage(lng: string): Promise<void> {
    try {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        console.warn("[i18n] chrome.storage.sync not available, fallback to localStorage")
        localStorage.setItem(STORAGE_KEY, lng)
        return
      }
      
      await chrome.storage.sync.set({ [STORAGE_KEY]: lng })
      console.log(`[i18n] 语言偏好已保存到 chrome.storage.sync: ${lng}`)
    } catch (error) {
      console.error("[i18n] 保存语言偏好失败:", error)
      // 降级到 localStorage
      localStorage.setItem(STORAGE_KEY, lng)
    }
  }
  
  /**
   * 从 chrome.storage.sync 读取语言偏好
   */
  static async loadLanguage(): Promise<string | null> {
    try {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        console.warn("[i18n] chrome.storage.sync not available, fallback to localStorage")
        return localStorage.getItem(STORAGE_KEY)
      }
      
      const result = await chrome.storage.sync.get(STORAGE_KEY)
      const lng = result[STORAGE_KEY]
      
      if (lng) {
        console.log(`[i18n] 从 chrome.storage.sync 加载语言偏好: ${lng}`)
        return lng
      }
      
      // 如果 chrome.storage 中没有，尝试从 localStorage 迁移
      const localStorageLng = localStorage.getItem(STORAGE_KEY)
      if (localStorageLng) {
        console.log(`[i18n] 从 localStorage 迁移语言偏好到 chrome.storage.sync: ${localStorageLng}`)
        await ChromeStorageBackend.saveLanguage(localStorageLng)
        // 迁移后删除 localStorage（可选）
        // localStorage.removeItem(STORAGE_KEY)
        return localStorageLng
      }
      
      return null
    } catch (error) {
      console.error("[i18n] 加载语言偏好失败:", error)
      // 降级到 localStorage
      return localStorage.getItem(STORAGE_KEY)
    }
  }
  
  /**
   * 删除语言偏好（恢复自动检测）
   */
  static async removeLanguage(): Promise<void> {
    try {
      if (chrome?.storage?.sync) {
        await chrome.storage.sync.remove(STORAGE_KEY)
      }
      localStorage.removeItem(STORAGE_KEY)
      console.log("[i18n] 语言偏好已删除，将使用自动检测")
    } catch (error) {
      console.error("[i18n] 删除语言偏好失败:", error)
    }
  }
}

export default ChromeStorageBackend
