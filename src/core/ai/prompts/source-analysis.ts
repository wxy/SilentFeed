/**
 * 源质量分析提示词
 * 
 * Phase 5.3: AI 驱动的源质量与类别分析
 * 
 * @module core/ai/prompts/source-analysis
 */

import type { FeedItem } from '../../rss/RSSFetcher'

/**
 * 标准分类 key 列表
 */
export const STANDARD_CATEGORY_KEYS = [
  'tech', 'news', 'finance', 'lifestyle', 'entertainment',
  'education', 'science', 'sports', 'gaming', 'design',
  'business', 'health', 'travel', 'food', 'photography',
  'music', 'art', 'politics', 'culture', 'other'
] as const

/**
 * 标准语言代码列表
 */
export const STANDARD_LANGUAGE_CODES = [
  'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'unknown'
] as const

/**
 * 构建源质量分析提示词
 * 
 * 输入：
 * - feedTitle: 订阅源标题
 * - feedDescription: 订阅源描述
 * - samples: 最近文章样本（10-20篇）
 * - selfReportedCategory: 自报类别（可选）
 * 
 * 输出 JSON：
 * {
 *   "category": "标准key（tech/news/finance等）",
 *   "secondaryCategory": "次要分类key（可选）",
 *   "language": "语言代码（zh-CN/en/ja等）",
 *   "originality": 0-100,
 *   "informationDensity": 0-100,
 *   "clickbaitScore": 0-100,
 *   "spamScore": 0-100,
 *   "reasoning": "分析依据"
 * }
 */
export function buildSourceAnalysisPrompt(
  feedTitle: string,
  feedDescription: string | undefined,
  samples: FeedItem[],
  selfReportedCategory?: string
): string {
  // 截断文本以控制 token 消耗
  const truncateText = (text: string, maxLength: number = 500): string => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // 构建文章摘要
  const articleSummary = samples
    .map((item, idx) => {
      const parts = [`${idx + 1}. ${item.title}`]
      if (item.description) {
        parts.push(`   摘要: ${truncateText(item.description)}`)
      }
      return parts.join('\n')
    })
    .join('\n\n')

  // 分类列表说明
  const categoryList = STANDARD_CATEGORY_KEYS.join(', ')
  const languageList = STANDARD_LANGUAGE_CODES.join(', ')

  return `请分析以下 RSS 订阅源的内容质量、主题类别和内容语言：

订阅源信息：
- 标题: ${feedTitle}
${feedDescription ? `- 描述: ${truncateText(feedDescription)}` : ''}
${selfReportedCategory ? `- 自报类别: ${selfReportedCategory}` : ''}

最近文章样本（共 ${samples.length} 篇）：
${articleSummary}

请以 JSON 格式返回分析结果。注意：为了兼容系统，需要返回两部分数据：

{
  "topics": {
    "主要类别": 1.0
  },
  "summary": "{...详细分析结果的JSON字符串...}"
}

其中 summary 字段是一个JSON字符串，必须包含以下字段：
{
  "category": "主题类别（只允许以下标准key之一：${categoryList}）",
  "secondaryCategory": "次要类别（可选，同样使用标准key）",
  "language": "内容语言代码（只允许以下之一：${languageList}）",
  "originality": "原创性评分 0-100",
  "informationDensity": "信息密度评分 0-100",
  "clickbaitScore": "标题党评分 0-100（越低越好）",
  "spamScore": "垃圾内容评分 0-100（越低越好）",
  "reasoning": "简短说明分析依据（50字以内）"
}

分类说明：
- tech: 编程、软件、互联网、人工智能等技术内容
- news: 时事新闻、资讯报道
- finance: 金融、投资、股票、经济
- lifestyle: 日常生活、个人博客
- entertainment: 影视、综艺、明星
- education: 学习、教程、课程
- science: 科研、学术
- sports: 体育运动
- gaming: 游戏、电竞
- design: UI/UX设计、美术
- business: 商业、创业、管理
- health: 健康、医疗、养生
- travel: 旅行、旅游
- food: 美食、烹饪
- photography: 摄影
- music: 音乐
- art: 艺术
- politics: 政治时政
- culture: 人文、历史、文化
- other: 其他

注意：
1. category 和 language 必须使用指定的标准 key/代码
2. 根据文章标题和摘要判断内容语言，不是根据订阅源标题
3. 如果同时有中文和英文内容，选择占比更大的语言`
}
