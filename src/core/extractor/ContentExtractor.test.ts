/**
 * ContentExtractor 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import { ContentExtractor } from "./ContentExtractor"
import { JSDOM } from "jsdom"

describe("ContentExtractor", () => {
  let extractor: ContentExtractor

  beforeEach(() => {
    extractor = new ContentExtractor()
  })

  describe("标题提取", () => {
    it("应该优先提取 og:title", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="OG标题" />
            <title>普通标题</title>
          </head>
          <body><h1>H1标题</h1></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.title).toBe("OG标题")
    })

    it("应该回退到 document.title", () => {
      const html = `
        <html>
          <head>
            <title>普通标题</title>
          </head>
          <body><h1>H1标题</h1></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.title).toBe("普通标题")
    })

    it("应该回退到第一个 h1", () => {
      const html = `
        <html>
          <head></head>
          <body><h1>H1标题</h1></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.title).toBe("H1标题")
    })

    it("没有标题时应该返回空字符串", () => {
      const html = `<html><body></body></html>`
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.title).toBe("")
    })
  })

  describe("描述提取", () => {
    it("应该优先提取 og:description", () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="OG描述" />
            <meta name="description" content="普通描述" />
          </head>
          <body><p>段落文字</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.description).toBe("OG描述")
    })

    it("应该回退到 meta description", () => {
      const html = `
        <html>
          <head>
            <meta name="description" content="普通描述" />
          </head>
          <body><p>段落文字</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.description).toBe("普通描述")
    })

    it("应该回退到第一段文字", () => {
      const html = `
        <html>
          <body><article><p>这是第一段文字</p></article></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.description).toBe("这是第一段文字")
    })

    it("第一段文字应该限制在 200 字以内", () => {
      const longText = "a".repeat(300)
      const html = `
        <html>
          <body><p>${longText}</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.description.length).toBe(200)
    })
  })

  describe("元数据关键词提取", () => {
    it("应该提取 meta keywords", () => {
      const html = `
        <html>
          <head>
            <meta name="keywords" content="react, hooks, javascript" />
          </head>
          <body></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.metaKeywords).toEqual(["react", "hooks", "javascript"])
    })

    it("应该处理空关键词", () => {
      const html = `
        <html>
          <head>
            <meta name="keywords" content="react, , hooks,  , javascript" />
          </head>
          <body></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.metaKeywords).toEqual(["react", "hooks", "javascript"])
    })

    it("没有 keywords 时应该返回空数组", () => {
      const html = `<html><body></body></html>`
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.metaKeywords).toEqual([])
    })
  })

  describe("正文内容提取", () => {
    it("应该优先提取 article 标签内容", () => {
      const html = `
        <html>
          <body>
            <nav>导航内容</nav>
            <article>
              <p>这是正文第一段</p>
              <p>这是正文第二段</p>
            </article>
            <aside>侧边栏内容</aside>
            <footer>页脚内容</footer>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).toContain("这是正文第一段")
      expect(result.content).toContain("这是正文第二段")
      expect(result.content).not.toContain("导航内容")
      expect(result.content).not.toContain("侧边栏内容")
      expect(result.content).not.toContain("页脚内容")
    })

    it("应该回退到 main 标签", () => {
      const html = `
        <html>
          <body>
            <main>
              <p>主要内容</p>
            </main>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).toContain("主要内容")
    })

    it("应该尝试常见的内容类名", () => {
      const html = `
        <html>
          <body>
            <div class="article-content">
              <p>文章内容</p>
            </div>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).toContain("文章内容")
    })

    it("应该过滤导航、侧边栏、页脚中的段落", () => {
      const html = `
        <html>
          <body>
            <nav><p>This is a navigation paragraph with more than fifty characters to pass the filter</p></nav>
            <aside><p>This is a sidebar paragraph with more than fifty characters to pass the filter</p></aside>
            <p>This is a valid main content paragraph with more than fifty characters to pass the filter</p>
            <footer><p>This is a footer paragraph with more than fifty characters to pass the filter</p></footer>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).toContain("valid main content")
      expect(result.content).not.toContain("navigation")
      expect(result.content).not.toContain("sidebar")
      expect(result.content).not.toContain("footer")
    })

    it("应该过滤太短的段落（< 50 字符）", () => {
      // 使用足够长的英文段落来测试
      const shortText = "Short"
      const longText =
        "This is a long paragraph with more than fifty characters that should be extracted"

      const html = `
        <html>
          <body>
            <p>${shortText}</p>
            <p>${longText}</p>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      // 短段落不应该被提取
      expect(result.content).not.toContain(shortText)
      // 长段落应该被提取
      expect(result.content).toContain(longText)
    })

    it("应该清理多余空白", () => {
      const html = `
        <html>
          <body>
            <article>
              <p>这是   多个   空格</p>
              
              
              <p>这是多个换行</p>
            </article>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).not.toMatch(/\s{2,}/)
      expect(result.content).not.toMatch(/\n{2,}/)
    })

    it("应该限制内容长度", () => {
      const longText = "a".repeat(3000)
      const html = `
        <html>
          <body>
            <article><p>${longText}</p></article>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content.length).toBe(2000) // 默认限制
    })

    it("配置 extractContent=false 时不应该提取正文", () => {
      const extractor = new ContentExtractor({ extractContent: false })
      const html = `
        <html>
          <body>
            <article><p>正文内容</p></article>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.content).toBe("")
    })
  })

  describe("语言检测", () => {
    it("中文字符占比 > 30% 应该识别为中文", () => {
      const html = `
        <html>
          <head><title>深入理解 React Hooks 的工作原理</title></head>
          <body><p>这是一段中文内容</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.language).toBe("zh")
    })

    it("英文字母占比 > 30% 应该识别为英文", () => {
      const html = `
        <html>
          <head><title>Understanding React Hooks</title></head>
          <body><p>This is English content</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.language).toBe("en")
    })

    it("中英文混合且中文占比 > 30% 应该识别为中文", () => {
      const html = `
        <html>
          <head><title>React Hooks 深入解析</title></head>
          <body><p>这篇文章介绍 React Hooks 的工作原理</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.language).toBe("zh")
    })

    it("无明显语言特征应该返回 other", () => {
      const html = `
        <html>
          <head><title>123 456</title></head>
          <body><p>@#$%^&*()</p></body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.language).toBe("other")
    })

    it("空内容应该返回 other", () => {
      const html = `<html><body></body></html>`
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.language).toBe("other")
    })
  })

  describe("完整提取", () => {
    it("应该提取完整的页面内容", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="深入理解 React Hooks" />
            <meta property="og:description" content="本文深入介绍 React Hooks 的工作原理" />
            <meta name="keywords" content="react, hooks, javascript" />
          </head>
          <body>
            <article>
              <p>React Hooks 是 React 16.8 引入的新特性，它允许你在不编写 class 的情况下使用 state 和其他 React 特性。</p>
              <p>最常用的 Hooks 包括 useState 和 useEffect。</p>
            </article>
          </body>
        </html>
      `
      const dom = new JSDOM(html)
      const result = extractor.extract(dom.window.document)

      expect(result.title).toBe("深入理解 React Hooks")
      expect(result.description).toBe("本文深入介绍 React Hooks 的工作原理")
      expect(result.metaKeywords).toEqual(["react", "hooks", "javascript"])
      expect(result.content).toContain("React Hooks 是 React 16.8 引入的新特性")
      expect(result.content).toContain("useState 和 useEffect")
      expect(result.language).toBe("zh")
    })
  })
})
