/**
 * 诊断清单模式下推荐池不断补充的问题
 * 
 * 使用方法：
 * 1. 切换到清单模式
 * 2. 打开扩展的 Service Worker 控制台
 * 3. 复制整个脚本并粘贴运行
 * 4. 观察输出，特别是推荐池文章的状态变化
 */

(async function diagnoseRefillIssue() {
  console.log('=== 清单模式补充问题诊断 ===\n')

  // 导入必要的模块
  const { db } = await import('./storage/db/index.js')
  const { getRecommendationConfig } = await import('./storage/recommendation-config.js')
  const { getCurrentStrategy } = await import('./storage/strategy-storage.js')

  // 1. 检查当前模式
  const config = await getRecommendationConfig()
  console.log('1️⃣ 当前模式:', config.deliveryMode)
  
  if (config.deliveryMode !== 'readingList') {
    console.warn('⚠️ 当前不是清单模式，请先切换到清单模式')
    return
  }

  // 2. 检查 AI 策略
  const strategy = await getCurrentStrategy()
  if (!strategy) {
    console.error('❌ 未找到 AI 策略')
    return
  }

  const targetPoolSize = strategy.strategy.recommendation.targetPoolSize
  console.log('\n2️⃣ AI 策略配置:')
  console.log(`  - 推荐池目标容量: ${targetPoolSize}`)
  console.log(`  - 补充阈值: ${strategy.strategy.recommendation.refillThreshold}`)
  console.log(`  - 触发百分比: ${(strategy.strategy.recommendation.refillThreshold / targetPoolSize * 100).toFixed(0)}%`)

  // 3. 检查推荐池状态（与补充检查逻辑完全一致）
  console.log('\n3️⃣ 推荐池状态检查:')
  
  // 3a. 检查所有 poolStatus='recommended' 的文章
  const allRecommended = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended')
    .toArray()
  
  console.log(`  - poolStatus='recommended' 的文章总数: ${allRecommended.length}`)
  
  // 3b. 检查未读未拒绝的文章（补充检查使用的条件）
  const currentPool = await db.feedArticles
    .filter(a => {
      const isPopup = a.poolStatus === 'recommended'
      const isUnread = !a.isRead
      const notDismissed = a.feedback !== 'dismissed'
      return isPopup && isUnread && notDismissed
    })
    .toArray()
  
  console.log(`  - 符合补充检查条件的文章: ${currentPool.length}`)
  console.log(`  - 推荐池容量: ${currentPool.length}/${targetPoolSize}`)

  // 4. 详细列出所有 poolStatus='recommended' 的文章
  console.log('\n4️⃣ 推荐池文章详情:')
  
  for (const article of allRecommended) {
    const符合条件 = !article.isRead && article.feedback !== 'dismissed'
    console.log(`\n  📄 ${article.title?.substring(0, 40)}...`)
    console.log(`     ID: ${article.id}`)
    console.log(`     poolStatus: ${article.poolStatus}`)
    console.log(`     isRead: ${article.isRead || false}`)
    console.log(`     feedback: ${article.feedback || 'none'}`)
    console.log(`     popupAddedAt: ${article.popupAddedAt ? new Date(article.popupAddedAt).toLocaleString('zh-CN') : 'none'}`)
    console.log(`     符合补充检查条件: ${符合条件 ? '✅' : '❌'}`)
    
    if (!符合条件) {
      console.log(`     ❗ 不符合原因: ${article.isRead ? 'isRead=true' : article.feedback === 'dismissed' ? 'feedback=dismissed' : '未知'}`)
    }
  }

  // 5. 检查阅读清单映射
  console.log('\n5️⃣ 阅读清单映射:')
  const entries = await db.readingListEntries.toArray()
  console.log(`  - readingListEntries 表记录数: ${entries.length}`)
  
  // 6. 检查 Chrome 阅读清单
  if (chrome.readingList) {
    try {
      const chromeEntries = await chrome.readingList.query({})
      const ourEntries = chromeEntries.filter(e => e.title?.startsWith('🤫'))
      console.log(`  - Chrome 阅读清单中的条目总数: ${chromeEntries.length}`)
      console.log(`  - 由扩展添加的条目（🤫开头）: ${ourEntries.length}`)
      console.log(`  - 未读: ${ourEntries.filter(e => !e.hasBeenRead).length}`)
      console.log(`  - 已读: ${ourEntries.filter(e => e.hasBeenRead).length}`)
    } catch (error) {
      console.warn('  - 无法读取 Chrome 阅读清单:', error.message)
    }
  }

  // 7. 检查补充状态
  console.log('\n6️⃣ 补充策略状态:')
  const refillState = await chrome.storage.local.get('pool_refill_state')
  if (refillState.pool_refill_state) {
    const state = refillState.pool_refill_state
    console.log(`  - 上次补充时间: ${state.lastRefillTime ? new Date(state.lastRefillTime).toLocaleString('zh-CN') : '从未'}`)
    console.log(`  - 今日补充次数: ${state.dailyRefillCount}`)
    console.log(`  - 当前日期: ${state.currentDate}`)
  } else {
    console.log('  - 无补充状态记录')
  }

  // 8. 判断是否应该补充
  console.log('\n7️⃣ 补充决策:')
  const fillRate = currentPool.length / targetPoolSize
  const triggerThreshold = strategy.strategy.recommendation.refillThreshold / targetPoolSize
  const shouldTrigger = fillRate <= triggerThreshold
  
  console.log(`  - 填充率: ${(fillRate * 100).toFixed(0)}%`)
  console.log(`  - 触发阈值: ${(triggerThreshold * 100).toFixed(0)}%`)
  console.log(`  - 应该补充: ${shouldTrigger ? '✅ 是' : '❌ 否'}`)

  console.log('\n✅ 诊断完成！')
  console.log('\n💡 关键指标:')
  console.log(`   - 如果 "poolStatus='recommended' 的文章总数" 与 "符合补充检查条件的文章" 不一致`)
  console.log(`     说明有文章被标记为已读或已拒绝`)
  console.log(`   - 如果 "符合补充检查条件的文章" < 目标容量`)
  console.log(`     且你没有进行任何操作，说明有后台逻辑修改了文章状态`)

})()
