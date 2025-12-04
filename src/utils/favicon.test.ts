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
    it('应该从完整 URL 提取域名并生成 favicon URL', () => {
      const url = 'https://www.example.com/path/to/page'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.google.com/s2/favicons?domain=www.example.com&sz=32')
    })
    
    it('应该处理没有协议的域名', () => {
      const url = 'www.example.com'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.google.com/s2/favicons?domain=www.example.com&sz=32')
    })
    
    it('应该处理带端口的 URL', () => {
      const url = 'http://localhost:3000/page'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.google.com/s2/favicons?domain=localhost&sz=32')
    })
    
    it('应该处理带查询参数的 URL', () => {
      const url = 'https://example.com/page?param=value&foo=bar'
      const faviconUrl = getFaviconUrl(url)
      
      expect(faviconUrl).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32')
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
  })
  
  describe('handleFaviconError', () => {
    it('应该将失败的图片替换为扩展图标', () => {
      const img = document.createElement('img')
      img.src = 'https://www.google.com/s2/favicons?domain=example.com&sz=32'
      
      const event = { currentTarget: img } as React.SyntheticEvent<HTMLImageElement>
      handleFaviconError(event)
      
      expect(img.src).toBe('chrome-extension://mock-id/assets/icon.png')
      expect(img.onerror).toBeNull()
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
  })
})
