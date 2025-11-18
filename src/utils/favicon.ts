/**
 * Favicon 工具函数
 * 用于获取网站的 favicon 图标
 */

/**
 * 从 URL 获取 favicon URL
 * 使用 Google Favicon Service 作为备选方案
 * 
 * @param url - 网站 URL 或域名
 * @returns favicon URL
 */
export function getFaviconUrl(url: string): string {
  try {
    // 如果不是完整 URL，添加 https://
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const urlObj = new URL(fullUrl)
    const domain = urlObj.hostname
    
    // 方案 1: 使用网站自己的 favicon.ico（最快，但可能不存在）
    // 方案 2: 使用 Google Favicon Service（稳定可靠）
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch (error) {
    // 解析失败时返回默认图标
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🌐</text></svg>'
  }
}

/**
 * Favicon 图片组件的辅助函数
 * 处理加载失败的情况
 * 
 * @param event - 图片加载失败事件
 */
export function handleFaviconError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  // 加载失败时显示默认图标
  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🌐</text></svg>'
}
