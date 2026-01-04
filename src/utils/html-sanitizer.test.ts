/**
 * HTML 清理工具测试
 */

import { describe, it, expect } from 'vitest'
import {
  decodeHtmlEntities,
  removeCDATA,
  stripHtmlTags,
  normalizeWhitespace,
  sanitizeHtmlToText,
  truncateText
} from './html-sanitizer'

describe('html-sanitizer', () => {
  describe('decodeHtmlEntities', () => {
    it('应该解码常见 HTML 实体', () => {
      expect(decodeHtmlEntities('&amp;')).toBe('&')
      expect(decodeHtmlEntities('&lt;')).toBe('<')
      expect(decodeHtmlEntities('&gt;')).toBe('>')
      expect(decodeHtmlEntities('&quot;')).toBe('"')
      expect(decodeHtmlEntities('&nbsp;')).toBe(' ')
    })

    it('应该解码数字实体（十进制）', () => {
      expect(decodeHtmlEntities('&#65;')).toBe('A')
      expect(decodeHtmlEntities('&#20013;')).toBe('中')
      expect(decodeHtmlEntities('&#8364;')).toBe('€')
    })

    it('应该解码数字实体（十六进制）', () => {
      expect(decodeHtmlEntities('&#x41;')).toBe('A')
      expect(decodeHtmlEntities('&#x4E2D;')).toBe('中')
      expect(decodeHtmlEntities('&#x20AC;')).toBe('€')
    })

    it('应该处理混合内容', () => {
      expect(decodeHtmlEntities('Hello &amp; World &#8212; Test'))
        .toBe('Hello & World — Test')
    })

    it('应该处理空值', () => {
      expect(decodeHtmlEntities('')).toBe('')
      expect(decodeHtmlEntities(null as unknown as string)).toBe('')
    })
  })

  describe('removeCDATA', () => {
    it('应该移除 CDATA 标记', () => {
      expect(removeCDATA('<![CDATA[Hello World]]>'))
        .toBe('Hello World')
    })

    it('应该处理嵌套内容', () => {
      expect(removeCDATA('<![CDATA[<p>HTML content</p>]]>'))
        .toBe('<p>HTML content</p>')
    })

    it('应该处理空值', () => {
      expect(removeCDATA('')).toBe('')
    })
  })

  describe('stripHtmlTags', () => {
    it('应该移除所有 HTML 标签', () => {
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello')
      expect(stripHtmlTags('<a href="test">Link</a>')).toBe('Link')
      expect(stripHtmlTags('<div class="test">Content</div>')).toBe('Content')
    })

    it('应该处理自闭合标签', () => {
      expect(stripHtmlTags('Hello<br/>World')).toBe('HelloWorld')
      expect(stripHtmlTags('Test<img src="x"/>End')).toBe('TestEnd')
    })

    it('应该处理嵌套标签', () => {
      expect(stripHtmlTags('<div><p><span>Nested</span></p></div>'))
        .toBe('Nested')
    })
  })

  describe('normalizeWhitespace', () => {
    it('应该合并多个空格', () => {
      expect(normalizeWhitespace('Hello    World')).toBe('Hello World')
    })

    it('应该合并多个换行为两个', () => {
      expect(normalizeWhitespace('A\n\n\n\nB')).toBe('A\n\nB')
    })

    it('应该移除行首行尾空格', () => {
      expect(normalizeWhitespace('  Hello  \n  World  '))
        .toBe('Hello\nWorld')
    })
  })

  describe('sanitizeHtmlToText', () => {
    it('应该完整处理复杂 HTML', () => {
      const html = '<![CDATA[<p>Hello &amp; World</p><br/><p>Second paragraph</p>]]>'
      const result = sanitizeHtmlToText(html)
      expect(result).toContain('Hello & World')
      expect(result).toContain('Second paragraph')
    })

    it('应该处理 RSS 常见格式', () => {
      const rssContent = `
        <description>
          <![CDATA[
            <p>这是一篇关于 AI &amp; ML 的文章。</p>
            <p>包含一些 &lt;技术&gt; 内容。</p>
          ]]>
        </description>
      `
      const result = sanitizeHtmlToText(rssContent)
      expect(result).toContain('AI & ML')
      expect(result).toContain('<技术>')
      expect(result).not.toContain('CDATA')
      expect(result).not.toContain('<p>')
    })

    it('应该保持段落结构', () => {
      const html = '<p>First</p><p>Second</p><p>Third</p>'
      const result = sanitizeHtmlToText(html)
      expect(result.split('\n').filter(l => l.trim()).length).toBe(3)
    })

    it('应该处理空值', () => {
      expect(sanitizeHtmlToText('')).toBe('')
      expect(sanitizeHtmlToText(null)).toBe('')
      expect(sanitizeHtmlToText(undefined)).toBe('')
    })
  })

  describe('truncateText', () => {
    it('应该在指定长度截断', () => {
      const text = 'Hello World'
      expect(truncateText(text, 100)).toBe('Hello World')
      expect(truncateText(text, 8).length).toBeLessThanOrEqual(8)
    })

    it('应该尽量在词边界截断', () => {
      const text = 'Hello beautiful World'
      const result = truncateText(text, 15)
      // 15 - 3(后缀) = 12, "Hello beauti" 长度为 12
      // 由于 "beauti" 没有到达词边界位置的 70%，所以不会回退
      expect(result.length).toBeLessThanOrEqual(15)
      expect(result).toContain('...')
    })

    it('应该处理中文', () => {
      const text = '这是一段中文测试文本，用于验证截断功能。'
      const result = truncateText(text, 15)
      expect(result.length).toBeLessThanOrEqual(15)
      expect(result).toContain('...')
    })
  })
})
