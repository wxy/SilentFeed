/**
 * 修复历史数据：poolStatus='recommended' 但实际已退出的文章
 * 
 * 问题：markAsRead/dismissRecommendations 之前没有更新 Phase 13 字段
 * 解决：补充设置 poolExitedAt 和 poolExitReason，清空 poolStatus
 * 
 * 使用方法：
 * 1. 打开扩展的设置页面
 * 2. 打开浏览器开发者工具 (F12)
 * 3. 在 Console 中粘贴此脚本并执行
 */

(async function fixPoolExitStatus() {
  console.log('🔧 开始修复 poolStatus 历史数据...')
  
  // 获取 Dexie 数据库实例
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('SilentFeedDB')
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      console.error('❌ 无法打开数据库')
      resolve(null)
    }
  })
  
  if (!db) return
  
  // 读取所有文章
  const transaction = db.transaction(['feedArticles'], 'readwrite')
  const store = transaction.objectStore('feedArticles')
  
  const allArticles = await new Promise((resolve) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve([])
  })
  
  console.log(`📊 总文章数: ${allArticles.length}`)
  
  // 找出需要修复的文章
  const needsFix = allArticles.filter(article => {
    // poolStatus 是 recommended 但实际已退出
    if (article.poolStatus === 'recommended') {
      // 已读、已忽略、或 inPool=false 都表示已退出
      if (article.read === true || article.disliked === true || article.inPool === false) {
        return true
      }
    }
    return false
  })
  
  console.log(`🔍 需要修复的文章数: ${needsFix.length}`)
  
  if (needsFix.length === 0) {
    console.log('✅ 没有需要修复的数据')
    db.close()
    return
  }
  
  // 分类统计
  const byReason = {
    read: needsFix.filter(a => a.read === true).length,
    disliked: needsFix.filter(a => a.disliked === true).length,
    other: needsFix.filter(a => !a.read && !a.disliked && a.inPool === false).length
  }
  console.log('📈 按退出原因分类:', byReason)
  
  // 执行修复
  const now = Date.now()
  let fixed = 0
  
  const writeTransaction = db.transaction(['feedArticles'], 'readwrite')
  const writeStore = writeTransaction.objectStore('feedArticles')
  
  for (const article of needsFix) {
    // 确定退出原因
    let exitReason = 'read' // 默认
    if (article.disliked === true) {
      exitReason = 'disliked'
    } else if (article.poolRemovedReason) {
      exitReason = article.poolRemovedReason
    } else if (article.poolExitReason) {
      exitReason = article.poolExitReason
    }
    
    // 确定退出时间
    const exitTime = article.poolRemovedAt || article.poolExitedAt || now
    
    // 更新文章
    const updatedArticle = {
      ...article,
      poolStatus: undefined,  // 清空，表示已退出
      poolExitedAt: exitTime,
      poolExitReason: exitReason
    }
    
    await new Promise((resolve, reject) => {
      const request = writeStore.put(updatedArticle)
      request.onsuccess = () => {
        fixed++
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  console.log(`✅ 已修复 ${fixed} 篇文章`)
  
  // 验证修复结果
  const verifyTransaction = db.transaction(['feedArticles'], 'readonly')
  const verifyStore = verifyTransaction.objectStore('feedArticles')
  
  const verifyArticles = await new Promise((resolve) => {
    const request = verifyStore.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve([])
  })
  
  const recommendedInPool = verifyArticles.filter(a => 
    a.poolStatus === 'recommended' && !a.poolExitedAt
  ).length
  
  console.log(`🎯 修复后当前推荐池文章数: ${recommendedInPool}`)
  
  db.close()
  console.log('🎉 修复完成！请刷新页面查看更新后的统计。')
})()
