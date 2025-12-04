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
 */
function normalizeURL(url: string): string | null {
  try {
    // 如果是相对路径，转换为绝对路径
    const absoluteURL = new URL(url, window.location.href)
    
    // 只接受 HTTP/HTTPS 协议
    if (!absoluteURL.protocol.startsWith("http")) {
      return null
    }
    
    return absoluteURL.href
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
