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
      
      // 提取元数据
      const metadata: FeedMetadata = {
        title,
        description,
        link: link || "",
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
      
      // 提取元数据
      const metadata: FeedMetadata = {
        title,
        description: subtitle || "",
        link: link || "",
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
