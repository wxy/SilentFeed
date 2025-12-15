/**
 * RSS 抓取器
 * 负责从网络抓取 RSS/Atom feed 并解析为统一的数据结构
 * 使用 fast-xml-parser 进行 XML 解析（轻量级，适合 background script）
 */

import { XMLParser } from 'fast-xml-parser'
import { logger } from '@/utils/logger'

const fetchLogger = logger.withTag('RSSFetcher')

export interface FeedItem {
  title: string
  link: string
  description?: string
  content?: string
  pubDate?: Date
  author?: string
  categories?: string[]
  guid?: string
}

export interface FeedInfo {
  title: string
  description?: string
  link: string
  language?: string
  lastBuildDate?: Date
  generator?: string
}

export interface FetchResult {
  success: boolean
  items: FeedItem[]
  feedInfo: FeedInfo
  error?: string
}

export class RSSFetcher {
  private readonly timeout: number
  private readonly parser: XMLParser

  constructor(options: { timeout?: number } = {}) {
    this.timeout = options.timeout || 10000 // 默认 10 秒超时
    
    // 配置 XML 解析器
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: false,
      trimValues: true,
      cdataPropName: '__cdata',
    })
  }

  /**
   * 抓取并解析 RSS/Atom feed
   */
  async fetch(url: string): Promise<FetchResult> {
    try {
      fetchLogger.info(`开始抓取 RSS: ${url}`)

      // 使用 AbortController 实现超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SilentFeed/1.0',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          success: false,
          items: [],
          feedInfo: { title: '', link: url },
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const xmlText = await response.text()
      
      // 使用 fast-xml-parser 解析 XML
      let parsed: any
      try {
        parsed = this.parser.parse(xmlText)
      } catch (parseError) {
        return {
          success: false,
          items: [],
          feedInfo: { title: '', link: url },
          error: 'XML 解析失败',
        }
      }

      // 判断是 RSS 还是 Atom
      const isAtom = parsed.feed !== undefined
      const result = isAtom ? this.parseAtom(parsed, url) : this.parseRSS(parsed, url)

      fetchLogger.info(`抓取成功: ${result.feedInfo.title}, ${result.items.length} 篇文章`)
      return result

    } catch (error) {
      fetchLogger.error('抓取失败:', error)
      return {
        success: false,
        items: [],
        feedInfo: { title: '', link: url },
        error: error instanceof Error ? error.message : '未知错误',
      }
    }
  }

  /**
   * 解析 RSS 2.0 格式
   */
  private parseRSS(parsed: any, feedUrl: string): FetchResult {
    const rss = parsed.rss
    if (!rss || !rss.channel) {
      return {
        success: false,
        items: [],
        feedInfo: { title: '', link: feedUrl },
        error: '无效的 RSS 格式：未找到 channel 元素',
      }
    }

    const channel = rss.channel

    // 提取 feed 信息
    const feedInfo: FeedInfo = {
      title: this.getText(channel.title) || 'Untitled Feed',
      description: this.getText(channel.description),
      link: this.getText(channel.link) || feedUrl,
      language: this.getText(channel.language),
      lastBuildDate: this.parseDate(this.getText(channel.lastBuildDate)),
      generator: this.getText(channel.generator),
    }

    // 提取文章列表
    const items = channel.item || []
    const itemArray = Array.isArray(items) ? items : [items]

    const feedItems: FeedItem[] = itemArray.map(item => {
      // 处理 content:encoded 和 dc:creator
      const contentEncoded = item['content:encoded'] || item.encoded
      const dcCreator = item['dc:creator'] || item.creator

      return {
        title: this.getText(item.title) || 'Untitled',
        link: this.getText(item.link) || '',
        description: this.getText(item.description),
        content: this.getText(contentEncoded) || this.getText(item.content),
        pubDate: this.parseDate(this.getText(item.pubDate)),
        author: this.getText(item.author) || this.getText(dcCreator),
        categories: this.getCategories(item.category),
        guid: this.getText(item.guid),
      }
    })

    return {
      success: true,
      items: feedItems,
      feedInfo,
    }
  }

  /**
   * 解析 Atom 1.0 格式
   */
  private parseAtom(parsed: any, feedUrl: string): FetchResult {
    const feed = parsed.feed
    if (!feed) {
      return {
        success: false,
        items: [],
        feedInfo: { title: '', link: feedUrl },
        error: '无效的 Atom 格式：未找到 feed 元素',
      }
    }

    // 提取 feed 信息
    const feedInfo: FeedInfo = {
      title: this.getText(feed.title) || 'Untitled Feed',
      description: this.getText(feed.subtitle),
      link: this.getAtomLink(feed.link) || feedUrl,
      language: feed['@_xml:lang'],
      lastBuildDate: this.parseDate(this.getText(feed.updated)),
      generator: this.getText(feed.generator),
    }

    // 提取文章列表
    const entries = feed.entry || []
    const entryArray = Array.isArray(entries) ? entries : [entries]

    const feedItems: FeedItem[] = entryArray.map(entry => ({
      title: this.getText(entry.title) || 'Untitled',
      link: this.getAtomLink(entry.link) || '',
      description: this.getText(entry.summary),
      content: this.getText(entry.content),
      pubDate: this.parseDate(
        this.getText(entry.published) || this.getText(entry.updated)
      ),
      author: this.getAtomAuthor(entry.author),
      categories: this.getAtomCategories(entry.category),
      guid: this.getText(entry.id),
    }))

    return {
      success: true,
      items: feedItems,
      feedInfo,
    }
  }

  /**
   * 计算 feed 的更新频率（篇/周）
   */
  calculateUpdateFrequency(items: FeedItem[]): number {
    if (items.length < 2) {
      return 0 // 至少需要 2 篇文章才能计算频率
    }

    // 过滤出有发布日期的文章
    const datedItems = items
      .filter(item => item.pubDate)
      .sort((a, b) => b.pubDate!.getTime() - a.pubDate!.getTime())

    if (datedItems.length < 2) {
      return 0
    }

    // 计算最新和最老文章的时间跨度（天）
    const newest = datedItems[0].pubDate!.getTime()
    const oldest = datedItems[datedItems.length - 1].pubDate!.getTime()
    const daySpan = (newest - oldest) / (1000 * 60 * 60 * 24)

    if (daySpan === 0) {
      return 0 // 避免除以 0
    }

    // 计算篇/周
    const articlesPerWeek = (datedItems.length / daySpan) * 7

    return Math.round(articlesPerWeek * 10) / 10 // 保留 1 位小数
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取文本内容（处理各种可能的格式）
   */
  private getText(value: any): string | undefined {
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
   * 解析日期字符串
   */
  private parseDate(dateString: string | undefined): Date | undefined {
    if (!dateString) return undefined

    const date = new Date(dateString)
    return isNaN(date.getTime()) ? undefined : date
  }

  /**
   * 获取分类列表
   * 注意：
   * - 正确处理 CDATA 标记（如 {__cdata: "Web"}）
   * - 限制最多返回3个分类，避免显示过多
   */
  private getCategories(category: any): string[] {
    if (!category) return []
    
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
    
    // 限制最多3个分类
    return extracted.slice(0, 3)
  }

  /**
   * 获取 Atom link（rel="alternate" 或第一个 link）
   */
  private getAtomLink(link: any): string | undefined {
    if (!link) return undefined
    
    const links = Array.isArray(link) ? link : [link]
    
    // 优先查找 rel="alternate"
    const alternateLink = links.find(l => l['@_rel'] === 'alternate')
    if (alternateLink && alternateLink['@_href']) {
      return alternateLink['@_href']
    }
    
    // 否则返回第一个有 href 的 link
    const firstLink = links.find(l => l['@_href'])
    return firstLink ? firstLink['@_href'] : undefined
  }

  /**
   * 获取 Atom 作者
   */
  private getAtomAuthor(author: any): string | undefined {
    if (!author) return undefined
    
    const authors = Array.isArray(author) ? author : [author]
    const firstAuthor = authors[0]
    
    return this.getText(firstAuthor?.name)
  }

  /**
   * 获取 Atom 分类列表
   */
  private getAtomCategories(category: any): string[] {
    if (!category) return []
    
    const categories = Array.isArray(category) ? category : [category]
    return categories
      .map(cat => cat['@_term'])
      .filter((term): term is string => !!term)
  }
}
