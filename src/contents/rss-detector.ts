/**
 * RSS 检测器 Content Script
 * 
 * 功能：
 * 1. 检测页面中的 RSS 链接（<link> 标签）
 * 2. 尝试常见 RSS URL 模式
 * 3. 发送候选 URL 到 background script（由 background 验证）
 * 
 * 注意：验证逻辑已移至 background script，因为需要使用 fast-xml-parser
 * 
 * @module contents/rss-detector
 */

import type { PlasmoCSConfig } from "plasmo"
import type { RSSLink } from "@/types/rss"

/**
 * Plasmo Content Script 配置
 * matches: 匹配所有 HTTP/HTTPS 页面
 * run_at: 文档加载完成后运行
 */
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end",
  all_frames: false,
}

/**
 * 检测页面中的 RSS 链接
 * 
 * 检测策略：
 * 1. 查找 <link rel="alternate"> 标签
 * 2. 尝试常见 RSS URL 路径
 */
async function detectRSSFeeds(): Promise<RSSLink[]> {
  const feeds: RSSLink[] = []
  
  // 1. 检测 <link> 标签
  const linkElements = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="alternate"][type="application/rss+xml"], ' +
    'link[rel="alternate"][type="application/atom+xml"]'
  )
  
  linkElements.forEach((link) => {
    const url = normalizeURL(link.href)
    if (!url) return
    
    const type = link.type.includes("atom") ? "atom" : "rss"
    const title = link.title || document.title
    
    // 避免重复
    if (!feeds.find(f => f.url === url)) {
      feeds.push({ url, type, title })
    }
  })
  
  // 2. 如果没有找到，尝试常见路径
  if (feeds.length === 0) {
    const candidateURLs = generateCandidateURLs()
    for (const url of candidateURLs) {
      feeds.push({ url, type: "rss" }) // 默认假设为 RSS
    }
  }
  
  return feeds
}

/**
 * 生成候选 RSS URL
 * 
 * 常见模式：
 * - /feed
 * - /rss
 * - /atom.xml
 * - /index.xml
 * - /feed.xml
 * - /rss.xml
 */
function generateCandidateURLs(): string[] {
  const origin = window.location.origin
  const paths = [
    "/feed",
    "/rss",
    "/atom.xml",
    "/index.xml",
    "/feed.xml",
    "/rss.xml",
  ]
  
  return paths.map(path => `${origin}${path}`)
}

/**
 * 标准化 URL
 * 
 * 功能：
 * - 转换相对路径为绝对路径
 * - 验证 URL 有效性
 * - 将谷歌翻译 URL 转换为原始 URL
 */
function normalizeURL(url: string): string | null {
  try {
    // 如果是相对路径，转换为绝对路径
    const absoluteURL = new URL(url, window.location.href)
    
    // 只接受 HTTP/HTTPS 协议
    if (!absoluteURL.protocol.startsWith("http")) {
      return null
    }
    
    // 检测并转换谷歌翻译 URL
    // 格式：https://原域名-用-替换点.translate.goog/路径
    // 例如：https://arstechnica-com.translate.goog/feed → https://arstechnica.com/feed
    if (absoluteURL.hostname.endsWith('.translate.goog')) {
      const originalUrl = convertGoogleTranslateUrl(absoluteURL)
      if (originalUrl) {
        return originalUrl
      }
      // 转换失败则忽略
      return null
    }
    
    // 直接忽略 translate.goog 主域
    if (absoluteURL.hostname === 'translate.goog') {
      return null
    }
    
    return absoluteURL.href
  } catch {
    return null
  }
}

/**
 * 将谷歌翻译 URL 转换为原始 URL
 * 
 * Google 翻译 URL 格式：
 * - 原始: https://example.com/path
 * - 翻译: https://example-com.translate.goog/path?_x_tr_sl=auto&_x_tr_tl=zh-CN&...
 * 
 * 转换规则：
 * 1. 提取子域名部分（.translate.goog 之前）
 * 2. 将 "-" 替换回 "."（但需要处理原本就有 "-" 的域名）
 * 3. 重建原始 URL（保留路径，去除翻译参数）
 * 
 * @param translateUrl 谷歌翻译 URL
 * @returns 原始 URL 或 null（如果转换失败）
 */
function convertGoogleTranslateUrl(translateUrl: URL): string | null {
  try {
    const hostname = translateUrl.hostname
    
    // 提取 .translate.goog 之前的部分
    // 例如：arstechnica-com.translate.goog → arstechnica-com
    const translatedDomain = hostname.replace('.translate.goog', '')
    
    // 将最后一个 "-" 后的部分视为 TLD（顶级域名）
    // 例如：arstechnica-com → arstechnica.com
    // 例如：www-example-co-uk → www.example.co.uk（需要处理多级 TLD）
    
    // 策略：从右向左，将 "-" 替换为 "."
    // 但要注意：原始域名中可能本身包含 "-"（如 my-site.com）
    // Google 翻译会将 "." 替换为 "-"，所以：
    // my-site.com → my--site-com.translate.goog（双 "-" 表示原始 "-"）
    
    // 更安全的策略：
    // 1. 先将 "--" 替换为临时占位符
    // 2. 将 "-" 替换为 "."
    // 3. 将占位符替换回 "-"
    const placeholder = '\x00' // 使用不可见字符作为占位符
    const originalDomain = translatedDomain
      .replace(/--/g, placeholder)
      .replace(/-/g, '.')
      .replace(new RegExp(placeholder, 'g'), '-')
    
    // 重建原始 URL（保留路径，去除翻译相关参数）
    const originalUrl = new URL(translateUrl.pathname, `https://${originalDomain}`)
    
    // 保留非翻译相关的查询参数
    const params = new URLSearchParams(translateUrl.search)
    const translateParams = ['_x_tr_sl', '_x_tr_tl', '_x_tr_hl', '_x_tr_pto', '_x_tr_hist']
    translateParams.forEach(param => params.delete(param))
    
    if (params.toString()) {
      originalUrl.search = params.toString()
    }
    
    return originalUrl.href
  } catch {
    return null
  }
}

/**
 * 发送检测结果到 background script
 * 
 * 功能：
 * 1. 发送候选 RSS URL 列表
 * 2. Background script 负责验证和保存
 */
async function sendRSSLinksToBackground(feeds: RSSLink[]): Promise<void> {
  if (feeds.length === 0) return
  
  
  try {
    await chrome.runtime.sendMessage({
      type: "RSS_DETECTED",
      payload: {
        feeds,
        sourceURL: window.location.href,
        sourceTitle: document.title,
        detectedAt: Date.now(),
      },
    })
    
  } catch (error) {
    // Background script 可能未运行，静默失败
    console.warn("[RSS Detector] 发送消息失败:", error)
  }
}

/**
 * 主函数：检测并发送 RSS 链接
 */
async function main() {
  // 1. 检测 RSS 链接
  const feeds = await detectRSSFeeds()
  
  // 2. 发送到 background
  await sendRSSLinksToBackground(feeds)
}

// 执行检测
main()
