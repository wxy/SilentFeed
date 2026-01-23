/**
 * 诊断推荐池显示问题
 * 
 * 使用方法：
 * 1. 在 Service Worker 控制台运行
 * 2. 检查推荐池实际数量和显示数量
 */

// 在 Service Worker 控制台中运行此代码
(async function diagnosePoolStatus() {
  console.log('🔍 开始诊断推荐池状态...')
  
  try {
    // 1. 查询所有 poolStatus = 'recommended' 的文章
    const allRecommended = await db.feedArticles
      .filter(a => a.poolStatus === 'recommended')
      .toArray()
    
    console.log(`\n📊 所有 poolStatus='recommended' 的文章: ${allRecommended.length} 篇`)
    allRecommended.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title}`)
      console.log(`     - ID: ${a.id}`)
      console.log(`     - 已读: ${a.isRead}`)
      console.log(`     - 反馈: ${a.feedback}`)
      console.log(`     - 加入时间: ${new Date(a.popupAddedAt || 0).toLocaleString()}`)
    })
    
    // 2. 查询活跃推荐（未读且未拒绝）
    const activeRecommended = await db.feedArticles
      .filter(a => {
        const isInPool = a.poolStatus === 'recommended'
        const isActive = !a.isRead && a.feedback !== 'dismissed'
        return isInPool && isActive
      })
      .toArray()
    
    console.log(`\n✅ 活跃推荐（未读且未拒绝）: ${activeRecommended.length} 篇`)
    activeRecommended.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title}`)
      console.log(`     - 评分: ${a.analysisScore?.toFixed(2)}`)
    })
    
    // 3. 查询候选池
    const candidates = await db.feedArticles
      .filter(a => a.poolStatus === 'candidate')
      .count()
    
    console.log(`\n📦 候选池文章总数: ${candidates}`)
    
    // 4. 查询策略配置
    const strategy = await getCurrentStrategy()
    const targetPoolSize = strategy?.strategy.recommendation.targetPoolSize || 6
    const triggerThreshold = 0.8
    
    console.log(`\n⚙️ 策略配置:`)
    console.log(`  - 目标容量: ${targetPoolSize}`)
    console.log(`  - 触发阈值: ${(triggerThreshold * 100)}%`)
    console.log(`  - 触发容量: ${Math.floor(targetPoolSize * triggerThreshold)}`)
    
    // 5. 检查补充状态
    const refillManager = getRefillManager()
    const shouldRefill = await refillManager.shouldRefill(activeRecommended.length, targetPoolSize)
    
    console.log(`\n🔄 补充状态检查:`)
    console.log(`  - 当前容量: ${activeRecommended.length}/${targetPoolSize}`)
    console.log(`  - 容量率: ${((activeRecommended.length / targetPoolSize) * 100).toFixed(0)}%`)
    console.log(`  - 是否应补充: ${shouldRefill ? '✅ 是' : '❌ 否'}`)
    
    if (activeRecommended.length < targetPoolSize) {
      console.log(`  - 缺口: ${targetPoolSize - activeRecommended.length} 篇`)
    }
    
    // 6. 检查补充策略状态
    const state = refillManager.getState()
    console.log(`\n📅 补充策略状态:`)
    console.log(`  - 上次补充: ${state.lastRefillTime ? new Date(state.lastRefillTime).toLocaleString() : '从未'}`)
    console.log(`  - 今日已补充: ${state.dailyRefillCount} 次`)
    console.log(`  - 每日上限: ${state.maxDailyRefills} 次`)
    
    // 7. 检查阅读清单模式
    const config = await getRecommendationConfig()
    console.log(`\n📋 显示模式:`)
    console.log(`  - deliveryMode: ${config.deliveryMode}`)
    console.log(`  - 是否清单模式: ${config.deliveryMode === 'readingList' ? '✅ 是' : '❌ 否'}`)
    
    console.log(`\n✅ 诊断完成！`)
    
  } catch (error) {
    console.error('❌ 诊断失败:', error)
  }
})()
