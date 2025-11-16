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