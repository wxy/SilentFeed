/**
 * HTML 清理工具
 * 
 * 将 HTML 内容转换为纯文本，用于 AI 分析
 * - 移除所有 HTML 标签
 * - 解码 HTML 实体（&amp; → &, &lt; → <, 等）
 * - 移除 CDATA 标记
 * - 合并多余空白
 * - 保留段落结构（换行）
 * 
 * @module utils/html-sanitizer
 */

/**
 * HTML 实体映射表
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '\u2013', // –
  '&mdash;': '\u2014', // —
  '&lsquo;': '\u2018', // '
  '&rsquo;': '\u2019', // '
  '&ldquo;': '\u201C', // "
  '&rdquo;': '\u201D', // "
  '&hellip;': '\u2026', // …
  '&copy;': '\u00A9', // ©
  '&reg;': '\u00AE', // ®
  '&trade;': '\u2122', // ™
  '&bull;': '\u2022', // •
  '&middot;': '\u00B7', // ·
  '&deg;': '\u00B0', // °
  '&plusmn;': '\u00B1', // ±
  '&times;': '\u00D7', // ×
  '&divide;': '\u00F7', // ÷
  '&frac12;': '\u00BD', // ½
  '&frac14;': '\u00BC', // ¼
  '&frac34;': '\u00BE', // ¾
}

/**
 * 解码 HTML 实体
 * 
 * @param text - 包含 HTML 实体的文本
 * @returns 解码后的文本
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return ''
  
  let result = text
  
  // 1. 替换命名实体
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char)
  }
  
  // 2. 替换数字实体（十进制）：&#65; → A
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10)
    return num > 0 && num < 65536 ? String.fromCharCode(num) : ''
  })
  
  // 3. 替换数字实体（十六进制）：&#x41; → A
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const num = parseInt(code, 16)
    return num > 0 && num < 65536 ? String.fromCharCode(num) : ''
  })
  
  return result
}

/**
 * 移除 CDATA 标记
 * 
 * @param text - 可能包含 CDATA 的文本
 * @returns 清理后的文本
 */
export function removeCDATA(text: string): string {
  if (!text) return ''
  
  // 移除 <![CDATA[ 和 ]]> 标记
  return text
    .replace(/<!\[CDATA\[/gi, '')
    .replace(/\]\]>/g, '')
}

/**
 * 将 HTML 块级元素转换为换行符
 * 保持段落结构
 * 
 * @param html - HTML 内容
 * @returns 带换行的文本
 */
function convertBlockElementsToNewlines(html: string): string {
  // 块级元素列表
  const blockTags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                     'li', 'tr', 'blockquote', 'pre', 'section', 'article']
  
  let result = html
  
  // 在块级标签前后添加换行
  for (const tag of blockTags) {
    // 处理开始标签
    result = result.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n')
    // 处理结束标签
    result = result.replace(new RegExp(`</${tag}>`, 'gi'), '\n')
  }
  
  // <br> 特殊处理（自闭合）
  result = result.replace(/<br\s*\/?>/gi, '\n')
  
  return result
}

/**
 * 移除所有 HTML 标签
 * 
 * @param html - HTML 内容
 * @returns 纯文本
 */
export function stripHtmlTags(html: string): string {
  if (!html) return ''
  
  // 移除所有 HTML 标签
  return html.replace(/<[^>]*>/g, '')
}

/**
 * 清理多余空白字符
 * 
 * @param text - 文本
 * @returns 清理后的文本
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return ''
  
  return text
    // 合并多个空格为一个
    .replace(/[ \t]+/g, ' ')
    // 合并多个换行为最多两个（保持段落分隔）
    .replace(/\n{3,}/g, '\n\n')
    // 移除行首行尾空格
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // 整体 trim
    .trim()
}

/**
 * 将 HTML 内容转换为纯文本
 * 
 * 完整处理流程：
 * 1. 移除 CDATA 标记
 * 2. 将块级元素转换为换行
 * 3. 移除所有 HTML 标签
 * 4. 解码 HTML 实体
 * 5. 清理多余空白
 * 
 * @param html - HTML 内容（可能包含 CDATA）
 * @returns 纯文本
 * 
 * @example
 * ```typescript
 * const html = '<![CDATA[<p>Hello &amp; World</p>]]>'
 * const text = sanitizeHtmlToText(html)
 * // => 'Hello & World'
 * ```
 */
export function sanitizeHtmlToText(html: string | null | undefined): string {
  if (!html) return ''
  
  let result = html
  
  // 1. 移除 CDATA 标记
  result = removeCDATA(result)
  
  // 2. 将块级元素转换为换行（保持段落结构）
  result = convertBlockElementsToNewlines(result)
  
  // 3. 移除所有 HTML 标签
  result = stripHtmlTags(result)
  
  // 4. 解码 HTML 实体
  result = decodeHtmlEntities(result)
  
  // 5. 清理多余空白
  result = normalizeWhitespace(result)
  
  return result
}

/**
 * 截断文本到指定长度
 * 尽量在词边界截断
 * 
 * @param text - 文本
 * @param maxLength - 最大长度
 * @param suffix - 截断后缀
 * @returns 截断后的文本
 */
export function truncateText(
  text: string, 
  maxLength: number, 
  suffix: string = '...'
): string {
  if (!text || text.length <= maxLength) return text
  
  const truncated = text.substring(0, maxLength - suffix.length)
  
  // 尝试在词边界截断（找最后一个空格或标点）
  const lastBreak = Math.max(
    truncated.lastIndexOf(' '),
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('，'),
    truncated.lastIndexOf('、'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf(',')
  )
  
  if (lastBreak > maxLength * 0.7) {
    return truncated.substring(0, lastBreak) + suffix
  }
  
  return truncated + suffix
}
