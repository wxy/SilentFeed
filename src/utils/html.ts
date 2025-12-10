/**
 * HTML工具函数
 */

/**
 * 解码HTML实体
 * @param text 包含HTML实体的文本
 * @returns 解码后的文本
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text
  
  // 创建一个临时的textarea元素来解码HTML实体
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  const decoded = textarea.value
  
  // 清理资源
  textarea.remove()
  
  return decoded
}

/**
 * 清理HTML标签，只保留纯文本
 * @param html 包含HTML标签的文本
 * @returns 纯文本内容
 */
export function stripHtmlTags(html: string): string {
  if (!html) return html
  
  const div = document.createElement('div')
  div.innerHTML = html
  const text = div.textContent || div.innerText || ''
  
  // 清理资源
  div.remove()
  
  return text
}

/**
 * 安全地解码并清理HTML内容
 * @param html 原始HTML内容
 * @param stripTags 是否移除HTML标签
 * @returns 清理后的文本
 */
export function sanitizeHtml(html: string, stripTags = true): string {
  if (!html) return html
  
  // 先解码HTML实体
  const decoded = decodeHtmlEntities(html)
  
  // 可选择移除HTML标签
  return stripTags ? stripHtmlTags(decoded) : decoded
}

/**
 * 格式化订阅源标题用于显示
 * @param title 原始标题（可能包含HTML实体）
 * @param domain 域名
 * @param maxLength 最大长度（默认80字符）
 * @returns 格式化后的标题
 */
export function formatFeedTitle(title: string, domain: string, maxLength = 80): string {
  if (!title) return title
  
  // 1. 解码 HTML 实体（如 &#8211; → –）
  const decoded = decodeHtmlEntities(title)
  
  // 2. 清理多余空格
  const cleaned = decoded.replace(/\s+/g, ' ').trim()
  
  // 3. 计算标题部分的最大长度（预留域名和括号的空间）
  // 格式: "Title (domain.com)"
  const domainLength = domain.length + 3 // " ()" = 3 characters
  const titleMaxLength = maxLength - domainLength
  
  // 4. 如果标题过长，进行智能截断
  let displayTitle = cleaned
  if (cleaned.length > titleMaxLength) {
    // 尝试在单词边界处截断
    const truncated = cleaned.substring(0, titleMaxLength - 3) // 预留 "..." 的空间
    const lastSpace = truncated.lastIndexOf(' ')
    
    if (lastSpace > titleMaxLength * 0.6) {
      // 如果最后一个空格位置合理（在60%之后），在此截断
      displayTitle = truncated.substring(0, lastSpace) + '...'
    } else {
      // 否则直接截断
      displayTitle = truncated + '...'
    }
  }
  
  return displayTitle
}
