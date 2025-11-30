import { describe, it, expect } from 'vitest'
import { OPMLImporter } from './OPMLImporter'

describe('OPMLImporter', () => {
  describe('parse', () => {
    it('解析标准 OPML 文件', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Feeds</title>
  </head>
  <body>
    <outline text="Tech Blog" xmlUrl="https://techblog.com/feed.xml" htmlUrl="https://techblog.com" />
    <outline text="News" xmlUrl="https://news.com/rss" />
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(2)
      expect(feeds[0]).toEqual({
        title: 'Tech Blog',
        xmlUrl: 'https://techblog.com/feed.xml',
        htmlUrl: 'https://techblog.com',
        description: undefined,
        category: undefined
      })
      expect(feeds[1]).toEqual({
        title: 'News',
        xmlUrl: 'https://news.com/rss',
        htmlUrl: undefined,
        description: undefined,
        category: undefined
      })
    })

    it('解析带分类的 OPML', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Technology" title="Tech News">
      <outline text="TechCrunch" xmlUrl="https://techcrunch.com/feed" category="tech" />
      <outline text="Wired" xmlUrl="https://wired.com/feed" category="tech" />
    </outline>
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(2)
      expect(feeds[0].title).toBe('TechCrunch')
      // category 从父级 outline 获取（Tech News），而不是 category 属性
      expect(feeds[0].category).toBe('Tech News')
    })

    it('解析带描述的 OPML', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Blog" xmlUrl="https://blog.com/feed" description="A tech blog" />
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].description).toBe('A tech blog')
    })

    it('忽略没有 xmlUrl 的节点', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Category Only" />
    <outline text="Valid Feed" xmlUrl="https://feed.com/rss" />
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('Valid Feed')
    })

    it('处理嵌套分类', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="AI">
        <outline text="OpenAI Blog" xmlUrl="https://openai.com/blog/rss" />
      </outline>
    </outline>
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('OpenAI Blog')
    })

    it('处理 title 属性（优先于 text）', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Title Attr" text="Text Attr" xmlUrl="https://feed.com/rss" />
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('Title Attr')
    })

    it('抛出错误：无效的 XML', () => {
      const invalidXml = 'not xml'
      
      expect(() => OPMLImporter.parse(invalidXml)).toThrow(/解析失败|Parse error/i)
    })

    it('处理无效 OPML（没有 outline 元素）', () => {
      const invalidOpml = `<?xml version="1.0"?>
<opml version="2.0">
  <body />
</opml>`
      
      // 虽然格式不规范，但不会抛错，只是返回空数组
      const feeds = OPMLImporter.parse(invalidOpml)
      expect(feeds).toHaveLength(0)
    })

    it('处理空的 OPML 文件', () => {
      const emptyOpml = `<?xml version="1.0"?>
<opml version="2.0">
  <body />
</opml>`
      
      const feeds = OPMLImporter.parse(emptyOpml)
      
      expect(feeds).toHaveLength(0)
    })

    it('处理特殊字符', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Blog &amp; News" xmlUrl="https://blog.com/feed?id=1&amp;type=rss" />
  </body>
</opml>`

      const feeds = OPMLImporter.parse(opml)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('Blog & News')
      expect(feeds[0].xmlUrl).toBe('https://blog.com/feed?id=1&type=rss')
    })
  })

  describe('fromFile', () => {
    it('从 File 对象读取 OPML', async () => {
      const opmlContent = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Test Feed" xmlUrl="https://test.com/feed" />
  </body>
</opml>`
      
      const file = new File([opmlContent], 'test.opml', { type: 'text/xml' })
      
      const feeds = await OPMLImporter.fromFile(file)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('Test Feed')
    })

    it('处理 UTF-8 编码', async () => {
      const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="中文博客" xmlUrl="https://blog.cn/feed" />
  </body>
</opml>`
      
      const file = new File([opmlContent], 'chinese.opml', { type: 'text/xml' })
      
      const feeds = await OPMLImporter.fromFile(file)
      
      expect(feeds).toHaveLength(1)
      expect(feeds[0].title).toBe('中文博客')
    })
    
    it('应该处理无效的 OPML 内容', async () => {
      const invalidContent = 'not xml content'
      const file = new File([invalidContent], 'invalid.opml', { type: 'text/xml' })
      
      await expect(OPMLImporter.fromFile(file)).rejects.toThrow(/OPML 解析失败|格式错误/)
    })
  })

  describe('generate', () => {
    it('应该生成标准 OPML 文件', () => {
      const feeds = [
        {
          title: 'Tech Blog',
          xmlUrl: 'https://techblog.com/feed.xml',
          htmlUrl: 'https://techblog.com',
          description: 'A technology blog'
        },
        {
          title: 'News Site',
          xmlUrl: 'https://news.com/rss'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(opml).toContain('<opml version="2.0">')
      expect(opml).toContain('Tech Blog')
      expect(opml).toContain('https://techblog.com/feed.xml')
      expect(opml).toContain('https://techblog.com')
      expect(opml).toContain('A technology blog')
      expect(opml).toContain('News Site')
      expect(opml).toContain('https://news.com/rss')
    })

    it('应该按分类组织源', () => {
      const feeds = [
        {
          title: 'Tech Blog 1',
          xmlUrl: 'https://tech1.com/feed',
          category: 'Technology'
        },
        {
          title: 'Tech Blog 2',
          xmlUrl: 'https://tech2.com/feed',
          category: 'Technology'
        },
        {
          title: 'News Blog',
          xmlUrl: 'https://news.com/feed',
          category: 'News'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('Technology')
      expect(opml).toContain('News')
      // Technology 分类下应该有两个源
      const techSection = opml.substring(
        opml.indexOf('<outline text="Technology"'),
        opml.indexOf('</outline>', opml.indexOf('<outline text="Technology"'))
      )
      expect(techSection).toContain('Tech Blog 1')
      expect(techSection).toContain('Tech Blog 2')
    })

    it('应该处理未分类的源', () => {
      const feeds = [
        {
          title: 'Uncategorized Feed',
          xmlUrl: 'https://feed.com/rss'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('未分类')
      expect(opml).toContain('Uncategorized Feed')
    })

    it('应该转义特殊字符', () => {
      const feeds = [
        {
          title: 'Blog & News',
          xmlUrl: 'https://blog.com/feed?id=1&type=rss',
          description: 'News < Today > "Breaking"'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('Blog &amp; News')
      expect(opml).toContain('https://blog.com/feed?id=1&amp;type=rss')
      expect(opml).toContain('News &lt; Today &gt; &quot;Breaking&quot;')
    })

    it('应该支持自定义标题', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed'
        }
      ]

      const opml = OPMLImporter.generate(feeds, 'My Custom Feeds')

      expect(opml).toContain('<title>My Custom Feeds</title>')
    })

    it('应该包含创建日期', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('<dateCreated>')
      expect(opml).toMatch(/<dateCreated>[^<]+<\/dateCreated>/)
    })

    it('应该使用中文作为默认语言', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed'
        }
      ]

      const opml = OPMLImporter.generate(feeds)

      expect(opml).toContain('<title>Silent Feed 订阅列表</title>')
      expect(opml).toContain('text="未分类"')
    })

    it('应该支持英文语言', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed'
        }
      ]

      const opml = OPMLImporter.generate(feeds, undefined, 'en')

      expect(opml).toContain('<title>Silent Feed Subscriptions</title>')
      expect(opml).toContain('text="Uncategorized"')
    })

    it('应该在指定标题时使用指定标题', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed'
        }
      ]

      const opml = OPMLImporter.generate(feeds, 'My Custom Title', 'en')

      expect(opml).toContain('<title>My Custom Title</title>')
      // 分类标签仍然使用英文
      expect(opml).toContain('text="Uncategorized"')
    })

    it('应该为有分类的 Feed 保留原分类名', () => {
      const feeds = [
        {
          title: 'Test Feed',
          xmlUrl: 'https://test.com/feed',
          category: 'Technology'
        }
      ]

      const opmlZh = OPMLImporter.generate(feeds, undefined, 'zh-CN')
      const opmlEn = OPMLImporter.generate(feeds, undefined, 'en')

      // 两种语言都应该保留原分类名
      expect(opmlZh).toContain('text="Technology"')
      expect(opmlEn).toContain('text="Technology"')
    })
  })
})

