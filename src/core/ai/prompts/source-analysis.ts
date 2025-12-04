/**
 * 源质量分析提示词
 * 
 * Phase 5.3: AI 驱动的源质量与类别分析
 * 
 * @module core/ai/prompts/source-analysis
 */

import type { FeedItem } from '../../rss/RSSFetcher'

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
 *   "category": "英文slug（technology/science/business等）",
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

  return `请分析以下 RSS 订阅源的内容质量和主题类别：

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

其中 summary 字段是一个JSON字符串，包含以下详细分析：
{
  "category": "主题类别（只允许以下英文slug之一：technology, science, business, design, entertainment, news, education, health, sports, lifestyle）",
  "originality": "原创性评分 0-100（是否原创内容还是转载聚合）",
  "informationDensity": "信息密度评分 0-100（内容深度和价值）",
  "clickbaitScore": "标题党评分 0-100（越低越好，是否过度夸张吸引点击）",
  "spamScore": "垃圾内容评分 0-100（越低越好，是否有营销、广告、低质内容）",
  "reasoning": "简短说明分析依据（50字以内）"
}

注意：
1. category 应该准确反映内容的主题方向，优先信任文章内容而非自报类别
2. 原创性高、信息密度高的源质量更好
3. 标题党和垃圾内容评分越低代表质量越高
4. topics 中的主要类别应与 summary 中的 category 一致`
}
