/**
 * RSS 抓取器
 * 负责从网络抓取 RSS/Atom feed 并解析为统一的数据结构
 */

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

  constructor(options: { timeout?: number } = {}) {
    this.timeout = options.timeout || 10000 // 默认 10 秒超时
  }

  /**
   * 抓取并解析 RSS/Atom feed
   */
  async fetch(url: string): Promise<FetchResult> {
    try {
      console.log(`开始抓取 RSS: ${url}`)

      // 使用 AbortController 实现超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FeedAIMuter/1.0',
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
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlText, 'text/xml')

      // 检查 XML 解析错误
      const parseError = doc.querySelector('parsererror')
      if (parseError) {
        return {
          success: false,
          items: [],
          feedInfo: { title: '', link: url },
          error: 'XML 解析失败',
        }
      }

      // 判断是 RSS 还是 Atom
      const isAtom = doc.querySelector('feed') !== null
      const result = isAtom ? this.parseAtom(doc, url) : this.parseRSS(doc, url)

      console.log(`抓取成功: ${result.feedInfo.title}, ${result.items.length} 篇文章`)
      return result

    } catch (error) {
      console.error('抓取失败:', error)
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
  private parseRSS(doc: Document, feedUrl: string): FetchResult {
    const channel = doc.querySelector('channel')
    if (!channel) {
      return {
        success: false,
        items: [],
        feedInfo: { title: '', link: feedUrl },
        error: '无效的 RSS 格式：未找到 channel 元素',
      }
    }

    // 提取 feed 信息
    const feedInfo: FeedInfo = {
      title: this.getTextContent(channel, 'title') || 'Untitled Feed',
      description: this.getTextContent(channel, 'description'),
      link: this.getTextContent(channel, 'link') || feedUrl,
      language: this.getTextContent(channel, 'language'),
      lastBuildDate: this.parseDate(this.getTextContent(channel, 'lastBuildDate')),
      generator: this.getTextContent(channel, 'generator'),
    }

    // 提取文章列表
    const itemElements = Array.from(channel.querySelectorAll('item'))
    const items: FeedItem[] = itemElements.map(item => {
      // content:encoded 需要用 getElement 而不是 querySelector
      const contentEncoded = item.getElementsByTagName('content:encoded')[0]
      const dcCreator = item.getElementsByTagName('dc:creator')[0]
      
      return {
        title: this.getTextContent(item, 'title') || 'Untitled',
        link: this.getTextContent(item, 'link') || '',
        description: this.getTextContent(item, 'description'),
        content: contentEncoded?.textContent?.trim() || this.getTextContent(item, 'content'),
        pubDate: this.parseDate(this.getTextContent(item, 'pubDate')),
        author: this.getTextContent(item, 'author') || dcCreator?.textContent?.trim(),
        categories: this.getCategories(item),
        guid: this.getTextContent(item, 'guid'),
      }
    })

    return {
      success: true,
      items,
      feedInfo,
    }
  }

  /**
   * 解析 Atom 1.0 格式
   */
  private parseAtom(doc: Document, feedUrl: string): FetchResult {
    const feed = doc.querySelector('feed')
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
      title: this.getTextContent(feed, 'title') || 'Untitled Feed',
      description: this.getTextContent(feed, 'subtitle'),
      link: this.getAtomLink(feed) || feedUrl,
      language: feed.getAttribute('xml:lang') || undefined,
      lastBuildDate: this.parseDate(this.getTextContent(feed, 'updated')),
      generator: this.getTextContent(feed, 'generator'),
    }

    // 提取文章列表
    const entryElements = Array.from(feed.querySelectorAll('entry'))
    const items: FeedItem[] = entryElements.map(entry => ({
      title: this.getTextContent(entry, 'title') || 'Untitled',
      link: this.getAtomLink(entry) || '',
      description: this.getTextContent(entry, 'summary'),
      content: this.getTextContent(entry, 'content'),
      pubDate: this.parseDate(
        this.getTextContent(entry, 'published') || this.getTextContent(entry, 'updated')
      ),
      author: this.getAtomAuthor(entry),
      categories: this.getAtomCategories(entry),
      guid: this.getTextContent(entry, 'id'),
    }))

    return {
      success: true,
      items,
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
   * 获取元素的文本内容（支持 CSS 选择器）
   */
  private getTextContent(parent: Element, selector: string): string | undefined {
    const element = parent.querySelector(selector)
    return element?.textContent?.trim() || undefined
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
   * 获取 RSS 分类列表
   */
  private getCategories(item: Element): string[] {
    const categoryElements = Array.from(item.querySelectorAll('category'))
    return categoryElements
      .map(el => el.textContent?.trim())
      .filter((cat): cat is string => !!cat)
  }

  /**
   * 获取 Atom link（rel="alternate"）
   */
  private getAtomLink(element: Element): string | undefined {
    const link = element.querySelector('link[rel="alternate"]') || element.querySelector('link')
    return link?.getAttribute('href') || undefined
  }

  /**
   * 获取 Atom 作者
   */
  private getAtomAuthor(entry: Element): string | undefined {
    const authorName = this.getTextContent(entry, 'author > name')
    return authorName
  }

  /**
   * 获取 Atom 分类列表
   */
  private getAtomCategories(entry: Element): string[] {
    const categoryElements = Array.from(entry.querySelectorAll('category'))
    return categoryElements
      .map(el => el.getAttribute('term'))
      .filter((cat): cat is string => !!cat)
  }
}
