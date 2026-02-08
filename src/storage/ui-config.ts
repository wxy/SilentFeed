/**
 * UI 配置存储
 * 管理用户的 UI 偏好设置（如自动翻译）
 * 颜色主题自动跟随系统
 */

import { logger } from "@/utils/logger"

const uiLogger = logger.withTag('UIConfig')

const UI_CONFIG_KEY = "uiConfig"

/**
 * UI 配置接口
 */
export interface UIConfig {
  /** 是否启用自动翻译 */
  autoTranslate: boolean
}

/**
 * 获取完整的 UI 配置
 * @returns UI 配置对象
 */
export async function getUIConfig(): Promise<UIConfig> {
  const result = await chrome.storage.sync.get(UI_CONFIG_KEY)
  const config = result[UI_CONFIG_KEY] as UIConfig | undefined
  
  return {
    autoTranslate: config?.autoTranslate ?? true // 默认开启自动翻译
  }
}

/**
 * 更新 UI 配置
 * @param config - 要更新的配置项（部分更新）
 */
export async function updateUIConfig(config: Partial<UIConfig>): Promise<void> {
  // 读取现有配置
  const current = await getUIConfig()
  
  // 合并更新
  const updated: UIConfig = {
    ...current,
    ...config
  }
  
  await chrome.storage.sync.set({ [UI_CONFIG_KEY]: updated })
  uiLogger.debug('UI 配置已更新:', config)
}

/**
 * 监听自动翻译配置变化
 * @param callback - 配置变化时的回调函数
 * @returns 取消监听的函数
 */
export function watchAutoTranslate(callback: (enabled: boolean) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[UI_CONFIG_KEY]) {
      const newConfig = changes[UI_CONFIG_KEY].newValue as UIConfig
      if (newConfig?.autoTranslate !== undefined) {
        callback(newConfig.autoTranslate)
      }
    }
  }
  
  chrome.storage.onChanged.addListener(listener)
  
  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}

/**
 * 检测当前系统主题
 * @returns 系统是否为暗色主题
 */
export function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return "light" // 默认明亮主题
}

/**
 * 监听系统主题变化
 * @param callback - 系统主题变化时的回调函数
 * @returns 取消监听的函数
 */
export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {} // 不支持的环境
  }
  
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  
  const listener = (e: MediaQueryListEvent) => {
    callback(e.matches)
  }
  
  mediaQuery.addEventListener("change", listener)
  
  return () => {
    mediaQuery.removeEventListener("change", listener)
  }
}
