/**
 * RSS 验证器测试
 */

import { describe, it, expect } from "vitest"
import { RSSValidator } from "./RSSValidator"

describe("RSSValidator", () => {
  describe("validate - RSS 2.0", () => {
    it("应该验证有效的 RSS 2.0", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <description>This is an example feed</description>
    <link>https://example.com</link>
    <item>
      <title>Example Item</title>
      <link>https://example.com/item1</link>
    </item>
  </channel>
</rss>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.type).toBe("rss")
      // 只检查核心字段，允许额外的 metadata 字段
      expect(result.metadata).toMatchObject({
        title: "Example Feed",
        description: "This is an example feed",
        link: "https://example.com",
      })
    })
    
    it("应该拒绝缺少 title 的 RSS", async () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <description>This is an example feed</description>
    <link>https://example.com</link>
  </channel>
</rss>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe("rss")
      expect(result.error).toContain("title")
    })
    
    it("应该拒绝缺少 description 的 RSS", async () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
  </channel>
</rss>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe("rss")
      expect(result.error).toContain("description")
    })
    
    it("应该处理没有 link 的 RSS（link 非必需）", async () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <description>This is an example feed</description>
  </channel>
</rss>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.metadata?.link).toBe("")
    })
    
    it("应该处理带空白的内容", async () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>
      Example Feed  
    </title>
    <description>
      
      This is an example feed
      
    </description>
    <link>  https://example.com  </link>
  </channel>
</rss>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.metadata?.title).toBe("Example Feed")
      expect(result.metadata?.description).toBe("This is an example feed")
      expect(result.metadata?.link).toBe("https://example.com")
    })
  })
  
  describe("validate - Atom 1.0", () => {
    it("应该验证有效的 Atom 1.0", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <subtitle>This is an example Atom feed</subtitle>
  <link rel="alternate" href="https://example.com"/>
  <entry>
    <title>Example Entry</title>
    <link href="https://example.com/entry1"/>
  </entry>
</feed>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.type).toBe("atom")
      // 只检查核心字段，允许额外的 metadata 字段
      expect(result.metadata).toMatchObject({
        title: "Example Atom Feed",
        description: "This is an example Atom feed",
        link: "https://example.com",
      })
    })
    
    it("应该拒绝缺少 title 的 Atom", async () => {
      const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <subtitle>This is an example Atom feed</subtitle>
  <link rel="alternate" href="https://example.com"/>
</feed>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe("atom")
      expect(result.error).toContain("title")
    })
    
    it("应该处理没有 subtitle 的 Atom（subtitle 非必需）", async () => {
      const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <link rel="alternate" href="https://example.com"/>
</feed>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.metadata?.description).toBe("")
    })
    
    it("应该处理没有 rel 属性的 link", async () => {
      const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <link href="https://example.com"/>
</feed>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(true)
      expect(result.metadata?.link).toBe("https://example.com")
    })
  })
  
  describe("validate - 错误处理", () => {
    it("应该拒绝无效的 XML", async () => {
      const xml = "<invalid>xml<content>"
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe(null)
      // fast-xml-parser 会尝试解析任何 XML，如果不是 RSS/Atom 会返回 "不是有效的 RSS 或 Atom Feed"
      expect(result.error).toBeDefined()
    })
    
    it("应该拒绝非 RSS/Atom 的 XML", async () => {
      const xml = `<?xml version="1.0"?>
<html>
  <head><title>Not a feed</title></head>
  <body></body>
</html>`
      
      const result = await RSSValidator.validate(xml)
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe(null)
      expect(result.error).toContain("不是有效的 RSS 或 Atom")
    })
    
    it("应该处理空字符串", async () => {
      const result = await RSSValidator.validate("")
      
      expect(result.valid).toBe(false)
      expect(result.type).toBe(null)
    })
  })
  
  describe("isRSSLike", () => {
    it("应该识别 RSS 格式的字符串", () => {
      const xml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`
      expect(RSSValidator.isRSSLike(xml)).toBe(true)
    })
    
    it("应该识别 Atom 格式的字符串", () => {
      const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`
      expect(RSSValidator.isRSSLike(xml)).toBe(true)
    })
    
    it("应该识别包含 MIME 类型的字符串", () => {
      expect(RSSValidator.isRSSLike("application/rss+xml")).toBe(true)
      expect(RSSValidator.isRSSLike("application/atom+xml")).toBe(true)
    })
    
    it("应该拒绝普通 HTML", () => {
      const html = `<!DOCTYPE html><html><head><title>Test</title></head></html>`
      expect(RSSValidator.isRSSLike(html)).toBe(false)
    })
    
    it("应该拒绝空字符串", () => {
      expect(RSSValidator.isRSSLike("")).toBe(false)
    })
  })
})
