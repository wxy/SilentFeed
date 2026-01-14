/**
 * 重置所有文章的分析状态
 * 
 * 使用方法：
 * 1. 在 Chrome 扩展的 Background 控制台执行此脚本
 * 2. 或者在浏览器开发者工具控制台执行
 * 
 * 功能：
 * - 清除所有文章的 analysis 字段
 * - 保留用户操作状态（read, starred, disliked 等）
 * - 允许文章重新进入 AI 分析流程
 */

(async function resetArticleAnalysis() {
  console.log('🔄 开始重置文章分析状态...')
  
  try {
    // 动态导入 Dexie
    const { db } = await import(chrome.runtime.getURL('storage/db.js'))
    
    // 获取所有文章
    const allArticles = await db.feedArticles.toArray()
    console.log(`📊 找到 ${allArticles.length} 篇文章`)
    
    // 统计各类分析状态
    const stats = {
      total: allArticles.length,
      analyzed: allArticles.filter(a => a.analysis && a.analysis.metadata?.provider !== 'tfidf-skipped').length,
      tfidfSkipped: allArticles.filter(a => a.analysis?.metadata?.provider === 'tfidf-skipped').length,
      noAnalysis: allArticles.filter(a => !a.analysis).length
    }
    
    console.log('📈 当前分析状态:')
    console.table(stats)
    
    // 确认操作
    if (!confirm(`确定要重置 ${stats.analyzed + stats.tfidfSkipped} 篇已分析文章的分析状态吗？\n\n注意：此操作不可恢复！`)) {
      console.log('❌ 操作已取消')
      return
    }
    
    // 批量更新：移除 analysis 字段
    let updated = 0
    for (const article of allArticles) {
      if (article.analysis) {
        await db.feedArticles.update(article.id, {
          analysis: undefined
        })
        updated++
      }
    }
    
    console.log(`✅ 成功重置 ${updated} 篇文章的分析状态`)
    console.log('💡 提示：下次推荐生成时，这些文章将重新进行 AI 分析')
    
    // 更新所有 RSS 源的统计信息
    console.log('🔄 更新 RSS 源统计...')
    const feeds = await db.discoveredFeeds.toArray()
    
    for (const feed of feeds) {
      const articles = await db.feedArticles.where('feedId').equals(feed.id).toArray()
      const analyzedCount = articles.filter(a => a.analysis && a.analysis.metadata?.provider !== 'tfidf-skipped').length
      const inFeedAnalyzedCount = articles.filter(a => a.inFeed !== false && a.analysis && a.analysis.metadata?.provider !== 'tfidf-skipped').length
      
      await db.discoveredFeeds.update(feed.id, {
        analyzedCount,
        inFeedAnalyzedCount
      })
    }
    
    console.log('✅ RSS 源统计已更新')
    console.log('🎉 重置完成！')
    
  } catch (error) {
    console.error('❌ 重置失败:', error)
  }
})()
