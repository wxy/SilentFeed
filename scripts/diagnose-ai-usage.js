/**
 * 诊断脚本：检查 AI 用量数据
 * 
 * 在浏览器扩展的 Service Worker 控制台中执行
 */

(async function diagnoseAIUsage() {
  console.log('🔍 开始诊断 AI 用量数据...')
  
  try {
    // 动态导入
    const { db } = await import('/src/storage/db/index.ts')
    const { AIUsageTracker } = await import('/src/core/ai/AIUsageTracker.ts')
    
    // 1. 检查 aiUsage 表是否存在
    const tables = db.tables.map(t => t.name)
    console.log('📋 数据库表:', tables)
    
    if (!tables.includes('aiUsage')) {
      console.error('❌ aiUsage 表不存在！')
      return
    }
    
    // 2. 统计 aiUsage 表记录数
    const totalCount = await db.aiUsage.count()
    console.log(`📊 aiUsage 表总记录数: ${totalCount}`)
    
    if (totalCount === 0) {
      console.warn('⚠️ aiUsage 表没有任何记录')
      return
    }
    
    // 3. 查看最近 5 条记录
    const recentRecords = await db.aiUsage
      .orderBy('timestamp')
      .reverse()
      .limit(5)
      .toArray()
    
    console.log('📝 最近 5 条记录:')
    recentRecords.forEach((r, i) => {
      console.log(`  ${i + 1}. [${new Date(r.timestamp).toLocaleString()}] ${r.provider} - ${r.purpose}`)
      console.log(`     tokens: ${r.tokens.total}, cost: ${r.cost.currency} ${r.cost.total.toFixed(6)}`)
    })
    
    // 4. 按 provider 分组统计
    const allRecords = await db.aiUsage.toArray()
    const byProvider = {}
    allRecords.forEach(r => {
      if (!byProvider[r.provider]) {
        byProvider[r.provider] = { count: 0, cost: { CNY: 0, USD: 0, FREE: 0 } }
      }
      byProvider[r.provider].count++
      const currency = r.cost.currency || 'CNY'
      byProvider[r.provider].cost[currency] += r.cost.total
    })
    
    console.log('📈 按 Provider 统计:')
    Object.entries(byProvider).forEach(([provider, stats]) => {
      console.log(`  ${provider}: ${stats.count} 次调用`)
      if (stats.cost.CNY > 0) console.log(`    CNY: ¥${stats.cost.CNY.toFixed(6)}`)
      if (stats.cost.USD > 0) console.log(`    USD: $${stats.cost.USD.toFixed(6)}`)
    })
    
    // 5. 使用 AIUsageTracker.getStats 测试
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    
    console.log(`\n📅 本月时间范围: ${monthStart.toLocaleDateString()} ~ ${monthEnd.toLocaleDateString()}`)
    
    const stats = await AIUsageTracker.getStats({
      startTime: monthStart.getTime(),
      endTime: monthEnd.getTime()
    })
    
    console.log('\n📊 AIUsageTracker.getStats 返回:')
    console.log(`  总调用次数: ${stats.totalCalls}`)
    console.log(`  byCurrency.CNY.total: ¥${stats.byCurrency.CNY.total.toFixed(6)}`)
    console.log(`  byCurrency.USD.total: $${stats.byCurrency.USD.total.toFixed(6)}`)
    console.log(`  byCurrency.FREE.total: ${stats.byCurrency.FREE.total}`)
    
    console.log('\n✅ 诊断完成')
    
  } catch (error) {
    console.error('❌ 诊断失败:', error)
  }
})()
