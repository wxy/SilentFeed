import { describe, it, expect } from 'vitest'
import { getFaviconUrl } from './favicon'

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
    
    it('应该处理无效 URL 并返回默认图标', () => {
      const invalidUrl = 'not a url'
      const faviconUrl = getFaviconUrl(invalidUrl)
      
      expect(faviconUrl).toContain('data:image/svg+xml')
      expect(faviconUrl).toContain('🌐')
    })
    
    it('应该处理空字符串并返回默认图标', () => {
      const faviconUrl = getFaviconUrl('')
      
      expect(faviconUrl).toContain('data:image/svg+xml')
      expect(faviconUrl).toContain('🌐')
    })
  })
})
