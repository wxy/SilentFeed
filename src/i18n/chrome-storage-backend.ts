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
        console.warn("[i18n] chrome.storage.sync not available")
        throw new Error("chrome.storage.sync not available")
      }
      
      await chrome.storage.sync.set({ [STORAGE_KEY]: lng })
    } catch (error) {
      console.error("[i18n] 保存语言偏好失败:", error)
      throw error
    }
  }
  
  /**
   * 从 chrome.storage.sync 读取语言偏好
   * 
   * @returns 用户保存的语言代码，如果未设置则返回 null（由调用方决定默认语言）
   */
  static async loadLanguage(): Promise<string | null> {
    try {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        console.warn("[i18n] chrome.storage.sync not available")
        return null
      }
      
      const result = await chrome.storage.sync.get(STORAGE_KEY)
      const lng = result[STORAGE_KEY]
      
      if (lng) {
        return lng
      }
      
      return null
      
    } catch (error) {
      console.error("[i18n] 加载语言偏好失败:", error)
      return null
    }
  }
  
  /**
   * 删除语言偏好（恢复默认语言）
   */
  static async removeLanguage(): Promise<void> {
    try {
      if (chrome?.storage?.sync) {
        await chrome.storage.sync.remove(STORAGE_KEY)
      } else {
        console.warn("[i18n] chrome.storage.sync not available")
      }
    } catch (error) {
      console.error("[i18n] 删除语言偏好失败:", error)
      throw error
    }
  }
}

export default ChromeStorageBackend
