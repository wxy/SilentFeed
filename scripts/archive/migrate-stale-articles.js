/**
 * 迁移脚本：将 inFeed=false 且 poolStatus='raw' 的文章改为 'stale' 状态
 * 
 * 使用方法：
 * 1. 在浏览器扩展的 Service Worker 控制台中执行
 * 2. 或者在 options 页面的控制台中执行
 * 
 * 注意：此脚本需要在扩展环境中运行，因为需要访问 IndexedDB
 */

(async function migrateStaleArticles() {
  console.log('🔄 开始迁移过时文章状态...')
  
  // 动态导入数据库
  const { db } = await import('/src/storage/db/index.ts')
  
  try {
    // 查找所有需要迁移的文章
    const articlesToMigrate = await db.feedArticles
      .filter(a => 
        (a.poolStatus === 'raw' || !a.poolStatus) && 
        a.inFeed === false
      )
      .toArray()
    
    console.log(`📊 找到 ${articlesToMigrate.length} 篇需要迁移的文章`)
    
    if (articlesToMigrate.length === 0) {
      console.log('✅ 没有需要迁移的文章')
      return { migrated: 0, total: 0 }
    }
    
    // 批量更新
    let migratedCount = 0
    const batchSize = 100
    
    for (let i = 0; i < articlesToMigrate.length; i += batchSize) {
      const batch = articlesToMigrate.slice(i, i + batchSize)
      
      await db.transaction('rw', db.feedArticles, async () => {
        for (const article of batch) {
          await db.feedArticles.update(article.id, {
            poolStatus: 'stale'
          })
          migratedCount++
        }
      })
      
      console.log(`📝 已迁移 ${migratedCount}/${articlesToMigrate.length}`)
    }
    
    console.log(`✅ 迁移完成！共迁移 ${migratedCount} 篇文章`)
    return { migrated: migratedCount, total: articlesToMigrate.length }
    
  } catch (error) {
    console.error('❌ 迁移失败:', error)
    throw error
  }
})()
