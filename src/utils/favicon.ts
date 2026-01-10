/**
 * Favicon 工具函数
 * 用于获取网站的 favicon 图标
 */

/**
 * 从 URL 获取 favicon URL
 * 
 * 策略：
 * 1. 优先使用 Google Favicon Service
 * 2. 解析失败时使用扩展图标作为后备
 * 3. 所有错误静默处理，不显示给用户
 * 4. 自动处理 Google Translate URL，提取原始域名
 * 
 * @param url - 网站 URL 或域名
 * @returns favicon URL（Google 服务 URL 或扩展图标）
 */
export function getFaviconUrl(url: string): string {
  try {
    // 如果不是完整 URL，添加 https://
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const urlObj = new URL(fullUrl)
    let domain = urlObj.hostname
    
    // 处理 Google Translate URL (translate.google.com 和 *.translate.goog)
    if (domain === 'translate.google.com') {
      // 从 u 参数提取原始 URL
      const originalUrl = urlObj.searchParams.get('u')
      if (originalUrl) {
        try {
          const originalUrlObj = new URL(originalUrl)
          domain = originalUrlObj.hostname
        } catch {
          // 解析失败，使用 translate.google.com
        }
      }
    } else if (domain.endsWith('.translate.goog')) {
      // 从主机名还原原始域名（example-com.translate.goog -> example.com）
      const rawHost = domain.replace('.translate.goog', '')
      // 将连字符还原为点
      domain = rawHost.replace(/-/g, '.')
    }
    
    // 方案 1: 使用网站自己的 favicon.ico（最快，但可能不存在）
    // 方案 2: 使用 Google Favicon Service（稳定可靠）
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch (error) {
    // 解析失败时使用扩展图标（静默处理，不显示错误）
    return chrome.runtime.getURL('assets/icon.png')
  }
}

/**
 * Favicon 图片组件的辅助函数
 * 处理加载失败的情况
 * 
 * 当 Google Favicon Service 无法访问或返回错误时：
 * 1. 静默切换到扩展图标
 * 2. 不在控制台显示错误信息
 * 3. 防止重复触发错误事件
 * 
 * @param event - 图片加载失败事件
 */
export function handleFaviconError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  
  // 防止错误处理函数重复触发
  if (img.src.includes('assets/icon.png')) {
    return
  }
  
  // 静默切换到扩展图标（不显示错误）
  img.src = chrome.runtime.getURL('assets/icon.png')
  
  // 移除 onError 处理器，防止扩展图标加载失败时再次触发
  img.onerror = null
}
