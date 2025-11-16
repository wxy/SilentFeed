/**
 * HTML工具函数测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { decodeHtmlEntities, stripHtmlTags, sanitizeHtml } from './html'

// Mock DOM elements for testing
let mockTextarea: HTMLTextAreaElement
let mockDiv: HTMLDivElement

beforeEach(() => {
  // Mock createElement for textarea
  const originalCreateElement = document.createElement
  document.createElement = ((tagName: string) => {
    if (tagName === 'textarea') {
      mockTextarea = originalCreateElement.call(document, 'textarea') as HTMLTextAreaElement
      return mockTextarea
    } else if (tagName === 'div') {
      mockDiv = originalCreateElement.call(document, 'div') as HTMLDivElement
      return mockDiv
    }
    return originalCreateElement.call(document, tagName)
  }) as any
})

afterEach(() => {
  // Restore original createElement
  // jest.restoreAllMocks?.() // If using jest
})

describe('HTML工具函数', () => {
  describe('decodeHtmlEntities', () => {
    it('应该解码基本HTML实体', () => {
      const input = '&lt;div&gt;Hello &amp; World&lt;/div&gt;'
      const result = decodeHtmlEntities(input)
      expect(result).toBe('<div>Hello & World</div>')
    })

    it('应该解码数字HTML实体', () => {
      const input = '&#8220;Hello&#8221; &#8212; World &#8216;Test&#8217;'
      const result = decodeHtmlEntities(input)
      // 注意：&#8220;为左双引号，&#8221;为右双引号，&#8216;为左单引号，&#8217;为右单引号
      expect(result).toBe('\u201cHello\u201d \u2014 World \u2018Test\u2019')
    })

    it('应该解码十六进制HTML实体', () => {
      const input = '&#x201C;Hello&#x201D; &#x2014; World'
      const result = decodeHtmlEntities(input)
      // 注意：&#x201C;为左双引号，&#x201D;为右双引号  
      expect(result).toBe('\u201cHello\u201d \u2014 World')
    })

    it('应该处理空字符串', () => {
      expect(decodeHtmlEntities('')).toBe('')
    })

    it('应该处理没有HTML实体的文本', () => {
      const input = 'Hello World'
      expect(decodeHtmlEntities(input)).toBe('Hello World')
    })

    it('应该处理null或undefined', () => {
      expect(decodeHtmlEntities(null as any)).toBe(null)
      expect(decodeHtmlEntities(undefined as any)).toBe(undefined)
    })
  })

  describe('stripHtmlTags', () => {
    it('应该移除HTML标签，保留文本', () => {
      const input = '<div><p>Hello <strong>World</strong></p></div>'
      const result = stripHtmlTags(input)
      expect(result).toBe('Hello World')
    })

    it('应该处理自闭合标签', () => {
      const input = '<p>Hello<br/>World<img src="test.jpg"/></p>'
      const result = stripHtmlTags(input)
      expect(result).toBe('HelloWorld')
    })

    it('应该处理嵌套标签', () => {
      const input = '<div><span><a href="#">Link</a></span></div>'
      const result = stripHtmlTags(input)
      expect(result).toBe('Link')
    })

    it('应该处理空字符串', () => {
      expect(stripHtmlTags('')).toBe('')
    })

    it('应该处理没有HTML标签的文本', () => {
      const input = 'Plain text'
      expect(stripHtmlTags(input)).toBe('Plain text')
    })
  })

  describe('sanitizeHtml', () => {
    it('应该同时解码HTML实体和移除标签', () => {
      const input = '<p>&lt;strong&gt;Hello &amp; World&lt;/strong&gt;</p>'
      const result = sanitizeHtml(input)
      expect(result).toBe('Hello & World')
    })

    it('应该在stripTags=false时保留标签', () => {
      const input = '<p>&lt;div&gt;Hello &amp; World&lt;/div&gt;</p>'
      const result = sanitizeHtml(input, false)
      expect(result).toBe('<p><div>Hello & World</div></p>')
    })

    it('应该处理复杂的混合内容', () => {
      const input = '<div>&#8220;Hello&#8221; <strong>&amp;</strong> &#8216;World&#8217;</div>'
      const result = sanitizeHtml(input)
      expect(result).toBe('\u201cHello\u201d & \u2018World\u2019')
    })

    it('应该处理RSS常见的HTML实体', () => {
      const input = '<title>Microsoft&#x27;s GitHub Copilot &#x2013; AI Coding Assistant</title>'
      const result = sanitizeHtml(input)
      expect(result).toBe('Microsoft\'s GitHub Copilot – AI Coding Assistant')
    })
  })

  describe('真实RSS数据测试', () => {
    it('应该正确处理RSS标题中的HTML实体', () => {
      // 这些是RSS源中常见的HTML实体
      const testCases = [
        {
          input: 'Microsoft&#x27;s GitHub Copilot',
          expected: 'Microsoft\'s GitHub Copilot'
        },
        {
          input: 'AI &amp; Machine Learning',
          expected: 'AI & Machine Learning'
        },
        {
          input: '&#8220;Hello World&#8221;',
          expected: '\u201cHello World\u201d'
        },
        {
          input: 'TypeScript &#8212; The Better JavaScript',
          expected: 'TypeScript — The Better JavaScript'
        }
      ]

      testCases.forEach(({ input, expected }) => {
        expect(sanitizeHtml(input)).toBe(expected)
      })
    })

    it('应该正确处理RSS描述中的HTML标签和实体', () => {
      const input = '<p>This is a <strong>great</strong> article about &quot;AI&quot; &amp; technology.</p>'
      const result = sanitizeHtml(input)
      expect(result).toBe('This is a great article about "AI" & technology.')
    })
  })
})