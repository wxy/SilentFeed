/**
 * 翻译问题诊断脚本
 * 
 * 使用方法：
 * 1. 在 Service Worker 控制台运行
 * 2. 检查推荐池中文章的翻译状态
 * 3. 检查阅读清单映射
 */

import { db } from '../src/storage/db/index'

async function diagnoseTranslation() {
  console.log('=== 翻译问题诊断 ===\n')

  // 1. 检查推荐池文章
  console.log('📊 推荐池文章翻译状态:')
  const recommended = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended' && !a.isRead && a.feedback !== 'dismissed')
    .toArray()
  
  console.log(`推荐池: ${recommended.length} 篇`)
  recommended.forEach((article, idx) => {
    console.log(`\n[${idx + 1}] ${article.title?.substring(0, 50)}`)
    console.log(`  URL: ${article.link}`)
    console.log(`  评分: ${article.analysisScore?.toFixed(2)}`)
    console.log(`  有翻译: ${!!article.translation}`)
    
    if (article.translation) {
      console.log(`  翻译标题: ${article.translation.translatedTitle?.substring(0, 50)}`)
      console.log(`  源语言: ${article.translation.sourceLanguage}`)
      console.log(`  目标语言: ${article.translation.targetLanguage}`)
      console.log(`  提供者: ${article.translation.provider}`)
      console.log(`  翻译时间: ${new Date(article.translation.translatedAt).toLocaleString()}`)
    } else {
      console.log(`  ⚠️ 缺少翻译数据`)
      console.log(`  有分析: ${!!article.analysis}`)
      console.log(`  分析评分: ${article.analysisScore}`)
    }
  })

  // 2. 检查阅读清单映射
  console.log('\n\n📋 阅读清单映射:')
  const mappings = await db.readingListEntries.toArray()
  console.log(`映射记录: ${mappings.length} 条`)
  
  mappings.forEach((mapping, idx) => {
    console.log(`\n[${idx + 1}] ${mapping.title?.substring(0, 50)}`)
    console.log(`  原始URL: ${mapping.originalUrl}`)
    console.log(`  清单URL: ${mapping.readingListUrl}`)
    console.log(`  推荐ID: ${mapping.recommendationId}`)
    console.log(`  添加时间: ${new Date(mapping.addedAt).toLocaleString()}`)
  })

  // 3. 检查候选池翻译率
  console.log('\n\n🔍 候选池翻译率:')
  const candidates = await db.feedArticles
    .filter(a => a.poolStatus === 'candidate' && a.analysisScore && a.analysisScore >= 0.7)
    .toArray()
  
  const withTranslation = candidates.filter(a => a.translation).length
  console.log(`候选池合格文章: ${candidates.length} 篇`)
  console.log(`有翻译: ${withTranslation} 篇 (${(withTranslation / candidates.length * 100).toFixed(1)}%)`)
  console.log(`无翻译: ${candidates.length - withTranslation} 篇`)

  // 4. 检查最近分析的文章
  console.log('\n\n📝 最近分析的文章（最多 5 篇）:')
  const recent = await db.feedArticles
    .orderBy('id')
    .reverse()
    .limit(5)
    .toArray()
  
  recent.forEach((article, idx) => {
    console.log(`\n[${idx + 1}] ${article.title?.substring(0, 50)}`)
    console.log(`  状态: ${article.poolStatus}`)
    console.log(`  评分: ${article.analysisScore?.toFixed(2)}`)
    console.log(`  有分析: ${!!article.analysis}`)
    console.log(`  有翻译: ${!!article.translation}`)
    
    if (article.translation) {
      console.log(`  翻译标题: ${article.translation.translatedTitle?.substring(0, 50)}`)
    }
  })

  console.log('\n=== 诊断完成 ===')
}

// 导出供控制台使用
window.diagnoseTranslation = diagnoseTranslation
console.log('已加载诊断脚本，运行 diagnoseTranslation() 开始诊断')
