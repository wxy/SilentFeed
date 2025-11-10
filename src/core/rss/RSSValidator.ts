/**
 * RSS 验证器
 * 
 * 功能：
 * 1. 验证 RSS 2.0 和 Atom 1.0 格式
 * 2. 提取 Feed 元数据（title, description, link）
 * 3. 检查 XML 结构有效性
 * 
 * @module core/rss/RSSValidator
 */

import type { ValidationResult, FeedMetadata } from "./types"

/**
 * RSS 验证器类
 */
export class RSSValidator {
  /**
   * 验证 RSS URL（从网络获取并验证）
   * 
   * @param url - RSS URL
   * @returns 验证结果
   */
  static async validateURL(url: string): Promise<ValidationResult> {
    try {
      // 1. 获取 RSS 内容
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(10000), // 10秒超时
      })
      
      if (!response.ok) {
        return {
          valid: false,
          type: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }
      
      // 2. 解析 XML
      const xml = await response.text()
      
      // 3. 验证 XML 内容
      return await this.validate(xml)
    } catch (error) {
      return {
        valid: false,
        type: null,
        error: `网络请求失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  
  /**
   * 验证 RSS/Atom Feed
   * 
   * @param xml - RSS/Atom XML 字符串
   * @returns 验证结果
   */
  static async validate(xml: string): Promise<ValidationResult> {
    try {
      // 1. 解析 XML
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, "text/xml")
      
      // 2. 检查解析错误
      const parseError = doc.querySelector("parsererror")
      if (parseError) {
        return {
          valid: false,
          type: null,
          error: "XML 格式错误",
        }
      }
      
      // 3. 检测 RSS 或 Atom
      const rssChannel = doc.querySelector("rss > channel")
      const atomFeed = doc.querySelector("feed")
      
      if (rssChannel) {
        // RSS 2.0
        return this.validateRSS(doc, rssChannel)
      } else if (atomFeed) {
        // Atom 1.0
        return this.validateAtom(doc, atomFeed)
      } else {
        return {
          valid: false,
          type: null,
          error: "不是有效的 RSS 或 Atom Feed",
        }
      }
    } catch (error) {
      return {
        valid: false,
        type: null,
        error: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  
  /**
   * 验证 RSS 2.0 格式
   */
  private static validateRSS(doc: Document, channel: Element): ValidationResult {
    try {
      // 提取必需字段
      const title = channel.querySelector("title")?.textContent?.trim()
      const description = channel.querySelector("description")?.textContent?.trim()
      const link = channel.querySelector("link")?.textContent?.trim()
      
      // RSS 2.0 要求 title 和 description
      if (!title || !description) {
        return {
          valid: false,
          type: "rss",
          error: "缺少必需字段（title 或 description）",
        }
      }
      
      // 提取扩展元数据
      const language = channel.querySelector("language")?.textContent?.trim()
      const category = channel.querySelector("category")?.textContent?.trim()
      const lastBuildDate = channel.querySelector("lastBuildDate")?.textContent?.trim()
      const pubDate = channel.querySelector("pubDate")?.textContent?.trim()
      const generator = channel.querySelector("generator")?.textContent?.trim()
      const copyright = channel.querySelector("copyright")?.textContent?.trim()
      
      // 统计条目数
      const items = channel.querySelectorAll("item")
      const itemCount = items.length
      
      // 提取元数据
      const metadata: FeedMetadata = {
        title,
        description,
        link: link || "",
        language,
        category,
        lastBuildDate: lastBuildDate ? new Date(lastBuildDate).getTime() : undefined,
        pubDate: pubDate ? new Date(pubDate).getTime() : undefined,
        itemCount,
        generator,
        copyright,
      }
      
      return {
        valid: true,
        type: "rss",
        metadata,
      }
    } catch (error) {
      return {
        valid: false,
        type: "rss",
        error: `RSS 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  
  /**
   * 验证 Atom 1.0 格式
   */
  private static validateAtom(doc: Document, feed: Element): ValidationResult {
    try {
      // 提取必需字段
      const title = feed.querySelector("title")?.textContent?.trim()
      const subtitle = feed.querySelector("subtitle")?.textContent?.trim()
      const linkElement = feed.querySelector("link[rel='alternate'], link:not([rel])")
      const link = linkElement?.getAttribute("href")?.trim()
      
      // Atom 要求 title
      if (!title) {
        return {
          valid: false,
          type: "atom",
          error: "缺少必需字段（title）",
        }
      }
      
      // 提取扩展元数据
      const language = feed.getAttribute("xml:lang") || 
                      feed.querySelector("language")?.textContent?.trim()
      const category = feed.querySelector("category")?.getAttribute("term")?.trim()
      const updated = feed.querySelector("updated")?.textContent?.trim()
      const generator = feed.querySelector("generator")?.textContent?.trim()
      const rights = feed.querySelector("rights")?.textContent?.trim()
      
      // 统计条目数
      const entries = feed.querySelectorAll("entry")
      const itemCount = entries.length
      
      // 提取元数据
      const metadata: FeedMetadata = {
        title,
        description: subtitle || "",
        link: link || "",
        language,
        category,
        lastBuildDate: updated ? new Date(updated).getTime() : undefined,
        itemCount,
        generator,
        copyright: rights,
      }
      
      return {
        valid: true,
        type: "atom",
        metadata,
      }
    } catch (error) {
      return {
        valid: false,
        type: "atom",
        error: `Atom 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  
  /**
   * 快速检查是否为 RSS/Atom（不完整验证）
   * 
   * @param xml - XML 字符串
   * @returns 是否为 RSS/Atom
   */
  static isRSSLike(xml: string): boolean {
    // 简单的字符串检查
    return (
      xml.includes("<rss") ||
      xml.includes("<feed") ||
      xml.includes("application/rss+xml") ||
      xml.includes("application/atom+xml")
    )
  }
}
