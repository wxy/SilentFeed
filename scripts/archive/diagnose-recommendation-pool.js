/**
 * 诊断推荐池状态和显示模式切换问题
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行此脚本
 * 2. 或在 Service Worker 中运行
 */

async function diagnoseRecommendationPool() {
  console.log('=== 推荐池诊断开始 ===\n')
  
  // 1. 检查数据库版本
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('SilentFeedDB')
    request.onsuccess = () => resolve(request.result)
  })
  console.log('📊 数据库版本:', db.version)
  console.log('')
  
  // 2. 检查所有文章的 poolStatus 分布
  const { db: dbInstance } = await import('./storage/db')
  
  const allArticles = await dbInstance.feedArticles.toArray()
  console.log('📈 文章总数:', allArticles.length)
  
  const statusCount = {}
  allArticles.forEach(a => {
    const status = a.poolStatus || 'undefined'
    statusCount[status] = (statusCount[status] || 0) + 1
  })
  
  console.log('\n📊 poolStatus 分布:')
  Object.entries(statusCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  
  // 3. 检查推荐池中的文章
  const recommendedArticles = allArticles.filter(a => a.poolStatus === 'recommended')
  console.log('\n📦 推荐池状态 (poolStatus=recommended):')
  console.log(`  总数: ${recommendedArticles.length}`)
  console.log(`  未读: ${recommendedArticles.filter(a => !a.isRead).length}`)
  console.log(`  已读: ${recommendedArticles.filter(a => a.isRead).length}`)
  console.log(`  已拒绝: ${recommendedArticles.filter(a => a.feedback === 'dismissed').length}`)
  
  if (recommendedArticles.length > 0) {
    console.log('\n  详细列表:')
    recommendedArticles.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title}`)
      console.log(`     URL: ${a.link}`)
      console.log(`     评分: ${a.analysisScore?.toFixed(2) || 'N/A'}`)
      console.log(`     状态: isRead=${a.isRead}, feedback=${a.feedback || 'none'}`)
      console.log(`     添加时间: ${a.popupAddedAt ? new Date(a.popupAddedAt).toLocaleString() : 'N/A'}`)
    })
  }
  
  // 4. 检查阅读清单条目
  const readingListEntries = await dbInstance.readingListEntries.toArray()
  console.log('\n📖 阅读清单映射表:')
  console.log(`  记录数: ${readingListEntries.length}`)
  
  if (readingListEntries.length > 0) {
    console.log('\n  详细列表:')
    for (const entry of readingListEntries) {
      const article = await dbInstance.feedArticles.get(entry.recommendationId)
      console.log(`  - ${entry.url}`)
      console.log(`    映射ID: ${entry.recommendationId}`)
      console.log(`    文章状态: ${article ? article.poolStatus : '文章不存在'}`)
      console.log(`    添加时间: ${new Date(entry.addedAt).toLocaleString()}`)
    }
  }
  
  // 5. 检查 Chrome 阅读清单
  if (typeof chrome !== 'undefined' && chrome.readingList) {
    try {
      const chromeEntries = await chrome.readingList.query({})
      console.log('\n📚 Chrome 阅读清单:')
      console.log(`  总条目: ${chromeEntries.length}`)
      
      const ourEntries = chromeEntries.filter(e => e.title?.startsWith('🤫 '))
      console.log(`  扩展添加: ${ourEntries.length}`)
      
      if (ourEntries.length > 0) {
        console.log('\n  扩展添加的条目:')
        ourEntries.forEach((e, i) => {
          console.log(`  ${i + 1}. ${e.title}`)
          console.log(`     URL: ${e.url}`)
          console.log(`     已读: ${e.hasBeenRead}`)
        })
      }
    } catch (error) {
      console.log('\n📚 Chrome 阅读清单: API 不可用')
    }
  }
  
  // 6. 检查配置
  const { getRecommendationConfig } = await import('./storage/recommendation-config')
  const config = await getRecommendationConfig()
  console.log('\n⚙️ 推荐配置:')
  console.log(`  显示模式: ${config.deliveryMode}`)
  console.log(`  最大推荐数: ${config.maxRecommendations}`)
  
  // 7. 检查是否有旧状态字段
  const oldStatusArticles = allArticles.filter(a => a.status)
  if (oldStatusArticles.length > 0) {
    console.log('\n⚠️ 发现使用旧 status 字段的文章:')
    console.log(`  数量: ${oldStatusArticles.length}`)
    oldStatusArticles.slice(0, 5).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title}`)
      console.log(`     status: ${a.status}`)
      console.log(`     poolStatus: ${a.poolStatus || 'undefined'}`)
    })
  }
  
  console.log('\n=== 诊断完成 ===')
}

// 运行诊断
diagnoseRecommendationPool().catch(console.error)
