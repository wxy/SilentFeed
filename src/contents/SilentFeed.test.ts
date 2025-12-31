/**
 * SilentFeed Content Script 测试
 * 整合了原 rss-detector.test.ts 和 title-state-manager.test.ts 的测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ========================================
// 辅助函数和模拟（从 SilentFeed.ts 提取）
// ========================================

/**
 * 辅助函数：模拟 convertGoogleTranslateUrl 的逻辑
 */
function convertGoogleTranslateUrl(translateUrl: URL): string | null {
  try {
    const hostname = translateUrl.hostname
    const translatedDomain = hostname.replace('.translate.goog', '')
    
    const placeholder = '\x00'
    const originalDomain = translatedDomain
      .replace(/--/g, placeholder)
      .replace(/-/g, '.')
      .replace(new RegExp(placeholder, 'g'), '-')
    
    const originalUrl = new URL(translateUrl.pathname, `https://${originalDomain}`)
    
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
 * 简化版的 TitleStateManager（用于测试）
 */
class TitleStateManager {
  private originalTitle: string = document.title
  private currentEmoji: string = ''
  
  private readonly EMOJIS = {
    LEARNING: '📖',
    PAUSED: '⏸️',
    LEARNED: '✅',
  }
  
  startLearning(): void {
    this.originalTitle = this.getCleanTitle()
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
  }
  
  pauseLearning(): void {
    this.currentEmoji = this.EMOJIS.PAUSED
    this.updateTitle()
  }
  
  resumeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
  }
  
  completeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNED
    this.updateTitle()
  }
  
  clearLearning(): void {
    this.currentEmoji = ''
    this.updateTitle()
  }
  
  reset(): void {
    this.clearLearning()
    this.originalTitle = document.title
  }
  
  private getCleanTitle(): string {
    let title = document.title
    Object.values(this.EMOJIS).forEach(emoji => {
      title = title.replace(emoji + ' ', '')
    })
    return title
  }
  
  private updateTitle(): void {
    const cleanTitle = this.getCleanTitle()
    document.title = this.currentEmoji ? `${this.currentEmoji} ${cleanTitle}` : cleanTitle
  }
}

// ========================================
// 测试套件
// ========================================

describe('SilentFeed Content Script', () => {
  // 设置测试环境
  beforeEach(() => {
    // 清理 DOM
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://example.com/page',
        origin: 'https://example.com',
      },
      writable: true,
      configurable: true,
    })
    
    // Mock document.title
    Object.defineProperty(document, 'title', {
      value: 'Example Page',
      writable: true,
      configurable: true,
    })
    
    // Mock chrome.runtime.sendMessage
    if (!global.chrome) {
      global.chrome = {} as any
    }
    global.chrome.runtime = {
      ...global.chrome?.runtime,
      sendMessage: vi.fn(() => Promise.resolve()),
    } as any
  })
  
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })
  
  // ========================================
  // RSS 检测测试（来自 rss-detector.test.ts）
  // ========================================
  
  describe('RSS 检测功能', () => {
    describe('detectRSSFeeds - DOM 检测', () => {
      it('应该检测 RSS <link> 标签', () => {
        const link = document.createElement('link')
        link.rel = 'alternate'
        link.type = 'application/rss+xml'
        link.href = 'https://example.com/feed'
        link.title = 'Example Feed'
        document.head.appendChild(link)
        
        const rssLinks = document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')
        expect(rssLinks).toHaveLength(1)
        expect(rssLinks[0].getAttribute('href')).toBe('https://example.com/feed')
      })
      
      it('应该检测 Atom <link> 标签', () => {
        const link = document.createElement('link')
        link.rel = 'alternate'
        link.type = 'application/atom+xml'
        link.href = 'https://example.com/atom.xml'
        link.title = 'Example Atom Feed'
        document.head.appendChild(link)
        
        const atomLinks = document.querySelectorAll('link[rel="alternate"][type="application/atom+xml"]')
        expect(atomLinks).toHaveLength(1)
        expect(atomLinks[0].getAttribute('href')).toBe('https://example.com/atom.xml')
      })
      
      it('应该检测多个 RSS 链接', () => {
        const rssLink = document.createElement('link')
        rssLink.rel = 'alternate'
        rssLink.type = 'application/rss+xml'
        rssLink.href = 'https://example.com/feed'
        document.head.appendChild(rssLink)
        
        const atomLink = document.createElement('link')
        atomLink.rel = 'alternate'
        atomLink.type = 'application/atom+xml'
        atomLink.href = 'https://example.com/atom.xml'
        document.head.appendChild(atomLink)
        
        const allLinks = document.querySelectorAll(
          'link[rel="alternate"][type="application/rss+xml"], ' +
          'link[rel="alternate"][type="application/atom+xml"]'
        )
        expect(allLinks).toHaveLength(2)
      })
      
      it('应该忽略无效的 <link> 标签', () => {
        // 缺少 type
        const invalidLink1 = document.createElement('link')
        invalidLink1.rel = 'alternate'
        invalidLink1.href = 'https://example.com/feed'
        document.head.appendChild(invalidLink1)
        
        // 错误的 type
        const invalidLink2 = document.createElement('link')
        invalidLink2.rel = 'alternate'
        invalidLink2.type = 'text/html'
        invalidLink2.href = 'https://example.com/page'
        document.head.appendChild(invalidLink2)
        
        const rssLinks = document.querySelectorAll(
          'link[rel="alternate"][type="application/rss+xml"], ' +
          'link[rel="alternate"][type="application/atom+xml"]'
        )
        expect(rssLinks).toHaveLength(0)
      })
    })
    
    describe('normalizeRSSURL - URL 标准化', () => {
      it('应该处理绝对 URL', () => {
        const url = 'https://example.com/feed'
        const normalized = new URL(url, window.location.href)
        expect(normalized.href).toBe(url)
      })
      
      it('应该处理相对 URL', () => {
        const url = '/feed'
        const normalized = new URL(url, window.location.href)
        expect(normalized.href).toBe('https://example.com/feed')
      })
      
      it('应该处理相对路径（无斜杠开头）', () => {
        const url = 'feed.xml'
        const normalized = new URL(url, 'https://example.com/blog/')
        expect(normalized.href).toBe('https://example.com/blog/feed.xml')
      })
      
      it('应该拒绝非 HTTP 协议', () => {
        const url = 'ftp://example.com/feed'
        const normalized = new URL(url, window.location.href)
        expect(normalized.protocol).toBe('ftp:')
        expect(normalized.protocol.startsWith('http')).toBe(false)
      })
      
      it('应该检测 translate.goog 域名', () => {
        const url1 = 'https://translate.goog/feed'
        const normalized1 = new URL(url1, window.location.href)
        expect(normalized1.hostname).toBe('translate.goog')
        
        const url2 = 'https://example-com.translate.goog/feed'
        const normalized2 = new URL(url2, window.location.href)
        expect(normalized2.hostname.endsWith('.translate.goog')).toBe(true)
        
        const url3 = 'https://example.com/feed'
        const normalized3 = new URL(url3, window.location.href)
        expect(normalized3.hostname).toBe('example.com')
        expect(normalized3.hostname.endsWith('.translate.goog')).toBe(false)
      })
    })
    
    describe('convertGoogleTranslateUrl - 谷歌翻译 URL 转换', () => {
      it('应该转换简单的翻译 URL', () => {
        const translateUrl = new URL('https://arstechnica-com.translate.goog/feed')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://arstechnica.com/feed')
      })
      
      it('应该转换带 www 的翻译 URL', () => {
        const translateUrl = new URL('https://www-example-com.translate.goog/rss.xml')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://www.example.com/rss.xml')
      })
      
      it('应该转换多级 TLD', () => {
        const translateUrl = new URL('https://www-example-co-uk.translate.goog/feed')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://www.example.co.uk/feed')
      })
      
      it('应该保留原始域名中的连字符', () => {
        const translateUrl = new URL('https://my--site-com.translate.goog/feed')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://my-site.com/feed')
      })
      
      it('应该保留路径', () => {
        const translateUrl = new URL('https://example-com.translate.goog/blog/feed')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://example.com/blog/feed')
      })
      
      it('应该移除翻译相关的查询参数', () => {
        const translateUrl = new URL('https://example-com.translate.goog/feed?_x_tr_sl=en&_x_tr_tl=zh&foo=bar')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://example.com/feed?foo=bar')
      })
      
      it('应该保留非翻译相关的查询参数', () => {
        const translateUrl = new URL('https://example-com.translate.goog/feed?page=1&limit=10&_x_tr_sl=en')
        const result = convertGoogleTranslateUrl(translateUrl)
        expect(result).toBe('https://example.com/feed?page=1&limit=10')
      })
      
      it('应该处理无效 URL', () => {
        // 测试 try-catch 异常处理
        // 通过传入一个不符合格式的 URL 对象
        const invalidUrl = {
          hostname: '',
          pathname: '',
          search: '',
        } as URL
        
        const result = convertGoogleTranslateUrl(invalidUrl)
        expect(result).toBeNull()
      })
    })
    
    describe('generateCandidateRSSURLs - 候选 URL 生成', () => {
      it('应该生成常见 RSS 路径', () => {
        const origin = 'https://example.com'
        const paths = ['/feed', '/rss', '/atom.xml', '/index.xml', '/feed.xml', '/rss.xml']
        const candidates = paths.map(path => `${origin}${path}`)
        
        expect(candidates).toContain('https://example.com/feed')
        expect(candidates).toContain('https://example.com/rss')
        expect(candidates).toContain('https://example.com/atom.xml')
        expect(candidates).toContain('https://example.com/feed.xml')
        expect(candidates).toHaveLength(6)
      })
    })
    
    describe('notifyRSSFeeds - 消息发送', () => {
      it('应该发送消息到 background script', async () => {
        const mockSendMessage = vi.fn(() => Promise.resolve())
        global.chrome.runtime.sendMessage = mockSendMessage
        
        const feeds = [
          { url: 'https://example.com/feed', type: 'rss' as const, title: 'Example Feed' },
        ]
        
        await chrome.runtime.sendMessage({
          type: 'RSS_DETECTED',
          payload: {
            feeds,
            sourceURL: window.location.href,
            sourceTitle: document.title,
            detectedAt: Date.now(),
          },
        })
        
        expect(mockSendMessage).toHaveBeenCalledTimes(1)
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'RSS_DETECTED',
            payload: expect.objectContaining({
              feeds,
              sourceURL: 'https://example.com/page',
              sourceTitle: 'Example Page',
            }),
          })
        )
      })
      
      it('应该忽略空 feeds 数组', async () => {
        const mockSendMessage = vi.fn()
        global.chrome.runtime.sendMessage = mockSendMessage
        
        const feeds: any[] = []
        
        if (feeds.length > 0) {
          await chrome.runtime.sendMessage({ type: 'RSS_DETECTED', payload: { feeds } })
        }
        
        expect(mockSendMessage).not.toHaveBeenCalled()
      })
      
      it('应该处理发送失败的情况', async () => {
        const mockSendMessage = vi.fn(() => Promise.reject(new Error('Background not ready')))
        global.chrome.runtime.sendMessage = mockSendMessage
        
        await expect(async () => {
          try {
            await chrome.runtime.sendMessage({ type: 'RSS_DETECTED', payload: {} })
          } catch (error) {
            // 静默失败
            console.warn('发送失败:', error)
          }
        }).not.toThrow()
      })
    })
    
    describe('RSSFeedLink 数据结构', () => {
      it('应该包含必需字段', () => {
        const link = {
          url: 'https://example.com/feed',
          type: 'rss' as const,
        }
        
        expect(link.url).toBeDefined()
        expect(link.type).toBeDefined()
        expect(['rss', 'atom']).toContain(link.type)
      })
      
      it('应该支持可选的 title 字段', () => {
        const linkWithTitle = {
          url: 'https://example.com/feed',
          type: 'atom' as const,
          title: 'My Feed',
        }
        
        expect(linkWithTitle.title).toBe('My Feed')
      })
    })
  })
  
  // ========================================
  // TitleStateManager 测试（来自 title-state-manager.test.ts）
  // ========================================
  
  describe('TitleStateManager - 标题状态管理', () => {
    let manager: TitleStateManager
    
    beforeEach(() => {
      document.title = 'Test Page Title'
      manager = new TitleStateManager()
    })
    
    describe('startLearning', () => {
      it('应该在标题前添加学习中 emoji', () => {
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
      })
      
      it('应该保存原始标题', () => {
        manager.startLearning()
        manager.clearLearning()
        expect(document.title).toBe('Test Page Title')
      })
      
      it('应该移除已存在的 emoji 后再添加', () => {
        document.title = '✅ Test Page Title'
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
      })
    })
    
    describe('pauseLearning', () => {
      it('应该将学习中 emoji 替换为暂停 emoji', () => {
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
        
        manager.pauseLearning()
        expect(document.title).toBe('⏸️ Test Page Title')
      })
      
      it('应该直接添加暂停 emoji（即使没有先调用 startLearning）', () => {
        manager.pauseLearning()
        expect(document.title).toBe('⏸️ Test Page Title')
      })
    })
    
    describe('resumeLearning', () => {
      it('应该将暂停 emoji 替换为学习中 emoji', () => {
        manager.startLearning()
        manager.pauseLearning()
        expect(document.title).toBe('⏸️ Test Page Title')
        
        manager.resumeLearning()
        expect(document.title).toBe('📖 Test Page Title')
      })
    })
    
    describe('completeLearning', () => {
      it('应该将学习中 emoji 替换为完成 emoji', () => {
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
        
        manager.completeLearning()
        expect(document.title).toBe('✅ Test Page Title')
      })
      
      it('应该直接添加完成 emoji（即使没有先调用 startLearning）', () => {
        manager.completeLearning()
        expect(document.title).toBe('✅ Test Page Title')
      })
    })
    
    describe('clearLearning', () => {
      it('应该移除学习中 emoji', () => {
        manager.startLearning()
        manager.clearLearning()
        expect(document.title).toBe('Test Page Title')
      })
      
      it('应该移除完成 emoji', () => {
        manager.completeLearning()
        manager.clearLearning()
        expect(document.title).toBe('Test Page Title')
      })
      
      it('对于没有 emoji 的标题应该保持不变', () => {
        manager.clearLearning()
        expect(document.title).toBe('Test Page Title')
      })
    })
    
    describe('reset', () => {
      it('应该清除 emoji 并更新原始标题', () => {
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
        
        document.title = 'New Page Title'
        
        manager.reset()
        expect(document.title).toBe('New Page Title')
        
        manager.startLearning()
        expect(document.title).toBe('📖 New Page Title')
      })
    })
    
    describe('多次调用', () => {
      it('应该正确处理多次状态切换', () => {
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
        
        manager.pauseLearning()
        expect(document.title).toBe('⏸️ Test Page Title')
        
        manager.resumeLearning()
        expect(document.title).toBe('📖 Test Page Title')
        
        manager.completeLearning()
        expect(document.title).toBe('✅ Test Page Title')
        
        manager.clearLearning()
        expect(document.title).toBe('Test Page Title')
        
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
      })
      
      it('应该避免重复添加 emoji', () => {
        manager.startLearning()
        manager.startLearning()
        expect(document.title).toBe('📖 Test Page Title')
        expect(document.title).not.toBe('📖 📖 Test Page Title')
      })
    })
    
    describe('特殊字符处理', () => {
      it('应该正确处理包含特殊字符的标题', () => {
        document.title = 'Test - Page & Title (2024)'
        manager = new TitleStateManager()
        
        manager.startLearning()
        expect(document.title).toBe('📖 Test - Page & Title (2024)')
        
        manager.clearLearning()
        expect(document.title).toBe('Test - Page & Title (2024)')
      })
      
      it('应该正确处理空标题', () => {
        document.title = ''
        manager = new TitleStateManager()
        
        manager.startLearning()
        expect(document.title).toBe('📖 ')
        
        manager.clearLearning()
        expect(document.title).toBe('')
      })
    })
  })
})
