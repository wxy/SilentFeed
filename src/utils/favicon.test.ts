import { describe, it, expect, beforeAll, vi } from 'vitest'
import { getFaviconUrl, handleFaviconError } from './favicon'

// Mock chrome.runtime.getURL
const mockGetURL = vi.fn((path: string) => `chrome-extension://mock-id/${path}`)

beforeAll(() => {
  global.chrome = {
    runtime: {
      getURL: mockGetURL
    }
  } as any
})

describe('Favicon 工具', () => {
  describe('getFaviconUrl', () => {
    // 新策略：优先返回网站自己的 /favicon.ico，失败后由 handleFaviconError 降级
    it('应该从完整 URL 生成网站 favicon.ico URL', () => {
      const url = 'https://www.example.com/path/to/page'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.example.com/favicon.ico')
    })
    
    it('应该处理没有协议的域名', () => {
      const url = 'www.example.com'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.example.com/favicon.ico')
    })
    
    it('应该处理带端口的 URL', () => {
      const url = 'http://localhost:3000/page'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('http://localhost/favicon.ico')
    })
    
    it('应该处理带查询参数的 URL', () => {
      const url = 'https://example.com/page?param=value&foo=bar'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://example.com/favicon.ico')
    })
    
    it('应该处理无效 URL 并返回扩展图标', () => {
      const invalidUrl = 'not a url'
      const faviconUrl = getFaviconUrl(invalidUrl)
      
      expect(faviconUrl).toBe('chrome-extension://mock-id/assets/icon.png')
      expect(mockGetURL).toHaveBeenCalledWith('assets/icon.png')
    })
    
    it('应该处理空字符串并返回扩展图标', () => {
      mockGetURL.mockClear()
      const faviconUrl = getFaviconUrl('')
      
      expect(faviconUrl).toBe('chrome-extension://mock-id/assets/icon.png')
      expect(mockGetURL).toHaveBeenCalledWith('assets/icon.png')
    })

    it('应该处理 Google Translate URL (translate.google.com)', () => {
      const translateUrl = 'https://translate.google.com/?u=https://example.com/page'
      const faviconUrl = getFaviconUrl(translateUrl)
      
      // 从 u 参数提取原始域名的 favicon.ico
      expect(faviconUrl).toBe('https://example.com/favicon.ico')
    })

    it('应该处理 Google Translate URL (translate.goog 域名)', () => {
      const translateUrl = 'https://example-com.translate.goog/page'
      const faviconUrl = getFaviconUrl(translateUrl)
      
      // example-com 应该被转换为 example.com 的 favicon.ico
      expect(faviconUrl).toBe('https://example.com/favicon.ico')
    })

    it('应该处理复杂的 translate.goog 域名', () => {
      const translateUrl = 'https://blog-example-com.translate.goog/article'
      const faviconUrl = getFaviconUrl(translateUrl)
      
      // blog-example-com 应该被转换为 blog.example.com 的 favicon.ico
      expect(faviconUrl).toBe('https://blog.example.com/favicon.ico')
    })

    it('应该处理 translate.google.com 但没有 u 参数的情况', () => {
      const translateUrl = 'https://translate.google.com/'
      const faviconUrl = getFaviconUrl(translateUrl)
      
      // 没有 u 参数，应该使用 translate.google.com 的 favicon.ico
      expect(faviconUrl).toBe('https://translate.google.com/favicon.ico')
    })

    it('应该处理 translate.google.com 的无效 u 参数', () => {
      const translateUrl = 'https://translate.google.com/?u=invalid-url'
      const faviconUrl = getFaviconUrl(translateUrl)
      
      // u 参数无效，应该使用 translate.google.com 的 favicon.ico
      expect(faviconUrl).toBe('https://translate.google.com/favicon.ico')
    })

    it('应该处理子域名', () => {
      const url = 'https://blog.example.com/post'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://blog.example.com/favicon.ico')
    })

    it('应该处理 www 子域名', () => {
      const url = 'https://www.github.com'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.github.com/favicon.ico')
    })
  })
  
  describe('handleFaviconError', () => {
    it('应该将 Google Favicon Service 失败的图片替换为扩展图标', () => {
      const img = document.createElement('img')
      img.src = 'https://www.google.com/s2/favicons?domain=example.com&sz=32'
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      expect(img.src).toBe('chrome-extension://mock-id/assets/icon.png')
      expect(img.onerror).toBeNull()
    })

    it('应该将 favicon.ico 失败的图片切换到 Google Favicon Service', () => {
      const img = document.createElement('img')
      img.src = 'https://example.com/favicon.ico'
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      // 第一次失败应该尝试 Google Favicon Service
      expect(img.src).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32')
    })
    
    it('应该防止重复触发错误处理', () => {
      const img = document.createElement('img')
      img.src = 'chrome-extension://mock-id/assets/icon.png'
      const originalSrc = img.src
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      // src 不应该改变
      expect(img.src).toBe(originalSrc)
    })

    it('应该在最终降级时设置 onerror 为 null', () => {
      const img = document.createElement('img')
      // Google Favicon Service 失败的情况
      img.src = 'https://www.google.com/s2/favicons?domain=example.com&sz=32'
      img.onerror = () => {}
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      expect(img.onerror).toBeNull()
    })

    it('应该处理已经包含 assets/icon.png 的图片', () => {
      const img = document.createElement('img')
      img.src = 'chrome-extension://different-id/assets/icon.png'
      const originalSrc = img.src
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      // 如果 src 已经包含 assets/icon.png，不应该改变
      expect(img.src).toBe(originalSrc)
    })
  })
})
