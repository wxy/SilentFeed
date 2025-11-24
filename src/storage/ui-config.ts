/**
 * UI 风格配置存储
 * 管理用户的 UI 主题偏好（手绘风格 vs 普通风格）
 * 以及其他 UI 相关设置（如自动翻译）
 * 颜色主题自动跟随系统
 */

import { logger } from "@/utils/logger"

const uiLogger = logger.withTag('UIConfig')

export type UIStyle = "sketchy" | "normal"

const UI_STYLE_KEY = "ui_style"
const AUTO_TRANSLATE_KEY = "auto_translate"

/**
 * UI 配置接口
 */
export interface UIConfig {
  /** UI 风格 */
  style: UIStyle
  /** 是否启用自动翻译 */
  autoTranslate: boolean
}

/**
 * 获取完整的 UI 配置
 * @returns UI 配置对象
 */
export async function getUIConfig(): Promise<UIConfig> {
  const result = await chrome.storage.sync.get([UI_STYLE_KEY, AUTO_TRANSLATE_KEY])
  return {
    style: (result[UI_STYLE_KEY] as UIStyle) || "normal", // 默认使用标准风格
    autoTranslate: result[AUTO_TRANSLATE_KEY] ?? true // 默认开启自动翻译
  }
}

/**
 * 更新 UI 配置
 * @param config - 要更新的配置项（部分更新）
 */
export async function updateUIConfig(config: Partial<UIConfig>): Promise<void> {
  const updates: Record<string, any> = {}
  
  if (config.style !== undefined) {
    updates[UI_STYLE_KEY] = config.style
  }
  
  if (config.autoTranslate !== undefined) {
    updates[AUTO_TRANSLATE_KEY] = config.autoTranslate
  }
  
  await chrome.storage.sync.set(updates)
  uiLogger.debug('UI 配置已更新:', config)
}

/**
 * 获取当前 UI 风格
 * @returns UI 风格（默认: sketchy）
 */
export async function getUIStyle(): Promise<UIStyle> {
  const result = await chrome.storage.sync.get(UI_STYLE_KEY)
  return (result[UI_STYLE_KEY] as UIStyle) || "normal" // 默认使用标准风格
}

/**
 * 设置 UI 风格
 * @param style - 要设置的 UI 风格
 */
export async function setUIStyle(style: UIStyle): Promise<void> {
  await chrome.storage.sync.set({ [UI_STYLE_KEY]: style })
  uiLogger.debug(`UI 风格已设置为: ${style}`)
}

/**
 * 监听 UI 风格变化
 * @param callback - 风格变化时的回调函数
 * @returns 取消监听的函数
 */
export function watchUIStyle(callback: (style: UIStyle) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[UI_STYLE_KEY]) {
      callback(changes[UI_STYLE_KEY].newValue as UIStyle)
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
