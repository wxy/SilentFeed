/**
 * OPML 导入/导出工具
 * 
 * OPML (Outline Processor Markup Language) 是 RSS 阅读器通用的订阅列表交换格式
 * 
 * @module core/rss/OPMLImporter
 */

export interface OPMLFeed {
  title: string
  xmlUrl: string
  htmlUrl?: string
  description?: string
  category?: string
}

/**
 * OPML 导入器
 */
export class OPMLImporter {
  /**
   * 解析 OPML 文件内容
   * 
   * @param opmlText - OPML XML 文本
   * @returns 解析出的源列表
   */
  static parse(opmlText: string): OPMLFeed[] {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(opmlText, "text/xml")
      
      // 检查解析错误
      const parseError = doc.querySelector("parsererror")
      if (parseError) {
        throw new Error("OPML 格式错误")
      }
      
      // 提取所有 outline 元素
      const outlines = doc.querySelectorAll("outline[xmlUrl]")
      const feeds: OPMLFeed[] = []
      
      outlines.forEach((outline) => {
        const xmlUrl = outline.getAttribute("xmlUrl")
        const title = outline.getAttribute("title") || outline.getAttribute("text")
        const htmlUrl = outline.getAttribute("htmlUrl")
        const description = outline.getAttribute("description")
        
        // 尝试从父级获取分类
        let category: string | undefined
        let parent = outline.parentElement
        while (parent && parent.tagName === "outline") {
          const categoryName = parent.getAttribute("title") || parent.getAttribute("text")
          if (categoryName) {
            category = categoryName
            break
          }
          parent = parent.parentElement
        }
        
        if (xmlUrl && title) {
          feeds.push({
            title,
            xmlUrl,
            htmlUrl: htmlUrl || undefined,
            description: description || undefined,
            category,
          })
        }
      })
      
      return feeds
    } catch (error) {
      throw new Error(`OPML 解析失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 从文件对象读取 OPML
   * 
   * @param file - File 对象
   * @returns Promise<解析出的源列表>
   */
  static async fromFile(file: File): Promise<OPMLFeed[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          const feeds = this.parse(text)
          resolve(feeds)
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => {
        reject(new Error("文件读取失败"))
      }
      
      reader.readAsText(file)
    })
  }
  
  /**
   * 生成 OPML 文件内容（导出功能）
   * 
   * @param feeds - 源列表
   * @param title - OPML 文件标题
   * @returns OPML XML 文本
   */
  static generate(feeds: OPMLFeed[], title: string = "Silent Feed 订阅列表"): string {
    const date = new Date().toUTCString()
    
    // 按分类分组
    const grouped: Record<string, OPMLFeed[]> = {}
    feeds.forEach((feed) => {
      const category = feed.category || "未分类"
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(feed)
    })
    
    // 生成 XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<opml version="2.0">\n`
    xml += `  <head>\n`
    xml += `    <title>${escapeXml(title)}</title>\n`
    xml += `    <dateCreated>${date}</dateCreated>\n`
    xml += `  </head>\n`
    xml += `  <body>\n`
    
    Object.entries(grouped).forEach(([category, categoryFeeds]) => {
      xml += `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`
      categoryFeeds.forEach((feed) => {
        xml += `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.xmlUrl)}"`
        if (feed.htmlUrl) {
          xml += ` htmlUrl="${escapeXml(feed.htmlUrl)}"`
        }
        if (feed.description) {
          xml += ` description="${escapeXml(feed.description)}"`
        }
        xml += `/>\n`
      })
      xml += `    </outline>\n`
    })
    
    xml += `  </body>\n`
    xml += `</opml>\n`
    
    return xml
  }
}

/**
 * XML 转义
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
