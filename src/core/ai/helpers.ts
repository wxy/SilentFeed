/**
 * AI 辅助函数
 * 
 * 提供 AI 分析结果和传统数据结构之间的转换
 */

/**
 * 从主题概率提取关键词（用于向后兼容）
 * 
 * 将 AI 返回的主题分布转换为关键词列表，
 * 保持与现有 TextAnalyzer 的兼容性
 * 
 * @param topics 主题概率分布 {"技术": 0.7, "设计": 0.3}
 * @param threshold 最低概率阈值（默认 0.1）
 * @returns 关键词列表，按概率降序排列
 */
export function extractKeywordsFromTopics(
  topics: Record<string, number>,
  threshold: number = 0.1
): string[] {
  return Object.entries(topics)
    .filter(([_, prob]) => prob >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, _]) => topic)
}

/**
 * 检测文本语言
 * 
 * 使用简单的启发式规则检测文本的主要语言
 * 
 * @param text 待检测的文本
 * @returns 语言代码 ("zh" | "ja" | "en")
 */
export function detectLanguage(text: string): string {
  if (!text || text.length === 0) {
    return "en" // 默认英文
  }
  
  // 统计各种字符的数量
  const zhCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const jaCount = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length
  const totalLength = text.length
  
  // 日文优先检测（因为日文可能包含汉字，但有假名）
  // 如果日文字符（假名）占比超过 10%，判定为日文
  if (jaCount / totalLength > 0.1) {
    return "ja"
  }
  
  // 如果中文字符占比超过 10%，判定为中文
  // 理由：技术文章即使包含大量英文术语，只要有较少比例的中文也应视为中文页面
  if (zhCount / totalLength > 0.1) {
    return "zh"
  }
  
  // 其他情况默认英文
  return "en"
}

/**
 * 合并多个主题分布
 * 
 * 将多个 AI 分析结果的主题分布进行加权平均
 * 
 * @param distributions 主题分布数组
 * @param weights 权重数组（可选，默认均等权重）
 * @returns 合并后的主题分布
 */
export function mergeTopicDistributions(
  distributions: Array<Record<string, number>>,
  weights?: number[]
): Record<string, number> {
  if (distributions.length === 0) {
    return {}
  }
  
  // 使用均等权重
  const actualWeights = weights || distributions.map(() => 1 / distributions.length)
  
  // 归一化权重
  const totalWeight = actualWeights.reduce((sum, w) => sum + w, 0)
  const normalizedWeights = actualWeights.map(w => w / totalWeight)
  
  // 收集所有主题
  const allTopics = new Set<string>()
  distributions.forEach(dist => {
    Object.keys(dist).forEach(topic => allTopics.add(topic))
  })
  
  // 计算加权平均
  const merged: Record<string, number> = {}
  allTopics.forEach(topic => {
    let weightedSum = 0
    distributions.forEach((dist, i) => {
      weightedSum += (dist[topic] || 0) * normalizedWeights[i]
    })
    merged[topic] = weightedSum
  })
  
  return merged
}
