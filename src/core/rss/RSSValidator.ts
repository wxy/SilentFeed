/**
 * RSS 验证器
 * 
 * 功能：
 * 1. 验证 RSS 2.0 和 Atom 1.0 格式
 * 2. 提取 Feed 元数据（title, description, link）
 * 3. 检查 XML 结构有效性
 * 
 * 使用 fast-xml-parser 进行 XML 解析（轻量级，适合 background script）
 * 
 * @module core/rss/RSSValidator
 */

import { XMLParser } from 'fast-xml-parser'
import type { ValidationResult, FeedMetadata } from "@/types/rss"

/**
 * RSS 验证器类
 */
export class RSSValidator {
  private static parser: XMLParser

  /**
   * 获取或创建 XML 解析器实例
   */
  private static getParser(): XMLParser {
    if (!this.parser) {
      this.parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        parseAttributeValue: false,
        trimValues: true,
        cdataPropName: '__cdata',
      })
    }
    return this.parser
  }
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
      const parser = this.getParser()
      let parsed: any
      
      try {
        parsed = parser.parse(xml)
      } catch (parseError) {
        return {
          valid: false,
          type: null,
          error: "XML 格式错误",
        }
      }
      
      // 2. 检测 RSS 或 Atom
      if (parsed.rss && parsed.rss.channel) {
        // RSS 2.0
        return this.validateRSS(parsed.rss.channel)
      } else if (parsed.feed) {
        // Atom 1.0
        return this.validateAtom(parsed.feed)
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
   * 获取文本内容（处理各种可能的格式）
   */
  private static getText(value: any): string | undefined {
    if (!value) return undefined
    
    // 如果是字符串，直接返回
    if (typeof value === 'string') return value.trim()
    
    // 如果有 #text 属性
    if (value['#text']) return String(value['#text']).trim()
    
    // 如果有 __cdata 属性（CDATA 内容）
    if (value['__cdata']) return String(value['__cdata']).trim()
    
    // 如果是对象但没有特殊字段，转为字符串
    if (typeof value === 'object') {
      const str = JSON.stringify(value)
      return str === '{}' ? undefined : str
    }
    
    return String(value).trim()
  }

  /**
   * 获取分类列表并转为字符串
   * 注意：
   * - 正确处理 CDATA 标记（如 {__cdata: "Web"}）
   * - 限制最多返回3个分类，避免显示过多
   * - 返回逗号分隔的字符串
   */
  private static getCategories(category: any): string | undefined {
    if (!category) return undefined
    
    const categories = Array.isArray(category) ? category : [category]
    const extracted = categories
      .map(cat => {
        // 特殊处理：如果是包含 __cdata 的对象，直接提取 __cdata 值
        if (cat && typeof cat === 'object' && cat['__cdata']) {
          return String(cat['__cdata']).trim()
        }
        // 否则使用通用 getText
        return this.getText(cat)
      })
      .filter((cat): cat is string => !!cat && cat !== '{}')
    
    if (extracted.length === 0) return undefined
    
    // 限制最多3个分类，用逗号分隔
    return extracted.slice(0, 3).join(', ')
  }
  
  /**
   * 验证 RSS 2.0 格式
   */
  private static validateRSS(channel: any): ValidationResult {
    try {
      // 提取必需字段
      const title = this.getText(channel.title)
      const description = this.getText(channel.description)
      const link = this.getText(channel.link)
      
      // RSS 2.0 要求 title 和 description
      if (!title || !description) {
        return {
          valid: false,
          type: "rss",
          error: "缺少必需字段（title 或 description）",
        }
      }
      
      // 提取扩展元数据
      const language = this.getText(channel.language)
      const category = this.getCategories(channel.category)  // 使用专门的 getCategories 处理
      const lastBuildDate = this.getText(channel.lastBuildDate)
      const pubDate = this.getText(channel.pubDate)
      const generator = this.getText(channel.generator)
      const copyright = this.getText(channel.copyright)
      
      // 统计条目数
      const items = channel.item || []
      const itemArray = Array.isArray(items) ? items : [items]
      const itemCount = itemArray.length
      
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
  private static validateAtom(feed: any): ValidationResult {
    try {
      // 提取必需字段
      const title = this.getText(feed.title)
      const subtitle = this.getText(feed.subtitle)
      
      // 提取 link (优先 rel="alternate")
      let link: string | undefined
      if (feed.link) {
        const links = Array.isArray(feed.link) ? feed.link : [feed.link]
        const alternateLink = links.find((l: any) => l['@_rel'] === 'alternate')
        if (alternateLink && alternateLink['@_href']) {
          link = alternateLink['@_href']
        } else {
          const firstLink = links.find((l: any) => l['@_href'])
          if (firstLink) link = firstLink['@_href']
        }
      }
      
      // Atom 要求 title
      if (!title) {
        return {
          valid: false,
          type: "atom",
          error: "缺少必需字段（title）",
        }
      }
      
      // 提取扩展元数据
      const language = feed['@_xml:lang'] || this.getText(feed.language)
      
      // Atom category 使用 @_term 属性
      let category: string | undefined
      if (feed.category) {
        const categories = Array.isArray(feed.category) ? feed.category : [feed.category]
        const extracted = categories
          .map((cat: any) => cat['@_term'])
          .filter((term: any): term is string => !!term)
          .slice(0, 3)  // 限制最多3个
        
        category = extracted.length > 0 ? extracted.join(', ') : undefined
      }
      
      const updated = this.getText(feed.updated)
      const generator = this.getText(feed.generator)
      const rights = this.getText(feed.rights)
      
      // 统计条目数
      const entries = feed.entry || []
      const entryArray = Array.isArray(entries) ? entries : [entries]
      const itemCount = entryArray.length
      
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
