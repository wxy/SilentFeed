/**
 * 分析调试器 - 帮助诊断无法分析的记录
 */

import { db } from "@/storage/db"

export class AnalysisDebugger {
  /**
   * 查找无法分析的记录详情
   */
  static async getUnanalyzableRecords() {
    const visits = await db.confirmedVisits.toArray()
    
    const unanalyzable = visits.filter(visit => {
      // 使用与其他组件相同的过滤条件
      if (!visit.analysis) return true
      if (!visit.analysis.keywords) return true
      if (!Array.isArray(visit.analysis.keywords)) return true
      if (visit.analysis.keywords.length === 0) return true
      if (!visit.analysis.language) return true
      return false
    })

    console.log(`[AnalysisDebugger] 找到 ${unanalyzable.length} 条无法分析的记录:`)
    
    unanalyzable.forEach((visit, index) => {
      console.log(`\n[${index + 1}] ID: ${visit.id}`)
      console.log(`  URL: ${visit.url}`)
      console.log(`  标题: ${visit.title}`)
      console.log(`  访问时间: ${new Date(visit.visitTime).toLocaleString()}`)
      console.log(`  停留时间: ${visit.duration}秒`)
      console.log(`  有内容摘要: ${visit.contentSummary ? '是' : '否'}`)
      
      if (visit.analysis) {
        console.log(`  分析结果:`)
        console.log(`    - keywords: ${visit.analysis.keywords} (类型: ${typeof visit.analysis.keywords})`)
        console.log(`    - topics: ${visit.analysis.topics}`)
        console.log(`    - language: ${visit.analysis.language}`)
      } else {
        console.log(`  分析结果: 无`)
      }
      
      console.log(`  原因:`)
      if (!visit.analysis) {
        console.log(`    - 没有分析对象`)
      } else {
        if (!visit.analysis.keywords) {
          console.log(`    - keywords字段为空`)
        } else if (!Array.isArray(visit.analysis.keywords)) {
          console.log(`    - keywords不是数组`)
        } else if (visit.analysis.keywords.length === 0) {
          console.log(`    - keywords数组为空`)
        }
        if (!visit.analysis.language) {
          console.log(`    - 缺少language字段`)
        }
      }
    })

    return unanalyzable
  }

  /**
   * 检查数据完整性
   */
  static async checkDataIntegrity() {
    const visits = await db.confirmedVisits.toArray()
    
    const stats = {
      total: visits.length,
      withAnalysis: 0,
      withKeywords: 0,
      withLanguage: 0,
      withSummary: 0,
      emptyKeywords: 0,
      invalidKeywords: 0
    }

    visits.forEach(visit => {
      if (visit.analysis) {
        stats.withAnalysis++
        
        if (visit.analysis.keywords) {
          if (Array.isArray(visit.analysis.keywords)) {
            if (visit.analysis.keywords.length > 0) {
              stats.withKeywords++
            } else {
              stats.emptyKeywords++
            }
          } else {
            stats.invalidKeywords++
          }
        }
        
        if (visit.analysis.language) {
          stats.withLanguage++
        }
      }
      
      if (visit.contentSummary) {
        stats.withSummary++
      }
    })

    console.log('[AnalysisDebugger] 数据完整性检查:')
    console.log(`  总记录数: ${stats.total}`)
    console.log(`  有分析对象: ${stats.withAnalysis}`)
    console.log(`  有有效关键词: ${stats.withKeywords}`)
    console.log(`  有语言标识: ${stats.withLanguage}`)
    console.log(`  有内容摘要: ${stats.withSummary}`)
    console.log(`  关键词数组为空: ${stats.emptyKeywords}`)
    console.log(`  关键词格式无效: ${stats.invalidKeywords}`)

    return stats
  }
}

// 在开发环境暴露到全局
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).AnalysisDebugger = AnalysisDebugger
}