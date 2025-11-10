/**
 * UI 风格配置存储
 * 管理用户的 UI 主题偏好（手绘风格 vs 普通风格）
 */

export type UIStyle = "sketchy" | "normal"

const UI_STYLE_KEY = "ui_style"

/**
 * 获取当前 UI 风格
 * @returns UI 风格（默认: sketchy）
 */
export async function getUIStyle(): Promise<UIStyle> {
  const result = await chrome.storage.local.get(UI_STYLE_KEY)
  return (result[UI_STYLE_KEY] as UIStyle) || "sketchy" // 默认使用手绘风格
}

/**
 * 设置 UI 风格
 * @param style - 要设置的 UI 风格
 */
export async function setUIStyle(style: UIStyle): Promise<void> {
  await chrome.storage.local.set({ [UI_STYLE_KEY]: style })
  console.log(`[UI Config] UI 风格已设置为: ${style}`)
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
