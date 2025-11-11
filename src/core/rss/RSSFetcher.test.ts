/**
 * RSSFetcher 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RSSFetcher } from './RSSFetcher'

// Mock fetch API
global.fetch = vi.fn()

describe('RSSFetcher', () => {
  let fetcher: RSSFetcher

  beforeEach(() => {
    fetcher = new RSSFetcher()
    vi.clearAllMocks()
  })

  describe('fetch()', () => {
    it('应该成功抓取 RSS 2.0 feed', async () => {
      const mockRSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <description>A test blog</description>
    <language>en</language>
    <item>
      <title>Post 1</title>
      <link>https://example.com/post1</link>
      <description>First post</description>
      <pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate>
      <guid>post1</guid>
      <category>Tech</category>
    </item>
    <item>
      <title>Post 2</title>
      <link>https://example.com/post2</link>
      <description>Second post</description>
      <pubDate>Tue, 02 Jan 2024 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRSS),
      })

      const result = await fetcher.fetch('https://example.com/feed')

      expect(result.success).toBe(true)
      expect(result.feedInfo.title).toBe('Test Blog')
      expect(result.feedInfo.link).toBe('https://example.com')
      expect(result.feedInfo.description).toBe('A test blog')
      expect(result.feedInfo.language).toBe('en')
      expect(result.items).toHaveLength(2)
      expect(result.items[0].title).toBe('Post 1')
      expect(result.items[0].link).toBe('https://example.com/post1')
      expect(result.items[0].description).toBe('First post')
      expect(result.items[0].guid).toBe('post1')
      expect(result.items[0].categories).toEqual(['Tech'])
    })

    it('应该成功抓取 Atom 1.0 feed', async () => {
      const mockAtom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <subtitle>An Atom feed</subtitle>
  <link href="https://example.com/" rel="alternate"/>
  <updated>2024-01-01T10:00:00Z</updated>
  <entry>
    <title>Atom Post 1</title>
    <link href="https://example.com/atom1" rel="alternate"/>
    <id>atom1</id>
    <published>2024-01-01T10:00:00Z</published>
    <summary>First atom post</summary>
    <content>Full content here</content>
    <author>
      <name>John Doe</name>
    </author>
    <category term="Science"/>
  </entry>
</feed>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockAtom),
      })

      const result = await fetcher.fetch('https://example.com/atom')

      expect(result.success).toBe(true)
      expect(result.feedInfo.title).toBe('Test Atom Feed')
      expect(result.feedInfo.description).toBe('An Atom feed')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].title).toBe('Atom Post 1')
      expect(result.items[0].link).toBe('https://example.com/atom1')
      expect(result.items[0].description).toBe('First atom post')
      expect(result.items[0].content).toBe('Full content here')
      expect(result.items[0].author).toBe('John Doe')
      expect(result.items[0].categories).toEqual(['Science'])
    })

    it('应该处理 HTTP 错误', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await fetcher.fetch('https://example.com/nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
      expect(result.items).toHaveLength(0)
    })

    it('应该处理网络错误', async () => {
      ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

      const result = await fetcher.fetch('https://example.com/feed')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('应该处理 XML 解析错误', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('Not valid XML'),
      })

      const result = await fetcher.fetch('https://example.com/invalid')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('应该支持自定义超时', async () => {
      const shortTimeoutFetcher = new RSSFetcher({ timeout: 100 })

      // Mock fetch 抛出 AbortError
      ;(global.fetch as any).mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      )

      const result = await shortTimeoutFetcher.fetch('https://example.com/slow')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('parseRSS()', () => {
    it('应该正确解析 RSS content:encoded 字段', async () => {
      const mockRSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Post with content</title>
      <link>https://example.com/post</link>
      <description>Short description</description>
      <content:encoded><![CDATA[<p>Full HTML content</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRSS),
      })

      const result = await fetcher.fetch('https://example.com/feed')

      expect(result.items[0].content).toBe('<p>Full HTML content</p>')
    })

    it('应该正确解析 dc:creator 字段', async () => {
      const mockRSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Post</title>
      <link>https://example.com/post</link>
      <dc:creator>Jane Smith</dc:creator>
    </item>
  </channel>
</rss>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRSS),
      })

      const result = await fetcher.fetch('https://example.com/feed')

      expect(result.items[0].author).toBe('Jane Smith')
    })

    it('应该处理多个分类', async () => {
      const mockRSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Post</title>
      <link>https://example.com/post</link>
      <category>Tech</category>
      <category>AI</category>
      <category>Science</category>
    </item>
  </channel>
</rss>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRSS),
      })

      const result = await fetcher.fetch('https://example.com/feed')

      expect(result.items[0].categories).toEqual(['Tech', 'AI', 'Science'])
    })
  })

  describe('parseAtom()', () => {
    it('应该处理没有 rel 属性的 link', async () => {
      const mockAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com/"/>
  <entry>
    <title>Post</title>
    <link href="https://example.com/post"/>
    <id>post1</id>
  </entry>
</feed>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockAtom),
      })

      const result = await fetcher.fetch('https://example.com/atom')

      expect(result.feedInfo.link).toBe('https://example.com/')
      expect(result.items[0].link).toBe('https://example.com/post')
    })

    it('应该使用 updated 作为 pubDate（如果没有 published）', async () => {
      const mockAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com/"/>
  <entry>
    <title>Post</title>
    <link href="https://example.com/post"/>
    <id>post1</id>
    <updated>2024-01-15T12:00:00Z</updated>
  </entry>
</feed>`

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockAtom),
      })

      const result = await fetcher.fetch('https://example.com/atom')

      expect(result.items[0].pubDate).toBeInstanceOf(Date)
      expect(result.items[0].pubDate?.toISOString()).toContain('2024-01-15')
    })
  })

  describe('calculateUpdateFrequency()', () => {
    it('应该正确计算更新频率（篇/周）', () => {
      const items = [
        { title: '1', link: '', pubDate: new Date('2024-01-08') },
        { title: '2', link: '', pubDate: new Date('2024-01-06') },
        { title: '3', link: '', pubDate: new Date('2024-01-04') },
        { title: '4', link: '', pubDate: new Date('2024-01-01') },
      ]

      const frequency = fetcher.calculateUpdateFrequency(items)

      // 4 篇文章，7 天跨度 = 4 篇/周
      expect(frequency).toBeCloseTo(4, 1)
    })

    it('应该返回 0 如果文章少于 2 篇', () => {
      const items = [{ title: '1', link: '', pubDate: new Date() }]

      const frequency = fetcher.calculateUpdateFrequency(items)

      expect(frequency).toBe(0)
    })

    it('应该忽略没有日期的文章', () => {
      const items = [
        { title: '1', link: '' },
        { title: '2', link: '' },
        { title: '3', link: '' },
      ]

      const frequency = fetcher.calculateUpdateFrequency(items)

      expect(frequency).toBe(0)
    })

    it('应该处理高频更新（每天多篇）', () => {
      const items = [
        { title: '1', link: '', pubDate: new Date('2024-01-05T12:00:00') },
        { title: '2', link: '', pubDate: new Date('2024-01-05T08:00:00') },
        { title: '3', link: '', pubDate: new Date('2024-01-04T20:00:00') },
        { title: '4', link: '', pubDate: new Date('2024-01-04T10:00:00') },
        { title: '5', link: '', pubDate: new Date('2024-01-03T15:00:00') },
        { title: '6', link: '', pubDate: new Date('2024-01-03T09:00:00') },
      ]

      const frequency = fetcher.calculateUpdateFrequency(items)

      // 6 篇文章，约 2 天跨度 = 约 21 篇/周
      expect(frequency).toBeGreaterThan(15)
    })
  })
})
